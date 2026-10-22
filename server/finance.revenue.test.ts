import { describe, expect, it, vi } from "vitest";

vi.mock("./audit", () => ({ appendAudit: vi.fn(async () => undefined) }));

import { maybePostShipmentRevenue } from "./finance";
import { financeEntries } from "../drizzle/schema";
import type { Shipment } from "@shared/operations";

describe("derived shipment revenue", () => {
  it("posts one canonical gross credit when costs exist in MRU and AED", async () => {
    const stored: any[] = [
      { kind: "shipment_cost", shipmentId: "s1", officeId: "nouakchott", currency: "MRU" },
      { kind: "shipment_cost", shipmentId: "s1", officeId: "nouakchott", currency: "AED" },
    ];
    const tx = {
      select() {
        return {
          from(table: unknown) {
            const query: any = {
              limited: false,
              where() { return query; },
              limit() { query.limited = true; return query; },
              for() { return Promise.resolve(table === financeEntries ? (query.limited ? stored.filter(x => x.kind === "shipment_revenue") : stored.filter(x => x.kind === "shipment_cost")) : []); },
            };
            return query;
          },
        };
      },
      insert(table: unknown) {
        return { values(value: any) { stored.push(value); return Promise.resolve(); } };
      },
    };
    const shipment = {
      id: "s1", tracking: "T1", account: "unrelated-display-name", route: "r",
      service: "جوي", status: "في الطريق", eta: "2026-01-01", amount: 0,
      officeId: "nouakchott", packing: {
        source: "dubai", pricePerKg: 2, pricePerKgMRU: 100,
        cartons: [{ number: 1, closed: true, goods: [{ id: "g1", name: "x", phone: "", unitWeight: 1, pieces: 1 }] }],
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    } as unknown as Shipment;
    const user = { id: 7, name: "Accountant" };
    const first = await maybePostShipmentRevenue(tx, shipment, user, undefined, "accountant");
    const second = await maybePostShipmentRevenue(tx, shipment, user, undefined, "accountant");
    expect(first).toHaveLength(1);
    expect(second).toEqual([]);
    expect(stored.filter(x => x.kind === "shipment_revenue")).toHaveLength(1);
    expect(stored.find(x => x.kind === "shipment_revenue").currency).toBe("MRU");
  });
});
