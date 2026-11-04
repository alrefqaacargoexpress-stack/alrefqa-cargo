import { describe, expect, it } from "vitest";
import {
  destinationStorageSchema,
  warehouseBillingSchema,
  warehouseCommandSchema,
} from "./warehouse";

describe("warehouse contracts", () => {
  it("accepts one location and rejects duplicate goods", () => {
    const item = {
      goodsId: "g1",
      warehouse: "W1",
      shelf: "S1",
      updatedAt: "2026-10-22T12:00:00.000Z",
      updatedBy: 4,
    };
    expect(destinationStorageSchema.parse([item])).toEqual([item]);
    expect(() => destinationStorageSchema.parse([item, item])).toThrow();
  });
  it("requires the optimistic version and rejects extra mutation fields", () => {
    expect(
      warehouseCommandSchema.parse({
        requestId: "r1",
        shipmentId: "s1",
        goodsId: "g1",
        warehouse: "W",
        shelf: "S",
        expectedVersion: 1,
      }).expectedVersion
    ).toBe(1);
    expect(() =>
      warehouseCommandSchema.parse({
        requestId: "r1",
        shipmentId: "s1",
        goodsId: "g1",
        warehouse: "W",
        shelf: "S",
        expectedVersion: 1,
        amount: 99,
      })
    ).toThrow();
  });
  it("keeps the warehouse billing summary coarse and currency-bound", () => {
    const summary = warehouseBillingSchema.parse({
      status: "unbilled",
      amount: 370,
      billedAmount: 0,
      remainingAmount: 370,
      currency: "AED",
    });
    expect(summary.status).toBe("unbilled");
    expect(() =>
      warehouseBillingSchema.parse({ ...summary, paymentMethod: "bankily" })
    ).toThrow();
  });
});
