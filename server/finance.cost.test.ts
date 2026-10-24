import { describe, expect, it } from "vitest";
import { canPostShipmentCost } from "./finance";

describe("source shipment cost authority", () => {
  it("allows only a general accountant with the actual source office", () => {
    expect(
      canPostShipmentCost(
        {
          role: "general_accountant",
          offices: ["dubai"],
          homeOffice: "dubai",
          permissions: {
            shipment_cost: "manage",
          } as any,
        },
        "dubai"
      )
    ).toBe(true);
  });

  it("denies source accountant, mismatched office, and Nouakchott source cost", () => {
    expect(
      canPostShipmentCost(
        {
          role: "accountant",
          offices: ["dubai"],
          homeOffice: "dubai",
          permissions: { shipment_cost: "manage" } as any,
        },
        "dubai"
      )
    ).toBe(false);
    expect(
      canPostShipmentCost(
        {
          role: "general_accountant",
          offices: ["dubai"],
          homeOffice: "dubai",
          permissions: { shipment_cost: "manage" } as any,
        },
        "turkey"
      )
    ).toBe(false);
    expect(
      canPostShipmentCost(
        {
          role: "general_accountant",
          offices: ["nouakchott"],
          homeOffice: "nouakchott",
          permissions: { shipment_cost: "manage" } as any,
        },
        "nouakchott"
      )
    ).toBe(false);
  });
});
