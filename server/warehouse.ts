import { loadLifecycle, recordIsActive, assertActiveEntity } from "./lifecycle";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { User } from "../drizzle/schema";
import {
  records,
  syncReceipts,
  shipmentTrackingEvents,
  warehouseLocationEvents,
} from "../drizzle/schema";
import { appendAudit } from "./audit";
import {
  readOfficeScope,
  recordVisible,
  type OfficeScope,
  hideForOfficeScope,
} from "./branches";
import { actorFromUser } from "./tracking";
import type { AppRole, Invoice, Shipment } from "@shared/operations";
import { sourceReceivable } from "@shared/finance";
import {
  destinationStorageSchema,
  warehouseCommandSchema,
  type WarehouseBilling,
  type DestinationStorageItem,
  type WarehouseCommand,
} from "@shared/warehouse";
import type { OfficeId } from "@shared/branches";
import { permissionAllowed, type PermissionMap } from "@shared/permissions";
import { z } from "zod";
import { readShipmentPricingProjection } from "./shipmentPricing";
import type { PriceProjection } from "@shared/shipmentPricing";
import { lockEmployee } from "./lockedEmployee";
import { marketStageForShipment } from "./marketWarehouse";

export {
  destinationStorageSchema,
  warehouseCommandSchema,
} from "@shared/warehouse";
export type {
  DestinationStorageItem,
  WarehouseCommand,
} from "@shared/warehouse";

export type WarehouseSnapshot = {
  shipments: Shipment[];
  canEdit: boolean;
  pricingProjections: PriceProjection[];
};
export type WarehouseDb = {
  select: (...args: any[]) => any;
  transaction?: <T>(callback: (tx: WarehouseDb) => Promise<T>) => Promise<T>;
  update: (...args: any[]) => any;
  insert: (...args: any[]) => any;
};

type WarehouseShipment = Shipment & {
  destinationStorage?: DestinationStorageItem[];
};
type WarehouseScope = OfficeScope & {
  /** Added by the fresh OfficeScope contract; undefined keeps legacy behavior. */
  permissions?: PermissionMap | null;
  delegatedBy?: AppRole | null;
};
const arrivedStatuses = new Set<Shipment["status"]>([
  "وصلت للمكتب",
  "جاهزة للتسليم",
  "بانتظار الدفع",
  "مسلّمة",
]);

function forbidden(message = "warehouse_forbidden"): never {
  throw new TRPCError({ code: "FORBIDDEN", message });
}
function conflict(message = "warehouse_version_conflict"): never {
  throw new TRPCError({ code: "CONFLICT", message });
}
function isNouakchottStaff(scope: OfficeScope): boolean {
  return (
    scope.role === "staff" &&
    scope.offices?.length === 1 &&
    scope.offices[0] === "nouakchott" &&
    scope.homeOffice === "nouakchott"
  );
}
/** Shelf assignment: Nouakchott warehouse staff, plus the general manager. */
function canWriteWarehouse(scope: OfficeScope): boolean {
  if (scope.role === "admin") return true;
  const permissions = (scope as WarehouseScope).permissions;
  const hasCapability = permissionAllowed(
    {
      role: scope.role,
      offices: scope.offices,
      homeOffice: scope.homeOffice,
      permissions,
    },
    "storage",
    "manage"
  );
  // Physical storage remains a Nouakchott-only operation, even when a manager
  // delegates the storage capability. The scope is read again inside the TX.
  return (
    hasCapability &&
    scope.offices?.length === 1 &&
    scope.offices[0] === "nouakchott" &&
    scope.homeOffice === "nouakchott"
  );
}
function canReadWarehouse(scope: OfficeScope): boolean {
  if (scope.role === "admin") return true;
  const permissions = (scope as WarehouseScope).permissions;
  // A null/omitted map is the legacy contract. Explicit maps are authoritative:
  // storage:view can read, while none cannot (including pending local drafts).
  if (permissions !== undefined && permissions !== null)
    return permissionAllowed(
      {
        role: scope.role,
        offices: scope.offices,
        homeOffice: scope.homeOffice,
        permissions,
      },
      "storage",
      "view"
    );
  return scope.role === "office_manager" || isNouakchottStaff(scope);
}
function arrivedInNouakchott(shipment: Shipment): boolean {
  if (
    shipment.deleted ||
    !shipment.packing ||
    !arrivedStatuses.has(shipment.status)
  )
    return false;
  const stage = shipment.journey?.stage;
  if (stage === "to_nouakchott") return false;
  if (!stage) return true; // legacy records encode arrival in status only.
  return (
    stage === "arrived_office" || shipment.journey?.branch === "nouakchott"
  );
}
function storageOf(shipment: Shipment): DestinationStorageItem[] {
  const candidate = (shipment as WarehouseShipment).destinationStorage;
  const parsed = destinationStorageSchema.safeParse(candidate ?? []);
  return parsed.success ? parsed.data : [];
}
function billingOf(
  shipment: Shipment,
  invoices: readonly Invoice[]
): WarehouseBilling | undefined {
  const [group] = sourceReceivable([shipment], null, invoices);
  const row = group?.shipments[0];
  if (!row || !group) return undefined;
  const billedAmount = row.soldAmount ?? 0;
  const remainingAmount = row.remainingAmount ?? row.amount;
  const hasDebt = invoices.some(
    invoice =>
      invoice.finance?.shipmentId === shipment.id && invoice.status === "دين"
  );
  const status: WarehouseBilling["status"] =
    row.pricingStatus === "unpriced"
      ? "unpriced"
      : billedAmount <= 0
        ? "unbilled"
        : remainingAmount > 0
          ? "partial"
          : hasDebt
            ? "debt"
            : "paid";
  return {
    status,
    amount: Math.max(0, row.amount),
    billedAmount: Math.max(0, billedAmount),
    remainingAmount: Math.max(0, remainingAmount),
    currency: group.currency,
  };
}
function warehousePublicShipment(
  shipment: Shipment,
  role: AppRole | null,
  offices: OfficeId[] | null
): Shipment {
  const scoped = hideForOfficeScope(
    shipment,
    role,
    offices
  ) as WarehouseShipment;
  const packing = scoped.packing;
  return {
    ...scoped,
    amount: 0,
    ...(packing
      ? {
          packing: {
            ...packing,
            pricePerKg: 0,
            ...(packing.pricePerKgMRU === undefined
              ? {}
              : { pricePerKgMRU: undefined }),
            cartons: packing.cartons.map(carton => ({
              ...carton,
              goods: carton.goods.map(goods => ({ ...goods })),
            })),
          },
        }
      : {}),
    destinationStorage: storageOf(shipment),
  } as Shipment;
}
async function rowsFor(db: WarehouseDb) {
  return db.select().from(records).where(eq(records.entity, "shipment"));
}
function assertVisible(scope: OfficeScope, shipment: Shipment) {
  if (!recordVisible(scope, "shipment", shipment))
    forbidden("warehouse_scope_forbidden");
}

/** Read only arrived, non-deleted Nouakchott goods; finance is stripped for every role. */
export async function readWarehouseSnapshot(
  db: WarehouseDb,
  user: Pick<User, "id" | "openId" | "role">
): Promise<WarehouseSnapshot> {
  const scope = await readOfficeScope(db, user);
  if (!canReadWarehouse(scope)) forbidden();
  const retired = await loadLifecycle(db);
  const rows = await rowsFor(db);
  const invoiceRows = await db
    .select()
    .from(records)
    .where(eq(records.entity, "invoice"));
  const invoices = invoiceRows
    .filter((row: any) =>
      recordIsActive(retired, "invoice", row.data as Invoice)
    )
    .map((row: any) => row.data as Invoice);
  const pricingProjections: PriceProjection[] = [];
  const shipments: Shipment[] = [];
  for (const row of rows as Array<{ data: Shipment; version: number }>) {
    const shipment = { ...row.data, version: row.version };
    if (
      !recordIsActive(retired, "shipment", shipment) ||
      !arrivedInNouakchott(shipment)
    )
      continue;
    if (!recordVisible(scope, "shipment", shipment)) continue;
    if (permissionAllowed(scope, "shipment_prices", "view")) {
      const projection = await readShipmentPricingProjection(
        db,
        shipment,
        row.version,
        scope
      );
      pricingProjections.push(
        ...[projection.source, projection.destination].filter(
          (item): item is PriceProjection => Boolean(item)
        )
      );
    }
    const publicShipment = warehousePublicShipment(
      shipment,
      scope.role,
      scope.offices
    );
    const billing = billingOf(shipment, invoices);
    shipments.push(
      billing
        ? { ...publicShipment, warehouseBilling: billing }
        : publicShipment
    );
  }
  return {
    shipments,
    canEdit: canWriteWarehouse(scope),
    pricingProjections,
  };
}

function payloadHash(input: WarehouseCommand): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        requestId: input.requestId,
        shipmentId: input.shipmentId,
        goodsId: input.goodsId,
        warehouse: input.warehouse,
        shelf: input.shelf,
        expectedVersion: input.expectedVersion,
        clientUserId: input.clientUserId ?? null,
      })
    )
    .digest("hex");
}
function receiptKey(requestId: string): string {
  return `warehouse:${createHash("sha256").update(requestId).digest("hex")}`;
}
function findGood(shipment: Shipment, goodsId: string) {
  for (const carton of shipment.packing?.cartons ?? []) {
    const goods = carton.goods.find(item => item.id === goodsId);
    if (goods) return { carton, goods };
  }
  return null;
}

/** Atomically updates only destinationStorage for one arrived good. */
export async function commitWarehouseStorage(
  db: WarehouseDb,
  user: User,
  rawInput: z.input<typeof warehouseCommandSchema>
) {
  const input = warehouseCommandSchema.parse(rawInput);
  if (input.clientUserId && input.clientUserId !== String(user.id))
    throw new Error("sync_owner_mismatch");
  if (!db.transaction) throw new Error("warehouse_transaction_required");
  return db.transaction(async tx => {
    const freshUser = await lockEmployee(tx, user);
    const scope = await readOfficeScope(tx, freshUser, new Set<number>(), true);
    await assertActiveEntity(tx, "shipment", input.shipmentId);
    if (!canWriteWarehouse(scope))
      forbidden("warehouse_staff_nouakchott_required");
    const key = receiptKey(input.requestId);
    const hash = payloadHash(input);
    const prior = await tx
      .select()
      .from(syncReceipts)
      .where(
        and(
          eq(syncReceipts.userId, freshUser.id),
          eq(syncReceipts.changeId, key)
        )
      )
      .limit(1)
      .for("update");
    if (prior[0]) {
      const replay = prior[0].result as {
        payloadHash?: string;
        result?: unknown;
      };
      if (replay.payloadHash !== hash) conflict("warehouse_request_reuse");
      const currentRows = await tx
        .select()
        .from(records)
        .where(
          and(
            eq(records.entity, "shipment"),
            eq(records.recordId, input.shipmentId)
          )
        )
        .limit(1)
        .for("update");
      const current = currentRows[0]?.data as Shipment | undefined;
      if (!current || !recordVisible(scope, "shipment", current))
        forbidden("warehouse_scope_forbidden");
      return replay.result;
    }
    const rows = await tx
      .select()
      .from(records)
      .where(
        and(
          eq(records.entity, "shipment"),
          eq(records.recordId, input.shipmentId)
        )
      )
      .limit(1)
      .for("update");
    const row = rows[0];
    if (!row)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "warehouse_shipment_not_found",
      });
    const shipment = row.data as WarehouseShipment;
    if (!recordVisible(scope, "shipment", shipment))
      forbidden("warehouse_scope_forbidden");
    if (shipment.deleted) forbidden("warehouse_deleted_shipment");
    if (row.version !== input.expectedVersion) conflict();
    if (!arrivedInNouakchott(shipment))
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "warehouse_not_arrived",
      });
    if (shipment.status === "مسلّمة")
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "warehouse_delivered_readonly",
      });
    const found = findGood(shipment, input.goodsId);
    if (!found || found.goods.deleted)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "warehouse_goods_not_found",
      });
    const now = new Date().toISOString();
    const nextStorage = storageOf(shipment).filter(
      item => item.goodsId !== input.goodsId
    );
    nextStorage.push({
      goodsId: input.goodsId,
      warehouse: input.warehouse,
      shelf: input.shelf,
      updatedAt: now,
      updatedBy: freshUser.id,
    });
    destinationStorageSchema.parse(nextStorage);
    const nextVersion = row.version + 1;
    const next = {
      ...shipment,
      destinationStorage: nextStorage,
    } as WarehouseShipment;
    await tx
      .update(records)
      .set({ version: nextVersion, data: next, updatedBy: freshUser.id })
      .where(eq(records.id, row.id));
    await tx.insert(warehouseLocationEvents).values({
      id: `warehouse-location:${key}`,
      shipmentId: input.shipmentId,
      goodsId: input.goodsId,
      officeId: "nouakchott",
      warehouseCode: input.warehouse,
      shelfCode: input.shelf,
      locationCode: `${input.warehouse} - ${input.shelf}`,
      action: "shelve",
      expectedVersion: row.version,
      actorId: freshUser.id,
      requestKey: key,
    });
    const actorRole = scope.role as AppRole;
    await appendAudit(tx as any, {
      actor: actorFromUser(freshUser, actorRole),
      entity: "warehouse_storage",
      recordId: input.shipmentId,
      action: "set_location",
      before: { destinationStorage: storageOf(shipment) },
      after: { destinationStorage: nextStorage },
      beforeVersion: row.version,
      afterVersion: nextVersion,
      requestKey: key,
    });
    const previousStage = marketStageForShipment(shipment);
    const nextStage = marketStageForShipment(next);
    if (previousStage !== nextStage)
      await tx.insert(shipmentTrackingEvents).values({
        id: `market-event:${key}`,
        shipmentId: input.shipmentId,
        goodsId: input.goodsId,
        eventType: "stage",
        stage: nextStage,
        status: next.status,
        actorId: freshUser.id,
        actorName: freshUser.name?.trim() || `user-${freshUser.id}`,
        actorRole,
        officeId: "nouakchott",
        reason: "warehouse_shelved",
        requestKey: `market:${key}`,
      });
    const result = {
      requestId: input.requestId,
      shipmentId: input.shipmentId,
      goodsId: input.goodsId,
      storage: nextStorage.find(item => item.goodsId === input.goodsId)!,
      version: nextVersion,
    };
    await tx.insert(syncReceipts).values({
      userId: freshUser.id,
      changeId: key,
      result: { payloadHash: hash, result },
    });
    return result;
  });
}
