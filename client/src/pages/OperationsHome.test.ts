import { describe, expect, it } from "vitest";
import { legacyDestination, operationActionsForRole } from "./OperationsHome";

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
  it("preserves legacy context while moving tabs to focused pages", () => {
    expect(legacyDestination("/operations?tab=accounts&account=a-7&office=dubai")).toBe(
      "/operations/customers?account=a-7&office=dubai",
    );
    expect(legacyDestination("/operations?tab=invoices&customer=a-7&invoice=i-2")).toBe(
      "/operations/billing?customer=a-7&invoice=i-2",
    );
    expect(legacyDestination("/operations?tab=permissions&office=china")).toBe(
      "/operations/settings?office=china",
    );
  });

  it("keeps role shortcuts focused and never gives finance to staff or viewers", () => {
    const admin = operationActionsForRole("admin", labels);
    const staff = operationActionsForRole("staff", labels);
    const viewer = operationActionsForRole("viewer", labels);
    expect(admin.map(item => item.href)).toEqual([
      "/operations/shipments/new",
      "/operations/shipments",
      "/operations/customers",
      "/operations/billing",
      "/operations/finance",
      "/operations/tracking",
      "/operations/settings",
    ]);
    expect(staff.map(item => item.href)).toEqual([
      "/operations/shipments/new",
      "/operations/shipments",
      "/operations/customers",
    ]);
    expect(viewer.map(item => item.href)).toEqual(["/operations/tracking"]);
  });
});
