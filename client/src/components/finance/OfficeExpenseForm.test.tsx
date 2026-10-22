import { describe, expect, it } from "vitest";
import { expenseInputSchema } from "@shared/finance";
import { createExpenseCommand } from "./OfficeExpenseForm";

describe("OfficeExpenseForm finance command contract", () => {
  it("builds an exp-prefixed command with a distinct command id", () => {
    const command = createExpenseCommand({
      officeId: "dubai",
      category: "daily_expense",
      amount: 12.5,
      currency: "AED",
      date: "2026-10-21",
      description: "Office supplies",
    });
    if (command.kind !== "expense") throw new Error("expected expense command");
    expect(command.id).not.toBe(command.payload.expenseId);
    expect(command.payload.expenseId).toMatch(/^exp-/);
    expect(expenseInputSchema.safeParse(command.payload).success).toBe(true);
  });

  it("keeps an explicit zero shipment cost valid and attaches the real shipment", () => {
    const command = createExpenseCommand({
      officeId: "nouakchott",
      category: "shipment_cost",
      amount: 0,
      currency: "MRU",
      date: "2026-10-21",
      description: "No extra handling charge",
      shipmentId: "shipment-1",
    });
    if (command.kind !== "expense") throw new Error("expected expense command");
    expect(command.payload.amount).toBe(0);
    expect(command.payload.shipmentId).toBe("shipment-1");
    expect(expenseInputSchema.safeParse(command.payload).success).toBe(true);
  });

  it("does not attach shipment ids to non-shipment categories", () => {
    const command = createExpenseCommand({
      officeId: "china",
      category: "monthly_expense",
      amount: 100,
      currency: "CNY",
      date: "2026-10-01",
      description: "Rent",
      shipmentId: "ignored",
    });
    if (command.kind !== "expense") throw new Error("expected expense command");
    expect(command.payload).not.toHaveProperty("shipmentId");
    expect(expenseInputSchema.safeParse(command.payload).success).toBe(true);
  });
});
