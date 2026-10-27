import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  blankPermissions,
  permissionKeys,
} from "../../../../shared/permissions";
import NewPermissionsMatrix from "./newPermissionsMatrix";

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "en", dir: "ltr" }),
}));

describe("new permissions matrix", () => {
  it("renders every shared permission key during SSR without browser or database access", () => {
    const html = renderToStaticMarkup(
      <NewPermissionsMatrix
        value={blankPermissions("manage")}
        ceiling={blankPermissions("manage")}
        canEdit
      />
    );
    expect((html.match(/aria-label=/g) ?? []).length).toBe(
      permissionKeys.length
    );
    expect(html).toContain("Assign offices");
    expect(html).toContain("General administrator only");
    expect(html).toContain("Office and employee management");
    expect(html).toContain("Reports, Excel, and audit");
  });

  it("keeps choices above an office manager ceiling disabled", () => {
    const ceiling = blankPermissions();
    ceiling.shipments = "manage";
    const html = renderToStaticMarkup(
      <NewPermissionsMatrix
        value={blankPermissions()}
        ceiling={ceiling}
        canEdit
      />
    );
    expect(html).toContain("Unavailable within your ceiling");
    expect(html).toContain('value="manage" disabled=""');
  });

  it("preserves a saved value above the ceiling while showing a separate effective value", () => {
    const stored = blankPermissions();
    stored.shipments = "manage";
    const effective = blankPermissions();
    effective.shipments = "view";
    const ceiling = blankPermissions();
    ceiling.shipments = "view";
    const html = renderToStaticMarkup(
      <NewPermissionsMatrix
        value={stored}
        effectiveValue={effective}
        ceiling={ceiling}
        source="saved"
        canEdit
      />
    );
    expect(html).toContain('value="manage"');
    expect(html).toContain('selected=""');
    expect(html).toContain("Saved customization");
    expect(html).toContain("Effective");
    expect(html).toContain("Saved value is above the ceiling");
  });
});
