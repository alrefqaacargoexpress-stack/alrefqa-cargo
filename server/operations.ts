import { z } from "zod";
import type { User } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { canonicalPackingShipment, packingSchema } from "@shared/packing";
import { journeySchema } from "@shared/tracking";
import { stageShipmentStatus } from "@shared/tracking";
import { invoicePaymentSchema } from "@shared/office";
import {
  assertShipmentAction,
  shipmentActionSchema,
  shipmentDeletionSchema,
  shipmentContent,
} from "@shared/shipmentDeletion";
import {
  type Account,
  type AppRole,
  canViewFinance,
  canWrite,
  type Entity,
  type EntityRecord,
  type Invoice,
  type LocalState,
  type PendingChange,
  type Shipment,
  type SyncResult,
} from "@shared/operations";
import { financialInvoiceSchema } from "@shared/finance";
import {
  canReadOfficeRecord,
  canWriteOfficeRecord,
  ownerOffice,
  type OfficeId,
} from "@shared/branches";

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const safeNonNegative = z
  .number()
  .finite()
  .nonnegative()
  .refine(Number.isSafeInteger, "must be a safe integer");
const nonNegative = z.number().finite().nonnegative().max(999999999);
const optionalMeta = {
  officeId: z.enum(["nouakchott", "dubai", "china", "turkey"]).optional(),
  scope: z.enum(["shared", "local", "pending"]).optional(),
  version: safeNonNegative.optional(),
};

export const accountDataSchema = z
  .object({
    id: boundedString(128),
    name: boundedString(240),
    phone: z.string().trim().max(64),
    city: z.string().trim().max(160),
    shipments: safeNonNegative,
    balance: nonNegative,
    updatedAt: boundedString(80),
    ...optionalMeta,
  })
  .strict();
export const shipmentDataSchema = z
  .object({
    id: boundedString(128),
    tracking: boundedString(128),
    account: boundedString(240),
    route: boundedString(240),
    service: z.enum(["جوي", "بحري", "سريع"]),
    status: z.enum([
      "في الطريق",
      "وصلت للمكتب",
      "جاهزة للتسليم",
      "بانتظار الدفع",
      "قيد التجهيز",
      "مسلّمة",
    ]),
    eta: boundedString(80),
    amount: nonNegative,
    packing: packingSchema.optional(),
    journey: journeySchema.optional(),
    deleted: shipmentDeletionSchema.optional(),
    ...optionalMeta,
  })
  .strict();
export const invoiceDataSchema = z
  .object({
    id: boundedString(128),
    account: boundedString(240),
    amount: nonNegative,
    status: z.enum(["مدفوعة", "بانتظار الدفع", "دين"]),
    issuedAt: boundedString(80),
    payment: invoicePaymentSchema.optional(),
    finance: financialInvoiceSchema.optional(),
    ...optionalMeta,
  })
  .strict();

export const pendingChangeSchema = z
  .object({
    id: boundedString(128),
    label: z.string().trim().max(240),
    createdAt: boundedString(80),
    entity: z.enum(["account", "shipment", "invoice"]),
    recordId: boundedString(128),
    expectedVersion: z.union([z.null(), safeNonNegative]),
    action: shipmentActionSchema.optional(),
    data: z.union([accountDataSchema, shipmentDataSchema, invoiceDataSchema]),
  })
  .strict();
export const syncInputSchema = z
  .object({ changes: z.array(pendingChangeSchema).max(500) })
  .strict();
export const setRoleInputSchema = z
  .object({
    userId: safeNonNegative,
    role: z.enum(["admin", "staff", "accountant", "viewer", "tracking_staff", "supervisor"]),
  })
  .strict();

export type ValidChange = z.infer<typeof pendingChangeSchema>;
export type MemoryRow = {
  entity: Entity;
  recordId: string;
  version: number;
  data: EntityRecord;
};

/** Root owner and the database's real admin flag are authoritative; a first visitor is never promoted. */
export function roleForUser(
  user: Pick<User, "openId" | "role"> | null,
  membership?: AppRole | null
): AppRole | null {
  if (!user) return null;
  if (ENV.ownerOpenId && user.openId === ENV.ownerOpenId) return "admin";
  if (user.role === "admin") return "admin";
  return membership ?? null;
}

export function canManageMembers(
  user: Pick<User, "openId" | "role"> | null,
  membership?: AppRole | null
): boolean {
  return roleForUser(user, membership) === "admin";
}

export function parseChange(change: unknown): ValidChange {
  const parsed = pendingChangeSchema.parse(change);
  if (parsed.action && parsed.entity !== "shipment")
    throw new Error("invalid_shipment_action");
  if (parsed.data.id !== parsed.recordId) {
    // The record id is the authoritative key, but accepting a different display id would make
    // replay/debugging ambiguous. Keep the public contract and reject it explicitly.
    throw new Error("data.id must equal recordId");
  }
  const expectedSchema =
    parsed.entity === "account"
      ? accountDataSchema
      : parsed.entity === "shipment"
        ? shipmentDataSchema
        : invoiceDataSchema;
  const data = expectedSchema.parse(parsed.data);
  return {
    ...parsed,
    data:
      parsed.entity === "shipment"
        ? canonicalPackingShipment(data as Shipment)
        : data,
  } as ValidChange;
}

export function hideFinance<T extends EntityRecord>(
  record: T,
  role: AppRole | null
): T {
  if (canViewFinance(role)) return { ...record } as T;
  if (record.id === undefined) return record;
  if ("balance" in record) return { ...record, balance: 0 } as T;
  if ("tracking" in record && record.packing)
    return {
      ...record,
      amount: 0,
      packing: {
        ...record.packing,
        pricePerKg: 0,
        ...(record.packing.pricePerKgMRU === undefined
          ? {}
          : { pricePerKgMRU: 0 }),
      },
    } as T;
  if ("amount" in record) return { ...record, amount: 0 } as T;
  return record;
}

export function publicRecord(
  row: MemoryRow,
  role: AppRole | null
): EntityRecord {
  return {
    ...hideFinance(row.data, role),
    scope: "shared",
    version: row.version,
  } as EntityRecord;
}

function preserveStaffFinance(
  role: AppRole | null,
  next: EntityRecord,
  current: EntityRecord | null
): EntityRecord {
  if (role !== "staff") return next;
  if (current && "balance" in next && "balance" in current)
    return { ...next, balance: current.balance };
  if (current && "amount" in next && "amount" in current) {
    if (
      "tracking" in next &&
      "tracking" in current &&
      next.packing &&
      current.packing
    )
      return {
        ...next,
        packing: {
          ...next.packing,
          pricePerKg: current.packing.pricePerKg,
          pricePerKgMRU: current.packing.pricePerKgMRU,
        },
        amount: current.amount,
      };
    return { ...next, amount: current.amount };
  }
  return next;
}

/** Preserve stored financial settings and all previously entered goods. */
export function prepareRecordForWrite(
  role: AppRole | null,
  next: EntityRecord,
  current: EntityRecord | null,
  action?: PendingChange["action"]
): EntityRecord {
  // Financial invoices are immutable facts owned by the finance API. Generic
  // operations sync must never create, edit, or erase them.
  if ("issuedAt" in next && ("finance" in next || next.status === "دين"))
    throw new Error("finance_command_required");
  if (current && "issuedAt" in current && ("finance" in current || current.status === "دين"))
    throw new Error("finance_command_required");
  let result = structuredClone(preserveStaffFinance(role, next, current));
  // Old clients omit officeId; omission must not clear a stored assignment.
  if (current?.officeId && !result.officeId)
    result = { ...result, officeId: current.officeId } as EntityRecord;
  if (
    current &&
    "issuedAt" in current &&
    "issuedAt" in result &&
    "payment" in current &&
    current.payment &&
    !("payment" in result)
  )
    result = { ...result, payment: structuredClone(current.payment) };
  if ("tracking" in result) {
    const oldShipment = current && "tracking" in current ? current : null;
    if (oldShipment?.journey) {
      // Older clients omit fields they do not understand; preserve the journey rather than
      // allowing a sync payload to erase actor-authored notes or metadata.
      if (!result.journey) result = { ...result, journey: structuredClone(oldShipment.journey) };
      else if (JSON.stringify(result.journey) !== JSON.stringify(oldShipment.journey))
        throw new Error("tracking_command_required");
      const stageStatus = stageShipmentStatus(oldShipment.journey.stage);
      const deliveredCorrection =
        result.status === "مسلّمة" &&
        oldShipment.journey.stage === "arrived_office" &&
        (role === "admin" || role === "staff");
      if (result.status !== oldShipment.status && !deliveredCorrection && result.status !== stageStatus)
        throw new Error("tracking_command_required");
    } else if (result.journey) {
      // Initial tracking plans are server commands, never a generic public record create.
      throw new Error("tracking_command_required");
    }
    assertShipmentAction(role, result, oldShipment, action);
    if (
      oldShipment &&
      (oldShipment.deleted || action) &&
      shipmentContent(canonicalPackingShipment(result)) !==
        shipmentContent(canonicalPackingShipment(oldShipment))
    )
      throw new Error(
        oldShipment.deleted
          ? "deleted_shipment_readonly"
          : "shipment_action_content_change_forbidden"
      );
    if (action === "delete-shipment" && result.deleted)
      result.deleted.at = new Date().toISOString();
  } else if (action) throw new Error("invalid_shipment_action");
  if (
    current &&
    "tracking" in current &&
    current.packing &&
    (!("tracking" in result) || !result.packing)
  )
    throw new Error("packing_data_loss_forbidden");
  if (!("tracking" in result) || !result.packing) return result;
  if (!canWrite(role, "shipment")) throw new Error("forbidden");
  if (
    role === "staff" &&
    "tracking" in next &&
    next.packing &&
    (next.packing.pricePerKg !== 0 ||
      (next.packing.pricePerKgMRU !== undefined &&
        next.packing.pricePerKgMRU !== 0))
  )
    throw new Error("financial_write_forbidden");
  if (current && "tracking" in current && current.packing) {
    const previous = current.packing;
    if (
      current.status !== "قيد التجهيز" &&
      (previous.pricePerKg !== result.packing.pricePerKg ||
        previous.pricePerKgMRU !== result.packing.pricePerKgMRU)
    )
      throw new Error("shipment_not_open");
    if (
      role === "staff" &&
      previous.pricePerKgMRU === undefined &&
      "tracking" in next &&
      next.packing?.pricePerKgMRU !== undefined
    )
      throw new Error("financial_write_forbidden");
    if (previous.source !== result.packing.source)
      throw new Error("source_change_forbidden");
    const allowed =
      current.status === "قيد التجهيز"
        ? ["قيد التجهيز", "في الطريق", "مسلّمة"]
        : current.status === "في الطريق"
          ? ["في الطريق", "مسلّمة"]
          : [current.status];
    if (!allowed.includes(result.status))
      throw new Error("invalid_status_transition");
    for (const oldCarton of previous.cartons) {
      const nextCarton = result.packing.cartons.find(
        c => c.number === oldCarton.number
      );
      if (!nextCarton || (oldCarton.closed && !nextCarton.closed))
        throw new Error("packing_data_loss_forbidden");
      for (const oldGoods of oldCarton.goods) {
        const kept = nextCarton.goods.find(g => g.id === oldGoods.id);
        if (
          !kept ||
          JSON.stringify([
            kept.name,
            kept.phone,
            kept.unitWeight,
            kept.pieces,
          ]) !==
            JSON.stringify([
              oldGoods.name,
              oldGoods.phone,
              oldGoods.unitWeight,
              oldGoods.pieces,
            ])
        )
          throw new Error("packing_data_loss_forbidden");
        if (
          JSON.stringify(kept.deleted) !== JSON.stringify(oldGoods.deleted) &&
          current.status !== "قيد التجهيز"
        )
          throw new Error("shipment_not_open");
        if (
          kept.deleted &&
          oldGoods.deleted &&
          JSON.stringify(kept.deleted) !== JSON.stringify(oldGoods.deleted)
        )
          throw new Error("deletion_metadata_change_forbidden");
      }
      if (
        oldCarton.closed &&
        nextCarton.goods.length !== oldCarton.goods.length
      )
        throw new Error("carton_closed");
    }
    if (
      current.status !== "قيد التجهيز" &&
      JSON.stringify(previous.cartons) !==
        JSON.stringify(result.packing.cartons)
    )
      throw new Error("shipment_not_open");
    result.packing.createdAt = previous.createdAt;
  }
  const existingGoods = new Map(
    current && "tracking" in current && current.packing
      ? current.packing.cartons
          .flatMap(c => c.goods)
          .map(g => [g.id, g] as const)
      : []
  );
  const acknowledgedAt = new Date().toISOString();
  for (const item of result.packing.cartons.flatMap(c => c.goods)) {
    if (item.deleted && !existingGoods.get(item.id)?.deleted)
      item.deleted = { ...item.deleted, at: acknowledgedAt };
  }
  return canonicalPackingShipment(result);
}

/** Validate an operation against the actor's explicit office allow-list. */
export function assertOfficeRecordWrite(
  role: AppRole | null,
  offices: OfficeId[] | null,
  entity: Entity,
  record: EntityRecord,
  current: EntityRecord | null,
): void {
  if (!role) throw new Error("forbidden");
  if (role === "admin" || offices === null) return;
  if (current?.officeId && record.officeId && current.officeId !== record.officeId)
    throw new Error("office_change_forbidden");
  const home = ownerOffice(entity, record);
  if (!home || !offices.includes(home)) throw new Error("office_scope_forbidden");
  if (!canWriteOfficeRecord(role, offices, entity, record))
    throw new Error("office_scope_forbidden");
}

export function canReadScopedRecord(
  role: AppRole | null,
  offices: OfficeId[] | null,
  entity: Entity,
  record: EntityRecord,
): boolean {
  return canReadOfficeRecord(role, offices, entity, record);
}

/** Pure optimistic-concurrency helper used by tests and kept equivalent to the SQL transaction path. */
export function applyChangeInMemory(
  state: Map<string, MemoryRow>,
  change: ValidChange,
  role: AppRole | null
): { result: SyncResult; nextState: Map<string, MemoryRow> } {
  const nextState = new Map(state);
  const key = `${change.entity}:${change.recordId}`;
  const current = state.get(key) ?? null;
  if (!canWrite(role, change.entity)) {
    return {
      nextState,
      result: {
        applied: [],
        conflicts: [
          {
            changeId: change.id,
            reason: "forbidden",
            current: current ? publicRecord(current, role) : null,
          },
        ],
      },
    };
  }
  if (role === "staff" && !current && isFinancialPayloadNonZero(change)) {
    return {
      nextState,
      result: {
        applied: [],
        conflicts: [
          {
            changeId: change.id,
            reason: "financial_write_forbidden",
            current: null,
          },
        ],
      },
    };
  }
  if (
    change.expectedVersion !== null &&
    (!current || current.version !== change.expectedVersion)
  ) {
    return {
      nextState,
      result: {
        applied: [],
        conflicts: [
          {
            changeId: change.id,
            reason: "version_conflict",
            current: current ? publicRecord(current, role) : null,
          },
        ],
      },
    };
  }
  if (change.expectedVersion === null && current) {
    return {
      nextState,
      result: {
        applied: [],
        conflicts: [
          {
            changeId: change.id,
            reason: "already_exists",
            current: publicRecord(current, role),
          },
        ],
      },
    };
  }
  let data: EntityRecord;
  try {
    data = prepareRecordForWrite(
      role,
      change.data,
      current?.data ?? null,
      change.action
    );
  } catch (error) {
    return {
      nextState,
      result: {
        applied: [],
        conflicts: [
          {
            changeId: change.id,
            reason: error instanceof Error ? error.message : "invalid_packing",
            current: current ? publicRecord(current, role) : null,
          },
        ],
      },
    };
  }
  const row: MemoryRow = {
    entity: change.entity,
    recordId: change.recordId,
    version: current ? current.version + 1 : 1,
    data,
  };
  nextState.set(key, row);
  return {
    nextState,
    result: {
      applied: [
        {
          changeId: change.id,
          entity: change.entity,
          record: publicRecord(row, role),
        },
      ],
      conflicts: [],
    },
  };
}

export function emptyState(): LocalState {
  return { accounts: [], shipments: [], invoices: [], lastSyncedAt: null };
}

export function isFinancialPayloadNonZero(change: ValidChange): boolean {
  if (change.entity === "account" && "balance" in change.data)
    return change.data.balance !== 0;
  if (
    change.entity === "shipment" &&
    "tracking" in change.data &&
    change.data.packing
  )
    return (
      change.data.amount !== 0 ||
      change.data.packing.pricePerKg !== 0 ||
      change.data.packing.pricePerKgMRU !== undefined
    );
  if (change.entity === "shipment" && "amount" in change.data)
    return change.data.amount !== 0;
  return false;
}

export type {
  Account,
  EntityRecord,
  Invoice,
  Shipment,
  SyncResult,
  LocalState,
  AppRole,
  Entity,
  PendingChange,
};
