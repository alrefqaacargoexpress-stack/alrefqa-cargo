import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Shipment } from "@shared/operations";
import type { User } from "../drizzle/schema";
import {
  financeEntries,
  financeGoods,
  records,
  shipmentChargeComponents,
  shipmentPriceOverrides,
} from "../drizzle/schema";

vi.mock("./audit", () => ({ appendAudit: vi.fn(async () => undefined) }));
vi.mock("./lifecycle", () => ({
  assertActiveEntity: vi.fn(async () => undefined),
}));

import { appendAudit } from "./audit";
import {
  applyShipmentPriceOverride,
  canViewShipmentPriceSide,
  readPriceProjection,
  readShipmentPricingProjection,
} from "./shipmentPricing";

const user = { id: 7, name: "Pricing Accountant" } as User;
const sourceScope = {
  role: "accountant" as const,
  offices: ["dubai" as const],
  homeOffice: "dubai" as const,
};
const destinationScope = {
  role: "accountant" as const,
  offices: ["nouakchott" as const],
  homeOffice: "nouakchott" as const,
};
const snapshot = {
  service: "airRegular",
  sourceOffice: "dubai",
  sourceRate: { amount: 37, currency: "AED", unit: "kg" },
  nouakchottRate: { amount: 425, currency: "MRU", unit: "kg" },
  sourceProfileVersion: 12,
  nouakchottProfileVersion: 8,
  capturedAt: "2026-10-24T00:00:00.000Z",
} as const;
const shipment: Shipment = {
  id: "S-PRICING",
  tracking: "TRK-PRICING",
  account: "Client",
  route: "Dubai–Nouakchott",
  service: "جوي",
  status: "قيد التجهيز",
  eta: "Unconfirmed",
  amount: 0,
  officeId: "dubai",
  packing: {
    source: "dubai",
    pricePerKg: 37,
    pricePerKgMRU: 425,
    service: "airRegular",
    rateSnapshot: snapshot,
    createdAt: "2026-10-24T00:00:00.000Z",
    updatedAt: "2026-10-24T00:00:00.000Z",
    cartons: [
      {
        number: 1,
        closed: false,
        goods: [
          {
            id: "G-1",
            name: "Client",
            phone: "+22212345",
            unitWeight: 1,
            pieces: 1,
          },
        ],
      },
    ],
  },
  journey: {
    stage: "preparing",
    branch: "nouakchott",
    startedAt: "2026-10-24T00:00:00.000Z",
    updatedAt: "2026-10-24T00:00:00.000Z",
    expectedDays: 9,
    notes: [],
  },
};

type State = {
  rows: any[];
  overrides: any[];
  goods: any[];
  components: any[];
  entries: any[];
};

function tableRows(state: State, table: unknown) {
  if (table === records) return state.rows;
  if (table === shipmentPriceOverrides) return state.overrides;
  if (table === financeGoods) return state.goods;
  if (table === shipmentChargeComponents) return state.components;
  if (table === financeEntries) return state.entries;
  return [];
}

function api(state: State): any {
  return {
    select() {
      return {
        from(table: unknown) {
          const values = structuredClone(tableRows(state, table));
          const query: any = {
            where() {
              return query;
            },
            limit() {
              return query;
            },
            for() {
              return Promise.resolve(values);
            },
            then(resolve: any, reject: any) {
              return Promise.resolve(values).then(resolve, reject);
            },
          };
          return query;
        },
      };
    },
    insert(table: unknown) {
      return {
        async values(value: any) {
          if (table === shipmentPriceOverrides) {
            if (
              state.overrides.some(row => row.requestKey === value.requestKey)
            )
              throw new Error("duplicate_request");
            state.overrides.push(structuredClone(value));
          }
        },
      };
    },
    update() {
      return {
        set() {
          return { where: async () => undefined };
        },
      };
    },
  };
}

function database(options: Partial<State> = {}) {
  let state: State = {
    rows: [
      {
        id: 1,
        entity: "shipment",
        recordId: shipment.id,
        version: 1,
        data: structuredClone(shipment),
      },
    ],
    overrides: [],
    goods: [],
    components: [],
    entries: [],
    ...structuredClone(options),
  };
  const db = {
    select(...args: any[]) {
      return api(state).select(...args);
    },
    insert(...args: any[]) {
      return api(state).insert(...args);
    },
    update(...args: any[]) {
      return api(state).update(...args);
    },
    async transaction(callback: (tx: any) => Promise<unknown>) {
      const draft = structuredClone(state);
      const result = await callback(api(draft));
      state = draft;
      return result;
    },
  };
  return { db, state: () => state };
}

function command(
  id: string,
  side: "source" | "destination",
  pricePerKg: number,
  expectedPricingRevision = 0,
  expectedVersion = 1
) {
  return {
    id,
    payload: {
      shipmentId: shipment.id,
      side,
      pricePerKg,
      reason: `approved ${side} correction`,
      expectedPricingRevision,
      expectedVersion,
    },
  };
}

async function apply(
  data: ReturnType<typeof database>,
  scope: typeof sourceScope | typeof destinationScope,
  input: ReturnType<typeof command>
) {
  return data.db.transaction((tx: any) =>
    applyShipmentPriceOverride(tx, user, scope, input)
  );
}

beforeEach(() => {
  vi.mocked(appendAudit).mockReset();
  vi.mocked(appendAudit).mockResolvedValue(undefined as any);
});

describe("shipment price override transaction contract", () => {
  it("applies source 37→40 at Dubai and destination 425→430 at Nouakchott", async () => {
    const source = database();
    const sourceResult = (await apply(
      source,
      sourceScope,
      command("source-40", "source", 40)
    )) as any;
    expect(sourceResult.priceProjection).toMatchObject({
      side: "source",
      officeId: "dubai",
      currency: "AED",
      pricePerKg: 40,
      overridePricePerKg: 40,
      revision: 1,
      expectedPricingRevision: 1,
    });

    const destination = database();
    const destinationResult = (await apply(
      destination,
      destinationScope,
      command("destination-430", "destination", 430)
    )) as any;
    expect(destinationResult.priceProjection).toMatchObject({
      side: "destination",
      officeId: "nouakchott",
      currency: "MRU",
      pricePerKg: 430,
      overridePricePerKg: 430,
      revision: 1,
    });
    expect(source.state().rows[0].data).toEqual(shipment);
    expect(destination.state().rows[0].data).toEqual(shipment);
    expect(source.state().overrides[0]).toMatchObject({
      officeId: "dubai",
      currency: "AED",
      pricePerKg: "40.00",
    });
    expect(destination.state().overrides[0]).toMatchObject({
      officeId: "nouakchott",
      currency: "MRU",
      pricePerKg: "430.00",
    });
  });

  it("projects only visible sides and rejects an out-of-scope write", async () => {
    const data = database();
    expect(canViewShipmentPriceSide(sourceScope, shipment, "source")).toBe(
      true
    );
    expect(canViewShipmentPriceSide(sourceScope, shipment, "destination")).toBe(
      false
    );
    await apply(data, sourceScope, command("source-visible", "source", 40));
    const visible = await readShipmentPricingProjection(
      data.db,
      shipment,
      1,
      sourceScope
    );
    expect(visible.source?.pricePerKg).toBe(40);
    expect(visible.destination).toBeNull();
    await expect(
      apply(
        data,
        sourceScope,
        command("destination-forbidden", "destination", 430)
      )
    ).rejects.toThrow("shipment_price_office_forbidden");
    expect(data.state().overrides).toHaveLength(1);
  });

  it("fences stale record versions and stale pricing revisions without writing", async () => {
    const data = database();
    await expect(
      apply(data, sourceScope, command("stale-record", "source", 40, 0, 2))
    ).rejects.toThrow("version_conflict");
    expect(data.state().overrides).toHaveLength(0);
    await apply(data, sourceScope, command("revision-one", "source", 40));
    await expect(
      apply(data, sourceScope, command("stale-revision", "source", 41, 0, 1))
    ).rejects.toThrow("pricing_revision_conflict");
    expect(data.state().overrides).toHaveLength(1);
  });

  it("rejects a mismatched historical target label instead of changing its currency", async () => {
    const data = database({
      overrides: [
        {
          id: "bad-target",
          shipmentId: shipment.id,
          officeId: "dubai",
          side: "destination",
          currency: "AED",
          pricePerKg: "430.00",
          revision: 1,
          recordVersion: 1,
          reason: "bad fixture",
          previousOverrideId: null,
          requestKey: "old-request",
          approvedBy: user.id,
        },
      ],
    });
    await expect(
      readPriceProjection(data.db, shipment, 1, "destination")
    ).rejects.toThrow("shipment_price_target_mismatch");
    await expect(
      apply(
        data,
        destinationScope,
        command("new-target", "destination", 431, 1)
      )
    ).rejects.toThrow("shipment_price_target_mismatch");
  });

  it("denies every known sales-history shape, including retired invoice rows", async () => {
    for (const invoice of [
      { id: "invoice-top", shipmentId: shipment.id },
      { id: "invoice-finance", finance: { shipmentId: shipment.id } },
      {
        id: "invoice-goods",
        finance: { goods: [{ goodsId: "G-1" }] },
      },
    ]) {
      const data = database({
        rows: [
          {
            id: 1,
            entity: "shipment",
            recordId: shipment.id,
            version: 1,
            data: structuredClone(shipment),
          },
          {
            id: 2,
            entity: "invoice",
            recordId: invoice.id,
            version: 1,
            data: invoice,
          },
        ],
        goods:
          invoice.id === "invoice-goods"
            ? [
                {
                  shipmentId: shipment.id,
                  goodsId: "G-1",
                  invoiceId: invoice.id,
                },
              ]
            : [],
      });
      await expect(
        apply(data, sourceScope, command(`history-${invoice.id}`, "source", 40))
      ).rejects.toThrow("shipment_price_financial_history");
      expect(data.state().overrides).toHaveLength(0);
    }
    const retiredSale = database({
      entries: [
        {
          id: "retired-sale",
          kind: "shipment_revenue",
          shipmentId: shipment.id,
          data: { shipmentId: shipment.id },
        },
      ],
    });
    await expect(
      apply(retiredSale, sourceScope, command("retired-sale", "source", 40))
    ).rejects.toThrow("shipment_price_financial_history");
  });

  it("rolls back on audit failure, preserves original tariff evidence, and rejects duplicate requests", async () => {
    const data = database();
    vi.mocked(appendAudit).mockRejectedValueOnce(new Error("audit_failed"));
    await expect(
      apply(data, sourceScope, command("audit-rollback", "source", 40))
    ).rejects.toThrow("audit_failed");
    expect(data.state().overrides).toEqual([]);
    expect(data.state().rows[0].data).toEqual(shipment);
    expect(data.state().rows[0].data.packing.rateSnapshot).toEqual(snapshot);

    await apply(data, sourceScope, command("duplicate", "source", 40));
    await expect(
      apply(data, sourceScope, command("duplicate", "source", 40))
    ).rejects.toThrow("duplicate_request");
    expect(data.state().overrides).toHaveLength(1);
    expect(data.state().rows[0].data).toEqual(shipment);
  });
});
