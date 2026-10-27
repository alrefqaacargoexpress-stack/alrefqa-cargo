import { describe, expect, it } from "vitest";
import {
  officeFinancePanelTarget,
  receivablesForSnapshot,
} from "./OfficeFinance";

describe("OfficeFinance receivables", () => {
  it("prefers shipmentReceivables and exposes gross, sold, remaining, and unpriced totals", () => {
    const [row] = receivablesForSnapshot({
      receivables: [
        {
          officeId: "dubai",
          currency: "AED",
          total: 99,
          shipments: [],
        },
      ],
      shipmentReceivables: [
        {
          officeId: "dubai",
          currency: "AED",
          total: 100,
          soldTotal: 37,
          remainingTotal: 63,
          unpricedShipments: 1,
          shipments: [
            {
              shipmentId: "s1",
              tracking: "DXB-1",
              amount: 100,
              soldAmount: 37,
              remainingAmount: 63,
              pricingStatus: "unpriced",
            },
          ],
        },
      ],
    });
    expect(row).toMatchObject({
      total: 100,
      soldTotal: 37,
      remainingTotal: 63,
      unpricedShipments: 1,
    });
  });

  it("falls back to an old cached receivables key and treats its amount as remaining until invoice data exists", () => {
    const [row] = receivablesForSnapshot({
      receivables: [
        {
          officeId: "dubai",
          currency: "AED",
          total: 37,
          shipments: [{ shipmentId: "legacy", tracking: "OLD-37", amount: 37 }],
        },
      ],
      shipmentReceivables: [],
    });
    expect(row).toMatchObject({
      total: 37,
      soldTotal: 0,
      remainingTotal: 37,
      unpricedShipments: 0,
    });
    expect(row.shipments[0]).toMatchObject({
      amount: 37,
      remainingAmount: 37,
    });
    expect(row.shipments[0].soldAmount).toBeUndefined();
  });

  it("derives totals from shipment-level invoice amounts when aggregate fields are absent", () => {
    const [row] = receivablesForSnapshot({
      receivables: [],
      shipmentReceivables: [
        {
          officeId: "china",
          currency: "CNY",
          total: 50,
          shipments: [
            {
              shipmentId: "s1",
              tracking: "CN-1",
              amount: 50,
              soldAmount: 12,
              remainingAmount: 38,
              pricingStatus: "priced",
            },
          ],
        },
      ],
    });
    expect(row.soldTotal).toBe(12);
    expect(row.remainingTotal).toBe(38);
    expect(row.unpricedShipments).toBe(0);
  });
});

describe("OfficeFinance panel links", () => {
  it("maps each approved panel query to an existing finance section", () => {
    expect(officeFinancePanelTarget("cash")).toEqual({
      id: "finance-panel-cash",
    });
    expect(officeFinancePanelTarget("expenses")).toEqual({
      id: "finance-panel-expenses",
    });
    expect(officeFinancePanelTarget("shipment-cost")).toEqual({
      id: "finance-panel-shipment-cost",
    });
    expect(officeFinancePanelTarget("arrival-cost")).toEqual({
      id: "finance-panel-arrival-cost",
    });
    expect(officeFinancePanelTarget("price")).toEqual({
      id: "finance-panel-price",
    });
  });

  it("ignores unknown panel queries", () => {
    expect(officeFinancePanelTarget("cashier")).toBeNull();
    expect(officeFinancePanelTarget(null)).toBeNull();
  });
});
