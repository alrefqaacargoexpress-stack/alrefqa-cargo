import { describe, expect, it } from "vitest";
import { legacyDestination, operationActionsForRole } from "./OperationsHome";
import { blankPermissions } from "@shared/permissions";
const labels = {
  newShipment: "new",
  shipments: "shipments",
  customers: "customers",
  invoice: "invoice",
  offices: "offices",
  tracking: "tracking",
  settings: "settings",
} as const;

describe("operations home routing", () => {
  it("preserves legacy context and opens the employee section for permissions", () => {
    expect(
      legacyDestination("/operations?tab=accounts&account=a-7&office=dubai")
    ).toBe("/operations/customers?account=a-7&office=dubai");
    expect(
      legacyDestination("/operations?tab=invoices&customer=a-7&invoice=i-2")
    ).toBe("/operations/billing?customer=a-7&invoice=i-2");
    expect(legacyDestination("/operations?tab=permissions&office=china")).toBe(
      "/operations/settings?office=china&panel=employees"
    );
  });
  it("organizes owner management first and never gives finance to source staff or viewers", () => {
    const admin = operationActionsForRole("admin", labels);
    const staff = operationActionsForRole("source_warehouse", labels, [
      "dubai",
    ]);
    const viewer = operationActionsForRole("viewer", labels, ["dubai"]);
    expect(admin.slice(0, 3).map(item => item.href)).toEqual([
      "/operations/offices",
      "/operations/settings?panel=employees",
      "/operations/settings?panel=profile",
    ]);
    expect(staff.map(item => item.href)).toEqual([
      "/operations/shipments/new",
      "/operations/shipments",
      "/operations/tracking",
      "/operations/market-warehouse",
    ]);
    expect(viewer.map(item => item.href)).toEqual(["/operations/tracking"]);
    expect(
      operationActionsForRole(
        "staff",
        labels,
        ["dubai"],
        false,
        blankPermissions()
      )
    ).toEqual([]);
  });
});
