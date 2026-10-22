import { describe, it, expect } from "vitest";
import { createPackedShipment } from "./packing";
import {
  calculateFinanceInvoice,
  adjustedInvoiceTotal,
  employeeFinanceOffice,
  searchableInvoiceGoods,
  summarizeOfficeFinance,
  summarizeCustomerDebts,
  expenseInputSchema,
  financeCommandSchema,
  type FinanceInvoiceInput,
  type FinanceEntry,
} from "./finance";
function shipment() {
  const s = createPackedShipment({
    tracking: "TEST-FIN",
    source: "dubai",
    pricePerKg: 20,
    pricePerKgMRU: 100,
    officeId: "dubai",
  });
  s.packing.cartons[0].goods.push(
    {
      id: "good-one",
      name: "Brand One",
      phone: "",
      unitWeight: 1.1,
      pieces: 3,
    },
    { id: "good-two", name: "Brand Two", phone: "", unitWeight: 2, pieces: 1 }
  );
  return s;
}
function invoice(): FinanceInvoiceInput {
  return {
    invoiceId: "inv-test",
    customerId: "customer-test",
    issuingOfficeId: "dubai",
    employeeOfficeId: "nouakchott",
    paymentMode: "on_account",
    chargeKind: "shipping",
    currency: "MRU",
    shipmentId: shipment().id,
    goodsIds: ["good-one"],
    adjustment: { direction: "increase", amount: 10 },
  };
}
const now = "2026-10-21T12:00:00.000Z";
function entry(
  kind: FinanceEntry["kind"],
  amount: number,
  currency: FinanceEntry["currency"] = "MRU"
): FinanceEntry {
  return {
    id: `${kind}-${currency}`,
    kind,
    amount,
    currency,
    officeId: "nouakchott",
    date: "2026-10-21",
    description: "test",
    actorId: 1,
    actorName: "Test actor",
    recordedAt: now,
    customerId: "c-1",
    customerName: "Test customer",
  };
}
describe("Financial invoice and office rules", () => {
  it("calculates only selected live goods using their explicit MRU rate", () => {
    const s = shipment(),
      input = { ...invoice(), shipmentId: s.id };
    const result = calculateFinanceInvoice(input, s);
    const base = Math.round(1.1 * 3 * 100 * 100) / 100;
    expect(result.baseAmount).toBe(base);
    expect(result.totalAmount).toBe(base + 10);
    expect(result.goods).toHaveLength(1);
    expect(result.goods[0].pieces).toBe(3);
    expect(result.currency).toBe("MRU");
    expect(
      calculateFinanceInvoice(
        { ...input, adjustment: { direction: "decrease", amount: 10 } },
        s
      ).totalAmount
    ).toBe(base - 10);
  });
  it("rejects missing, deleted or duplicated goods and unsupported rate currencies", () => {
    const s = shipment(),
      input = { ...invoice(), shipmentId: s.id };
    expect(() =>
      calculateFinanceInvoice({ ...input, goodsIds: ["missing"] }, s)
    ).toThrow("goods_unavailable");
    expect(() =>
      calculateFinanceInvoice(
        { ...input, goodsIds: ["good-one", "good-one"] },
        s
      )
    ).toThrow();
    s.packing.cartons[0].goods[0].deleted = { at: now, reason: "correction" };
    expect(() => calculateFinanceInvoice(input, s)).toThrow(
      "goods_unavailable"
    );
    expect(() =>
      calculateFinanceInvoice(
        { ...input, goodsIds: ["good-two"], currency: "USD" },
        s
      )
    ).toThrow("shipping_rate_missing");
  });
  it("never converts a source price into MRU when the MRU rate is absent", () => {
    const s = shipment();
    delete s.packing.pricePerKgMRU;
    expect(() =>
      calculateFinanceInvoice({ ...invoice(), shipmentId: s.id }, s)
    ).toThrow("shipping_rate_missing");
  });
  it("forbids a negative corrected total and precision beyond cents", () => {
    expect(() =>
      adjustedInvoiceTotal(1, { direction: "decrease", amount: 2 })
    ).toThrow();
    expect(() =>
      adjustedInvoiceTotal(1, { direction: "increase", amount: 0.001 })
    ).toThrow();
    expect(
      adjustedInvoiceTotal(1.1, { direction: "increase", amount: 0.2 })
    ).toBe(1.3);
  });
  it("charges the employee home office rather than the issuing office and refuses spoofing", () => {
    const scope = {
      role: "accountant" as const,
      offices: ["nouakchott", "dubai"] as const,
      homeOffice: "nouakchott" as const,
    };
    expect(
      employeeFinanceOffice({ ...scope, offices: [...scope.offices] })
    ).toBe("nouakchott");
    expect(() =>
      employeeFinanceOffice({ ...scope, offices: [...scope.offices] }, "dubai")
    ).toThrow("financial_office_mismatch");
    expect(
      employeeFinanceOffice({ role: "accountant", offices: ["turkey"] })
    ).toBe("turkey");
    expect(() =>
      employeeFinanceOffice({ role: "accountant", offices: null })
    ).toThrow("employee_office_required");
    expect(
      employeeFinanceOffice({ role: "admin", offices: null }, "china")
    ).toBe("china");
    expect(() =>
      employeeFinanceOffice({ role: "staff", offices: null }, "china")
    ).toThrow("finance_forbidden");
  });
  it("supports real goods search by normalized brand and total weight without deleted shipments", () => {
    const s = shipment();
    expect(searchableInvoiceGoods([s], " brand one ")).toHaveLength(1);
    expect(searchableInvoiceGoods([s], "3.3")).toHaveLength(1);
    s.deleted = { at: now, reason: "archive" };
    expect(searchableInvoiceGoods([s])).toHaveLength(0);
  });
  it("does not double count shipping collections as revenue and separates currency balances", () => {
    const entries = [
      entry("shipment_revenue", 100),
      entry("shipment_cost", 20),
      entry("daily_expense", 5),
      entry("collection", 100),
      entry("customer_debt", 50),
      entry("debt_payment", 10),
      entry("shipment_revenue", 30, "AED"),
    ];
    const summary = summarizeOfficeFinance(entries);
    expect(summary).toHaveLength(2);
    const mru = summary.find(x => x.currency === "MRU")!;
    expect(mru.revenue).toBe(100);
    expect(mru.expenses).toBe(25);
    expect(mru.net).toBe(75);
    expect(mru.collections).toBe(110);
    expect(mru.debts).toBe(40);
    expect(summarizeCustomerDebts(entries)[0].outstanding).toBe(40);
  });
  it("requires shipment references for costs and real dates while allowing an explicitly entered zero cost", () => {
    const p = {
      expenseId: "expense",
      category: "shipment_cost" as const,
      officeId: "china" as const,
      amount: 0,
      currency: "CNY" as const,
      date: "2026-10-21",
      description: "Zero cost reviewed",
      shipmentId: "shipment",
    };
    expect(expenseInputSchema.safeParse(p).success).toBe(true);
    expect(
      expenseInputSchema.safeParse({ ...p, shipmentId: undefined }).success
    ).toBe(false);
    expect(
      expenseInputSchema.safeParse({ ...p, date: "2026-02-30" }).success
    ).toBe(false);
  });
  it("rejects client-provided actor fields in financial commands", () => {
    expect(
      financeCommandSchema.safeParse({
        id: "command",
        kind: "invoice",
        createdAt: now,
        payload: { ...invoice(), actorId: 999 },
      }).success
    ).toBe(false);
  });
});
