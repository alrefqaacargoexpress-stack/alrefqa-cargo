import { describe, expect, it } from "vitest";
import {
  financeCommandOffice,
  selectedFinanceCommands,
} from "./financeCommands";
import type { FinanceCommand } from "./finance";

const movement: FinanceCommand = {
  id: "one",
  kind: "customer_movement",
  createdAt: "2026-10-22T01:00:00Z",
  payload: {
    movementId: "mov",
    customerId: "a",
    officeId: "nouakchott",
    direction: "credit",
    amount: 10,
    currency: "MRU",
    date: "2026-10-22",
    description: "قبض",
    paymentMode: "cash",
  },
};
const expense: FinanceCommand = {
  id: "two",
  kind: "expense",
  createdAt: "2026-10-22T01:00:00Z",
  payload: {
    expenseId: "exp",
    officeId: "dubai",
    category: "daily_expense",
    amount: 10,
    currency: "AED",
    date: "2026-10-22",
    description: "مصروف",
  },
};
describe("specific financial posting", () => {
  it("posts only the reviewed command and never all drafts for an empty selection", () => {
    const all = [movement, expense];
    expect(selectedFinanceCommands(all, ["one"]).map(c => c.id)).toEqual([
      "one",
    ]);
    expect(selectedFinanceCommands(all, [])).toEqual([]);
    expect(all).toHaveLength(2);
    expect(selectedFinanceCommands(all)).toHaveLength(2);
  });
  it("uses the movement's own office for scoping", () => {
    expect(financeCommandOffice(movement, [], "dubai")).toBe("nouakchott");
    expect(financeCommandOffice(expense, [], "nouakchott")).toBe("dubai");
  });
});
