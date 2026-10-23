import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { blankPermissions } from "@shared/permissions";
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
    expect((html.match(/aria-label=/g) ?? []).length).toBe(20);
    expect(html).toContain("Assign offices");
    expect(html).toContain("Root administrator only");
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
});
