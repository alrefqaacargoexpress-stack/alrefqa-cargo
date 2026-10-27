import { describe, expect, it } from "vitest";
import { workspaceLinkActive } from "./WorkspaceNavigation";

describe("workspace navigation context", () => {
  it("keeps the home tab inactive on nested pages", () => {
    expect(workspaceLinkActive("/operations", "/operations/billing", "")).toBe(
      false
    );
    expect(workspaceLinkActive("/operations", "/operations", "")).toBe(true);
  });
  it("distinguishes employees from profile even on the same route", () => {
    expect(
      workspaceLinkActive(
        "/operations/settings?panel=employees",
        "/operations/settings",
        "?panel=employees&office=dubai"
      )
    ).toBe(true);
    expect(
      workspaceLinkActive(
        "/operations/settings?panel=profile",
        "/operations/settings",
        "?panel=employees&office=dubai"
      )
    ).toBe(false);
  });
  it("keeps a tracking section active on its shipment detail", () => {
    expect(
      workspaceLinkActive(
        "/operations/tracking",
        "/operations/tracking/abc",
        ""
      )
    ).toBe(true);
  });
});
