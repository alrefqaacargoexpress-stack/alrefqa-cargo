import { describe, it, expect, vi } from "vitest";
import {
  createPackedShipment,
  addPackingGoods,
  closePackingCarton,
} from "../shared/packing";
import {
  assertFrozenShipmentComponents,
  recordComponentPayment,
  shipmentSettlementSnapshot,
} from "./shipmentSettlement";
import {
  shipmentChargeComponents,
  shipmentChargeAllocations,
  entityLifecycle,
  records,
} from "../drizzle/schema";
const permissionFixture = vi.hoisted(() => ({
  scope: { role: "admin", offices: null, homeOffice: null } as any,
}));
vi.mock("./branches", () => ({
  readOfficeScope: async () => permissionFixture.scope,
  recordVisibleInOffice: () => true,
}));
function db(tables: Map<any, any[]>): any {
  return {
    select: () => ({
      from: (t: any) => {
        let rows = tables.get(t) ?? [];
        const q: any = {
          where: () => q,
          limit: () => q,
          for: async () => rows,
          then: (r: any, j: any) => Promise.resolve(rows).then(r, j),
        };
        return q;
      },
    }),
    insert: (t: any) => ({
      values: async (v: any) => {
        tables.get(t)?.push(structuredClone(v));
      },
    }),
  };
}
function fixture() {
  const s = closePackingCarton(
    addPackingGoods(
      createPackedShipment({
        tracking: "UNIT",
        source: "dubai",
        pricePerKg: 37,
      }),
      { name: "Unit", phone: "", unitWeight: 1, pieces: 1 }
    )
  );
  const g = s.packing.cartons[0].goods[0];
  const c = {
    id: "c",
    shipmentId: s.id,
    goodsId: g.id,
    kind: "export",
    officeId: "dubai",
    currency: "AED",
    amount: "37.00",
    actorId: 1,
    requestKey: "x",
    data: {
      frozenPricePerKg: 37,
      frozenGoods: {
        id: g.id,
        name: g.name,
        phone: g.phone,
        unitWeight: g.unitWeight,
        pieces: g.pieces,
      },
    },
    createdAt: new Date(),
  };
  return { s, g, c };
}
describe("Approved component identity and currency safe settlement", () => {
  it("allows unchanged packing and rejects changing approved weight", async () => {
    const { s, c } = fixture();
    const d = db(new Map([[shipmentChargeComponents, [c]]]));
    await expect(
      assertFrozenShipmentComponents(d, s, structuredClone(s))
    ).resolves.toBeUndefined();
    const next = structuredClone(s);
    next.packing.cartons[0].goods[0].unitWeight = 2;
    await expect(assertFrozenShipmentComponents(d, s, next)).rejects.toThrow(
      "shipment_financial_components_frozen"
    );
  });
  it("allows archiving without rewriting the component or releasing the goods", async () => {
    const { s, c } = fixture();
    const next = { ...s, deleted: { at: "now", reason: "unit" } };
    await expect(
      assertFrozenShipmentComponents(
        db(new Map([[shipmentChargeComponents, [c]]])),
        s,
        next
      )
    ).resolves.toBeUndefined();
    expect(c.amount).toBe("37.00");
  });
  it("does not combine currencies in prepaid physical inventory", async () => {
    const { s, c } = fixture();
    const local = {
      ...c,
      id: "local",
      kind: "destination_local",
      officeId: "nouakchott",
      currency: "MRU",
      amount: "10.00",
      data: { passedToCustomer: true },
    };
    const tables = new Map<any, any[]>([
      [records, [{ entity: "shipment", version: 1, data: s }]],
      [entityLifecycle, []],
      [shipmentChargeComponents, [c, local]],
      [
        shipmentChargeAllocations,
        [
          {
            componentId: "c",
            invoiceId: "a",
            kind: "invoice",
            amount: "37.00",
          },
          {
            componentId: "c",
            invoiceId: "a",
            kind: "payment",
            amount: "37.00",
          },
          {
            componentId: "local",
            invoiceId: "b",
            kind: "invoice",
            amount: "10.00",
          },
          {
            componentId: "local",
            invoiceId: "b",
            kind: "payment",
            amount: "10.00",
          },
        ],
      ],
    ]);
    const snap = await shipmentSettlementSnapshot(
      db(tables),
      { id: 1, role: "admin" } as any,
      { shipmentId: s.id }
    );
    expect(snap.physical.paidUndeliveredByCurrency).toEqual([
      { currency: "AED", amount: 37 },
      { currency: "MRU", amount: 10 },
    ]);
    expect((snap.physical as any).paidUndelivered).toBeUndefined();
  });
  it("does not charge the customer for an institution-only local cost", async () => {
    const { s, c } = fixture();
    const cost = {
      ...c,
      id: "cost",
      kind: "destination_local",
      officeId: "nouakchott",
      currency: "MRU",
      amount: "10.00",
      data: { passedToCustomer: false },
    };
    const snap = await shipmentSettlementSnapshot(
      db(
        new Map<any, any[]>([
          [records, [{ entity: "shipment", version: 1, data: s }]],
          [entityLifecycle, []],
          [shipmentChargeComponents, [c, cost]],
          [shipmentChargeAllocations, []],
        ])
      ),
      { id: 1, role: "admin" } as any,
      { shipmentId: s.id }
    );
    expect(snap.breakdown).toHaveLength(1);
    expect(snap.components.find(x => x.id === "cost")?.unbilled).toBe(0);
  });
  it("uses bounded idempotent payment keys even for maximum length identifiers", async () => {
    const rows: any[] = [
      {
        id: "a",
        componentId: "c".repeat(128),
        invoiceId: "i",
        kind: "invoice",
        amount: "1.00",
      },
    ];
    const d = db(new Map([[shipmentChargeAllocations, rows]]));
    const request = {
      invoiceId: "i",
      amount: 0.5,
      actorId: 1,
      requestKey: "k".repeat(128),
    };
    const first = await recordComponentPayment(d, request);
    expect(first[0].requestKey.length).toBeLessThanOrEqual(128);
    await recordComponentPayment(d, request);
    expect(rows.filter(x => x.kind === "payment")).toHaveLength(1);
  });
  it("does not leak source totals or prepaid source inventory to destination-only staff", async () => {
    const { s, c } = fixture();
    s.status = "وصلت للمكتب";
    const local = {
      ...c,
      id: "local",
      kind: "destination_local",
      officeId: "nouakchott",
      currency: "MRU",
      amount: "10.00",
      data: { passedToCustomer: true },
    };
    permissionFixture.scope = {
      role: "accountant",
      offices: ["nouakchott"],
      homeOffice: "nouakchott",
    };
    try {
      const snap = await shipmentSettlementSnapshot(
        db(
          new Map<any, any[]>([
            [records, [{ entity: "shipment", version: 1, data: s }]],
            [entityLifecycle, []],
            [shipmentChargeComponents, [c, local]],
            [
              shipmentChargeAllocations,
              [
                {
                  componentId: "c",
                  invoiceId: "x",
                  kind: "invoice",
                  amount: "37.00",
                },
                {
                  componentId: "c",
                  invoiceId: "x",
                  kind: "payment",
                  amount: "37.00",
                },
                {
                  componentId: "local",
                  invoiceId: "y",
                  kind: "invoice",
                  amount: "10.00",
                },
                {
                  componentId: "local",
                  invoiceId: "y",
                  kind: "payment",
                  amount: "10.00",
                },
              ],
            ],
          ])
        ),
        { id: 1 } as any,
        { shipmentId: s.id }
      );
      expect(snap.breakdown.map(b => b.currency)).toEqual(["MRU"]);
      expect(snap.physical.paidUndeliveredByCurrency).toEqual([
        { currency: "MRU", amount: 10 },
      ]);
      expect(snap.components.map(x => x.id)).toEqual(["local"]);
    } finally {
      permissionFixture.scope = {
        role: "admin",
        offices: null,
        homeOffice: null,
      };
    }
  });
});
