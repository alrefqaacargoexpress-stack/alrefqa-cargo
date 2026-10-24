import { describe, expect, it } from "vitest";
import { defaultOfficeSettings } from "@shared/office";
import { publicOfficeSettings, canonicalInvoicePayment, recordWalletReceipt } from "./office";
import { walletMovements } from "../drizzle/schema";

describe("public office wallet projection", () => {
  it("publishes only explicit enabled methods and never versions, users, or credentials", () => {
    const settings = defaultOfficeSettings();
    settings.version = 9;
    settings.methods[0] = {
      ...settings.methods[0],
      accountNumber: "+222 12-34-56",
      accountName: "A Beneficiary",
      instructions: "Send the receipt to the office.",
      showToCustomers: true,
    };
    settings.methods[1] = {
      ...settings.methods[1],
      accountNumber: "+222 99-88-77",
      accountName: "Hidden Beneficiary",
      showToCustomers: false,
    };
    settings.methods[2] = {
      ...settings.methods[2],
      accountNumber: "+222 11-22-33",
      enabled: false,
      showToCustomers: true,
    };
    settings.methods[4] = {
      ...settings.methods[4],
      instructions: "Cash at the desk.",
      showToCustomers: true,
    };
    const projection = publicOfficeSettings(settings);
    expect(projection).toEqual({
      office: "nouakchott",
      methods: [
        {
          id: "bankily",
          label: "Bankily",
          accountNumber: "+222 12-34-56",
          accountName: "A Beneficiary",
          instructions: "Send the receipt to the office.",
        },
        { id: "cash", label: "نقدي", instructions: "Cash at the desk." },
      ],
    });
    expect(JSON.stringify(projection)).not.toMatch(
      /version|user|credential|enabled|showToCustomers|password|otp|pin/i
    );
  });
});

describe("office-scoped wallet receipts", () => {
  it("rejects a wallet payment from another office and preserves identical history", () => {
    const settings = defaultOfficeSettings("dubai");
    settings.methods = [
      { id: "cash", label: "Cash", enabled: true },
      { id: "bankily", label: "Bankily", enabled: true },
    ];
    expect(() =>
      canonicalInvoicePayment(
        {
          office: "nouakchott",
          methodId: "bankily",
          methodLabel: "Bankily",
        },
        null,
        settings,
        "dubai"
      )
    ).toThrow("payment_office_mismatch");
    const historical = {
      id: "i1",
      account: "A",
      amount: 1,
      status: "مدفوعة" as const,
      issuedAt: "2026-01-01",
      payment: {
        office: "nouakchott" as const,
        methodId: "old_wallet",
        methodLabel: "Old wallet",
      },
    };
    expect(
      canonicalInvoicePayment(historical.payment, historical, settings, "dubai")
    ).toBe(historical.payment);
  });

  it("does not duplicate an actual receipt on exact replay", async () => {
    const rows: any[] = [];
    const db = {
      select() {
        return {
          from(table: unknown) {
            const query: any = {
              where() {
                return query;
              },
              limit() {
                return query;
              },
              for() {
                return Promise.resolve(
                  table === walletMovements
                    ? rows.filter(r => r.financeEntryId === "entry-1")
                    : []
                );
              },
            };
            return query;
          },
        };
      },
      insert(table: unknown) {
        return {
          values(value: any) {
            if (table === walletMovements) rows.push(value);
            return Promise.resolve();
          },
        };
      },
    };
    const input = {
      officeId: "dubai" as const,
      methodId: "bankily",
      currency: "AED",
      amount: 2,
      invoiceId: "invoice-1",
      financeEntryId: "entry-1",
      actorId: 7,
    };
    await recordWalletReceipt(db, input);
    await recordWalletReceipt(db, input);
    expect(rows).toHaveLength(1);
    await expect(
      recordWalletReceipt(db, { ...input, amount: 3 })
    ).rejects.toThrow("wallet_receipt_conflict");
  });
});
