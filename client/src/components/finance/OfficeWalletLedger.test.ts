import { describe, expect, it } from "vitest";
import { summarizeWalletLedger, walletLedgerCopy } from "./OfficeWalletLedger";
import { financeCashBalance } from "../../pages/OfficeFinance";
import type { FinanceEntry } from "../../../../shared/finance";

describe("office wallet ledger boundaries", () => {
  it("never creates a fictional opening balance or merges offices/currencies", () => {
    expect(summarizeWalletLedger([], "dubai")).toEqual([]);
    const rows = [
      { officeId: "dubai", currency: "AED", kind: "receipt", amount: "2.10" },
      { officeId: "dubai", currency: "AED", kind: "receipt", amount: "0.20" },
      { officeId: "dubai", currency: "AED", kind: "refund", amount: "0.10" },
      { officeId: "dubai", currency: "USD", kind: "receipt", amount: "4.00" },
      {
        officeId: "nouakchott",
        currency: "MRU",
        kind: "receipt",
        amount: "99.00",
      },
    ];
    const totals = summarizeWalletLedger(rows, "dubai");
    expect(totals.map(row => row.currency)).toEqual(["AED", "USD"]);
    expect(totals[0].balance).toBe((210 + 20 - 10) / 100);
    expect(totals[1].balance).toBe(4);
  });
  it("does not increase cash from an explicit wallet receipt", () => {
    const make = (kind: FinanceEntry["kind"], amount: number, extra = {}) =>
      ({
        id: kind,
        kind,
        amount,
        officeId: "dubai",
        currency: "AED",
        actorId: 1,
        actorName: "Actor",
        recordedAt: "2026-10-24T00:00:00.000Z",
        date: "2026-10-24",
        description: "Entry",
        ...extra,
      }) as FinanceEntry;
    const wallet = make("collection", 10, {
      payment: { office: "dubai", methodId: "bankily", methodLabel: "Wallet" },
      cashEffect: "none",
    });
    const cash = make("debt_payment", 7, {
      payment: { office: "dubai", methodId: "cash", methodLabel: "Cash" },
    });
    const expense = make("shipment_cost", 2);
    expect(financeCashBalance([wallet, cash, expense], "dubai", "AED")).toBe(
      cash.amount - expense.amount
    );
    const legacyWallet = make("collection", 10, {
      payment: {
        office: "dubai",
        methodId: "wallet",
        methodLabel: "Legacy wallet",
      },
    });
    expect(financeCashBalance([legacyWallet], "dubai", "AED")).toBe(0);
  });
  it("has clear external-balance and empty-ledger copy in all four languages", () => {
    for (const language of ["ar", "en", "zh", "tr"] as const) {
      expect(walletLedgerCopy[language].hint).toBeTruthy();
      expect(walletLedgerCopy[language].empty).toBeTruthy();
    }
  });
});
