import { z } from "zod";
import type { User } from "../drizzle/schema";
import { ENV } from "./_core/env";
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

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const safeNonNegative = z.number().finite().nonnegative().refine(Number.isSafeInteger, "must be a safe integer");
const nonNegative = z.number().finite().nonnegative().max(999999999);
const optionalMeta = {
  scope: z.enum(["shared", "local", "pending"]).optional(),
  version: safeNonNegative.optional(),
};

export const accountDataSchema = z.object({
  id: boundedString(128), name: boundedString(240), phone: z.string().trim().max(64), city: boundedString(160),
  shipments: safeNonNegative, balance: nonNegative, updatedAt: boundedString(80), ...optionalMeta,
}).strict();
export const shipmentDataSchema = z.object({
  id: boundedString(128), tracking: boundedString(128), account: boundedString(240), route: boundedString(240),
  service: z.enum(["جوي", "بحري", "سريع"]), status: z.enum(["في الطريق", "وصلت للمكتب", "جاهزة للتسليم", "بانتظار الدفع"]),
  eta: boundedString(80), amount: nonNegative, ...optionalMeta,
}).strict();
export const invoiceDataSchema = z.object({
  id: boundedString(128), account: boundedString(240), amount: nonNegative,
  status: z.enum(["مدفوعة", "بانتظار الدفع"]), issuedAt: boundedString(80), ...optionalMeta,
}).strict();

export const pendingChangeSchema = z.object({
  id: boundedString(128), label: z.string().trim().max(240), createdAt: boundedString(80),
  entity: z.enum(["account", "shipment", "invoice"]), recordId: boundedString(128),
  expectedVersion: z.union([z.null(), safeNonNegative]),
  data: z.union([accountDataSchema, shipmentDataSchema, invoiceDataSchema]),
}).strict();
export const syncInputSchema = z.object({ changes: z.array(pendingChangeSchema).max(500) }).strict();
export const setRoleInputSchema = z.object({ userId: safeNonNegative, role: z.enum(["admin", "staff", "accountant", "viewer"]) }).strict();

export type ValidChange = z.infer<typeof pendingChangeSchema>;
export type MemoryRow = { entity: Entity; recordId: string; version: number; data: EntityRecord };

/** Root owner and the database's real admin flag are authoritative; a first visitor is never promoted. */
export function roleForUser(user: Pick<User, "openId" | "role"> | null, membership?: AppRole | null): AppRole | null {
  if (!user) return null;
  if (ENV.ownerOpenId && user.openId === ENV.ownerOpenId) return "admin";
  if (user.role === "admin") return "admin";
  return membership ?? null;
}

export function canManageMembers(user: Pick<User, "openId" | "role"> | null, membership?: AppRole | null): boolean {
  return roleForUser(user, membership) === "admin";
}

export function parseChange(change: unknown): ValidChange {
  const parsed = pendingChangeSchema.parse(change);
  if (parsed.data.id !== parsed.recordId) {
    // The record id is the authoritative key, but accepting a different display id would make
    // replay/debugging ambiguous. Keep the public contract and reject it explicitly.
    throw new Error("data.id must equal recordId");
  }
  const expectedSchema = parsed.entity === "account" ? accountDataSchema : parsed.entity === "shipment" ? shipmentDataSchema : invoiceDataSchema;
  return { ...parsed, data: expectedSchema.parse(parsed.data) } as ValidChange;
}

export function hideFinance<T extends EntityRecord>(record: T, role: AppRole | null): T {
  if (canViewFinance(role)) return { ...record } as T;
  if (record.id === undefined) return record;
  if ("balance" in record) return { ...record, balance: 0 } as T;
  if ("amount" in record) return { ...record, amount: 0 } as T;
  return record;
}

export function publicRecord(row: MemoryRow, role: AppRole | null): EntityRecord {
  return { ...hideFinance(row.data, role), scope: "shared", version: row.version } as EntityRecord;
}

function preserveStaffFinance(role: AppRole | null, next: EntityRecord, current: EntityRecord | null): EntityRecord {
  if (role !== "staff") return next;
  if (current && "balance" in next && "balance" in current) return { ...next, balance: current.balance };
  if (current && "amount" in next && "amount" in current) return { ...next, amount: current.amount };
  return next;
}

/** Pure optimistic-concurrency helper used by tests and kept equivalent to the SQL transaction path. */
export function applyChangeInMemory(state: Map<string, MemoryRow>, change: ValidChange, role: AppRole | null): { result: SyncResult; nextState: Map<string, MemoryRow> } {
  const nextState = new Map(state);
  const key = `${change.entity}:${change.recordId}`;
  const current = state.get(key) ?? null;
  if (!canWrite(role, change.entity)) {
    return { nextState, result: { applied: [], conflicts: [{ changeId: change.id, reason: "forbidden", current: current ? publicRecord(current, role) : null }] } };
  }
  if (role === "staff" && !current && isFinancialPayloadNonZero(change)) {
    return { nextState, result: { applied: [], conflicts: [{ changeId: change.id, reason: "financial_write_forbidden", current: null }] } };
  }
  if (change.expectedVersion !== null && (!current || current.version !== change.expectedVersion)) {
    return { nextState, result: { applied: [], conflicts: [{ changeId: change.id, reason: "version_conflict", current: current ? publicRecord(current, role) : null }] } };
  }
  if (change.expectedVersion === null && current) {
    return { nextState, result: { applied: [], conflicts: [{ changeId: change.id, reason: "already_exists", current: publicRecord(current, role) }] } };
  }
  const data = preserveStaffFinance(role, change.data, current?.data ?? null);
  const row: MemoryRow = { entity: change.entity, recordId: change.recordId, version: current ? current.version + 1 : 1, data };
  nextState.set(key, row);
  return { nextState, result: { applied: [{ changeId: change.id, entity: change.entity, record: publicRecord(row, role) }], conflicts: [] } };
}

export function emptyState(): LocalState {
  return { accounts: [], shipments: [], invoices: [], lastSyncedAt: null };
}

export function isFinancialPayloadNonZero(change: ValidChange): boolean {
  if (change.entity === "account" && "balance" in change.data) return change.data.balance !== 0;
  if (change.entity === "shipment" && "amount" in change.data) return change.data.amount !== 0;
  return false;
}

export type { Account, EntityRecord, Invoice, Shipment, SyncResult, LocalState, AppRole, Entity, PendingChange };
