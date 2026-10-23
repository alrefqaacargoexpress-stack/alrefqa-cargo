import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import OfficeMemberships from "./OfficeMemberships";
import { blankPermissions } from "@shared/permissions";

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "en", dir: "ltr" }),
}));

describe("office memberships SSR safeguards", () => {
  it("keeps a root profile locked without browser, database, or password-reset work", () => {
    const html = renderToStaticMarkup(
      <OfficeMemberships
        members={[
          {
            userId: 1,
            name: "Root profile",
            email: "root@example.test",
            accountType: "employee",
            isLocalAccount: true,
            role: "admin",
            offices: null,
            version: 4,
            permissions: blankPermissions("manage"),
          },
        ]}
        actorRole="admin"
        actorUserId={2}
        permissionCeiling={blankPermissions("manage")}
        canEdit
        online
        onSave={async () => null}
        onResetPassword={async () => true}
      />
    );
    expect(html).toContain("Root administrator");
    expect(html).toContain("The root administrator cannot be changed");
    expect(html).not.toContain("Reset account password");
  });
});
