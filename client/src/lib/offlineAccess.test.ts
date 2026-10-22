import { describe, expect, it } from "vitest";
import {
  canEditCustomerAccount,
  canOpenLocalWorkspace,
  canShowTrackingLink,
  canStaffSendShipment,
  isNouakchottStaff,
  profileMatchesUser,
} from "./offlineAccess";

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
});
