import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { entityLifecycle, type EntityLifecycleRow } from "../drizzle/schema";
import type { getDb } from "./db";
import type { EntityRecord, Entity } from "../shared/operations";

export type LifecycleEntity = EntityLifecycleRow["entity"];
export type LifecycleDb = Pick<
  NonNullable<Awaited<ReturnType<typeof getDb>>>,
  "select" | "insert"
>;
export type LifecycleIndex = Map<LifecycleEntity, Set<string>>;
export async function loadLifecycle(db: LifecycleDb): Promise<LifecycleIndex> {
  const rows = await db
    .select({
      entity: entityLifecycle.entity,
      recordId: entityLifecycle.recordId,
      action: entityLifecycle.action,
    })
    .from(entityLifecycle);
  const result: LifecycleIndex = new Map();
  for (const row of rows) {
    if (!["delete", "disable", "void"].includes(row.action)) continue;
    const ids = result.get(row.entity) ?? new Set<string>();
    ids.add(row.recordId);
    result.set(row.entity, ids);
  }
  return result;
}
export function isRetired(
  index: LifecycleIndex,
  entity: LifecycleEntity,
  id: string
) {
  return index.get(entity)?.has(id) === true;
}
export function recordIsActive(
  index: LifecycleIndex,
  entity: Entity,
  record: EntityRecord
): boolean {
  return (
    !isRetired(index, entity, record.id) &&
    !(entity === "shipment" && "deleted" in record && record.deleted)
  );
}
export async function assertActiveEntity(
  db: LifecycleDb,
  entity: LifecycleEntity,
  recordId: string
) {
  const rows = await db
    .select()
    .from(entityLifecycle)
    .where(
      and(
        eq(entityLifecycle.entity, entity),
        eq(entityLifecycle.recordId, recordId)
      )
    )
    .limit(1);
  if (rows.some(row => ["delete", "disable", "void"].includes(row.action)))
    throw new TRPCError({
      code: "CONFLICT",
      message: "record_permanently_retired",
    });
}
export async function isEmployeeDisabled(db: LifecycleDb, userId: number) {
  const rows = await db
    .select()
    .from(entityLifecycle)
    .where(
      and(
        eq(entityLifecycle.entity, "employee"),
        eq(entityLifecycle.recordId, String(userId))
      )
    )
    .limit(1);
  return rows.some(
    row =>
      row.entity === "employee" &&
      row.recordId === String(userId) &&
      row.action === "disable"
  );
}
export function lifecycleId(entity: LifecycleEntity, recordId: string) {
  return (
    "life-" +
    createHash("sha256")
      .update(entity + "\0" + recordId)
      .digest("hex")
  );
}
/** Call only inside an authorized, version-checked, row-locked transaction, followed by appendAudit. */
export async function insertLifecycle(
  tx: LifecycleDb,
  input: Omit<typeof entityLifecycle.$inferInsert, "id" | "createdAt">
) {
  const id = lifecycleId(input.entity, input.recordId);
  await tx.insert(entityLifecycle).values({ ...input, id });
  return id;
}
