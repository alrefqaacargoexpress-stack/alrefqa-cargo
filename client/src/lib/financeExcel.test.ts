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
const opening: FinanceCommand = {
  id: "opening-command",
  kind: "opening_balance",
  createdAt: now,
  payload: {
    openingId: "opening-one",
    officeId: "nouakchott",
    currency: "MRU",
    direction: "debit",
    date: "2026-10-21",
    amount: 125,
    note: "Cash count at opening",
  },
};
const shipmentPrice: FinanceCommand = {
  id: "shipment-price-command",
  kind: "shipment_price",
  createdAt: now,
  payload: {
    shipmentId: "s-one",
    side: "destination",
    pricePerKg: 100,
    reason: "approved destination correction",
    expectedPricingRevision: 0,
    expectedVersion: 3,
  },
};
const withdrawal: FinanceCommand = {
  id: "withdrawal-command",
  kind: "profit_withdrawal",
  createdAt: now,
  payload: {
    withdrawalId: "withdrawal-one",
    officeId: "nouakchott",
    currency: "MRU",
    amount: 25,
    date: "2026-10-21",
    description: "Owner distribution",
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

  it("roundtrips opening and shipment price drafts as validated discriminated commands", () => {
    const result = parseFinanceBuffer(
      buffer(
        buildFinanceWorkbook(emptyFinanceSnapshot(), [opening, shipmentPrice])
      ),
      { openingIds: [], shipmentPriceShipmentIds: [] }
    );
    expect(result.commands.map(command => command.kind)).toEqual([
      "opening_balance",
      "shipment_price",
    ]);
    expect(result.commands[0]).toMatchObject({
      kind: "opening_balance",
      payload: opening.payload,
    });
    expect(result.commands[1]).toMatchObject({
      kind: "shipment_price",
      payload: shipmentPrice.payload,
    });
    expect(result.readOnlySheets).toContain("القيود المسجلة");
    expect(result.readOnlySheets).toContain("الفواتير المسجلة");
  });

  it("does not import a posted opening entry or price draft twice", () => {
    const result = parseFinanceBuffer(
      buffer(
        buildFinanceWorkbook(emptyFinanceSnapshot(), [opening, shipmentPrice])
      ),
      { openingIds: ["opening-one"], shipmentPriceShipmentIds: ["s-one"] }
    );
    expect(result.commands).toHaveLength(0);
    expect(result.rejected.map(row => row.reason)).toEqual([
      "duplicate_record",
      "duplicate_record",
    ]);
  });

  it("rejects a legacy shipment-price row with a row-level review reason", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        [
          "الشحنة",
          "مكتب المصدر",
          "سعر الكيلو",
          "سعر الكيلو MRU",
          "النسخة المتوقعة",
        ],
        ["s-one", "china", 25, 100, 3],
      ]),
      "مسودات أسعار الشحنات"
    );
    const result = parseFinanceBuffer(buffer(wb), {
      shipmentPriceShipmentIds: [],
    });
    expect(result.commands).toEqual([]);
    expect(result.rejected).toEqual([
      {
        sheet: "مسودات أسعار الشحنات",
        row: 2,
        reason: "shipment_price_override_fields_required",
      },
    ]);
  });

  it("exports withdrawal drafts as reference-only and never imports them", () => {
    const wb = buildFinanceWorkbook(emptyFinanceSnapshot(), [withdrawal]);
    expect(wb.SheetNames).toContain("مسودات سحب الأرباح (مرجع فقط)");
    const result = parseFinanceBuffer(buffer(wb));
    expect(result.commands).toEqual([]);
    expect(result.readOnlySheets).toContain("مسودات سحب الأرباح (مرجع فقط)");
  });

  it("rejects a zero modern shipment price without creating a financial command", () => {
    const wb = buildFinanceWorkbook(emptyFinanceSnapshot(), [
      {
        ...shipmentPrice,
        payload: { ...shipmentPrice.payload, pricePerKg: 0 },
      },
    ]);
    const result = parseFinanceBuffer(buffer(wb), {
      shipmentPriceShipmentIds: [],
    });
    expect(result.commands).toEqual([]);
    expect(result.rejected[0]).toMatchObject({
      sheet: "مسودات أسعار الشحنات",
      row: 2,
    });
    expect(result.rejected[0].reason).toMatch(
      /positive|invalid_rate|Too small/i
    );
  });
});
