import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PublishedPackingTariff from "@/components/packing/PublishedPackingTariff";
import { copyFor } from "@/lib/packingCopy";
import { packingPricingView } from "@/lib/packingTariffPreview";
import {
  addPackingGoods,
  createPackedShipment,
  packingTotals,
  packingTotalsMRU,
  type PackingSession,
} from "@shared/packing";
import type { PendingChange } from "@shared/operations";

const now = "2026-10-24T23:00:00.000Z";
const snapshot: NonNullable<PackingSession["rateSnapshot"]> = {
  service: "airRegular",
  sourceOffice: "dubai",
  sourceRate: { amount: 37, currency: "AED", unit: "kg" },
  nouakchottRate: { amount: 425, currency: "MRU", unit: "kg" },
  sourceProfileVersion: 6,
  nouakchottProfileVersion: 9,
  capturedAt: now,
};

function fixture() {
  const created = createPackedShipment(
    {
      tracking: "SM610",
      source: "dubai",
      officeId: "dubai",
      pricePerKg: 0,
      service: "airRegular",
      rateSnapshot: snapshot,
    },
    now
  );
  const shipment = addPackingGoods(created, {
    name: "SM610",
    phone: "",
    unitWeight: 0.1,
    pieces: 1,
  });
  const queue: PendingChange[] = [
    {
      id: "change-sm610",
      label: "Create SM610",
      createdAt: now,
      entity: "shipment",
      recordId: shipment.id,
      expectedVersion: null,
      data: shipment,
    },
  ];
  return { shipment, queue };
}

describe("Shipment packing tariff preview", () => {
  it("SSR renders the announced kg tariff and calculates 100g as 0.1kg", () => {
    const { shipment, queue } = fixture();
    const pricing = packingPricingView(shipment, queue, true);
    const sourceTotals = packingTotals(pricing.packingForDisplay);
    const mruTotals = packingTotalsMRU(pricing.packingForDisplay);
    const html = renderToStaticMarkup(
      <PublishedPackingTariff
        snapshot={snapshot}
        service="airRegular"
        c={copyFor("en")}
        language="en"
        preview={pricing.isPendingCreation}
      />
    );

    expect(pricing.isPreview).toBe(true);
    expect(pricing.packingForDisplay.pricePerKg).toBe(37);
    expect(pricing.packingForDisplay.pricePerKgMRU).toBe(425);
    expect(sourceTotals.weight).toBe(0.1);
    expect(sourceTotals.amount).toBe(3.7);
    expect(mruTotals?.amount).toBe(42.5);
    expect(html).toContain("37 AED / kg");
    expect(html).toContain("425 MRU / kg");
    expect(html).toContain(copyFor("en").previewPending);
    expect(html).toContain(copyFor("en").previewNotice);
  });

  it("hides both monetary rates when the viewer lacks shipment-price permission", () => {
    const { shipment, queue } = fixture();
    const pricing = packingPricingView(shipment, queue, false);

    expect(pricing.isPreview).toBe(false);
    expect(pricing.packingForDisplay.pricePerKg).toBe(0);
    expect(pricing.packingForDisplay.pricePerKgMRU).toBeUndefined();
    expect(packingTotals(pricing.packingForDisplay).amount).toBe(0);
    expect(packingTotalsMRU(pricing.packingForDisplay)).toBeNull();
  });

  it("does not treat an older versioned edit as a creation preview", () => {
    const { shipment } = fixture();
    const edited = {
      ...shipment,
      scope: "pending" as const,
      version: 7,
      packing: {
        ...shipment.packing,
        pricePerKg: 8.25,
        pricePerKgMRU: 120,
      },
    };
    const queue: PendingChange[] = [
      {
        id: "change-old-edit",
        label: "Edit SM610",
        createdAt: now,
        entity: "shipment",
        recordId: edited.id,
        expectedVersion: 7,
        data: edited,
      },
    ];
    const pricing = packingPricingView(edited, queue, true);

    expect(pricing.isPendingCreation).toBe(false);
    expect(pricing.isPreview).toBe(false);
    expect(pricing.packingForDisplay.pricePerKg).toBe(8.25);
    expect(pricing.packingForDisplay.pricePerKgMRU).toBe(120);
  });

  it("keeps the form vocabulary in kilograms rather than per-gram pricing", () => {
    const copy = copyFor("en");
    const tariffHtml = renderToStaticMarkup(
      <PublishedPackingTariff
        snapshot={snapshot}
        service="airRegular"
        c={copy}
        language="en"
        preview
      />
    );

    expect(copy.unitWeight).toContain("kg");
    expect(copy.pricePerKg).toContain("kg");
    expect(tariffHtml.toLowerCase()).not.toContain("gram");
    expect(tariffHtml).not.toContain("غرام");
  });
});
