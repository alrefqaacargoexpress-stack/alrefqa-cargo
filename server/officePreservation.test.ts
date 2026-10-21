import { describe, expect, it } from "vitest";
import { defaultOfficeSettings } from "@shared/office";
import type { Invoice } from "@shared/operations";
import {
  canonicalInvoicePayment,
  validateInvoicePaymentRecord,
} from "./office";
const old: Invoice = {
  id: "I",
  account: "C",
  amount: 300,
  status: "مدفوعة",
  issuedAt: "2026-10-21",
  payment: {
    office: "nouakchott",
    methodId: "bankily",
    methodLabel: "Original Bankily",
    reference: "TX-1",
  },
};
describe("Recorded manual payment history", () => {
  it("does not rewrite a saved method label when settings are renamed", () => {
    const settings = defaultOfficeSettings();
    settings.methods[0].label = "Renamed Bankily";
    const saved = validateInvoicePaymentRecord(
      { ...old, amount: 350 },
      old,
      settings
    );
    expect(saved.payment?.methodLabel).toBe("Original Bankily");
    expect(old.amount).toBe(300);
  });
  it("preserves old invoices for disabled methods but rejects the method on a new invoice", () => {
    const settings = defaultOfficeSettings();
    settings.methods[0].enabled = false;
    expect(
      canonicalInvoicePayment(old.payment, old, settings)?.methodLabel
    ).toBe("Original Bankily");
    expect(() => canonicalInvoicePayment(old.payment, null, settings)).toThrow(
      "payment_method_disabled"
    );
  });
  it("rejects made-up method keys and canonicalizes a new record label from server settings", () => {
    const settings = defaultOfficeSettings();
    expect(() =>
      canonicalInvoicePayment(
        { ...old.payment!, methodId: "nonexistent" },
        null,
        settings
      )
    ).toThrow("payment_method_unknown");
    expect(
      canonicalInvoicePayment(
        { ...old.payment!, methodLabel: "forged" },
        null,
        settings
      )?.methodLabel
    ).toBe("Bankily");
  });
  it("leaves invoice payment undefined for legacy invoices without one", () => {
    const settings = defaultOfficeSettings();
    const legacy = { ...old };
    delete legacy.payment;
    expect(
      validateInvoicePaymentRecord(legacy, legacy, settings).payment
    ).toBeUndefined();
    expect(legacy.amount).toBe(300);
  });
});
