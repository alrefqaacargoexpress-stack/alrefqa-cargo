import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Shipment } from "../shared/operations";
import type { User } from "../drizzle/schema";
import { records, syncReceipts } from "../drizzle/schema";
import type { OfficeScope } from "./branches";
let scope: OfficeScope;
vi.mock("./branches", async () => ({
  ...(await vi.importActual("./branches")),
  readOfficeScope: async () => scope,
}));
vi.mock("./audit", () => ({ appendAudit: vi.fn() }));
import { appendAudit } from "./audit";
import { commitWarehouseStorage, readWarehouseSnapshot } from "./warehouse";

const at = "2026-10-22T20:00:00.000Z";
const user = {
  id: 8,
  openId: "warehouse-test",
  role: "user",
  name: "Warehouse",
} as User;
const shipment: Shipment = {
  id: "S1",
  tracking: "S1",
  account: "Goods clients",
  route: "Dubai–Nouakchott",
  service: "جوي",
  status: "وصلت للمكتب",
  eta: "Unconfirmed",
  amount: 300,
  officeId: "dubai",
  packing: {
    source: "dubai",
    pricePerKg: 100,
    pricePerKgMRU: 200,
    createdAt: at,
    updatedAt: at,
    cartons: [
      {
        number: 1,
        closed: true,
        goods: [
          {
            id: "G1",
            name: "Client",
            phone: "+22212345",
            unitWeight: 1,
            pieces: 3,
          },
        ],
      },
    ],
  },
  journey: {
    stage: "arrived_office",
    branch: "nouakchott",
    startedAt: at,
    updatedAt: at,
    expectedDays: 9,
    notes: [],
  },
};
const command = {
  requestId: "storage-test",
  shipmentId: "S1",
  goodsId: "G1",
  warehouse: "مستودع أ",
  shelf: "R-001",
  expectedVersion: 1,
};
function database(original: Shipment = shipment) {
  let state = {
    rows: [
      {
        id: 1,
        entity: "shipment",
        recordId: "S1",
        version: 1,
        data: structuredClone(original),
      },
    ],
    receipts: [] as any[],
  };
  let writeCount = 0;
  function api(target: typeof state): any {
    return {
      select: () => ({
        from: (table: unknown) => {
          const values = structuredClone(
            table === records
              ? target.rows
              : table === syncReceipts
                ? target.receipts
                : []
          );
          const builder: any = {
            where: () => builder,
            limit: () => builder,
            for: () => Promise.resolve(values),
            then: (resolve: any, reject: any) =>
              Promise.resolve(values).then(resolve, reject),
          };
          return builder;
        },
      }),
      update: () => ({
        set: (patch: any) => ({
          where: async () => {
            writeCount++;
            Object.assign(target.rows[0], structuredClone(patch));
          },
        }),
      }),
      insert: (table: unknown) => ({
        values: async (value: any) => {
          if (table === syncReceipts)
            target.receipts.push(structuredClone(value));
        },
      }),
    };
  }
  const db: any = {
    ...api(state),
    transaction: async (callback: any) => {
      const draft = structuredClone(state);
      const result = await callback(api(draft));
      state = draft;
      return result;
    },
  };
  return { db, getState: () => state, writes: () => writeCount };
}
beforeEach(() => {
  scope = {
    role: "staff",
    offices: ["nouakchott"],
    homeOffice: "nouakchott",
    membershipVersion: 1,
  };
  vi.mocked(appendAudit).mockReset();
  vi.mocked(appendAudit).mockResolvedValue(undefined as any);
});
describe("Nouakchott storage transaction isolation", () => {
  it("updates only location, logs actor/version and retries without another write", async () => {
    const data = database();
    const first: any = await commitWarehouseStorage(data.db, user, command);
    expect(first.storage).toMatchObject({
      goodsId: "G1",
      warehouse: "مستودع أ",
      shelf: "R-001",
      updatedBy: user.id,
    });
    const after = data.getState().rows[0];
    const { destinationStorage, ...rest } = after.data;
    expect(rest).toEqual(shipment);
    expect(after.version).toBe(2);
    expect(appendAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entity: "warehouse_storage",
        beforeVersion: 1,
        afterVersion: 2,
        actor: expect.objectContaining({ id: user.id, role: "staff" }),
      })
    );
    const replay = await commitWarehouseStorage(data.db, user, command);
    expect(replay).toEqual(first);
    expect(data.writes()).toBe(1);
    expect(appendAudit).toHaveBeenCalledTimes(1);
    await expect(
      commitWarehouseStorage(data.db, user, { ...command, shelf: "Changed" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("lets the general manager assign a shelf, like Nouakchott warehouse staff", async () => {
    scope = {
      role: "admin",
      offices: null,
      homeOffice: null,
      membershipVersion: 1,
    } as OfficeScope;
    const data = database();
    const saved = await commitWarehouseStorage(data.db, user, command);
    expect(saved.version).toBe(2);
    expect(data.writes()).toBe(1);
  });
  it("rejects office managers, accountants, a different office and a revoked assignment", async () => {
    for (const next of [
      { role: "office_manager", offices: ["dubai"], homeOffice: "dubai" },
      { role: "accountant", offices: ["nouakchott"], homeOffice: "nouakchott" },
      { role: "staff", offices: ["dubai"], homeOffice: "dubai" },
      { role: "staff", offices: [], homeOffice: null },
    ]) {
      scope = { ...next, membershipVersion: 1 } as OfficeScope;
      const data = database();
      await expect(
        commitWarehouseStorage(data.db, user, command)
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(data.writes()).toBe(0);
    }
  });
  it("rejects unarrived, delivered, deleted or foreign goods and stale versions", async () => {
    for (const original of [
      {
        ...shipment,
        status: "في الطريق",
        journey: { ...shipment.journey!, stage: "to_nouakchott" },
      },
      { ...shipment, status: "مسلّمة" },
      { ...shipment, deleted: { at, reason: "Test" } },
    ] as Shipment[]) {
      const data = database(original);
      await expect(
        commitWarehouseStorage(data.db, user, command)
      ).rejects.toBeDefined();
      expect(data.writes()).toBe(0);
    }
    const data = database();
    await expect(
      commitWarehouseStorage(data.db, user, { ...command, goodsId: "OTHER" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      commitWarehouseStorage(data.db, user, { ...command, expectedVersion: 4 })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(data.writes()).toBe(0);
  });
  it("rolls back a location update if immutable audit cannot be written", async () => {
    const data = database();
    vi.mocked(appendAudit).mockRejectedValueOnce(
      new Error("Audit unavailable")
    );
    await expect(
      commitWarehouseStorage(data.db, user, command)
    ).rejects.toThrow("Audit unavailable");
    expect(data.getState().rows[0].data).toEqual(shipment);
    expect(data.getState().rows[0].version).toBe(1);
    expect(data.getState().receipts).toEqual([]);
  });
  it("bounds receipt keys for a long request id", async () => {
    const data = database();
    await commitWarehouseStorage(data.db, user, {
      ...command,
      requestId: "x".repeat(128),
    });
    expect(data.getState().receipts[0].changeId.length).toBeLessThanOrEqual(
      128
    );
  });
  it("read-only snapshots strip all source and MRU money", async () => {
    const data = database();
    const result = await readWarehouseSnapshot(data.db, user);
    expect(result.canEdit).toBe(true);
    expect(result.shipments).toHaveLength(1);
    expect(result.shipments[0].amount).toBe(0);
    expect(result.shipments[0].packing?.pricePerKg).toBe(0);
    expect(result.shipments[0].packing?.pricePerKgMRU).toBeUndefined();
  });
});
