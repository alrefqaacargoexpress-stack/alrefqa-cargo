import { describe, expect, it } from "vitest";
import {
  customerAccountStatement,
  searchableCustomerAccounts,
} from "./customerAccounts";
import {
  customerMovementInputSchema,
  summarizeOfficeFinance,
  type FinanceEntry,
} from "./finance";
import type { Account, Invoice } from "./operations";

const account = (id: string): Account => ({
  id,
  name: "نفس الاسم",
  phone: id === "a" ? "+22211111" : "+22222222",
  city: "",
  balance: 0,
  shipments: 0,
  updatedAt: "2026-10-22",
  officeId: "nouakchott",
});
const invoice = (
  id: string,
  customerId: string,
  amount: number,
  paidAmount: number
): Invoice => ({
  id,
  account: "نفس الاسم",
  amount,
  status: paidAmount >= amount ? "مدفوعة" : "دين",
  issuedAt: "2026-10-22T01:00:00Z",
  officeId: "nouakchott",
  finance: {
    customerId,
    chargeKind: "general",
    paymentMode: paidAmount === amount ? "cash" : "on_account",
    issuingOfficeId: "dubai",
    financialOfficeId: "nouakchott",
    actorId: 1,
    actorName: "محاسب",
    recordedAt: "2026-10-22T01:00:00Z",
    currency: "MRU",
    goods: [],
    baseAmount: amount,
    adjustment: { direction: "increase", amount: 0 },
    paidAmount,
  },
});
const entry = (
  kind: FinanceEntry["kind"],
  amount: number,
  extra: Partial<FinanceEntry> = {}
): FinanceEntry => ({
  id: `${kind}:${amount}`,
  kind,
  amount,
  currency: "MRU",
  officeId: "nouakchott",
  date: "2026-10-22",
  recordedAt: "2026-10-22T01:01:00Z",
  actorId: 1,
  actorName: "محاسب",
  customerId: "a",
  customerName: "نفس الاسم",
  description: kind,
  ...extra,
});

describe("customer accounts are independent of goods and names", () => {
  it("keeps accounts with matching names separate and searches phone", () => {
    const accounts = [account("a"), account("b")];
    expect(
      searchableCustomerAccounts(accounts, "نفس الاسم").map(a => a.id)
    ).toEqual(["a", "b"]);
    expect(
      searchableCustomerAccounts(accounts, "+22222222").map(a => a.id)
    ).toEqual(["b"]);
  });
  it("links by customer ID only, never automatically by old invoice name", () => {
    const old: Invoice = {
      id: "old",
      account: "نفس الاسم",
      amount: 999,
      issuedAt: "2026-10-21",
      status: "بانتظار الدفع",
    };
    const result = customerAccountStatement(
      "a",
      [invoice("own", "a", 100, 0), invoice("other", "b", 900, 0), old],
      []
    );
    expect(result.invoices.map(i => i.id)).toEqual(["own"]);
    expect(result.balances[0].owed).toBe(100);
    expect(result.invoices[0]).not.toHaveProperty("goods");
    expect(result.invoices[0]).not.toHaveProperty("shipmentId");
  });
  it("counts one invoice and one receipt, not invoice_revenue/customer_debt mirrors twice", () => {
    const invoices = [
      invoice("cash", "a", 100, 100),
      invoice("debt", "a", 200, 50),
    ];
    const entries = [
      entry("collection", 100),
      entry("customer_debt", 200),
      entry("invoice_revenue", 300),
      entry("debt_payment", 50),
      entry("customer_credit", 80),
      entry("customer_debit", 20),
    ];
    const result = customerAccountStatement("a", invoices, entries);
    expect(result.rows).toHaveLength(6);
    expect(result.balances[0].balance).toBe(100 + 200 + 20 - (100 + 50 + 80));
    expect(result.balances[0].invoiceOutstanding).toBe(200 - 50);
    expect(result.balances[0].received).toBe(100 + 50 + 80);
    expect(result.balances[0].paidOut).toBe(20);
  });
  it("shows money in the customer's favor and keeps currencies/offices separate", () => {
    const result = customerAccountStatement(
      "a",
      [],
      [
        entry("customer_credit", 500),
        entry("customer_debit", 100),
        entry("customer_credit", 7, { currency: "AED", officeId: "dubai" }),
        entry("customer_debit", 8, { customerId: "b" }),
      ]
    );
    expect(result.balances).toHaveLength(2);
    expect(result.balances.find(b => b.currency === "MRU")?.inFavor).toBe(
      500 - 100
    );
    expect(result.balances.find(b => b.currency === "AED")?.inFavor).toBe(7);
  });
  it("does not treat customer deposits as sales or payouts as operating expenses", () => {
    const summary = summarizeOfficeFinance([
      entry("customer_credit", 200),
      entry("customer_debit", 25),
    ])[0];
    expect(summary.revenue).toBe(0);
    expect(summary.expenses).toBe(0);
    expect(summary.collections).toBe(200 - 25);
  });
  it("validates required wallet, positive amounts and impossible dates", () => {
    const movement = {
      movementId: "mov",
      customerId: "a",
      officeId: "nouakchott",
      direction: "credit",
      amount: 2.5,
      currency: "MRU",
      date: "2026-10-22",
      description: "قبض",
      paymentMode: "cash",
    };
    expect(customerMovementInputSchema.safeParse(movement).success).toBe(true);
    expect(
      customerMovementInputSchema.safeParse({
        ...movement,
        paymentMode: "wallet",
      }).success
    ).toBe(false);
    expect(
      customerMovementInputSchema.safeParse({ ...movement, amount: 0 }).success
    ).toBe(false);
    expect(
      customerMovementInputSchema.safeParse({ ...movement, date: "2026-02-30" })
        .success
    ).toBe(false);
  });
});
