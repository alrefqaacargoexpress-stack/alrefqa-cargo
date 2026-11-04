import { describe, expect, it } from "vitest";
import { financeSnapshot } from "./finance";
import { financeEntries, financeReversals } from "../drizzle/schema";
import { blankPermissions } from "../shared/permissions";
import type { FinanceEntry } from "../shared/finance";
const now = "2026-11-04T18:00:00.000Z";
const fact = (
  id: string,
  kind: FinanceEntry["kind"],
  amount: number,
  extra: Partial<FinanceEntry> = {}
): FinanceEntry => ({
  id,
  kind,
  officeId: "dubai",
  currency: "AED",
  amount,
  date: "2026-11-04",
  description: "Fixture only",
  actorId: 7,
  actorName: "Fixture",
  recordedAt: now,
  ...extra,
});
function dbFor(entries: FinanceEntry[], reversals: any[] = []) {
  return {
    select: () => ({
      from: (table: unknown) => {
        const rows =
          table === financeEntries
            ? entries.map(data => ({ id: data.id, data }))
            : table === financeReversals
              ? reversals
              : [];
        return {
          where: () => Promise.resolve(rows),
          then: (resolve: any, reject: any) =>
            Promise.resolve(rows).then(resolve, reject),
        };
      },
    }),
  };
}
describe("authoritative cash projection", () => {
  it("retains real collected cash when an invoice is voided without refund, while net profit is reversed", async () => {
    const entries = [
      fact("retained-revenue", "invoice_revenue", 100),
      fact("voided-revenue", "invoice_revenue", 50),
      fact("cash", "collection", 50),
      fact("credit", "customer_credit", 50, { cashEffect: "none" }),
    ];
    const reversals = ["voided-revenue", "cash"].map(originalEntryId => ({
      id: `reverse-${originalEntryId}`,
      originalEntryId,
      originalKind: entries.find(x => x.id === originalEntryId)!.kind,
      officeId: "dubai",
      currency: "AED",
      amount: -50,
      actorId: 7,
    }));
    const snapshot = await financeSnapshot(dbFor(entries, reversals), {
      role: "accountant",
      offices: ["dubai"],
    });
    expect(snapshot.entries.some(e => e.id === "cash")).toBe(false);
    expect(snapshot.cashBalances).toEqual([
      {
        officeId: "dubai",
        currency: "AED",
        cashBalance: 50,
        availableProfitWithdrawal: 50,
      },
    ]);
  });
  it("never reveals another office or currency under a single-office grant", async () => {
    const entries = [
      fact("income", "invoice_revenue", 10),
      fact("cash", "collection", 10),
      fact("other", "collection", 999, { officeId: "china", currency: "CNY" }),
    ];
    const snapshot = await financeSnapshot(dbFor(entries), {
      role: "accountant",
      offices: ["dubai"],
    });
    expect(snapshot.cashBalances).toEqual([
      {
        officeId: "dubai",
        currency: "AED",
        cashBalance: 10,
        availableProfitWithdrawal: 10,
      },
    ]);
  });
  it("old custom maps and cashiers do not receive the new profit projection", async () => {
    const entries = [
      fact("income", "invoice_revenue", 10),
      fact("cash", "collection", 10),
    ];
    for (const scope of [
      { role: "cashier" as const, offices: ["dubai" as const] },
      {
        role: "accountant" as const,
        offices: ["dubai" as const],
        permissions: { ...blankPermissions(), invoices: "view" as const },
      },
    ]) {
      const snapshot = await financeSnapshot(dbFor(entries), scope);
      expect(snapshot.cashBalances).toEqual([]);
    }
  });
  it("independently delegated withdrawal view exposes summaries, not hidden invoice or entry details", async () => {
    const snapshot = await financeSnapshot(
      dbFor([
        fact("income", "invoice_revenue", 10),
        fact("cash", "collection", 10),
      ]),
      {
        role: "accountant",
        offices: ["dubai"],
        permissions: { ...blankPermissions(), profit_withdrawal: "view" },
      }
    );
    expect(snapshot.invoices).toEqual([]);
    expect(snapshot.entries).toEqual([]);
    expect(snapshot.cashBalances?.[0]?.cashBalance).toBe(10);
  });
});
