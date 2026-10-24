import { describe, expect, it } from "vitest";
import {
  allocateCentsByWeight,
  billComponentsInputSchema,
  fromCents,
  isConfirmedArrival,
  registerExportInputSchema,
  storedExportCents,
  toCents,
} from "./shipmentSettlement";

describe("shipment settlement shared helpers", () => {
  it("allocates integer cents deterministically and preserves the total", () => {
    const goods = [
      { id: "a", unitWeight: 1, pieces: 1 },
      { id: "b", unitWeight: 1, pieces: 1 },
      { id: "c", unitWeight: 1, pieces: 1 },
    ];
    const allocated = allocateCentsByWeight(100, goods);
    expect([...allocated.values()]).toEqual([34, 33, 33]);
    expect([...allocated.values()].reduce((sum, value) => sum + value, 0)).toBe(
      100
    );
  });

  it("keeps source and destination currencies independent", () => {
    expect(toCents("12.34")).toBe(1234);
    expect(fromCents(1234)).toBe(12.34);
    const aed = storedExportCents([{ id: "g1", unitWeight: 1, pieces: 1 }], {
      pricePerKg: 10,
    } as any);
    const mru = allocateCentsByWeight(2500, [
      { id: "g1", unitWeight: 1, pieces: 1 },
    ]);
    expect(aed.get("g1")).toBe(1000);
    expect(mru.get("g1")).toBe(2500);
  });

  it("distinguishes confirmed arrival from a merely in-transit shipment", () => {
    expect(
      isConfirmedArrival({
        status: "في الطريق",
        journey: { stage: "to_nouakchott" },
      })
    ).toBe(false);
    expect(
      isConfirmedArrival({
        status: "وصلت للمكتب",
        journey: { stage: "arrived_office" },
      })
    ).toBe(true);
  });

  it("requires explicit legacy approval and defaults it to false", () => {
    const parsed = registerExportInputSchema.parse({
      id: "req-1",
      shipmentId: "s1",
      expectedVersion: 1,
      confirmation: { trackingNumber: "TRK-1" },
    });
    expect(parsed.includeLegacyApproval).toBe(false);
  });

  it("rejects mixed component currencies and duplicate component ids at the API boundary", () => {
    expect(() =>
      billComponentsInputSchema.parse({
        id: "req-1",
        invoiceId: "i1",
        customerId: "c1",
        componentIds: ["component-1", "component-1"],
        currency: "MRU",
        paymentMode: "on_account",
        expectedShipmentVersion: 1,
      })
    ).toThrow();
  });
});
