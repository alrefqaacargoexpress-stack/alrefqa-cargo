import { describe, expect, it } from "vitest";
import {
  canonicalPackingShipment,
  createPackedShipment,
  packingSchema,
  shipmentServiceForPackingService,
  tariffForPackingProfiles,
} from "@shared/packing";
import { workspaceSchema } from "@shared/localValidation";
import type { Shipment } from "@shared/operations";
import { prepareRecordForWrite } from "./operations";

const sourceProfile = {
  officeId: "dubai" as const,
  version: 4,
  shippingRates: {
    airRegular: { amount: 11, currency: "AED" as const, unit: "kg" as const },
  },
};
const nouakchottProfile = {
  officeId: "nouakchott" as const,
  version: 7,
  sourceShippingRates: {
    dubai: {
      airRegular: {
        amount: 420,
        currency: "MRU" as const,
        unit: "kg" as const,
      },
    },
  },
};

describe("trusted published packing tariff", () => {
  it("only derives source price from the source currency and kg unit", () => {
    const valid = tariffForPackingProfiles({
      source: "dubai",
      service: "airRegular",
      sourceProfile,
      nouakchottProfile,
      capturedAt: "2026-10-23T00:00:00.000Z",
    });
    expect(valid.pricePerKg).toBe(11);
    expect(valid.pricePerKgMRU).toBe(420);

    expect(
      tariffForPackingProfiles({
        source: "dubai",
        service: "airRegular",
        sourceProfile: {
          ...sourceProfile,
          shippingRates: {
            airRegular: { amount: 99, currency: "USD", unit: "kg" },
          },
        },
        nouakchottProfile,
      }).pricePerKg
    ).toBe(0);
    expect(
      tariffForPackingProfiles({
        source: "dubai",
        service: "airRegular",
        sourceProfile: {
          ...sourceProfile,
          shippingRates: {
            airRegular: { amount: 99, currency: "AED", unit: "m3" },
          },
        },
        nouakchottProfile,
      }).pricePerKg
    ).toBe(0);
  });

  it("keeps sensitive as packing metadata while mapping the legacy service", () => {
    expect(shipmentServiceForPackingService("airRegular")).toBe("جوي");
    expect(shipmentServiceForPackingService("airExpress")).toBe("سريع");
    expect(shipmentServiceForPackingService("sensitive")).toBe("جوي");
    expect(shipmentServiceForPackingService("sea")).toBe("بحري");
    const shipment = createPackedShipment({
      tracking: "SVC",
      source: "dubai",
      service: "airExpress",
    });
    expect(canonicalPackingShipment(shipment).service).toBe("سريع");
  });

  it("allows a new server-approved tariff but rejects generic nonzero writes", () => {
    const shipment = createPackedShipment({
      tracking: "TARIFF",
      source: "dubai",
      pricePerKg: 11,
      service: "airRegular",
    });
    expect(() => prepareRecordForWrite("admin", shipment, null)).toThrow();
    const saved = prepareRecordForWrite(
      "admin",
      shipment,
      null,
      undefined,
      true
    ) as Shipment;
    expect(saved.packing?.pricePerKg).toBe(11);
    expect(saved.service).toBe("جوي");
  });

  it("freezes existing tariff price and metadata even for admin", () => {
    const snapshot = tariffForPackingProfiles({
      source: "dubai",
      service: "airRegular",
      sourceProfile,
      nouakchottProfile,
    }).snapshot;
    const current = createPackedShipment({
      tracking: "FROZEN",
      source: "dubai",
      service: "airRegular",
      rateSnapshot: snapshot,
      pricePerKg: 11,
    });
    expect(() =>
      prepareRecordForWrite(
        "admin",
        { ...current, packing: { ...current.packing, pricePerKg: 12 } },
        current
      )
    ).toThrow("finance_command_required");
    expect(() =>
      prepareRecordForWrite(
        "admin",
        {
          ...current,
          packing: {
            ...current.packing,
            service: "sea",
            rateSnapshot: { ...snapshot, service: "sea" },
          },
          service: "بحري",
        },
        current
      )
    ).toThrow("finance_command_required");
    const legacyEdit = { ...current, packing: { ...current.packing } };
    delete legacyEdit.packing.rateSnapshot;
    const preserved = prepareRecordForWrite(
      "admin",
      legacyEdit,
      current
    ) as Shipment;
    expect(preserved.packing?.rateSnapshot).toEqual(snapshot);
  });

  it("accepts the new packing metadata in the local queued workspace schema", () => {
    const shipment = createPackedShipment({
      tracking: "LOCAL",
      source: "dubai",
      service: "sensitive",
      rateSnapshot: tariffForPackingProfiles({
        source: "dubai",
        service: "sensitive",
        sourceProfile,
        nouakchottProfile,
      }).snapshot,
    });
    packingSchema.parse(shipment.packing);
    expect(
      workspaceSchema.parse({
        state: {
          accounts: [],
          shipments: [shipment],
          invoices: [],
          lastSyncedAt: null,
        },
        queue: [],
      }).state.shipments[0].packing?.service
    ).toBe("sensitive");
  });
});
