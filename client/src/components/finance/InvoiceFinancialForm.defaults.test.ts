import {
  defaultPermissions,
  permissionAllowed,
} from "../../../../shared/permissions";
import {
  canWriteFinance,
  financePermissionForCommand,
} from "../../../../shared/finance";
import { describe, expect, it } from "vitest";
import { invoiceOfficeCurrency } from "./InvoiceFinancialForm";
import { createExpenseCommand } from "./OfficeExpenseForm";

describe("office invoice and source-cost defaults", () => {
  it("uses the office currency, without copying an AED price as MRU", () => {
    expect(invoiceOfficeCurrency("dubai")).toBe("AED");
    expect(invoiceOfficeCurrency("turkey")).toBe("TRY");
    expect(invoiceOfficeCurrency("china")).toBe("CNY");
    expect(invoiceOfficeCurrency("nouakchott")).toBe("MRU");
  });
  it("omits an additional cost reference unless the operator explicitly supplies it", () => {
    const input = {
      officeId: "dubai" as const,
      category: "shipment_cost" as const,
      currency: "AED" as const,
      amount: 1,
      description: "Carrier cost",
      date: "2026-10-24",
      shipmentId: "shipment-1",
    };
    const primary = createExpenseCommand(input);
    expect(primary.payload).not.toHaveProperty("referenceKey");
    expect(primary.payload).not.toHaveProperty("costReference");
    const extra = createExpenseCommand({
      ...input,
      referenceKey: " carrier-receipt-2 ",
    });
    expect(extra.payload).toMatchObject({
      referenceKey: "carrier-receipt-2",
      costReference: "carrier-receipt-2",
    });
  });
});

it("keeps a source general accountant to source cost management and financial viewing", () => {
  const subject = {
    role: "general_accountant" as const,
    offices: ["dubai" as const],
    homeOffice: "dubai" as const,
  };
  const permissions = defaultPermissions(subject);
  expect(
    permissionAllowed({ ...subject, permissions }, "shipment_cost", "manage")
  ).toBe(true);
  for (const key of [
    "customers",
    "payments",
    "expenses",
    "opening_balance",
    "invoices",
    "shipment_prices",
    "office_wallets",
    "excel",
  ] as const)
    expect(permissionAllowed({ ...subject, permissions }, key, "manage")).toBe(
      false
    );
  expect(canWriteFinance({ ...subject, permissions })).toBe(true);
  expect(financePermissionForCommand("expense", "shipment_cost")).toBe(
    "shipment_cost"
  );
  expect(financePermissionForCommand("expense", "daily_expense")).toBe(
    "expenses"
  );
});
