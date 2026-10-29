import { describe, expect, it } from "vitest";
import type { Invoice, Shipment } from "@shared/operations";
import {
  marketShipmentMatches,
  marketStageForShipment,
  paymentStatusForShipment,
  type MarketStageId,
} from "./marketWarehouse";

function shipment(overrides: Partial<Shipment> = {}): Shipment {
  return {
    id: "shipment-1",
    tracking: "RF-1001",
    account: "عميل الرفكة",
    route: "دبي → نواكشوط",
    service: "جوي",
    status: "قيد التجهيز",
    eta: "2026-11-01",
    amount: 0,
    packing: {
      source: "dubai",
      pricePerKg: 37,
      createdAt: "2026-10-29T10:00:00.000Z",
      updatedAt: "2026-10-29T10:00:00.000Z",
      cartons: [
        {
          number: 1,
          closed: true,
          goods: [
            {
              id: "good-1",
              name: "هاتف",
              phone: "22223333",
              unitWeight: 2.5,
              pieces: 2,
            },
          ],
        },
      ],
    },
    ...overrides,
  };
}

function invoice(paidAmount: number): Invoice {
  return {
    id: "invoice-1",
    account: "عميل الرفكة",
    amount: 100,
    status: paidAmount === 100 ? "مدفوعة" : "دين",
    issuedAt: "2026-10-29T10:00:00.000Z",
    finance: {
      customerId: "customer-1",
      chargeKind: "shipping",
      paymentMode: "cash",
      issuingOfficeId: "dubai",
      financialOfficeId: "dubai",
      actorId: 1,
      actorName: "محاسب",
      recordedAt: "2026-10-29T10:00:00.000Z",
      currency: "AED",
      shipmentId: "shipment-1",
      goods: [
        {
          goodsId: "good-1",
          cartonNumber: 1,
          name: "هاتف",
          phone: "22223333",
          weight: 2.5,
          pieces: 2,
        },
      ],
      baseAmount: 100,
      adjustment: { direction: "increase", amount: 0 },
      paidAmount,
    },
  };
}

describe("Market Warehouse inquiry helpers", () => {
  it.each([
    ["قيد التجهيز", undefined, "registered"],
    ["في الطريق", undefined, "in_transit"],
    ["وصلت للمكتب", undefined, "arrived_destination"],
    ["وصلت للمكتب", [{ goodsId: "good-1" }], "ready_for_pickup"],
    ["مسلّمة", [{ goodsId: "good-1" }], "delivered"],
  ] as const)(
    "maps status and storage to %s",
    (status, destinationStorage, expected: MarketStageId) => {
      expect(
        marketStageForShipment(
          shipment({
            status,
            destinationStorage: destinationStorage as Shipment["destinationStorage"],
          })
        )
      ).toBe(expected);
    }
  );

  it("matches shipment, customer goods name, and phone without exposing search details", () => {
    const value = shipment();
    expect(marketShipmentMatches(value, "rf-1001")).toBe(true);
    expect(marketShipmentMatches(value, "هاتف")).toBe(true);
    expect(marketShipmentMatches(value, "2222")).toBe(true);
    expect(marketShipmentMatches(value, "غير موجود")).toBe(false);
  });

  it("returns a status indicator without returning invoice amounts", () => {
    expect(paymentStatusForShipment([invoice(100)], "shipment-1")).toBe("paid");
    expect(paymentStatusForShipment([invoice(40)], "shipment-1")).toBe(
      "outstanding"
    );
    expect(paymentStatusForShipment([], "shipment-1")).toBe("no_invoice");
  });
});
