import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../drizzle/schema";
import {
  entityLifecycle,
  records,
  syncReceipts,
  users,
  warehouseLocationEvents,
} from "../drizzle/schema";
import type { OfficeScope } from "./branches";

let mode: "revoked" | "disabled" | "staleAdmin" | "normal" = "normal";
let lockedUser: User;
let writes = 0;

const normalScope: OfficeScope = {
  role: "staff",
  offices: ["nouakchott"],
  homeOffice: "nouakchott",
  membershipVersion: 1,
};
const deniedScope: OfficeScope = {
  role: "viewer",
  offices: ["nouakchott"],
  homeOffice: "nouakchott",
  membershipVersion: 2,
  permissions: {},
};

vi.mock("./branches", async () => ({
  ...(await vi.importActual<typeof import("./branches")>("./branches")),
  readOfficeScope: async (_db: unknown, user: Pick<User, "role">) =>
    mode === "revoked" ||
    (mode === "staleAdmin" && user.role === "user") ||
    (mode !== "staleAdmin" && user.role !== "user")
      ? deniedScope
      : normalScope,
}));
vi.mock("./audit", () => ({ appendAudit: vi.fn(async () => {}) }));

import { commitWarehouseStorage } from "./warehouse";

const contextUser = {
  id: 8,
  openId: "stale-context",
  name: "Context employee",
  email: "context@example.test",
  role: "user",
  accountType: "employee",
} as User;
const shipment = {
  id: "S1",
  tracking: "S1",
  account: "Client",
  route: "Dubai–Nouakchott",
  service: "جوي",
  status: "وصلت للمكتب",
  eta: "Unknown",
  amount: 0,
  officeId: "dubai",
  packing: {
    source: "dubai",
    pricePerKg: 0,
    createdAt: "2026-10-22T20:00:00.000Z",
    updatedAt: "2026-10-22T20:00:00.000Z",
    cartons: [
      {
        number: 1,
        closed: true,
        goods: [
          { id: "G1", name: "Client", phone: "", unitWeight: 1, pieces: 1 },
        ],
      },
    ],
  },
  journey: {
    stage: "arrived_office",
    branch: "nouakchott",
    startedAt: "2026-10-22T20:00:00.000Z",
    updatedAt: "2026-10-22T20:00:00.000Z",
    expectedDays: 9,
    notes: [],
  },
} as any;
const command = {
  requestId: "authlock-fake",
  shipmentId: "S1",
  goodsId: "G1",
  warehouse: "A",
  shelf: "R1",
  expectedVersion: 1,
};

function fakeDb() {
  const row = {
    id: 1,
    entity: "shipment",
    recordId: "S1",
    version: 1,
    data: structuredClone(shipment),
  };
  const query = (table: unknown) => {
    const values =
      table === users
        ? [lockedUser]
        : table === entityLifecycle
          ? mode === "disabled"
            ? [
                {
                  entity: "employee",
                  recordId: String(lockedUser.id),
                  action: "disable",
                },
              ]
            : []
          : table === records
            ? [row]
            : table === syncReceipts
              ? []
              : [];
    const builder: any = {
      where: () => builder,
      limit: () => builder,
      for: () => Promise.resolve(values),
      then: (resolve: (value: unknown[]) => unknown) =>
        Promise.resolve(values).then(resolve),
    };
    return builder;
  };
  const db: any = {
    select: () => ({ from: query }),
    update: () => ({
      set: () => ({ where: async () => void (writes += 1) }),
    }),
    insert: (table: unknown) => ({
      values: async () => {
        if (table === warehouseLocationEvents || table === syncReceipts)
          writes += 1;
      },
    }),
    transaction: async (run: (tx: any) => Promise<unknown>) => run(db),
  };
  return db;
}

beforeEach(() => {
  mode = "normal";
  lockedUser = { ...contextUser };
  writes = 0;
});

describe("authoritative employee lock rejects unsafe warehouse writes", () => {
  it.each([
    ["revoked membership", "revoked" as const, "user", "employee" as const],
    ["disabled employee", "disabled" as const, "user", "employee" as const],
    ["customer account", "normal" as const, "user", "customer" as const],
  ])(
    "rejects %s before a record, event, receipt, or audit write",
    async (_label, nextMode, actualRole, accountType) => {
      mode = nextMode;
      lockedUser = { ...contextUser, role: actualRole, accountType } as User;
      await expect(
        commitWarehouseStorage(fakeDb() as any, contextUser, command)
      ).rejects.toBeDefined();
      expect(writes).toBe(0);
    }
  );

  it("does not let a stale admin context authorize the actual non-admin row", async () => {
    mode = "staleAdmin";
    lockedUser = { ...contextUser, role: "user" };
    const staleAdmin = { ...contextUser, role: "admin" } as User;
    await expect(
      commitWarehouseStorage(fakeDb() as any, staleAdmin, command)
    ).rejects.toBeDefined();
    expect(writes).toBe(0);
  });
});
