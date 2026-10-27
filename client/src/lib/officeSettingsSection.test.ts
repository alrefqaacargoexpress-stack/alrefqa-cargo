import { describe, expect, it } from "vitest";
import {
  officeSettingsCopyFor,
  officeSettingsLocationWithQuery,
  officeSettingsSectionFromPanel,
} from "./officeSettingsSection";

describe("office settings sections", () => {
  it("normalizes missing and invalid panels to the profile section", () => {
    expect(officeSettingsSectionFromPanel(undefined)).toBe("profile");
    expect(officeSettingsSectionFromPanel(null)).toBe("profile");
    expect(officeSettingsSectionFromPanel("unknown")).toBe("profile");
    expect(officeSettingsSectionFromPanel("employees")).toBe("employees");
  });

  it("preserves office and unrelated query context while switching panels", () => {
    expect(
      officeSettingsLocationWithQuery(
        "/operations/settings?office=dubai&source=dashboard#section",
        { panel: "employees" }
      )
    ).toBe(
      "/operations/settings?office=dubai&source=dashboard&panel=employees#section"
    );
    expect(
      officeSettingsLocationWithQuery(
        "/operations/settings?panel=wallets&office=dubai",
        { panel: "profile", office: "china" }
      )
    ).toBe("/operations/settings?panel=profile&office=china");
  });

  it("supports all requested languages and a safe fallback", () => {
    expect(officeSettingsCopyFor("ar").employees).toContain("الموظفين");
    expect(officeSettingsCopyFor("en").wallets).toBe("Payment methods");
    expect(officeSettingsCopyFor("zh").permissions).toContain("权限");
    expect(officeSettingsCopyFor("tr").profile).toContain("Ofis");
    expect(officeSettingsCopyFor("unknown").profile).toBe("Office profile");
  });
});
