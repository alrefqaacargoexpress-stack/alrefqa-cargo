import { describe, expect, it } from "vitest";
import {
  canDeleteShipments,
  canEditShipments,
  canSendShipments,
  canEditCustomerAccount,
  canOpenLocalWorkspace,
  canShowTrackingLink,
  canStaffSendShipment,
  isNouakchottStaff,
  permissionFingerprint,
  profileMatchesUser,
} from "./offlineAccess";
import { blankPermissions } from "@shared/permissions";

describe("offline and role access policies", () => {
  const profile = {
    userId: "7",
    role: "accountant" as const,
    offices: ["dubai"] as const,
  };

  it("never opens a cached workspace without a matching signed-in user", () => {
    expect(canOpenLocalWorkspace(profile, "7", false)).toBe(true);
    expect(canOpenLocalWorkspace(profile, "8", false)).toBe(false);
    expect(canOpenLocalWorkspace(profile, null, false)).toBe(false);
    expect(canOpenLocalWorkspace(profile, "7", true)).toBe(false);
  });

  it("does not treat a cached profile as authorization after user change", () => {
    expect(profileMatchesUser(profile, "7")).toBe(true);
    expect(profileMatchesUser(profile, "8")).toBe(false);
    expect(profileMatchesUser(null, "7")).toBe(false);
  });

  it("keeps account writes to a one-office accountant", () => {
    expect(canEditCustomerAccount("accountant", ["dubai"])).toBe(true);
    expect(canEditCustomerAccount("accountant", ["dubai", "china"])).toBe(
      false
    );
    expect(canEditCustomerAccount("admin", null)).toBe(false);
    expect(canEditCustomerAccount("office_manager", ["dubai"])).toBe(false);
  });

  it("limits Nouakchott staff to warehouse storage and permits only preparing to transit", () => {
    expect(isNouakchottStaff("staff", ["nouakchott"])).toBe(true);
    expect(isNouakchottStaff("staff", ["dubai"])).toBe(false);
    expect(canStaffSendShipment("staff", "قيد التجهيز", "في الطريق")).toBe(
      true
    );
    expect(canStaffSendShipment("staff", "في الطريق", "مسلّمة")).toBe(false);
    expect(canShowTrackingLink(false)).toBe(false);
  });

  it("lets a source warehouse create and fill a shipment in preparation", () => {
    expect(canStaffSendShipment("staff", undefined, "قيد التجهيز")).toBe(true);
    expect(canStaffSendShipment("staff", "قيد التجهيز", "قيد التجهيز")).toBe(
      true
    );
    expect(canStaffSendShipment("staff", undefined, "في الطريق")).toBe(false);
    expect(canStaffSendShipment("staff", undefined, "مسلّمة")).toBe(false);
    expect(canStaffSendShipment("staff", "في الطريق", "في الطريق")).toBe(false);
    expect(canStaffSendShipment("admin", undefined, "مسلّمة")).toBe(true);
  });

  it("uses explicit grants for custom roles without changing the displayed role", () => {
    const permissions = blankPermissions();
    permissions.shipments = "view";
    permissions.shipment_send = "manage";
    permissions.shipment_delete = "manage";
    permissions.customers = "manage";
    const subject = {
      role: "viewer" as const,
      offices: ["dubai"] as const,
      permissions,
    };
    expect(canEditShipments(subject)).toBe(false);
    expect(canSendShipments(subject)).toBe(true);
    expect(canDeleteShipments(subject)).toBe(true);
    expect(canEditCustomerAccount(subject)).toBe(true);
  });

  it("changes the offline privilege fingerprint when effective grants change", () => {
    const first = blankPermissions();
    const second = blankPermissions();
    second.shipments = "view";
    expect(permissionFingerprint(first, "admin")).not.toBe(
      permissionFingerprint(second, "admin")
    );
  });
});
