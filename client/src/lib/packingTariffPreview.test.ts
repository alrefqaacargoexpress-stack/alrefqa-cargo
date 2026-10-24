import { describe, expect, it } from "vitest";
import { packingPricingView } from "./packingTariffPreview";
import {
  addPackingGoods,
  createPackedShipment,
  packingTotals,
  packingTotalsMRU,
  type PackingSession,
} from "../../../shared/packing";
import type { PendingChange } from "../../../shared/operations";

const createdAt = "2026-10-24T22:54:00.000Z";
const snapshot = (): NonNullable<PackingSession["rateSnapshot"]> => ({
  service: "airRegular",
  sourceOffice: "dubai",
  sourceRate: { amount: 37, currency: "AED", unit: "kg" },
  nouakchottRate: { amount: 425, currency: "MRU", unit: "kg" },
  sourceProfileVersion: 4,
  nouakchottProfileVersion: 8,
  capturedAt: createdAt,
});
const draft = () =>
  addPackingGoods(
    createPackedShipment(
      {
        tracking: "SM 610",
        source: "dubai",
        officeId: "dubai",
        service: "airRegular",
        pricePerKg: 0,
        rateSnapshot: snapshot(),
      },
      createdAt
    ),
    { name: "Brand", phone: "", unitWeight: 0.1, pieces: 1 }
  );
const change = (
  shipment: ReturnType<typeof draft>,
  expectedVersion: number | null = null
): PendingChange => ({
  id: "pending-create",
  entity: "shipment",
  recordId: shipment.id,
  label: "Create",
  createdAt,
  expectedVersion,
  data: structuredClone(shipment),
});

describe("display-only creation tariff", () => {
  it("calculates source and destination for 0.1 kg without changing saved prices or queued data", () => {
    const shipment = draft(),
      queue = [change(shipment)];
    const before = JSON.stringify({ shipment, queue });
    const result = packingPricingView(shipment, queue, true);
    expect(result.isPreview).toBe(true);
    expect(result.packingForDisplay.pricePerKg).toBe(37);
    expect(result.packingForDisplay.pricePerKgMRU).toBe(425);
    expect(packingTotals(result.packingForDisplay).amount).toBe(3.7);
    expect(packingTotalsMRU(result.packingForDisplay)?.amount).toBe(42.5);
    expect(JSON.stringify({ shipment, queue })).toBe(before);
    expect(shipment.packing.pricePerKg).toBe(0);
    expect(shipment.packing.pricePerKgMRU).toBeUndefined();
    expect(result.confirmed).toBe(false);
  });
  it("rounds only final totals rather than a one-gram rate", () => {
    const shipment = draft();
    shipment.packing.cartons[0].goods[0].unitWeight = 0.001;
    shipment.packing.cartons[0].goods[0].pieces = 3;
    const result = packingPricingView(shipment, [change(shipment)], true);
    expect(packingTotals(result.packingForDisplay).amount).toBe(0.11);
    expect(packingTotalsMRU(result.packingForDisplay)?.amount).toBe(1.28);
  });
  it("handles a piece count and fractional kilogram", () => {
    const shipment = draft();
    shipment.packing.cartons[0].goods[0].unitWeight = 0.333;
    shipment.packing.cartons[0].goods[0].pieces = 3;
    const result = packingPricingView(shipment, [change(shipment)], true);
    expect(packingTotals(result.packingForDisplay).amount).toBe(36.96);
    expect(packingTotalsMRU(result.packingForDisplay)?.amount).toBe(424.58);
  });
  it("has a zero empty total, not a zero office rate", () => {
    const shipment = draft();
    shipment.packing.cartons[0].goods = [];
    const result = packingPricingView(shipment, [change(shipment)], true);
    expect(result.hasSourceRate).toBe(true);
    expect(packingTotals(result.packingForDisplay).amount).toBe(0);
  });
  it("does not restore or reprice an existing pending edit", () => {
    const shipment = draft();
    shipment.version = 5;
    shipment.packing.pricePerKg = 35;
    shipment.packing.pricePerKgMRU = 400;
    const result = packingPricingView(shipment, [change(shipment, 5)], true);
    expect(result.isPreview).toBe(false);
    expect(result.packingForDisplay).toBe(shipment.packing);
    expect(result.packingForDisplay.pricePerKg).toBe(35);
    expect(result.confirmed).toBe(true);
    shipment.packing.pricePerKg = 0;
    expect(
      packingPricingView(shipment, [change(shipment, 5)], true).hasSourceRate
    ).toBe(false);
  });
  it("does not reprice a shared unpriced shipment from its snapshot", () => {
    const shipment = draft();
    shipment.scope = "shared";
    shipment.version = 2;
    const result = packingPricingView(shipment, [], true);
    expect(result.isPreview).toBe(false);
    expect(result.packingForDisplay.pricePerKg).toBe(0);
  });
  it("requires a pending creation with null expectedVersion and no saved version", () => {
    const shipment = draft();
    expect(packingPricingView(shipment, [], true).isPendingCreation).toBe(
      false
    );
    expect(
      packingPricingView(shipment, [change(shipment, 0)], true)
        .isPendingCreation
    ).toBe(false);
    shipment.version = 3;
    expect(
      packingPricingView(shipment, [change(shipment)], true).isPendingCreation
    ).toBe(false);
  });
  it("never quotes an archive or a retired shipment", () => {
    const shipment = draft();
    const pending = change(shipment);
    pending.action = "delete-shipment";
    expect(packingPricingView(shipment, [pending], true).isPreview).toBe(false);
    shipment.deleted = { at: createdAt, reason: "Retired" };
    expect(
      packingPricingView(shipment, [change(shipment)], true).isPreview
    ).toBe(false);
  });
  it("does not let untrusted numeric prices override publication preview", () => {
    const shipment = draft();
    shipment.packing.pricePerKg = 999;
    shipment.packing.pricePerKgMRU = 999;
    const result = packingPricingView(shipment, [change(shipment)], true);
    expect(result.packingForDisplay.pricePerKg).toBe(37);
    expect(result.packingForDisplay.pricePerKgMRU).toBe(425);
    expect(shipment.packing.pricePerKg).toBe(999);
  });
  it("keeps hidden financial prices hidden even when the announcement is available", () => {
    const shipment = draft();
    shipment.packing.pricePerKg = 37;
    shipment.packing.pricePerKgMRU = 425;
    const result = packingPricingView(shipment, [change(shipment)], false);
    expect(result.isPreview).toBe(false);
    expect(result.packingForDisplay.pricePerKg).toBe(0);
    expect(result.packingForDisplay.pricePerKgMRU).toBeUndefined();
  });
  it("does not replace a missing snapshot with a current or invented tariff", () => {
    const shipment = draft();
    delete shipment.packing.rateSnapshot;
    const result = packingPricingView(shipment, [change(shipment)], true);
    expect(result.issue).toBe("snapshot_unavailable");
    expect(result.isPreview).toBe(false);
  });
  it.each(["source", "service", "late", "old"])(
    "rejects a mismatched %s snapshot",
    kind => {
      const shipment = draft();
      const tariff = snapshot();
      if (kind === "source") tariff.sourceOffice = "china";
      if (kind === "service") tariff.service = "airExpress";
      if (kind === "late") tariff.capturedAt = "2026-10-24T22:54:00.001Z";
      if (kind === "old") tariff.capturedAt = "2026-10-24T22:53:58.000Z";
      shipment.packing.rateSnapshot = tariff;
      const result = packingPricingView(shipment, [change(shipment)], true);
      expect(result.issue).toBe("snapshot_mismatch");
      expect(result.isPreview).toBe(false);
    }
  );
  it("supports existing local snapshots evaluated just before creation", () => {
    const shipment = draft();
    shipment.packing.rateSnapshot!.capturedAt = "2026-10-24T22:53:59.999Z";
    expect(
      packingPricingView(shipment, [change(shipment)], true).isPreview
    ).toBe(true);
  });
  it.each(["currency", "unit", "zero"])(
    "does not invent a source rate for wrong %s",
    kind => {
      const shipment = draft();
      shipment.packing.rateSnapshot!.sourceRate = {
        amount: kind === "zero" ? 0 : 37,
        currency: kind === "currency" ? "USD" : "AED",
        unit: kind === "unit" ? "m3" : "kg",
      };
      const result = packingPricingView(shipment, [change(shipment)], true);
      expect(result.hasSourceRate).toBe(false);
      expect(result.hasMruRate).toBe(true);
      expect(result.packingForDisplay.pricePerKg).toBe(0);
    }
  );
  it("does not convert a destination volume tariff to kg", () => {
    const shipment = draft();
    shipment.packing.rateSnapshot!.nouakchottRate = {
      amount: 425,
      currency: "MRU",
      unit: "m3",
    };
    const result = packingPricingView(shipment, [change(shipment)], true);
    expect(result.hasMruRate).toBe(false);
    expect(result.packingForDisplay.pricePerKgMRU).toBeUndefined();
  });
  it.each([
    ["turkey", "TRY"],
    ["china", "CNY"],
  ] as const)(
    "uses the %s office currency without exchange",
    (source, currency) => {
      const shipment = draft();
      shipment.packing.source = source;
      shipment.officeId = source;
      shipment.packing.rateSnapshot = {
        ...snapshot(),
        sourceOffice: source,
        sourceRate: { amount: 37, currency, unit: "kg" },
      };
      const result = packingPricingView(shipment, [change(shipment)], true);
      expect(result.hasSourceRate).toBe(true);
      expect(result.packingForDisplay.pricePerKg).toBe(37);
    }
  );
});
