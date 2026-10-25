import { describe, expect, it } from "vitest";
import {
  createShipmentPriceOverrideCommand,
  hasShipmentFinancialHistory,
  projectionForShipmentSide,
  sideIsInScope,
  stableShipmentPriceCommandId,
} from "./ShipmentPriceOverrideForm";
import { createPackedShipment } from "@shared/packing";
import type { PriceProjection } from "@shared/shipmentPricing";
import type { FinanceCommand } from "@shared/finance";

const shipment = {
  ...createPackedShipment({
  tracking: "SM-PRICE-1",
  source: "dubai",
  officeId: "dubai",
  service: "airRegular",
  pricePerKg: 37,
    pricePerKgMRU: 425,
  }),
  id: "shipment-price-test",
};

const projection = (side: "source" | "destination"): PriceProjection => ({
  shipmentId: shipment.id,
  side,
  officeId: side === "source" ? "dubai" : "nouakchott",
  currency: side === "source" ? "AED" : "MRU",
  pricePerKg: side === "source" ? 40 : 500,
  overridePricePerKg: side === "source" ? 40 : null,
  revision: 2,
  expectedPricingRevision: 2,
  recordVersion: 7,
  overrideId: side === "source" ? "override-1" : null,
  createdAt: "2026-10-25T00:00:00.000Z",
});

const accountant = (offices: ("dubai" | "nouakchott")[]) => ({
  role: "accountant" as const,
  offices,
  permissions: null,
});

describe("ShipmentPriceOverrideForm pricing contract", () => {
  it("allows an employee only the side owned by their office and root both sides", () => {
    expect(sideIsInScope(shipment, "source", accountant(["dubai"]))).toBe(true);
    expect(sideIsInScope(shipment, "destination", accountant(["dubai"]))).toBe(false);
    expect(sideIsInScope(shipment, "destination", accountant(["nouakchott"]))).toBe(true);
    expect(
      sideIsInScope(shipment, "source", {
        role: "admin",
        offices: null,
        permissions: null,
      })
    ).toBe(true);
    expect(
      sideIsInScope(shipment, "destination", {
        role: "admin",
        offices: null,
        permissions: null,
      })
    ).toBe(true);
  });

  it("matches projections by shipment, side, office and currency", () => {
    expect(projectionForShipmentSide(shipment, "source", [projection("source")])).toEqual(
      projection("source")
    );
    expect(
      projectionForShipmentSide(shipment, "destination", [projection("source")])
    ).toBeNull();
    expect(
      projectionForShipmentSide(
        shipment,
        "source",
        [{ ...projection("source"), currency: "TRY" }]
      )
    ).toBeNull();
  });

  it("creates only the selected-side per-kg payload with reason and authoritative versions", () => {
    const command = createShipmentPriceOverrideCommand({
      shipment,
      side: "source",
      pricePerKg: 40,
      reason: "Approved source contract refresh",
      projection: projection("source"),
      createdAt: "2026-10-25T00:00:00.000Z",
    });
    expect(command.id).toBe(stableShipmentPriceCommandId(shipment.id, "source"));
    expect(command.kind).toBe("shipment_price");
    expect(command.payload).toEqual({
      shipmentId: shipment.id,
      side: "source",
      pricePerKg: 40,
      reason: "Approved source contract refresh",
      expectedPricingRevision: 2,
      expectedVersion: 7,
    });
    expect("sourceOfficeId" in command.payload).toBe(false);
    expect("pricePerKgMRU" in command.payload).toBe(false);
  });

  it("keeps the original 37/AED rate immutable while the projection supplies 40/AED display", () => {
    const before = JSON.stringify(shipment.packing);
    const source = projectionForShipmentSide(shipment, "source", [projection("source")]);
    expect(source?.pricePerKg).toBe(40);
    expect(shipment.packing.pricePerKg).toBe(37);
    expect(JSON.stringify(shipment.packing)).toBe(before);
  });

  it("blocks any invoice, claim, expense, or receivable history", () => {
    const command = (kind: FinanceCommand["kind"]): FinanceCommand =>
      kind === "invoice"
        ? {
            id: "invoice-command",
            createdAt: "2026-10-25T00:00:00.000Z",
            kind,
            payload: {
              invoiceId: "i-1",
              customerId: "c-1",
              issuingOfficeId: "dubai",
              employeeOfficeId: "dubai",
              chargeKind: "shipping",
              paymentMode: "cash",
              currency: "AED",
              shipmentId: shipment.id,
              goodsIds: ["g-1"],
              adjustment: { direction: "increase", amount: 0 },
            },
          }
        : {
            id: "expense-command",
            createdAt: "2026-10-25T00:00:00.000Z",
            kind: "expense",
            payload: {
              expenseId: "e-1",
              officeId: "dubai",
              category: "shipment_cost",
              amount: 1,
              currency: "AED",
              date: "2026-10-25",
              description: "claim",
              shipmentId: shipment.id,
            },
          };
    expect(hasShipmentFinancialHistory(shipment.id, { commands: [command("invoice")] })).toBe(true);
    expect(hasShipmentFinancialHistory(shipment.id, { commands: [command("expense")] })).toBe(true);
    expect(
      hasShipmentFinancialHistory(shipment.id, {
        commands: [],
        snapshot: { shipmentReceivables: [{ shipments: [{ shipmentId: shipment.id }] }] },
      })
    ).toBe(true);
  });
});
