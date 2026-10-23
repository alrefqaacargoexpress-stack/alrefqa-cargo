import { describe, expect, it } from "vitest";
import { createPackedShipment } from "@shared/packing";
import { blankPermissions, permissionAllowed } from "@shared/permissions";
import {
  canReadPermissionRecord,
  canReadTrackingPermissionRecord,
  sanitizePermissionRecord,
  changePermission,
} from "./permissionAccess";
import type { OfficeScope } from "./branches";
const shipment = createPackedShipment({
  tracking: "PERMISSION-TEST",
  source: "dubai",
  pricePerKg: 25,
  pricePerKgMRU: 90,
  officeId: "dubai",
});
function scope(): OfficeScope {
  return {
    role: "accountant",
    offices: ["dubai"],
    homeOffice: "dubai",
    membershipVersion: 1,
    permissionsCustomized: true,
    permissions: { ...blankPermissions(), shipments: "view", tracking: "view" },
  };
}
describe("Capability-specific records", () => {
  it("redacts private prices even for an accountant with only tracking view", () => {
    const user = scope();
    const result = sanitizePermissionRecord(user, "shipment", shipment);
    expect(result.amount).toBe(0);
    expect(result.packing?.pricePerKg).toBe(0);
    expect(result.packing?.pricePerKgMRU).toBe(0);
    expect(shipment.packing.pricePerKg).toBe(25);
  });
  it("lets an explicit price-view grant read only their office's price", () => {
    const user = scope();
    user.permissions!.shipment_prices = "view";
    expect(
      sanitizePermissionRecord(user, "shipment", shipment).packing?.pricePerKg
    ).toBe(25);
    expect(
      canReadPermissionRecord(
        { ...user, offices: ["china"], homeOffice: "china" },
        "shipment",
        shipment
      )
    ).toBe(false);
  });
  it("keeps generic shipment and tracking permissions independent", () => {
    const user = scope();
    user.permissions!.shipments = "none";
    expect(canReadPermissionRecord(user, "shipment", shipment)).toBe(false);
    expect(canReadTrackingPermissionRecord(user, "shipment", shipment)).toBe(
      true
    );
  });
  it("a view-only user cannot send or delete through generic sync", () => {
    const user = scope();
    const next = { ...shipment, status: "في الطريق" };
    expect(
      changePermission(user, { entity: "shipment", data: next }, shipment).role
    ).toBeNull();
    user.permissions!.shipments = "manage";
    expect(
      changePermission(user, { entity: "shipment", data: next }, shipment).role
    ).toBeNull();
    expect(
      changePermission(
        user,
        { entity: "shipment", action: "delete", data: shipment },
        shipment
      ).role
    ).toBeNull();
  });
  it("does not give global office assignments to an employee even with a forged map", () => {
    const user = scope();
    user.permissions!.office_assign = "manage";
    expect(permissionAllowed(user, "office_assign", "manage")).toBe(false);
  });
});
