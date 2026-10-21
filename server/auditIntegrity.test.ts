import { describe, expect, it } from "vitest";
import { auditEvents, auditHeads } from "../drizzle/schema";
import {
  auditRowHash,
  verifyAuditPage,
  type AuditIntegrityRow,
} from "./auditIntegrity";
import { hashAuditEvent, publicAudit, readAudit } from "./audit";
const first = (): AuditIntegrityRow => {
  const row = {
    id: 1,
    sequence: 1,
    actorId: 9,
    actorName: "Real actor",
    role: "admin" as const,
    entity: "shipment",
    recordId: "S",
    action: "tracking_note",
    beforeData: null,
    afterData: {
      amount: 700,
      packing: { pricePerKg: 10, pricePerKgMRU: 100 },
      journey: { stage: "preparing" },
    },
    beforeVersion: null,
    afterVersion: 1,
    requestKey: "request",
    previousHash: "",
    eventHash: "",
    createdAt: new Date("2026-10-21T16:00:00.000Z"),
  };
  row.eventHash = auditRowHash(row);
  return row;
};
describe("Append-only audit verification", () => {
  it("reconstructs the canonical event hash with the persisted server timestamp and sequence", () => {
    const row = first();
    expect(verifyAuditPage([row], 0, "")).toEqual({
      sequence: 1,
      lastHash: row.eventHash,
    });
    expect(hashAuditEvent("", { a: 1, b: 2 })).toBe(
      hashAuditEvent("", { b: 2, a: 1 })
    );
  });
  it("detects altering identity, timestamp, raw cargo or an earlier link", () => {
    const row = first();
    for (const changed of [
      { ...row, actorName: "forged" },
      { ...row, createdAt: new Date("2026-01-01T00:00:00.000Z") },
      { ...row, afterData: { amount: 1 } },
      { ...row, previousHash: "forged" },
    ])
      expect(() => verifyAuditPage([changed], 0, "")).toThrow(
        "audit_integrity_failed"
      );
  });
  it("detects deleted or skipped events rather than accepting a partial chain", () => {
    const row = first();
    const next = { ...row, id: 9, sequence: 2, previousHash: row.eventHash };
    next.eventHash = auditRowHash(next);
    expect(() => verifyAuditPage([next], 0, "")).toThrow(
      "audit_integrity_failed"
    );
    expect(verifyAuditPage([row, next], 0, "").sequence).toBe(2);
  });
  it("does not recursively leak financial fields to supervisors and retains them for admins", () => {
    const row = first();
    const supervisor = publicAudit(row, "supervisor");
    expect(supervisor.after).toEqual({
      packing: {},
      journey: { stage: "preparing" },
    });
    expect((publicAudit(row, "admin").after as any).amount).toBe(700);
  });
  it("verifies the complete chain before using a supervisor entity filter", async () => {
    const row = first();
    const wheres: any[] = [];
    let audits = 0;
    const db: any = {
      select: () => ({
        from: (table: unknown) => {
          const builder: any = {
            where: (condition: unknown) => {
              wheres.push(condition);
              return builder;
            },
            orderBy: () => builder,
            limit: async () => {
              if (table === auditHeads)
                return [{ id: 1, sequence: 1, lastHash: row.eventHash }];
              return ++audits === 1 ? [row] : [row];
            },
          };
          return builder;
        },
      }),
    };
    const result = await readAudit(db, "supervisor", {});
    expect(result.items).toHaveLength(1);
    expect(wheres.length).toBe(3);
    expect(wheres[2]).toBeDefined();
  });
  it("refuses to show history when the immutable chain and head disagree", async () => {
    const row = first();
    const db: any = {
      select: () => ({
        from: (table: unknown) => {
          const builder: any = {
            where: () => builder,
            orderBy: () => builder,
            limit: async () =>
              table === auditHeads
                ? [{ id: 1, sequence: 2, lastHash: "missing-row" }]
                : [row],
          };
          return builder;
        },
      }),
    };
    await expect(readAudit(db, "admin", {})).rejects.toThrow(
      "audit_integrity_failed"
    );
  });
});
