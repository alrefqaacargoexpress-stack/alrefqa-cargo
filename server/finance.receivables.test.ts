import { describe, expect, it } from "vitest";
import { blankPermissions } from "../shared/permissions";
import { addPackingGoods, createPackedShipment } from "../shared/packing";
import type { Invoice } from "../shared/operations";
import { records } from "../drizzle/schema";
import { financeSnapshot } from "./finance";

function fakeDb(rows: any[]) {
  return {
    select() {
      return {
        from(table: unknown) {
          const values = table === records ? rows : [];
          const query = {
            where() {
              return Promise.resolve(values);
            },
            then(resolve: (value: any[]) => unknown) {
              return Promise.resolve(values).then(resolve);
            },
          };
          return query;
        },
      };
    },
  };
}

function invoice(shipmentId: string, goodsId: string): Invoice {
  return {
    id: "source-sale",
    account: "Customer",
    amount: 20,
    status: "مدفوعة",
    issuedAt: "2026-10-24T00:00:00.000Z",
    officeId: "dubai",
    finance: {
      customerId: "customer",
      chargeKind: "shipping",
      paymentMode: "cash",
      issuingOfficeId: "dubai",
      financialOfficeId: "dubai",
      actorId: 1,
      actorName: "Accountant",
      recordedAt: "2026-10-24T00:00:00.000Z",
      currency: "AED",
      shipmentId,
      goods: [
        {
          goodsId,
          cartonNumber: 1,
          name: "Goods",
          phone: "",
          weight: 2,
          pieces: 1,
        },
      ],
      baseAmount: 20,
      adjustment: { direction: "increase", amount: 0 },
      paidAmount: 20,
    },
  };
}

describe("finance snapshot receivable privacy", () => {
  it("derives source drawdown from raw invoices without returning invoices without invoice view", async () => {
    let shipment = createPackedShipment({
      tracking: "SNAP-DRAW",
      source: "dubai",
      pricePerKg: 10,
      officeId: "dubai",
    });
    shipment = addPackingGoods(shipment, {
      name: "Goods",
      phone: "",
      unitWeight: 2,
      pieces: 1,
    });
    shipment.status = "في الطريق";
    const goodId = shipment.packing.cartons[0].goods[0].id;
    const permissions = blankPermissions();
    permissions.shipment_prices = "view";
    const result = await financeSnapshot(
      fakeDb([
        {
          entity: "shipment",
          recordId: shipment.id,
          version: 1,
          data: shipment,
        },
        {
          entity: "invoice",
          recordId: "source-sale",
          version: 1,
          data: invoice(shipment.id, goodId),
        },
      ]),
      { role: "accountant", offices: ["dubai"], permissions }
    );
    expect(result.invoices).toEqual([]);
    expect(result.receivables?.[0]).toMatchObject({
      officeId: "dubai",
      currency: "AED",
      total: 20,
      soldTotal: 20,
      remainingTotal: 0,
    });
  });

  it("does not use an invoice from another financial office for the source aggregate", async () => {
    let shipment = createPackedShipment({
      tracking: "SNAP-OFFICE",
      source: "dubai",
      pricePerKg: 10,
      officeId: "dubai",
    });
    shipment = addPackingGoods(shipment, {
      name: "Goods",
      phone: "",
      unitWeight: 2,
      pieces: 1,
    });
    shipment.status = "في الطريق";
    const goodId = shipment.packing.cartons[0].goods[0].id;
    const otherOffice = invoice(shipment.id, goodId);
    otherOffice.finance = {
      ...otherOffice.finance!,
      financialOfficeId: "nouakchott",
      issuingOfficeId: "nouakchott",
      currency: "MRU",
    };
    const permissions = blankPermissions();
    permissions.shipment_prices = "view";
    const result = await financeSnapshot(
      fakeDb([
        {
          entity: "shipment",
          recordId: shipment.id,
          version: 1,
          data: shipment,
        },
        {
          entity: "invoice",
          recordId: "other-office",
          version: 1,
          data: otherOffice,
        },
      ]),
      { role: "accountant", offices: ["dubai"], permissions }
    );
    expect(result.receivables?.[0]?.soldTotal).toBe(0);
    expect(result.receivables?.[0]?.remainingTotal).toBe(20);
  });
});
