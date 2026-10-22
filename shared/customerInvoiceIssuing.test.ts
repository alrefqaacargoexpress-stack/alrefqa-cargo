import { describe, expect, it } from "vitest";
import {
  financeCommandSchema,
  invoiceInputSchema,
  newInvoiceInputSchema,
} from "./finance";
import { isSharedCustomerAccount } from "./customerAccountCreation";
import { financeEntryKinds as databaseKinds } from "../drizzle/schema";
import { financeEntryKinds } from "./finance";
import type { Account } from "./operations";
const invoice = {
  invoiceId: "old-draft",
  customerId: "customer",
  issuingOfficeId: "nouakchott",
  employeeOfficeId: "nouakchott",
  chargeKind: "shipping",
  paymentMode: "shipping_fee",
  currency: "MRU",
  shipmentId: "shipment",
  goodsIds: ["good"],
  adjustment: { direction: "increase", amount: 0 },
};
const customer: Account = {
  id: "customer",
  name: "العميل",
  phone: "+2221234",
  city: "",
  balance: 0,
  shipments: 0,
  updatedAt: "2026-10-22",
};
describe("new invoice issuing guard", () => {
  it("retains old local drafts but never accepts shipping_fee for new posting", () => {
    expect(invoiceInputSchema.safeParse(invoice).success).toBe(true);
    expect(
      financeCommandSchema.safeParse({
        id: "cmd",
        createdAt: "2026-10-22T01:00:00Z",
        kind: "invoice",
        payload: invoice,
      }).success
    ).toBe(true);
    expect(newInvoiceInputSchema.safeParse(invoice).success).toBe(false);
    expect(
      newInvoiceInputSchema.safeParse({ ...invoice, paymentMode: "cash" })
        .success
    ).toBe(true);
    expect(
      newInvoiceInputSchema.safeParse({ ...invoice, paymentMode: "on_account" })
        .success
    ).toBe(true);
  });
  it("requires shared identity, while allowing contact edits to an existing shared customer", () => {
    expect(isSharedCustomerAccount(customer)).toBe(false);
    expect(isSharedCustomerAccount({ ...customer, scope: "local" })).toBe(
      false
    );
    expect(
      isSharedCustomerAccount({ ...customer, scope: "shared", version: 1 })
    ).toBe(true);
    expect(
      isSharedCustomerAccount({ ...customer, scope: "pending", version: 1 })
    ).toBe(true);
  });
  it("keeps the canonical database and API entry kinds synchronized", () => {
    expect([...databaseKinds].sort()).toEqual([...financeEntryKinds].sort());
  });
});
