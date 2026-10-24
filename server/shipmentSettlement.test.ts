import { describe, expect, it } from "vitest";
import {
  recordComponentPayment,
  settlementCanManage,
  settlementOfficeVisible,
} from "./shipmentSettlement";
import type { ShipmentSettlementSnapshot } from "../shared/shipmentSettlement";
import { shipmentChargeAllocations } from "../drizzle/schema";

const sourceScope = {
  role: "accountant" as const,
  offices: ["dubai"],
  homeOffice: "dubai" as const,
  membershipVersion: 1,
};
const destinationScope = {
  role: "accountant" as const,
  offices: ["nouakchott"],
  homeOffice: "nouakchott" as const,
  membershipVersion: 1,
};

function allocationDb(rows: any[]) {
  return {
    select() {
      return {
        from(table: unknown) {
          const query: any = {
            limit() {
              return query;
            },
            then(r: any, j: any) {
              return Promise.resolve(
                table === shipmentChargeAllocations
                  ? rows.map(row => structuredClone(row))
                  : []
              ).then(r, j);
            },
            where() {
              return query;
            },
            for() {
              return Promise.resolve(
                table === shipmentChargeAllocations
                  ? rows.map(row => structuredClone(row))
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
          if (table === shipmentChargeAllocations)
            rows.push(structuredClone(value));
          return Promise.resolve();
        },
      };
    },
  };
}

describe("shipment settlement server helpers", () => {
  it("enforces office and financial permission boundaries", () => {
    expect(settlementOfficeVisible(sourceScope, "dubai")).toBe(true);
    expect(settlementOfficeVisible(sourceScope, "nouakchott")).toBe(false);
    expect(settlementCanManage(sourceScope, "shipment_prices")).toBe(true);
    expect(settlementCanManage(destinationScope, "expenses")).toBe(true);
  });

  it("keeps prepaid undelivered physical stock separate from paid totals", () => {
    const snapshot: ShipmentSettlementSnapshot = {
      shipmentId: "s1",
      tracking: "TRK-1",
      shipmentVersion: 4,
      visibleOffice: "nouakchott",
      sourceOffice: "dubai",
      destinationOffice: "nouakchott",
      components: [],
      breakdown: [
        {
          currency: "AED",
          componentTotal: 10,
          unbilled: 0,
          customerDebt: 0,
          paid: 10,
          settled: 10,
        },
      ],
      physical: {
        undeliveredGoodsIds: ["g1"],
        undeliveredWeight: 1,
        paidUndeliveredByCurrency: [{ currency: "AED", amount: 10 }],
      },
    };
    expect(snapshot.breakdown[0].paid).toBe(10);
    expect(snapshot.physical.paidUndeliveredByCurrency[0].amount).toBe(10);
    expect(
      snapshot.breakdown[0].paid +
        snapshot.physical.paidUndeliveredByCurrency[0].amount
    ).toBe(20);
  });

  it("allocates partial payments once in cents and rejects overpayment", async () => {
    const rows = [
      {
        id: "i1",
        componentId: "c1",
        invoiceId: "inv-1",
        kind: "invoice",
        amount: "1.00",
        requestKey: "bill-1",
      },
      {
        id: "i2",
        componentId: "c2",
        invoiceId: "inv-1",
        kind: "invoice",
        amount: "1.00",
        requestKey: "bill-1",
      },
    ];
    const db = allocationDb(rows);
    const first = await recordComponentPayment(db, {
      invoiceId: "inv-1",
      amount: 0.75,
      actorId: 7,
      requestKey: "pay-1",
    });
    expect(first).toHaveLength(1);
    expect(first[0].amount).toBe(0.75);
    const replay = await recordComponentPayment(db, {
      invoiceId: "inv-1",
      amount: 0.75,
      actorId: 7,
      requestKey: "pay-1",
    });
    expect(replay).toHaveLength(1);
    expect(rows.filter(row => row.kind === "payment")).toHaveLength(1);
    await expect(
      recordComponentPayment(db, {
        invoiceId: "inv-1",
        amount: 1.3,
        actorId: 7,
        requestKey: "pay-2",
      })
    ).rejects.toThrow("overpayment");
  });
});
