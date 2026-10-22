import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { buildFinanceWorkbook, parseFinanceBuffer } from "./financeExcel";
import { emptyFinanceSnapshot, type FinanceCommand } from "@shared/finance";
const now = "2026-10-21T12:00:00.000Z";
const invoice: FinanceCommand = {
  id: "invoice-command",
  kind: "invoice",
  createdAt: now,
  payload: {
    invoiceId: "inv-one",
    customerId: "c-one",
    issuingOfficeId: "dubai",
    employeeOfficeId: "nouakchott",
    chargeKind: "general",
    paymentMode: "on_account",
    currency: "MRU",
    manualAmount: 10,
    goodsIds: [],
    adjustment: { direction: "decrease", amount: 1 },
  },
};
const expense: FinanceCommand = {
  id: "expense-command",
  kind: "expense",
  createdAt: now,
  payload: {
    expenseId: "exp-one",
    officeId: "china",
    category: "shipment_cost",
    amount: 0,
    currency: "CNY",
    date: "2026-10-21",
    description: "Zero cost explicitly reviewed",
    shipmentId: "s-one",
  },
};
const buffer = (wb: XLSX.WorkBook) =>
  XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
describe("Financial Excel import and export", () => {
  it("roundtrips drafts with exact offices, currencies and correction without importing posted ledgers", () => {
    const snapshot = {
      ...emptyFinanceSnapshot(),
      entries: [
        {
          id: "posted-debt",
          kind: "customer_debt" as const,
          officeId: "nouakchott" as const,
          currency: "MRU" as const,
          amount: 100,
          date: "2026-10-21",
          description: "Posted debt",
          actorId: 1,
          actorName: "Test actor",
          recordedAt: now,
          customerId: "c-one",
        },
      ],
    };
    const result = parseFinanceBuffer(
      buffer(buildFinanceWorkbook(snapshot, [invoice, expense])),
      { accountIds: ["c-one"], shipmentIds: ["s-one"] }
    );
    expect(result.commands).toHaveLength(2);
    expect(result.rejected).toHaveLength(0);
    expect(result.commands[0].payload).toEqual(invoice.payload);
    expect(result.commands[1].payload).toEqual(expense.payload);
    expect(result.readOnlySheets).toContain("القيود المسجلة");
  });
  it("accepts a blank template as a preview with zero postings rather than failing on an empty accounts sheet", () => {
    const result = parseFinanceBuffer(
      buffer(buildFinanceWorkbook(emptyFinanceSnapshot(), []))
    );
    expect(result.commands).toHaveLength(0);
    expect(result.accounts).toHaveLength(0);
  });
  it("refuses existing invoice or expense identifiers instead of replacing them", () => {
    const result = parseFinanceBuffer(
      buffer(buildFinanceWorkbook(emptyFinanceSnapshot(), [invoice, expense])),
      {
        invoiceIds: ["inv-one"],
        expenseIds: ["exp-one"],
        accountIds: ["c-one"],
        shipmentIds: ["s-one"],
      }
    );
    expect(result.commands).toHaveLength(0);
    expect(result.rejected).toHaveLength(2);
  });
  it("rejects a formula even if it has a cached amount", () => {
    const wb = buildFinanceWorkbook(emptyFinanceSnapshot(), [expense]);
    wb.Sheets["مسودات المصروفات"].D2 = { t: "n", v: 10, f: "5+5" };
    const result = parseFinanceBuffer(buffer(wb), { shipmentIds: ["s-one"] });
    expect(result.commands).toHaveLength(0);
    expect(result.rejected[0].reason).toBe("formulas_not_allowed");
  });
  it("rejects the whole invoice when one associated goods row is invalid", () => {
    const shipping: FinanceCommand = {
      ...invoice,
      payload: {
        ...invoice.payload,
        chargeKind: "shipping",
        shipmentId: "s-one",
        manualAmount: undefined,
        goodsIds: ["g-one", "g-two"],
      },
    };
    const wb = buildFinanceWorkbook(emptyFinanceSnapshot(), [shipping]);
    wb.Sheets["بنود المسودات"].B3 = { t: "s", v: "g-two", f: '"g-two"' };
    const result = parseFinanceBuffer(buffer(wb), {
      accountIds: ["c-one"],
      shipmentIds: ["s-one"],
    });
    expect(result.commands).toHaveLength(0);
    expect(result.rejected.some(r => r.reason === "invalid_goods_row")).toBe(
      true
    );
  });
  it("keeps account identifiers and phone numbers as text and does not mutate their opening balances", () => {
    const account = {
      id: "00017",
      name: "Test account",
      phone: "+22200000000",
      city: "Test",
      shipments: 1,
      balance: 20,
      officeId: "dubai" as const,
      updatedAt: now,
    };
    const result = parseFinanceBuffer(
      buffer(buildFinanceWorkbook(emptyFinanceSnapshot(), [], [account])),
      { accountIds: [] }
    );
    expect(result.accounts[0].id).toBe(account.id);
    expect(result.accounts[0].phone).toBe(account.phone);
    expect(result.accounts[0].balance).toBe(account.balance);
  });
});
