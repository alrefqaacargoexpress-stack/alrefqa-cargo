import { describe, expect, it } from "vitest";
import {
  financeCommandOffice,
  selectedFinanceCommands,
} from "./financeCommands";
import type { FinanceCommand } from "./finance";
import type { Shipment } from "./operations";

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
const shipment: Shipment = {
  id: "shipment-one",
  tracking: "TRK-1",
  account: "Customer",
  route: "Dubai → Nouakchott",
  service: "جوي",
  status: "قيد التجهيز",
  eta: "none",
  amount: 0,
  packing: {
    source: "dubai",
    pricePerKg: 37,
    cartons: [],
    createdAt: "2026-10-22T00:00:00.000Z",
    updatedAt: "2026-10-22T00:00:00.000Z",
  },
};
function shipmentPrice(
  payload: Partial<
    Extract<FinanceCommand, { kind: "shipment_price" }>["payload"]
  >
): FinanceCommand {
  return {
    id: "price-command",
    kind: "shipment_price",
    createdAt: "2026-10-22T01:00:00Z",
    payload: {
      shipmentId: shipment.id,
      side: "source",
      pricePerKg: 40,
      reason: "reviewed correction",
      expectedPricingRevision: 0,
      expectedVersion: 1,
      ...payload,
    },
  };
}
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

  it("derives a source price office from the selected shipment", () => {
    expect(
      financeCommandOffice(shipmentPrice({ side: "source" }), [], null, [
        shipment,
      ])
    ).toBe("dubai");
  });

  it("derives destination pricing to Nouakchott", () => {
    expect(
      financeCommandOffice(shipmentPrice({ side: "destination" }), [], null, [
        shipment,
      ])
    ).toBe("nouakchott");
  });

  it("blocks an unknown shipment instead of trusting a legacy office field", () => {
    expect(
      financeCommandOffice(
        shipmentPrice({ shipmentId: "missing", sourceOfficeId: "dubai" }),
        [],
        null,
        [shipment]
      )
    ).toBeUndefined();
  });

  it("denies a mismatched legacy source office", () => {
    expect(
      financeCommandOffice(
        shipmentPrice({ sourceOfficeId: "china" }),
        [],
        null,
        [shipment]
      )
    ).toBeUndefined();
  });
});
