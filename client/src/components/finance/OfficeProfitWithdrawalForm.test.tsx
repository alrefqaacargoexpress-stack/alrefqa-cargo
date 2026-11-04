import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { financeMoneySchema } from "@shared/finance";
import { blankPermissions } from "@shared/permissions";
import { LanguageProvider } from "@/contexts/LanguageContext";
import {
  createProfitWithdrawalCommand,
  canStageProfitWithdrawal,
  default as OfficeProfitWithdrawalForm,
  hasPendingProfitWithdrawal,
  hasProfitWithdrawalPermission,
} from "./OfficeProfitWithdrawalForm";

function permissionsWithWithdrawal(level: "view" | "manage" = "manage") {
  const permissions = blankPermissions();
  permissions.profit_withdrawal = level;
  return permissions;
}

const projection = {
  officeId: "nouakchott" as const,
  currency: "MRU" as const,
  cashBalance: 100,
  availableProfitWithdrawal: 40,
};

function renderForm(input: {
  role?: "accountant" | "cashier" | null;
  permissions?: ReturnType<typeof blankPermissions> | null;
  snapshotReady?: boolean;
  cashBalances?: (typeof projection)[];
}) {
  return renderToStaticMarkup(
    <LanguageProvider>
      <OfficeProfitWithdrawalForm
        allowedOffices={["nouakchott"]}
        initialOffice="nouakchott"
        entries={[]}
        commands={[]}
        cashBalances={input.cashBalances}
        snapshotReady={input.snapshotReady ?? true}
        online
        canEdit
        role={input.role ?? "accountant"}
        homeOffice="nouakchott"
        permissions={input.permissions ?? permissionsWithWithdrawal()}
        saveCommand={async () => true}
      />
    </LanguageProvider>
  );
}

describe("OfficeProfitWithdrawalForm helpers", () => {
  it("requires a fresh matching server projection before staging", () => {
    expect(
      canStageProfitWithdrawal({
        snapshotReady: true,
        cashBalances: [projection],
        officeId: "nouakchott",
        currency: "MRU",
      })
    ).toBe(true);
    expect(
      canStageProfitWithdrawal({
        snapshotReady: false,
        cashBalances: [projection],
        officeId: "nouakchott",
        currency: "MRU",
      })
    ).toBe(false);
    expect(
      canStageProfitWithdrawal({
        snapshotReady: true,
        cashBalances: [],
        officeId: "nouakchott",
        currency: "MRU",
      })
    ).toBe(false);
  });

  it("renders official cash and available values for an independent grant", () => {
    const html = renderForm({ cashBalances: [projection] });
    expect(html).toContain("100.00 MRU");
    expect(html).toContain("40.00 MRU");
    expect(html).toContain("حفظ مسودة السحب");
    expect(html).toContain('type="submit">حفظ مسودة السحب</button>');
  });

  it("renders but disables staging when the projection is missing or stale", () => {
    const missing = renderForm({ cashBalances: [] });
    expect(missing).toContain("سحب الأرباح غير متاح");
    expect(missing).toContain('disabled=""');
    const stale = renderForm({
      cashBalances: [projection],
      snapshotReady: false,
    });
    expect(stale).toContain('disabled=""');
  });

  it("denies cashier, view-only, and legacy maps without the independent grant", () => {
    expect(
      renderForm({ role: "cashier", permissions: blankPermissions() })
    ).toBe("");
    expect(
      renderForm({
        role: "cashier",
        permissions: permissionsWithWithdrawal(),
        cashBalances: [projection],
      })
    ).toBe("");
    expect(renderForm({ permissions: permissionsWithWithdrawal("view") })).toBe(
      ""
    );
    const oldMap = blankPermissions();
    oldMap.expenses = "manage";
    oldMap.payments = "manage";
    expect(renderForm({ permissions: oldMap })).toBe("");
  });

  it("does not auto-grant the new permission from an old finance permission", () => {
    const permissions = blankPermissions();
    permissions.expenses = "manage";
    permissions.payments = "manage";
    expect(
      hasProfitWithdrawalPermission({
        role: "accountant",
        offices: ["nouakchott"],
        homeOffice: "nouakchott",
        permissions,
      })
    ).toBe(false);
    permissions.profit_withdrawal = "manage";
    expect(
      hasProfitWithdrawalPermission({
        role: "accountant",
        offices: ["nouakchott"],
        homeOffice: "nouakchott",
        permissions,
      })
    ).toBe(true);
  });

  it("creates a validated positive two-decimal withdrawal command", () => {
    const command = createProfitWithdrawalCommand({
      officeId: "dubai",
      amount: 12.5,
      currency: "AED",
      date: "2026-10-21",
      description: "Owner distribution",
    });
    expect(command.kind).toBe("profit_withdrawal");
    if (command.kind !== "profit_withdrawal")
      throw new Error("expected withdrawal");
    expect(command.id).not.toBe(command.payload.withdrawalId);
    expect(command.payload.withdrawalId.length).toBeLessThanOrEqual(64);
    expect(financeMoneySchema.safeParse(command.payload.amount).success).toBe(
      true
    );
  });

  it("prevents another pending draft for the same office and currency only", () => {
    const command = createProfitWithdrawalCommand({
      officeId: "dubai",
      amount: 10,
      currency: "AED",
      date: "2026-10-21",
      description: "Owner distribution",
    });
    expect(hasPendingProfitWithdrawal([command], "dubai", "AED")).toBe(true);
    expect(hasPendingProfitWithdrawal([command], "dubai", "USD")).toBe(false);
    expect(hasPendingProfitWithdrawal([command], "china", "AED")).toBe(false);
  });
});
