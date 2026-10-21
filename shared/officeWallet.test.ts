import { describe, expect, it } from "vitest";
import {
  defaultOfficeSettings,
  invoicePaymentSchema,
  officeSettingsSchema,
} from "./office";

describe("Nouakchott wallet contract", () => {
  it("defaults every existing method to private with no wallet number", () => {
    const settings = defaultOfficeSettings();
    expect(settings.methods.map(method => method.id)).toEqual([
      "bankily",
      "masrvi",
      "gazapay",
      "sedad",
      "cash",
    ]);
    expect(
      settings.methods.every(method => method.showToCustomers === false)
    ).toBe(true);
    expect(
      settings.methods.every(method => method.accountNumber === undefined)
    ).toBe(true);
  });

  it("accepts phone-like numbers and rejects URLs or javascript payloads", () => {
    const base = defaultOfficeSettings().methods.map(method => ({ ...method }));
    base[0] = {
      ...base[0],
      accountNumber: "+222 12-34-56",
      showToCustomers: true,
    };
    expect(
      officeSettingsSchema.safeParse({ office: "nouakchott", methods: base })
        .success
    ).toBe(true);
    for (const accountNumber of [
      "https://example.test",
      "javascript:alert(1)",
      "+222\n123",
    ]) {
      expect(
        officeSettingsSchema.safeParse({
          office: "nouakchott",
          methods: [{ ...base[0], accountNumber }],
        }).success
      ).toBe(false);
    }
  });

  it("requires a number only when an enabled non-cash method is explicitly public", () => {
    const methods = defaultOfficeSettings().methods.map(method => ({
      ...method,
    }));
    methods[0] = { ...methods[0], showToCustomers: true };
    expect(
      officeSettingsSchema.safeParse({ office: "nouakchott", methods }).success
    ).toBe(false);
    methods[0] = { ...methods[0], enabled: false };
    expect(
      officeSettingsSchema.safeParse({ office: "nouakchott", methods }).success
    ).toBe(true);
    methods[4] = {
      ...methods[4],
      showToCustomers: true,
      instructions: "Pay at the desk.",
    };
    expect(
      officeSettingsSchema.safeParse({ office: "nouakchott", methods }).success
    ).toBe(true);
  });

  it("does not change the recorded invoice payment contract", () => {
    expect(
      invoicePaymentSchema.safeParse({
        office: "nouakchott",
        methodId: "bankily",
        methodLabel: "Old Bankily",
        reference: "TX-1",
      }).success
    ).toBe(true);
  });
});
