import { describe, expect, it } from "vitest";
import {
  emptyFinanceSnapshot,
  financeSnapshotSchema,
  sourceReceivable,
  type FinanceReceivable,
} from "./finance";
import { addPackingGoods, createPackedShipment } from "./packing";
import type { Invoice } from "./operations";

const recordedAt = "2026-10-24T00:00:00.000Z";

function shippingInvoice(
  id: string,
  shipmentId: string,
  officeId: "dubai" | "nouakchott" | "china",
  currency: "AED" | "MRU" | "CNY",
  goodsIds: string[],
  paymentMode: "cash" | "wallet" | "on_account" = "cash"
): Invoice {
  return {
    id,
    account: "Customer",
    amount: 1,
    status: "مدفوعة",
    issuedAt: recordedAt,
    officeId,
    finance: {
      customerId: "customer-1",
      chargeKind: "shipping",
      paymentMode,
      issuingOfficeId: officeId,
      financialOfficeId: officeId,
      actorId: 1,
      actorName: "Accountant",
      recordedAt,
      currency,
      shipmentId,
      goods: goodsIds.map((goodsId, index) => ({
        goodsId,
        cartonNumber: 1,
        name: `Goods ${index + 1}`,
        phone: "",
        weight: 1,
        pieces: 1,
      })),
      baseAmount: 1,
      adjustment: { direction: "increase", amount: 0 },
      paidAmount: paymentMode === "on_account" ? 0 : 1,
    },
  };
}

describe("source receivable drawdown", () => {
  it("deduplicates source-office cash, wallet, and debt invoices at the live source price", () => {
    let shipment = createPackedShipment({
      tracking: "SRC-DRAW-1",
      source: "dubai",
      pricePerKg: 10,
      officeId: "dubai",
    });
    shipment = addPackingGoods(shipment, {
      name: "One",
      phone: "",
      unitWeight: 2,
      pieces: 1,
    });
    shipment = addPackingGoods(shipment, {
      name: "Two",
      phone: "",
      unitWeight: 1,
      pieces: 1,
    });
    shipment.status = "في الطريق";
    const invoices = [
      shippingInvoice("cash", shipment.id, "dubai", "AED", ["missing"], "cash"),
      shippingInvoice("cash-one", shipment.id, "dubai", "AED", [
        shipment.packing.cartons[0].goods[0].id,
      ]),
      shippingInvoice(
        "wallet-one",
        shipment.id,
        "dubai",
        "AED",
        [shipment.packing.cartons[0].goods[0].id],
        "wallet"
      ),
      shippingInvoice(
        "debt-two",
        shipment.id,
        "dubai",
        "AED",
        [shipment.packing.cartons[0].goods[1].id],
        "on_account"
      ),
      shippingInvoice("wrong-office", shipment.id, "nouakchott", "MRU", [
        shipment.packing.cartons[0].goods[0].id,
      ]),
    ];
    const [row] = sourceReceivable([shipment], ["dubai"], invoices);
    expect(row).toMatchObject({
      officeId: "dubai",
      currency: "AED",
      total: 30,
      soldTotal: 30,
      remainingTotal: 0,
      unpricedShipments: 0,
    });
    expect(row.shipments[0]).toMatchObject({
      amount: 30,
      soldAmount: 30,
      remainingAmount: 0,
      pricingStatus: "priced",
    });
  });

  it("reports unpriced shipments without leaking another office or MRU invoices", () => {
    const shipment = createPackedShipment({
      tracking: "SRC-DRAW-2",
      source: "china",
      pricePerKg: 0,
      officeId: "china",
    });
    shipment.status = "في الطريق";
    const [row] = sourceReceivable(
      [shipment],
      ["china"],
      [shippingInvoice("mru", shipment.id, "nouakchott", "MRU", [])]
    );
    expect(row).toMatchObject({
      officeId: "china",
      currency: "CNY",
      total: 0,
      soldTotal: 0,
      remainingTotal: 0,
      unpricedShipments: 1,
    });
    expect(row.shipments[0].pricingStatus).toBe("unpriced");
  });

  it("accepts old cached receivables without requiring additive fields", () => {
    const old: FinanceReceivable = {
      officeId: "dubai",
      currency: "AED",
      total: 10,
      shipments: [{ shipmentId: "s", tracking: "T", amount: 10 }],
    };
    expect(
      financeSnapshotSchema.parse({
        ...emptyFinanceSnapshot(),
        receivables: [old],
        shipmentReceivables: [old],
      }).receivables
    ).toEqual([old]);
  });
});
