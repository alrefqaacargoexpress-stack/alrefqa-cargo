import { describe, expect, it } from "vitest";
import {
  availableProfitWithdrawal,
  canWriteFinance,
  financeCashBalance,
  financeCommandSchema,
  financePermissionForCommand,
  financePermissionForEntry,
  summarizeOfficeFinance,
  type FinanceEntry,
  type FinanceCommand,
} from "./finance";
import {
  financeCommandOffice,
  financeCommandPermissionKey,
} from "./financeCommands";
import {
  blankPermissions,
  defaultPermissions,
  permissionAllowed,
  permissionsFor,
} from "./permissions";

const now = "2026-11-04T18:00:00.000Z";
const withdrawal: FinanceCommand = {
  id: "withdraw-command",
  kind: "profit_withdrawal",
  createdAt: now,
  payload: {
    withdrawalId: "withdraw-one",
    officeId: "dubai",
    currency: "AED",
    amount: 10.01,
    date: "2026-11-04",
    description: "Approved distribution",
  },
};
const entry = (
  kind: FinanceEntry["kind"],
  amount: number,
  extra: Partial<FinanceEntry> = {}
): FinanceEntry => ({
  id: `${kind}-${amount}`,
  kind,
  officeId: "dubai",
  currency: "AED",
  amount,
  date: "2026-11-04",
  description: "Synthetic only",
  actorId: 1,
  actorName: "Fixture",
  recordedAt: now,
  ...extra,
});
describe("profit withdrawal contract and accounting", () => {
  it("accepts explicit positive cents and rejects zero, fractions, invalid dates and actor claims", () => {
    expect(financeCommandSchema.safeParse(withdrawal).success).toBe(true);
    for (const patch of [
      { amount: 0 },
      { amount: -1 },
      { amount: 0.001 },
      { date: "2026-02-30" },
      { actorId: 99 },
      { paymentMode: "wallet" },
      { description: "" },
    ]) {
      expect(
        financeCommandSchema.safeParse({
          ...withdrawal,
          payload: { ...withdrawal.payload, ...patch },
        }).success
      ).toBe(false);
    }
  });
  it("maps to its own permission and claimed office instead of a different home office", () => {
    expect(financeCommandPermissionKey(withdrawal)).toBe("profit_withdrawal");
    expect(financePermissionForCommand("profit_withdrawal")).toBe(
      "profit_withdrawal"
    );
    expect(financePermissionForEntry("profit_withdrawal")).toBe(
      "profit_withdrawal"
    );
    expect(financeCommandOffice(withdrawal, [], "nouakchott")).toBe("dubai");
  });
  it("does not turn income, debt, unbilled goods or wallet receipts into cash", () => {
    const entries = [
      entry("shipment_revenue", 300),
      entry("customer_debt", 250),
      entry("collection", 30, {
        payment: { office: "dubai", methodId: "wallet", methodLabel: "Wallet" },
      }),
      entry("collection", 50, { cashEffect: "none" }),
    ];
    expect(financeCashBalance(entries, "dubai", "AED")).toBe(0);
    expect(availableProfitWithdrawal(entries, "dubai", "AED")).toBe(0);
  });
  it("separates offices/currencies, honors signed opening balance and counts cash outflows only once", () => {
    const entries = [
      entry("opening_balance", 100, { direction: "credit" }),
      entry("collection", 0.3),
      entry("profit_withdrawal", 0.1),
      entry("daily_expense", 0.2),
      entry("collection", 999, { officeId: "china" }),
      entry("collection", 999, { currency: "MRU" }),
    ];
    expect(financeCashBalance(entries, "dubai", "AED")).toBe(100);
    expect(
      financeCashBalance(
        [entry("opening_balance", 10, { direction: "debit" })],
        "dubai",
        "AED"
      )
    ).toBe(-10);
  });
  it("distributions do not inflate operating expenses or erase net before distribution", () => {
    const entries = [
      entry("invoice_revenue", 100),
      entry("collection", 100),
      entry("daily_expense", 20),
      entry("profit_withdrawal", 30),
    ];
    const summary = summarizeOfficeFinance(entries)[0];
    expect(summary).toMatchObject({
      revenue: 100,
      expenses: 20,
      net: 80,
      withdrawals: 30,
      retainedNet: 50,
    });
    expect(availableProfitWithdrawal(entries, "dubai", "AED")).toBe(50);
    expect(
      availableProfitWithdrawal(
        [entry("opening_balance", 1000, { direction: "credit" })],
        "dubai",
        "AED"
      )
    ).toBe(0);
  });
  it("limits distributions by both retained net and actual cash", () => {
    expect(
      availableProfitWithdrawal(
        [entry("invoice_revenue", 30), entry("collection", 100)],
        "dubai",
        "AED"
      )
    ).toBe(30);
    expect(
      availableProfitWithdrawal(
        [entry("invoice_revenue", 100), entry("collection", 30)],
        "dubai",
        "AED"
      )
    ).toBe(30);
    expect(
      availableProfitWithdrawal(
        [
          entry("invoice_revenue", 20),
          entry("collection", 100),
          entry("profit_withdrawal", 30),
        ],
        "dubai",
        "AED"
      )
    ).toBe(0);
  });
});
describe("withdrawal permission preserves explicit denials", () => {
  it("gives default full accountant access without adding cashier/source-cost/warehouse grants", () => {
    expect(
      defaultPermissions({ role: "accountant", offices: ["dubai"] })
        .profit_withdrawal
    ).toBe("manage");
    expect(
      defaultPermissions({
        role: "general_accountant",
        offices: ["nouakchott"],
      }).profit_withdrawal
    ).toBe("manage");
    for (const role of [
      "cashier",
      "office_manager",
      "source_warehouse",
      "destination_warehouse",
      "viewer",
    ] as const)
      expect(
        defaultPermissions({ role, offices: ["dubai"] }).profit_withdrawal
      ).toBe("none");
    expect(
      defaultPermissions({ role: "general_accountant", offices: ["dubai"] })
        .profit_withdrawal
    ).toBe("none");
  });
  it("old customized maps missing the new key remain denied and intact", () => {
    const { profit_withdrawal: _missing, ...legacy } = blankPermissions();
    const before = JSON.stringify(legacy);
    const subject = {
      role: "accountant" as const,
      offices: ["dubai"] as ["dubai"],
      permissions: legacy as ReturnType<typeof blankPermissions>,
    };
    expect(permissionAllowed(subject, "profit_withdrawal", "manage")).toBe(
      false
    );
    expect(permissionsFor(subject).profit_withdrawal).toBe("none");
    expect(JSON.stringify(legacy)).toBe(before);
  });
  it("isolated explicit grant can enable finance but never office-less access", () => {
    const subject = {
      role: "accountant" as const,
      offices: ["dubai"] as ["dubai"],
      homeOffice: "dubai" as const,
      permissions: {
        ...blankPermissions(),
        profit_withdrawal: "manage" as const,
      },
    };
    expect(canWriteFinance(subject)).toBe(true);
    expect(
      canWriteFinance({ ...subject, permissions: blankPermissions() })
    ).toBe(false);
    expect(
      permissionAllowed(
        { ...subject, offices: [] },
        "profit_withdrawal",
        "manage"
      )
    ).toBe(false);
  });
});
