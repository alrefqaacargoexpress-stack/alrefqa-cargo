import { describe, expect, it } from "vitest";
import { buildNetAccountingEntries } from "./financialVoids";
import { summarizeOfficeFinance } from "./finance";
const e = (id: string, kind: any, amount: number, extra: any = {}) => ({
  id,
  kind,
  amount,
  officeId: "dubai" as const,
  currency: "AED" as const,
  date: "2026-10-24",
  description: "unit",
  actorId: 7,
  actorName: "Unit",
  recordedAt: "2026-10-24T18:00:00Z",
  ...extra,
});
const reverse = (original: any, amount = -original.amount) => ({
  id: "rev-" + original.id,
  originalEntryId: original.id,
  originalKind: original.kind,
  officeId: original.officeId,
  currency: original.currency,
  amount,
  actorId: 7,
});
describe("Net accounting projection preserves original money facts", () => {
  it("cancels book income but retains real collected cash and generated customer credit", () => {
    const income = e("income", "invoice_revenue", 100);
    const cash = e("cash", "collection", 100);
    const credit = e("credit", "customer_credit", 100, {
      customerId: "c",
      cashEffect: "none",
    });
    const original = [income, cash, credit];
    const before = JSON.stringify(original);
    const net = buildNetAccountingEntries(original, [reverse(income)]);
    expect(net.map(x => x.id)).toEqual(["cash", "credit"]);
    expect(summarizeOfficeFinance(net)[0]).toMatchObject({
      revenue: 0,
      collections: 100,
    });
    expect(JSON.stringify(original)).toBe(before);
  });
  it("cancels outstanding debt recognition without deleting payment facts", () => {
    const debt = e("debt", "customer_debt", 100, { customerId: "c" });
    const payment = e("pay", "debt_payment", 20, { customerId: "c" });
    const net = buildNetAccountingEntries([debt, payment], [reverse(debt)]);
    expect(net).toEqual([payment]);
  });
  it("does not add a positive synthetic reversal as a second expense", () => {
    const expense = e("bad", "daily_expense", 37);
    const active = e("ok", "daily_expense", 10);
    const net = buildNetAccountingEntries(
      [expense, active],
      [reverse(expense)]
    );
    expect(summarizeOfficeFinance(net)[0].dailyExpenses).toBe(10);
  });
  it("rejects an over-reversal rather than showing a negative entry", () => {
    const row = e("x", "invoice_revenue", 10);
    expect(() => buildNetAccountingEntries([row], [reverse(row, -11)])).toThrow(
      "reversal_exceeds_original"
    );
  });
});
