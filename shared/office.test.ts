import { describe, expect, it } from "vitest";
import {
  defaultOfficeSettings,
  invoicePaymentSchema,
  officeSettingsSchema,
} from "./office";
import { localInvoiceSchema } from "./localValidation";
describe("Manual payment methods for Nouakchott", () => {
  it("supplies five named manual methods without automatically writing settings", () => {
    const settings = defaultOfficeSettings();
    expect(settings.office).toBe("nouakchott");
    expect(settings.version).toBe(0);
    expect(settings.methods.map(m => m.label)).toEqual([
      "Bankily",
      "Masrvi",
      "Gazapay",
      "Sedad",
      "نقدي",
    ]);
  });
  it("allows renaming and disabling without dropping identifiers", () => {
    const settings = defaultOfficeSettings();
    settings.methods[0].label = "Bankily المكتب";
    settings.methods[0].enabled = false;
    expect(
      officeSettingsSchema.safeParse({
        office: settings.office,
        methods: settings.methods,
      }).success
    ).toBe(true);
    expect(defaultOfficeSettings().methods[0].label).toBe("Bankily");
  });
  it("rejects repeated method keys and invalid names", () => {
    const settings = defaultOfficeSettings();
    expect(
      officeSettingsSchema.safeParse({
        office: settings.office,
        methods: [settings.methods[0], settings.methods[0]],
      }).success
    ).toBe(false);
    expect(
      officeSettingsSchema.safeParse({
        office: settings.office,
        methods: [{ id: "bad", label: "", enabled: true }],
      }).success
    ).toBe(false);
  });
  it("accepts old invoices unchanged and freezes a recorded method label with its reference", () => {
    const old = {
      id: "invoice",
      account: "Customer",
      amount: 300,
      status: "مدفوعة",
      issuedAt: "2026-10-21",
    };
    expect(localInvoiceSchema.safeParse(old).success).toBe(true);
    const payment = {
      office: "nouakchott",
      methodId: "bankily",
      methodLabel: "Bankily",
      reference: "TX-001",
    };
    expect(invoicePaymentSchema.safeParse(payment).success).toBe(true);
    expect(localInvoiceSchema.safeParse({ ...old, payment }).success).toBe(
      true
    );
    expect(localInvoiceSchema.parse(old)).not.toHaveProperty("payment");
  });
});
