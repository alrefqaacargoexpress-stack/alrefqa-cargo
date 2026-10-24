import { describe, expect, it } from "vitest";
import { activeGoodsForCustomerTracking } from "./CustomerTrackingGrantPanel";

const shipment = {
  id: "s-1",
  tracking: "AR-100",
  account: "a-1",
  route: "Dubai",
  service: "جوي" as const,
  status: "في الطريق" as const,
  eta: "",
  amount: 0,
  officeId: "dubai" as const,
  packing: {
    source: "dubai" as const,
    pricePerKg: 1,
    createdAt: "2026-10-24T21:00:00.000Z",
    updatedAt: "2026-10-24T21:00:00.000Z",
    cartons: [
      {
        number: 1,
        closed: true,
        goods: [
          {
            id: "g-1",
            name: "Box",
            phone: "+2220000000",
            pieces: 1,
            unitWeight: 2,
          },
          {
            id: "g-2",
            name: "Retired",
            phone: "+2220000001",
            pieces: 1,
            unitWeight: 1,
            deleted: { at: "2026-10-24T21:00:00.000Z", reason: "retired" },
          },
        ],
      },
    ],
  },
};

describe("customer tracking grant selection", () => {
  it("returns active goods only and strips phone data", () => {
    const goods = activeGoodsForCustomerTracking(shipment);
    expect(goods).toEqual([
      { id: "g-1", name: "Box", pieces: 1, unitWeight: 2 },
    ]);
    expect(goods[0]).not.toHaveProperty("phone");
  });
});
