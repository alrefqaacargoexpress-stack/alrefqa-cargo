import { createHash } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { auditEvents, auditHeads } from "../drizzle/schema";
import type { AppRole } from "@shared/operations";
import { verifyAuditPage } from "./auditIntegrity";

export type AuditActor = { id: number; name: string; role: AppRole };
export type AuditAppend = {
  actor: AuditActor;
  entity: string;
  recordId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  beforeVersion?: number | null;
  afterVersion?: number | null;
  requestKey: string;
};
export type AuditPublic = {
  id: number;
  sequence: number;
  actorId: number;
  actorName: string;
  role: AppRole;
  entity: string;
  recordId: string;
  action: string;
  before: unknown;
  after: unknown;
  beforeVersion: number | null;
  afterVersion: number | null;
  requestKey: string;
  createdAt: Date;
};

/** The transaction object is deliberately structural so this helper works with the root db and Drizzle tx. */
export type AuditExecutor = {
  insert: (...args: any[]) => any;
  select: (...args: any[]) => any;
  update: (...args: any[]) => any;
  transaction?: (callback: (tx: AuditExecutor) => Promise<any>) => Promise<any>;
};

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stable(item)])
    );
  return value;
}
function canonical(value: unknown) {
  return JSON.stringify(stable(value));
}
function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function hashAuditEvent(previousHash: string, payload: unknown) {
  return sha256(`${previousHash}:${canonical(payload)}`);
}

/** Appends an event and advances the singleton head in the same transaction. */
export async function appendAudit(
  tx: AuditExecutor,
  event: AuditAppend
): Promise<number> {
  const existing = await tx
    .select()
    .from(auditHeads)
    .where(eq(auditHeads.id, 1))
    .limit(1)
    .for("update");
  if (!existing[0]) {
    await tx
      .insert(auditHeads)
      .ignore()
      .values({ id: 1, sequence: 0, lastHash: "", updatedAt: new Date() });
  }
  const headRows = await tx
    .select()
    .from(auditHeads)
    .where(eq(auditHeads.id, 1))
    .limit(1)
    .for("update");
  const head = headRows[0] ?? { sequence: 0, lastHash: "" };
  const sequence = head.sequence + 1;
  const previousHash = head.lastHash || "";
  const createdAt = new Date();
  createdAt.setMilliseconds(0);
  const payload = {
    sequence,
    actorId: event.actor.id,
    actorName: event.actor.name,
    role: event.actor.role,
    entity: event.entity,
    recordId: event.recordId,
    action: event.action,
    before: event.before ?? null,
    after: event.after ?? null,
    beforeVersion: event.beforeVersion ?? null,
    afterVersion: event.afterVersion ?? null,
    requestKey: event.requestKey,
    previousHash,
    createdAt: createdAt.toISOString(),
  };
  const eventHash = hashAuditEvent(previousHash, payload);
  const inserted = await tx.insert(auditEvents).values({
    sequence,
    actorId: event.actor.id,
    actorName: event.actor.name,
    role: event.actor.role,
    entity: event.entity,
    recordId: event.recordId,
    action: event.action,
    beforeData: event.before ?? null,
    afterData: event.after ?? null,
    beforeVersion: event.beforeVersion ?? null,
    afterVersion: event.afterVersion ?? null,
    requestKey: event.requestKey,
    previousHash,
    eventHash,
    createdAt,
  });
  await tx
    .update(auditHeads)
    .set({ sequence, lastHash: eventHash })
    .where(eq(auditHeads.id, 1));
  const id = Number(
    Array.isArray(inserted)
      ? (inserted[0]?.insertId ?? 0)
      : (inserted.insertId ?? 0)
  );
  return id;
}

function redactAuditValue(value: unknown, role: AppRole): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value))
    return value.map(item => redactAuditValue(item, role));
  if (typeof value !== "object") return value;
  const candidate = value as Record<string, unknown>;
  if (role === "admin" || role === "accountant")
    return structuredClone(candidate);
  const financeKeys = new Set([
    "amount",
    "balance",
    "pricePerKg",
    "pricePerKgMRU",
    "payment",
    "methodLabel",
    "reference",
  ]);
  return Object.fromEntries(
    Object.entries(candidate)
      .filter(([key]) => !financeKeys.has(key))
      .map(([key, item]) => [key, redactAuditValue(item, role)])
  );
}

export function publicAudit(
  row: typeof auditEvents.$inferSelect,
  role: AppRole
): AuditPublic {
  return {
    id: row.id,
    sequence: row.sequence,
    actorId: row.actorId,
    actorName: row.actorName,
    role: row.role,
    entity: row.entity,
    recordId: row.recordId,
    action: row.action,
    before: redactAuditValue(row.beforeData, role),
    after: redactAuditValue(row.afterData, role),
    beforeVersion: row.beforeVersion,
    afterVersion: row.afterVersion,
    requestKey: row.requestKey,
    createdAt: row.createdAt,
  };
}

export async function readAudit(
  db: AuditExecutor,
  role: AppRole,
  input: { shipmentId?: string; afterId?: number }
): Promise<{ items: AuditPublic[]; nextCursor: number | null }> {
  if (db.transaction)
    return db.transaction(tx => readAuditSnapshot(tx, role, input));
  return readAuditSnapshot(db, role, input);
}
async function readAuditSnapshot(
  db: AuditExecutor,
  role: AppRole,
  input: { shipmentId?: string; afterId?: number }
): Promise<{ items: AuditPublic[]; nextCursor: number | null }> {
  const headRows = await db
    .select()
    .from(auditHeads)
    .where(eq(auditHeads.id, 1))
    .limit(1);
  const head = headRows[0] as typeof auditHeads.$inferSelect | undefined;
  let checkpoint = { sequence: 0, lastHash: "" };
  // Limit each verification batch; never assume a filtered shipment page proves global integrity.
  while (true) {
    const batch = (await db
      .select()
      .from(auditEvents)
      .where(gt(auditEvents.sequence, checkpoint.sequence))
      .orderBy(auditEvents.sequence)
      .limit(500)) as (typeof auditEvents.$inferSelect)[];
    checkpoint = verifyAuditPage(
      batch,
      checkpoint.sequence,
      checkpoint.lastHash
    );
    if (batch.length < 500) break;
  }
  if (
    checkpoint.sequence !== (head?.sequence ?? 0) ||
    checkpoint.lastHash !== (head?.lastHash ?? "")
  )
    throw new Error("audit_integrity_failed");
  const predicates = [] as any[];
  if (role !== "admin") predicates.push(eq(auditEvents.entity, "shipment"));
  if (input.afterId !== undefined)
    predicates.push(gt(auditEvents.id, input.afterId));
  if (input.shipmentId)
    predicates.push(
      and(
        eq(auditEvents.entity, "shipment"),
        eq(auditEvents.recordId, input.shipmentId)
      )
    );
  const rows = await db
    .select()
    .from(auditEvents)
    .where(predicates.length ? and(...predicates) : undefined)
    .orderBy(auditEvents.id)
    .limit(101);
  const page = rows.slice(0, 100);
  return {
    items: page.map((row: typeof auditEvents.$inferSelect) =>
      publicAudit(row, role)
    ),
    nextCursor: rows.length > 100 ? (page.at(-1)?.id ?? null) : null,
  };
}
