import { auditEvents } from "../drizzle/schema";
import { hashAuditEvent } from "./audit";
export type AuditIntegrityRow = typeof auditEvents.$inferSelect;
export function auditRowHash(row: AuditIntegrityRow): string {
  return hashAuditEvent(row.previousHash, {
    sequence: row.sequence,
    actorId: row.actorId,
    actorName: row.actorName,
    role: row.role,
    entity: row.entity,
    recordId: row.recordId,
    action: row.action,
    before: row.beforeData ?? null,
    after: row.afterData ?? null,
    beforeVersion: row.beforeVersion ?? null,
    afterVersion: row.afterVersion ?? null,
    requestKey: row.requestKey,
    previousHash: row.previousHash,
    createdAt: new Date(row.createdAt).toISOString(),
  });
}
export function verifyAuditPage(
  rows: AuditIntegrityRow[],
  expectedSequence: number,
  previousHash: string
) {
  let sequence = expectedSequence;
  let hash = previousHash;
  for (const row of rows) {
    if (
      row.sequence !== sequence + 1 ||
      row.previousHash !== hash ||
      auditRowHash(row) !== row.eventHash
    )
      throw new Error("audit_integrity_failed");
    sequence = row.sequence;
    hash = row.eventHash;
  }
  return { sequence, lastHash: hash };
}
