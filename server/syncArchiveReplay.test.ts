import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPackedShipment,
  addPackingGoods,
  closePackingCarton,
  changePackingStatus,
} from "../shared/packing";
import { deleteShipment } from "../shared/shipmentDeletion";
import {
  records,
  syncReceipts,
  financeEntries,
  memberRoles,
  users,
} from "../drizzle/schema";
import type { User } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import type { PendingChange, Shipment } from "../shared/operations";
let row: any;
let requestId = "";
const receipts: any[] = [];
const updates = vi.fn();
const inserts = vi.fn();
let userLockTail: Promise<void> = Promise.resolve();
const db: any = {
  select: () => ({
    from: (table: unknown) => {
      const result =
        table === records
          ? [structuredClone(row)]
          : table === syncReceipts
            ? structuredClone(receipts.filter(r => r.changeId === requestId))
            : [];
      const query: any = {
        where: () => query,
        limit: () => query,
        for: async () => result,
        then: (resolve: any, reject: any) =>
          Promise.resolve(result).then(resolve, reject),
      };
      return query;
    },
  }),
  update: (table: unknown) => ({
    set: (data: any) => ({
      where: async () => {
        expect(table).toBe(records);
        row = { ...row, ...structuredClone(data) };
        updates(data);
      },
    }),
  }),
  insert: (table: unknown) => ({
    values: async (data: any) => {
      if (table === financeEntries)
        throw new Error("An archive must not write a ledger");
      if (table === syncReceipts) {
        if (
          receipts.some(
            r => r.userId === data.userId && r.changeId === data.changeId
          )
        )
          throw new Error("duplicate_receipt");
        receipts.push(structuredClone(data));
      }
      inserts(table, data);
    },
  }),
  transaction: async (callback: any) => {
    let release: (() => void) | undefined;
    const tx = {
      ...db,
      select: () => ({
        from: (table: unknown) => {
          if (table !== users) return db.select().from(table);
          const query: any = {
            where: () => query,
            limit: () => query,
            for: async () => {
              const previous = userLockTail;
              userLockTail = new Promise<void>(resolve => {
                release = resolve;
              });
              await previous;
              return [{ id: 8008 }];
            },
          };
          return query;
        },
      }),
    };
    try {
      return await callback(tx);
    } finally {
      release?.();
    }
  },
};
vi.mock("./db", () => ({ getDb: async () => db }));
vi.mock("./audit", () => ({ appendAudit: vi.fn() }));
import { appendAudit } from "./audit";
import { appRouter } from "./routers";
const user = {
  id: 8008,
  openId: "mock-admin",
  role: "admin",
  accountType: "employee",
  mustChangePassword: false,
} as User;
const caller = () =>
  appRouter.createCaller({
    user,
    req: { headers: {} },
    res: {},
  } as unknown as TrpcContext);
function change(): PendingChange {
  const current = row.data as Shipment;
  return {
    id: "archive-request",
    entity: "shipment",
    recordId: current.id,
    expectedVersion: 1,
    createdAt: "now",
    label: "Archive fixture",
    data: deleteShipment(current, "Duplicate fixture"),
    action: "delete-shipment",
  };
}
async function sync(input: PendingChange) {
  requestId = input.id;
  return caller().operations.sync({ changes: [input] });
}
beforeEach(() => {
  const cargo = changePackingStatus(
    closePackingCarton(
      addPackingGoods(
        createPackedShipment({
          tracking: "REPLAY-FIXTURE",
          source: "dubai",
          officeId: "dubai",
          pricePerKg: 4,
        }),
        { name: "Fixture", phone: "", unitWeight: 1, pieces: 3 }
      )
    ),
    "في الطريق"
  );
  row = {
    id: 1,
    entity: "shipment",
    recordId: cargo.id,
    version: 1,
    data: cargo,
  };
  receipts.length = 0;
  updates.mockReset();
  inserts.mockReset();
  userLockTail = Promise.resolve();
  vi.mocked(appendAudit).mockReset();
});
describe("Safe generic archive receipts", () => {
  it("replays two concurrent first-use requests with one write and one receipt", async () => {
    const request = change();
    const [first, second] = await Promise.all([
      sync(request),
      sync(structuredClone(request)),
    ]);
    expect(first.conflicts).toEqual([]);
    expect(second).toEqual(first);
    expect(receipts).toHaveLength(1);
    expect(updates).toHaveBeenCalledTimes(1);
    expect(appendAudit).toHaveBeenCalledTimes(1);
  });
  it("records a payload hash and acknowledges an exact successful retry without another write", async () => {
    const request = change();
    const first = await sync(request);
    expect(first.conflicts).toEqual([]);
    expect(first.applied[0].record).toMatchObject({
      version: 2,
      deleted: { reason: "Duplicate fixture" },
    });
    expect(receipts[0].result.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(await sync(request)).toEqual(first);
    expect(updates).toHaveBeenCalledTimes(1);
    expect(appendAudit).toHaveBeenCalledTimes(1);
    expect(row.data.deleted).toBeDefined();
  });
  it("rejects a modified draft under an already acknowledged request id", async () => {
    const request = change();
    await sync(request);
    const changed = structuredClone(request);
    (changed.data as Shipment).deleted!.reason = "Changed reason";
    const result = await sync(changed);
    expect(result.applied).toEqual([]);
    expect(result.conflicts[0].reason).toBe("replay_payload_mismatch");
    expect(updates).toHaveBeenCalledTimes(1);
  });
  it("does not modify legacy receipts or automatically rebase a fresh retry", async () => {
    const request = change();
    receipts.push({
      userId: user.id,
      changeId: request.id,
      result: { applied: [], conflicts: [] },
    });
    const legacy = structuredClone(receipts);
    expect((await sync(request)).conflicts[0].reason).toBe(
      "legacy_receipt_requires_review"
    );
    expect(receipts).toEqual(legacy);
    row.version = 2;
    const retry = { ...request, id: "explicit-new-attempt" };
    expect((await sync(retry)).conflicts[0].reason).toBe("version_conflict");
    expect(receipts[1].result.payloadHash).toBeDefined();
    expect(updates).not.toHaveBeenCalled();
    expect(row.data.deleted).toBeUndefined();
  });
});
