import { describe, expect, it, vi } from "vitest";

vi.mock("./audit", () => ({ appendAudit: vi.fn(async () => undefined) }));

import { createPackedShipment } from "../shared/packing";
import type { FinanceCommand } from "../shared/finance";
import { records } from "../drizzle/schema";
import { applyFinanceCommand } from "./finance";

function transactionFor(row: any) {
  return {
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
            then(resolve: any, reject: any) {
              return Promise.resolve(table === records ? [row] : []).then(
                resolve,
                reject
              );
            },
            for() {
              return Promise.resolve(table === records ? [row] : []);
            },
          };
          return query;
        },
      };
    },
    update() {
      return {
        set(value: any) {
          return {
            where() {
              Object.assign(row, value);
              return Promise.resolve();
            },
          };
        },
      };
    },
    insert() {
      return { values: vi.fn(async () => undefined) };
    },
  };
}

describe("published shipment tariff freeze", () => {
  it("does not reprice a published 37 AED/kg shipment to 42 before dispatch", async () => {
    const shipment = createPackedShipment({
      tracking: "TARIFF-FROZEN",
      source: "dubai",
      pricePerKg: 37,
      rateSnapshot: {
        service: "airRegular",
        sourceOffice: "dubai",
        sourceRate: { amount: 37, currency: "AED", unit: "kg" },
        nouakchottRate: null,
        sourceProfileVersion: 2,
        nouakchottProfileVersion: 2,
        capturedAt: "2026-10-24T00:00:00.000Z",
      },
    });
    const row = {
      id: 1,
      entity: "shipment",
      recordId: shipment.id,
      version: 1,
      data: shipment,
    };
    const command: FinanceCommand = {
      id: "freeze-command",
      kind: "shipment_price",
      createdAt: "2026-10-24T00:00:00.000Z",
      payload: {
        shipmentId: shipment.id,
        sourceOfficeId: "dubai",
        pricePerKg: 42,
        expectedVersion: 1,
      },
    };
    await expect(
      applyFinanceCommand(
        transactionFor(row),
        { id: 1, name: "Accountant" },
        { role: "accountant", offices: ["dubai"], homeOffice: "dubai" },
        command
      )
    ).rejects.toThrow("shipment_tariff_frozen");
    expect(row.data.packing.pricePerKg).toBe(37);
  });
});
