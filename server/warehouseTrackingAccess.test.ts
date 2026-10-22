import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { parseChange } from "./operations";
import type { Shipment } from "../shared/operations";
import type { User } from "../drizzle/schema";
import {
  memberRoles,
  records,
  syncReceipts,
  financeEntries,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
let membership: any;
let membershipReads = 0;
let revokeInside = false;
const updates = vi.fn();
const inserts = vi.fn();
const receipts: any[] = [];
const at = "2026-10-22T20:00:00.000Z";
const cargo: Shipment = {
  id: "S1",
  tracking: "S1",
  account: "Client",
  route: "Dubai–Nouakchott",
  service: "جوي",
  status: "قيد التجهيز",
  eta: "Unknown",
  amount: 8,
  officeId: "dubai",
  packing: {
    source: "dubai",
    pricePerKg: 4,
    createdAt: at,
    updatedAt: at,
    cartons: [
      {
        number: 1,
        closed: true,
        goods: [
          { id: "G1", name: "Client", phone: "", unitWeight: 1, pieces: 2 },
        ],
      },
    ],
  },
  journey: {
    stage: "preparing",
    branch: "dubai",
    startedAt: at,
    updatedAt: at,
    expectedDays: 9,
    notes: [],
  },
};
const db: any = {
  select: () => ({
    from: (table: unknown) => {
      if (table === memberRoles) membershipReads++;
      const member =
        revokeInside && membershipReads >= 3
          ? { ...membership, canUpdateTracking: false }
          : membership;
      const values =
        table === memberRoles
          ? [member]
          : table === records
            ? [
                {
                  id: 1,
                  entity: "shipment",
                  recordId: "S1",
                  version: 1,
                  data: structuredClone(cargo),
                },
              ]
            : table === syncReceipts
              ? structuredClone(receipts)
              : [];
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
    set: (data: any) => ({ where: async () => updates(data) }),
  }),
  insert: (table: unknown) => ({
    values: async (data: any) => {
      if (table === financeEntries)
        throw new Error("Warehouse must never write finance entries");
      if (table === syncReceipts) receipts.push(structuredClone(data));
      inserts(table, data);
    },
  }),
  transaction: async (callback: any) => callback(db),
};
vi.mock("./db", () => ({ getDb: async () => db }));
vi.mock("./audit", () => ({ appendAudit: vi.fn() }));
import { appendAudit } from "./audit";
import { appRouter } from "./routers";
const user = {
  id: 8,
  openId: "source-warehouse-test",
  role: "user",
  name: "Warehouse",
  accountType: "employee",
  mustChangePassword: false,
} as User;
const caller = () =>
  appRouter.createCaller({
    user,
    req: { headers: {} },
    res: {},
  } as unknown as TrpcContext);
const request = {
  requestId: "stage-test",
  shipmentId: "S1",
  expectedVersion: 1,
  command: {
    type: "stage" as const,
    stage: "dubai_airport" as const,
    reason: "Warehouse confirmed the current stage",
  },
};
beforeEach(() => {
  membership = {
    role: "staff",
    offices: ["dubai"],
    homeOffice: "dubai",
    version: 1,
    canUpdateTracking: false,
  };
  receipts.length = 0;
  membershipReads = 0;
  revokeInside = false;
  updates.mockReset();
  inserts.mockReset();
  vi.mocked(appendAudit).mockReset();
});
describe("Explicit warehouse tracking authorization", () => {
  it("rejects a warehouse worker without the assigned stage capability", async () => {
    await expect(caller().tracking.commit(request)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(updates).not.toHaveBeenCalled();
    expect(inserts).not.toHaveBeenCalled();
  });
  it("permits the assigned next stage and audits it without touching a ledger", async () => {
    membership.canUpdateTracking = true;
    const result = await caller().tracking.commit(request);
    expect(result.shipment.journey?.stage).toBe("dubai_airport");
    expect(result.shipment.packing?.pricePerKg).toBe(0);
    expect(updates).toHaveBeenCalledTimes(1);
    expect(appendAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actor: expect.objectContaining({ id: 8, role: "staff" }),
        entity: "shipment",
        action: "tracking_stage",
        beforeVersion: 1,
        afterVersion: 2,
      })
    );
    expect(inserts).toHaveBeenCalledWith(syncReceipts, expect.anything());
  });
  it("denies Nouakchott, multiple offices, transfer and stage jumps", async () => {
    membership.canUpdateTracking = true;
    await expect(
      caller().tracking.commit({
        ...request,
        command: {
          type: "stage",
          stage: "dakar_airport",
          reason: "Invalid jump",
        },
      })
    ).rejects.toBeDefined();
    await expect(
      caller().tracking.commit({
        ...request,
        command: {
          type: "transfer",
          branch: "china",
          reason: "Invalid transfer",
        },
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    membership.offices = ["nouakchott"];
    membership.homeOffice = "nouakchott";
    await expect(caller().tracking.commit(request)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    membership.offices = ["dubai", "china"];
    membership.homeOffice = "dubai";
    await expect(caller().tracking.commit(request)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(updates).not.toHaveBeenCalled();
  });
  it("rechecks revoked capabilities inside the transaction before a write", async () => {
    membership.canUpdateTracking = true;
    revokeInside = true;
    await expect(caller().tracking.commit(request)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(membershipReads).toBeGreaterThanOrEqual(3);
    expect(updates).not.toHaveBeenCalled();
  });
  it("replays only the exact tracking payload and rejects a revised reason", async () => {
    membership.canUpdateTracking = true;
    const first = await caller().tracking.commit(request);
    expect(await caller().tracking.commit(request)).toEqual(first);
    await expect(
      caller().tracking.commit({
        ...request,
        command: { ...request.command, reason: "Revised draft" },
      })
    ).rejects.toBeDefined();
    expect(updates).toHaveBeenCalledTimes(1);
  });
  it("does not acknowledge a revised generic shipment draft with an old receipt", async () => {
    const data = structuredClone(cargo);
    data.amount = 0;
    data.packing!.pricePerKg = 0;
    const change = {
      id: "ops-confirmed",
      entity: "shipment" as const,
      recordId: "S1",
      expectedVersion: 1,
      label: "Goods",
      createdAt: at,
      data,
    };
    const payloadHash = createHash("sha256")
      .update(JSON.stringify(parseChange(change)))
      .digest("hex");
    receipts.push({
      result: {
        payloadHash,
        applied: [{ changeId: change.id, entity: "shipment", record: cargo }],
        conflicts: [],
      },
    });
    data.packing!.cartons[0].goods[0].pieces = 99;
    const result = await caller().operations.sync({ changes: [change] });
    expect(result.applied).toEqual([]);
    expect(result.conflicts[0].reason).toBe("replay_payload_mismatch");
    expect(updates).not.toHaveBeenCalled();
  });
});
