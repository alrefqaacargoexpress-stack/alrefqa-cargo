import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  auditEvents,
  customerShipmentAccess,
  entityLifecycle,
  memberRoles,
  records,
  users,
  warehouseLocationEvents,
  type CustomerShipmentAccessRow,
  type User,
} from "../drizzle/schema";
import type { Account, Shipment } from "@shared/operations";
import {
  customerLinkGrantInputSchema,
  customerLinkRevokeInputSchema,
  customerTrackingRequestSchema,
  customerTrackingResultSchema,
  customerTrackingShipmentSchema,
  customerTrackingTimelineItemSchema,
  projectCustomerShipment,
  officeLabel,
  type CustomerLinkGrantInput,
  type CustomerLinkRevokeInput,
  type CustomerTrackingResult,
  type CustomerTrackingLocation,
  CUSTOMER_LINK_MAX_GOODS,
  CUSTOMER_TRACKING_MAX_SHIPMENTS,
} from "@shared/customerTracking";
import {
  publicTrackingResultSchema,
  type PublicTrackingResult,
} from "@shared/publicTracking";
import { branchForbidden, readOfficeScope, rootAdmin } from "./branches";
import { assertActiveEntity, isEmployeeDisabled } from "./lifecycle";
import { appendAudit } from "./audit";
import { normalizeEmail } from "./localAuth";
import { getDb } from "./db";
import { permissionAllowed } from "@shared/permissions";
import { protectedProcedure, router } from "./_core/trpc";

export type CustomerTrackingDb = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
  transaction?: (callback: (tx: any) => Promise<any>) => Promise<any>;
};

const LINK_ACTIONS = new Set(["customer_link_grant", "customer_link_revoke"]);
const TRACKING_ACTIONS = new Set([
  "tracking_plan",
  "tracking_stage",
  "tracking_transfer",
  "tracking_arrival",
]);

function badRequest(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}
function forbidden(message: string): never {
  throw new TRPCError({ code: "FORBIDDEN", message });
}
function notFound(message = "customer_tracking_not_found"): never {
  throw new TRPCError({ code: "NOT_FOUND", message });
}
function conflict(message: string): never {
  throw new TRPCError({ code: "CONFLICT", message });
}
function asRows<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
function dbRequired(
  db: CustomerTrackingDb | null | undefined
): CustomerTrackingDb {
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database is not available",
    });
  return db;
}
function accountOffice(account: Account): string | null {
  return typeof account.officeId === "string" ? account.officeId : null;
}
function shipmentOffice(shipment: Shipment): string | null {
  return typeof shipment.officeId === "string"
    ? shipment.officeId
    : typeof shipment.packing?.source === "string"
      ? shipment.packing.source
      : null;
}
function isActiveData(data: any): boolean {
  return Boolean(data && !data.deleted);
}
function rowData<T>(row: any): T | null {
  return row && typeof row.data === "object" && row.data !== null
    ? (row.data as T)
    : null;
}

type LifecycleLookupEntity = "account" | "shipment" | "employee";

async function retired(
  db: CustomerTrackingDb,
  entity: LifecycleLookupEntity,
  ids: readonly string[]
) {
  if (!ids.length) return new Set<string>();
  const rows = await db
    .select({
      recordId: entityLifecycle.recordId,
      action: entityLifecycle.action,
    })
    .from(entityLifecycle)
    .where(
      and(
        eq(entityLifecycle.entity, entity),
        inArray(entityLifecycle.recordId, ids)
      )
    )
    .limit(ids.length + 1);
  return new Set(
    asRows<{ recordId?: unknown; action?: unknown }>(rows)
      .filter(
        row =>
          typeof row.recordId === "string" &&
          ["delete", "disable", "void"].includes(String(row.action))
      )
      .map(row => row.recordId as string)
  );
}

async function lockedRecord(
  tx: CustomerTrackingDb,
  entity: "account" | "shipment",
  id: string
) {
  const rows = await tx
    .select()
    .from(records)
    .where(and(eq(records.entity, entity), eq(records.recordId, id)))
    .limit(1)
    .for("update");
  return rows[0] ?? null;
}

async function ensureActorScope(
  tx: CustomerTrackingDb,
  actor: User,
  officeId: string
) {
  if (actor.accountType !== "employee") forbidden("employee_account_required");
  if (await isEmployeeDisabled(tx, actor.id)) forbidden("employee_disabled");
  const scope = await readOfficeScope(tx, actor, new Set<number>(), true);
  if (
    !scope.role ||
    !permissionAllowed(scope, "customers", "manage") ||
    !permissionAllowed(scope, "shipments", "view")
  )
    forbidden("customer_link_permission_required");
  if (
    !rootAdmin(actor) &&
    (scope.role !== "office_manager" ||
      scope.offices?.length !== 1 ||
      scope.offices[0] !== officeId)
  )
    forbidden("customer_office_scope_required");
  // Root/admin is intentionally still constrained by the account/shipment same-office check below.
  return scope;
}

async function lockedTargetByEmail(
  tx: CustomerTrackingDb,
  email: string
): Promise<User> {
  const rows = await tx
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1)
    .for("update");
  const target = rows[0] as User | undefined;
  if (!target) notFound("customer_target_not_found");
  if (target.accountType !== "customer") forbidden("customer_account_required");
  if (target.id <= 0) forbidden("invalid_customer_target");
  const memberships = await tx
    .select({ userId: memberRoles.userId })
    .from(memberRoles)
    .where(eq(memberRoles.userId, target.id))
    .limit(1)
    .for("update");
  if (memberships.length) forbidden("customer_employee_membership_forbidden");
  const disabled = await retired(tx, "employee", [String(target.id)]);
  if (disabled.has(String(target.id))) forbidden("customer_disabled");
  return target;
}

function validateActiveGoods(shipment: Shipment, goodsIds: readonly string[]) {
  if (shipment.deleted || !shipment.packing) forbidden("shipment_inactive");
  const goods = shipment.packing.cartons.flatMap(carton => carton.goods);
  const byId = new Map(goods.map(item => [item.id, item]));
  return goodsIds.map(id => {
    const item = byId.get(id);
    if (!item || item.deleted) notFound("goods_inactive");
    return item;
  });
}

function actorForAudit(actor: User, role: any) {
  return {
    id: actor.id,
    name: actor.name?.trim() || `user-${actor.id}`,
    role: role ?? "admin",
  } as const;
}

function accessPublic(row: CustomerShipmentAccessRow) {
  const iso = (value: Date | string) =>
    value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  return {
    userId: row.userId,
    customerAccountId: row.customerAccountId,
    shipmentId: row.shipmentId,
    goodsId: row.goodsId,
    officeId: row.officeId,
    status: row.status,
    version: row.version,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export const customerAccessItemSchema = z
  .object({
    userId: z.number().int().positive(),
    customerAccountId: z.string().min(1).max(128),
    shipmentId: z.string().min(1).max(128),
    goodsId: z.string().min(1).max(128),
    officeId: z.string().min(1).max(32),
    status: z.enum(["active", "revoked"]),
    version: z.number().int().positive(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const customerLinkMutationResultSchema = z
  .object({
    items: z.array(customerAccessItemSchema).max(CUSTOMER_LINK_MAX_GOODS),
  })
  .strict();

export type CustomerLinkMutationResult = {
  items: ReturnType<typeof accessPublic>[];
};

async function grantInTransaction(
  tx: CustomerTrackingDb,
  actor: User,
  input: CustomerLinkGrantInput
): Promise<CustomerLinkMutationResult> {
  const parsed = customerLinkGrantInputSchema.parse(input);
  const goodsIds = parsed.goods.map(item => item.goodsId);
  if (goodsIds.length > CUSTOMER_LINK_MAX_GOODS) badRequest("too_many_goods");
  const target = await lockedTargetByEmail(tx, parsed.targetEmail);
  if (target.id === actor.id) forbidden("self_customer_link_forbidden");

  // Lock the actor membership before authorizing, then lock account and shipment in a stable order.
  const accountRow = await lockedRecord(
    tx,
    "account",
    parsed.customerAccountId
  );
  const account = rowData<Account>(accountRow);
  if (
    !accountRow ||
    !account ||
    account.id !== parsed.customerAccountId ||
    !isActiveData(account)
  )
    notFound("customer_account_not_found");
  const officeId = accountOffice(account);
  if (!officeId) forbidden("customer_account_office_required");
  const scope = await ensureActorScope(tx, actor, officeId);
  const accountRetired = await retired(tx, "account", [
    parsed.customerAccountId,
  ]);
  if (accountRetired.has(parsed.customerAccountId))
    conflict("customer_account_retired");

  const shipmentRow = await lockedRecord(tx, "shipment", parsed.shipmentId);
  const shipment = rowData<Shipment>(shipmentRow);
  if (
    !shipmentRow ||
    !shipment ||
    shipment.id !== parsed.shipmentId ||
    !isActiveData(shipment)
  )
    notFound("shipment_not_found");
  if (shipmentOffice(shipment) !== officeId)
    forbidden("shipment_office_scope_required");
  const shipmentRetired = await retired(tx, "shipment", [parsed.shipmentId]);
  if (shipmentRetired.has(parsed.shipmentId)) conflict("shipment_retired");
  validateActiveGoods(shipment, goodsIds);

  const existing = asRows<CustomerShipmentAccessRow>(
    await tx
      .select()
      .from(customerShipmentAccess)
      .where(
        and(
          eq(customerShipmentAccess.shipmentId, parsed.shipmentId),
          inArray(customerShipmentAccess.goodsId, goodsIds)
        )
      )
      .limit(goodsIds.length + 1)
      .for("update")
  );
  const byGood = new Map(existing.map(row => [row.goodsId, row]));
  const saved: CustomerShipmentAccessRow[] = [];
  for (const item of parsed.goods) {
    const current = byGood.get(item.goodsId);
    if ((current?.version ?? 0) !== item.expectedVersion)
      conflict("customer_link_version_conflict");
    if (
      current?.status === "active" &&
      (current.userId !== target.id ||
        current.customerAccountId !== parsed.customerAccountId)
    )
      conflict("goods_already_owned");
    if (current?.status === "active") {
      saved.push(current);
      continue;
    }
    const nextVersion = current ? current.version + 1 : 1;
    const values = {
      id: current?.id ?? crypto.randomUUID(),
      userId: target.id,
      customerAccountId: parsed.customerAccountId,
      shipmentId: parsed.shipmentId,
      goodsId: item.goodsId,
      officeId,
      status: "active" as const,
      version: nextVersion,
      grantedBy: actor.id,
      updatedBy: actor.id,
    };
    if (current)
      await tx
        .update(customerShipmentAccess)
        .set(values)
        .where(eq(customerShipmentAccess.id, current.id));
    else await tx.insert(customerShipmentAccess).values(values);
    await appendAudit(tx, {
      actor: actorForAudit(actor, scope.role),
      entity: "customer_shipment_access",
      recordId: values.id,
      action: "customer_link_grant",
      before: current
        ? {
            status: current.status,
            version: current.version,
            userId: current.userId,
            customerAccountId: current.customerAccountId,
            shipmentId: current.shipmentId,
            goodsId: current.goodsId,
            officeId: current.officeId,
          }
        : null,
      after: {
        status: values.status,
        version: values.version,
        userId: values.userId,
        customerAccountId: values.customerAccountId,
        shipmentId: values.shipmentId,
        goodsId: values.goodsId,
        officeId: values.officeId,
      },
      beforeVersion: current?.version ?? 0,
      afterVersion: nextVersion,
      requestKey: `customer-link-grant:${values.id}:${nextVersion}`,
    });
    saved.push({
      ...(current ?? values),
      ...values,
      createdAt: current?.createdAt ?? new Date(),
      updatedAt: new Date(),
    } as CustomerShipmentAccessRow);
  }
  return { items: saved.map(accessPublic) };
}

async function revokeInTransaction(
  tx: CustomerTrackingDb,
  actor: User,
  input: CustomerLinkRevokeInput
): Promise<CustomerLinkMutationResult> {
  const parsed = customerLinkRevokeInputSchema.parse(input);
  const goodsIds = parsed.goods.map(item => item.goodsId);
  const accountRow = await lockedRecord(
    tx,
    "account",
    parsed.customerAccountId
  );
  const account = rowData<Account>(accountRow);
  if (
    !accountRow ||
    !account ||
    account.id !== parsed.customerAccountId ||
    !isActiveData(account)
  )
    notFound("customer_account_not_found");
  const officeId = accountOffice(account);
  if (!officeId) forbidden("customer_account_office_required");
  const scope = await ensureActorScope(tx, actor, officeId);
  await assertActiveEntity(tx, "account", parsed.customerAccountId);
  const shipmentRow = await lockedRecord(tx, "shipment", parsed.shipmentId);
  const shipment = rowData<Shipment>(shipmentRow);
  if (
    !shipmentRow ||
    !shipment ||
    shipment.id !== parsed.shipmentId ||
    !isActiveData(shipment)
  )
    notFound("shipment_not_found");
  if (shipmentOffice(shipment) !== officeId)
    forbidden("shipment_office_scope_required");
  await assertActiveEntity(tx, "shipment", parsed.shipmentId);
  validateActiveGoods(shipment, goodsIds);
  const existing = asRows<CustomerShipmentAccessRow>(
    await tx
      .select()
      .from(customerShipmentAccess)
      .where(
        and(
          eq(customerShipmentAccess.shipmentId, parsed.shipmentId),
          inArray(customerShipmentAccess.goodsId, goodsIds)
        )
      )
      .limit(goodsIds.length + 1)
      .for("update")
  );
  const byGood = new Map(existing.map(row => [row.goodsId, row]));
  const saved: CustomerShipmentAccessRow[] = [];
  for (const item of parsed.goods) {
    const current = byGood.get(item.goodsId);
    if (!current || current.customerAccountId !== parsed.customerAccountId)
      conflict("customer_link_not_found");
    if (current.version !== item.expectedVersion)
      conflict("customer_link_version_conflict");
    if (current.status === "revoked") {
      saved.push(current);
      continue;
    }
    const nextVersion = current.version + 1;
    await tx
      .update(customerShipmentAccess)
      .set({ status: "revoked", version: nextVersion, updatedBy: actor.id })
      .where(eq(customerShipmentAccess.id, current.id));
    await appendAudit(tx, {
      actor: actorForAudit(actor, scope.role),
      entity: "customer_shipment_access",
      recordId: current.id,
      action: "customer_link_revoke",
      before: {
        status: current.status,
        version: current.version,
        userId: current.userId,
        customerAccountId: current.customerAccountId,
        shipmentId: current.shipmentId,
        goodsId: current.goodsId,
        officeId: current.officeId,
      },
      after: {
        status: "revoked",
        version: nextVersion,
        userId: current.userId,
        customerAccountId: current.customerAccountId,
        shipmentId: current.shipmentId,
        goodsId: current.goodsId,
        officeId: current.officeId,
      },
      beforeVersion: current.version,
      afterVersion: nextVersion,
      requestKey: `customer-link-revoke:${current.id}:${nextVersion}`,
    });
    saved.push({
      ...current,
      status: "revoked",
      version: nextVersion,
      updatedBy: actor.id,
      updatedAt: new Date(),
    });
  }
  return { items: saved.map(accessPublic) };
}

export async function grantCustomerShipmentAccess(
  db: CustomerTrackingDb,
  actor: User,
  input: CustomerLinkGrantInput
) {
  const run = (tx: CustomerTrackingDb) => grantInTransaction(tx, actor, input);
  return db.transaction ? db.transaction(run) : run(db);
}
export async function revokeCustomerShipmentAccess(
  db: CustomerTrackingDb,
  actor: User,
  input: CustomerLinkRevokeInput
) {
  const run = (tx: CustomerTrackingDb) => revokeInTransaction(tx, actor, input);
  return db.transaction ? db.transaction(run) : run(db);
}

async function customerUserActive(db: CustomerTrackingDb, user: User) {
  const currentRows = await db
    .select()
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  const currentUser = asRows<Pick<User, "id" | "accountType">>(currentRows)[0];
  if (
    !currentUser ||
    currentUser.id !== user.id ||
    currentUser.accountType !== "customer"
  )
    forbidden("customer_account_required");
  const membership = await db
    .select({ userId: memberRoles.userId })
    .from(memberRoles)
    .where(eq(memberRoles.userId, user.id))
    .limit(1);
  if (membership.length) forbidden("customer_employee_membership_forbidden");
  const disabled = await retired(db, "employee", [String(user.id)]);
  if (disabled.has(String(user.id))) forbidden("customer_disabled");
}

async function trackingTimeline(
  db: Pick<CustomerTrackingDb, "select">,
  shipmentId: string
) {
  const rows = asRows<any>(
    await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.entity, "shipment"),
          eq(auditEvents.recordId, shipmentId),
          inArray(auditEvents.action, [...TRACKING_ACTIONS])
        )
      )
      .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
      .limit(100)
  );
  return rows
    .filter(row => TRACKING_ACTIONS.has(String(row.action)))
    .map(row => {
      const after = row.afterData as any;
      const journey = after?.journey;
      const at =
        typeof journey?.updatedAt === "string"
          ? journey.updatedAt
          : row.createdAt instanceof Date
            ? row.createdAt.toISOString()
            : String(row.createdAt);
      const parsed = customerTrackingTimelineItemSchema.safeParse({
        stage: journey?.stage ?? null,
        branch: journey?.branch ?? null,
        at,
      });
      return parsed.success ? parsed.data : null;
    })
    .filter((row): row is { stage: any; branch: any; at: string } =>
      Boolean(row)
    )
    .sort((a, b) => {
      const byTime = Date.parse(a.at) - Date.parse(b.at);
      return byTime || a.at.localeCompare(b.at);
    })
    .slice(-100);
}

/** Public /track augmentation: no timeline is returned for a failed match. */
export async function augmentPublicTrackingTimeline(
  db: Pick<CustomerTrackingDb, "select">,
  result: PublicTrackingResult,
  shipmentId: string
): Promise<PublicTrackingResult> {
  if (!result.found) return result;
  const timeline = await trackingTimeline(db, shipmentId);
  return publicTrackingResultSchema.parse({
    ...result,
    shipment: { ...result.shipment, ...(timeline.length ? { timeline } : {}) },
  });
}

async function latestWarehouseFacts(
  db: CustomerTrackingDb,
  shipmentId: string,
  goodsIds: readonly string[]
) {
  const latestRows = await Promise.all(
    goodsIds.map(async goodsId => {
      const rows = asRows<any>(
        await db
          .select()
          .from(warehouseLocationEvents)
          .where(
            and(
              eq(warehouseLocationEvents.shipmentId, shipmentId),
              eq(warehouseLocationEvents.goodsId, goodsId)
            )
          )
          .orderBy(
            desc(warehouseLocationEvents.createdAt),
            desc(warehouseLocationEvents.expectedVersion),
            desc(warehouseLocationEvents.id)
          )
          .limit(1)
      );
      return [goodsId, rows[0] ?? null] as const;
    })
  );
  const latest = new Map(latestRows);
  const deliveryByGoods = new Map<string, string | null>();
  const locationByGoods = new Map<string, CustomerTrackingLocation | null>();
  for (const goodsId of goodsIds) {
    const row = latest.get(goodsId);
    deliveryByGoods.set(
      goodsId,
      row?.action === "deliver" ? new Date(row.createdAt).toISOString() : null
    );
    locationByGoods.set(
      goodsId,
      row
        ? {
            officeLabel: officeLabel(row.officeId),
            warehouseLabel:
              typeof row.warehouseCode === "string" ? row.warehouseCode : null,
            placeLabel:
              typeof row.locationCode === "string"
                ? row.locationCode
                : typeof row.shelfCode === "string"
                  ? row.shelfCode
                  : null,
            at: row.createdAt ? new Date(row.createdAt).toISOString() : null,
          }
        : null
    );
  }
  return { deliveryByGoods, locationByGoods };
}

export async function readCustomerTracking(
  db: CustomerTrackingDb,
  user: User
): Promise<CustomerTrackingResult> {
  await customerUserActive(db, user);
  const accessRows = asRows<CustomerShipmentAccessRow>(
    await db
      .select()
      .from(customerShipmentAccess)
      .where(
        and(
          eq(customerShipmentAccess.userId, user.id),
          eq(customerShipmentAccess.status, "active")
        )
      )
      .limit(CUSTOMER_TRACKING_MAX_SHIPMENTS * CUSTOMER_LINK_MAX_GOODS + 1)
  );
  if (!accessRows.length) return { shipments: [] };
  const accountIds = [...new Set(accessRows.map(row => row.customerAccountId))];
  const shipmentIds = [...new Set(accessRows.map(row => row.shipmentId))];
  const [accountRows, shipmentRows] = await Promise.all([
    db
      .select()
      .from(records)
      .where(
        and(
          eq(records.entity, "account"),
          inArray(records.recordId, accountIds)
        )
      )
      .limit(accountIds.length + 1),
    db
      .select()
      .from(records)
      .where(
        and(
          eq(records.entity, "shipment"),
          inArray(records.recordId, shipmentIds)
        )
      )
      .limit(shipmentIds.length + 1),
  ]);
  const [accountRetired, shipmentRetired] = await Promise.all([
    retired(db, "account", accountIds),
    retired(db, "shipment", shipmentIds),
  ]);
  const accounts = new Map(
    asRows<any>(accountRows).map(row => [
      String(row.recordId),
      rowData<Account>(row),
    ])
  );
  const shipments = new Map(
    asRows<any>(shipmentRows).map(row => [
      String(row.recordId),
      rowData<Shipment>(row),
    ])
  );
  const grouped = new Map<string, CustomerShipmentAccessRow[]>();
  for (const access of accessRows) {
    const account = accounts.get(access.customerAccountId);
    const shipment = shipments.get(access.shipmentId);
    if (
      !account ||
      !shipment ||
      !isActiveData(account) ||
      !isActiveData(shipment) ||
      accountRetired.has(access.customerAccountId) ||
      shipmentRetired.has(access.shipmentId)
    )
      continue;
    if (
      accountOffice(account) !== access.officeId ||
      shipmentOffice(shipment) !== access.officeId
    )
      continue;
    if (!grouped.has(access.shipmentId)) grouped.set(access.shipmentId, []);
    grouped.get(access.shipmentId)!.push(access);
  }
  const output: CustomerTrackingResult["shipments"] = [];
  for (const [shipmentId, access] of grouped) {
    const shipment = shipments.get(shipmentId)!;
    const goodsIds = [...new Set(access.map(row => row.goodsId))];
    const activeGoods = new Set(
      shipment.packing?.cartons.flatMap(carton =>
        carton.goods.filter(item => !item.deleted).map(item => item.id)
      ) ?? []
    );
    const visibleGoods = goodsIds.filter(id => activeGoods.has(id));
    if (!visibleGoods.length) continue;
    const facts = await latestWarehouseFacts(db, shipmentId, visibleGoods);
    const timeline = await trackingTimeline(db, shipmentId);
    const allActiveGoodsLinked = activeGoods.size === visibleGoods.length;
    const projected = projectCustomerShipment(shipment, visibleGoods, {
      ...facts,
      timeline,
      allActiveGoodsLinked,
    });
    if (projected) output.push(projected);
  }
  output.sort((a, b) => a.tracking.localeCompare(b.tracking));
  return customerTrackingResultSchema.parse({
    shipments: output.slice(0, CUSTOMER_TRACKING_MAX_SHIPMENTS),
  });
}

export const customerAccessListInputSchema = customerLinkRevokeInputSchema.pick(
  { customerAccountId: true, shipmentId: true }
);
export const customerAccessListOutputSchema = customerLinkMutationResultSchema;

export async function listCustomerShipmentAccess(
  db: CustomerTrackingDb,
  actor: User,
  input: { customerAccountId: string; shipmentId: string }
) {
  const parsed = customerAccessListInputSchema.parse(input);
  const accountRow = await lockedRecord(
    db,
    "account",
    parsed.customerAccountId
  );
  const account = rowData<Account>(accountRow);
  if (
    !account ||
    account.id !== parsed.customerAccountId ||
    !isActiveData(account)
  )
    notFound("customer_account_not_found");
  const officeId = accountOffice(account);
  if (!officeId) forbidden("customer_account_office_required");
  await ensureActorScope(db, actor, officeId);
  await assertActiveEntity(db, "account", parsed.customerAccountId);
  const shipmentRow = await lockedRecord(db, "shipment", parsed.shipmentId);
  const shipment = rowData<Shipment>(shipmentRow);
  if (
    !shipment ||
    shipment.id !== parsed.shipmentId ||
    shipmentOffice(shipment) !== officeId ||
    shipment.deleted
  )
    forbidden("shipment_office_scope_required");
  await assertActiveEntity(db, "shipment", parsed.shipmentId);
  const rows = asRows<CustomerShipmentAccessRow>(
    await db
      .select()
      .from(customerShipmentAccess)
      .where(
        and(
          eq(
            customerShipmentAccess.customerAccountId,
            parsed.customerAccountId
          ),
          eq(customerShipmentAccess.shipmentId, parsed.shipmentId)
        )
      )
      .limit(CUSTOMER_LINK_MAX_GOODS + 1)
  );
  return { items: rows.map(accessPublic) };
}

async function dbOrThrow() {
  return dbRequired((await getDb()) as CustomerTrackingDb | null);
}

export const customerTrackingRouter = router({
  mine: protectedProcedure
    .input(customerTrackingRequestSchema)
    .output(customerTrackingResultSchema)
    .query(async ({ ctx }) => {
      ctx.res.setHeader("Cache-Control", "no-store");
      return readCustomerTracking(await dbOrThrow(), ctx.user);
    }),
  grant: protectedProcedure
    .input(customerLinkGrantInputSchema)
    .mutation(async ({ ctx, input }) => {
      ctx.res.setHeader("Cache-Control", "no-store");
      return grantCustomerShipmentAccess(await dbOrThrow(), ctx.user, input);
    }),
  revoke: protectedProcedure
    .input(customerLinkRevokeInputSchema)
    .mutation(async ({ ctx, input }) => {
      ctx.res.setHeader("Cache-Control", "no-store");
      return revokeCustomerShipmentAccess(await dbOrThrow(), ctx.user, input);
    }),
  listAccess: protectedProcedure
    .input(customerAccessListInputSchema)
    .output(customerAccessListOutputSchema)
    .query(async ({ ctx, input }) => {
      ctx.res.setHeader("Cache-Control", "no-store");
      return listCustomerShipmentAccess(await dbOrThrow(), ctx.user, input);
    }),
});

export { LINK_ACTIONS };
