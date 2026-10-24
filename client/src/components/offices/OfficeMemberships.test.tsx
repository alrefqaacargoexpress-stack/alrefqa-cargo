import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import OfficeMemberships, {
  automaticPermissionPreview,
  delegationPayloadForSave,
  permissionPayloadForSave,
  permissionsWithinCeiling,
} from "./OfficeMemberships";
import { blankPermissions } from "../../../../shared/permissions";

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

describe("automatic membership permissions", () => {
  it("accepts a normal member map but never grants a root-only permission", () => {
    expect(
      permissionsWithinCeiling(blankPermissions(), blankPermissions("manage"))
    ).toBe(true);
    expect(
      permissionsWithinCeiling(
        { ...blankPermissions(), office_assign: "manage" },
        blankPermissions("manage")
      )
    ).toBe(false);
  });

  it("omits permissions for an untouched automatic save", () => {
    const permissions = blankPermissions();
    expect(
      permissionPayloadForSave({ permissions, permissionsMode: "automatic" })
    ).toBeUndefined();
  });

  it("preserves an existing same-role legacy map by omitting permissions", () => {
    const legacy = { ...blankPermissions(), shipments: "manage" as const };
    expect(
      permissionPayloadForSave({
        permissions: legacy,
        permissionsMode: "automatic",
      })
    ).toBeUndefined();
  });

  it("recomputes the automatic preview when role and office change", () => {
    const preview = automaticPermissionPreview(
      "accountant",
      ["nouakchott"],
      "nouakchott",
      false,
      blankPermissions("manage")
    );
    expect(preview.customers).toBe("manage");
    expect(preview.office_wallets).toBe("manage");
    expect(preview.shipments).toBe("view");
  });

  it("does not preview a new grant over a previous explicit denial on role change", () => {
    const preview = automaticPermissionPreview(
      "source_warehouse",
      ["dubai"],
      "dubai",
      false,
      blankPermissions("manage"),
      blankPermissions(),
      "staff"
    );
    expect(preview.shipments).toBe("none");
    expect(preview.shipment_send).toBe("none");
  });

  it("does not load old customization into the automatic preview", () => {
    const old = { ...blankPermissions(), reports: "view" as const };
    const preview = automaticPermissionPreview(
      "staff",
      ["china"],
      "china",
      false,
      blankPermissions("manage"),
      old,
      "staff"
    );
    expect(preview.reports).toBe("none");
  });

  it("sends the full intended map only after manual matrix editing", () => {
    const manual = { ...blankPermissions(), reports: "view" as const };
    expect(
      permissionPayloadForSave({
        permissions: manual,
        permissionsMode: "manual",
      })
    ).toEqual(manual);
  });

  it("sends delegation policy only after an explicit root edit", () => {
    const policy = { ...blankPermissions(), reports: "view" as const };
    expect(
      delegationPayloadForSave({
        role: "office_manager",
        actorRole: "admin",
        delegationPermissions: policy,
        delegationPermissionsDirty: false,
      })
    ).toBeUndefined();
    expect(
      delegationPayloadForSave({
        role: "office_manager",
        actorRole: "admin",
        delegationPermissions: policy,
        delegationPermissionsDirty: true,
      })
    ).toEqual(policy);
    expect(
      delegationPayloadForSave({
        role: "office_manager",
        actorRole: "office_manager",
        delegationPermissions: policy,
        delegationPermissionsDirty: true,
      })
    ).toBeUndefined();
  });

  it("renders a legacy tracking member as deprecated and read-only", () => {
    const html = renderToStaticMarkup(
      <OfficeMemberships
        members={[
          {
            userId: 9,
            name: "Legacy tracking",
            email: "legacy@example.test",
            accountType: "employee",
            role: "tracking_staff",
            offices: ["dubai"],
            version: 1,
          },
        ]}
        actorRole="admin"
        actorUserId={2}
        canEdit
        online
        onSave={async () => null}
        onResetPassword={async () => true}
      />
    );
    expect(html).toContain("Retired legacy tracking role");
    expect(html).toContain('value="tracking_staff"');
    expect(html).not.toContain('value="viewer"');
  });
});
