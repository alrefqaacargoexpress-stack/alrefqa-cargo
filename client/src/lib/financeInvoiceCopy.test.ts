import { describe, expect, it } from "vitest";
import {
  invoicePaymentOptions,
  financeInvoiceCopy,
  searchableInvoiceGoods,
  adjustmentTotal,
} from "./financeInvoiceCopy";
import type { Invoice, Shipment } from "@shared/operations";

const shipment = {
  id: "s-1",
  tracking: "TR-1",
  account: "A",
  route: "x",
  service: "جوي",
  status: "قيد التجهيز",
  eta: "",
  amount: 0,
  packing: {
    source: "china",
    pricePerKg: 4,
    pricePerKgMRU: 120,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    cartons: [
      {
        number: 1,
        closed: true,
        goods: [
          { id: "g-1", name: "Phone", phone: "22", unitWeight: 2, pieces: 3 },
          { id: "g-2", name: "Cable", phone: "33", unitWeight: 0.5, pieces: 2 },
          {
            id: "g-deleted",
            name: "Deleted",
            phone: "",
            unitWeight: 1,
            pieces: 1,
            deleted: { at: new Date().toISOString(), reason: "x" },
          },
        ],
      },
    ],
  },
} as Shipment;

describe("finance invoice pure helpers", () => {
  it("keeps complete Arabic, English, Chinese and Turkish copy and payment choices", () => {
    const keys = Object.keys(financeInvoiceCopy.ar).sort();
    for (const language of ["ar", "en", "zh", "tr"] as const) {
      expect(Object.keys(financeInvoiceCopy[language]).sort()).toEqual(keys);
      expect(invoicePaymentOptions(financeInvoiceCopy[language])).toHaveLength(
        3
      );
      expect(invoicePaymentOptions(financeInvoiceCopy[language]).map(pair => pair[0])).toEqual([
        "cash",
        "wallet",
        "on_account",
      ]);
      for (const value of Object.values(financeInvoiceCopy[language]))
        expect(value.trim()).not.toBe("");
    }
  });
  it("calculates plus/minus corrections in cents and clamps a negative result", () => {
    expect(adjustmentTotal(10, "increase", 0.25)).toBe(10.25);
    expect(adjustmentTotal(10, "decrease", 0.25)).toBe(9.75);
    expect(adjustmentTotal(1, "decrease", 2)).toBe(0);
  });
  it("searches by name or weight and excludes deleted and billed goods", () => {
    const billed = [
      {
        id: "i-1",
        account: "A",
        amount: 1,
        status: "دين",
        issuedAt: "today",
        finance: {
          goods: [
            {
              goodsId: "g-1",
              cartonNumber: 1,
              name: "Phone",
              phone: "22",
              weight: 6,
              pieces: 3,
            },
          ],
          customerId: "a",
          chargeKind: "shipping",
          paymentMode: "shipping_fee",
          issuingOfficeId: "china",
          financialOfficeId: "nouakchott",
          actorId: 1,
          actorName: "server",
          recordedAt: new Date().toISOString(),
          currency: "CNY",
          baseAmount: 1,
          adjustment: { direction: "increase", amount: 0 },
          paidAmount: 0,
        },
      } as Invoice,
    ];
    expect(searchableInvoiceGoods([shipment], "phone", billed)).toHaveLength(0);
    expect(searchableInvoiceGoods([shipment], "1", [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ goodsId: "g-2", weight: 1 }),
      ])
    );
    expect(searchableInvoiceGoods([shipment], "", [])).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ goodsId: "g-deleted" }),
      ])
    );
  });
});
