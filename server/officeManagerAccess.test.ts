import { defaultPermissions, type PermissionMap } from "@shared/permissions";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { users, memberRoles, records } from "../drizzle/schema";
import { appRouter } from "./routers";
const state = vi.hoisted(() => ({
  offices: ["dubai"] as string[] | null,
  homeOffice: "dubai" as string | null,
  transaction: vi.fn(),
  permissions: null as PermissionMap | null,
}));
const officeAccount = (office: string) => ({
  entity: "account",
  recordId: `A-${office}`,
  version: 1,
  data: {
    id: `A-${office}`,
    name: office,
    phone: "",
    city: "",
    shipments: 0,
    balance: 20,
    officeId: office,
    updatedAt: "now",
  },
});
const rows = [
  officeAccount("dubai"),
  officeAccount("china"),
  {
    entity: "shipment",
    recordId: "S-China",
    version: 1,
    data: {
      id: "S-China",
      tracking: "S-China",
      officeId: "china",
      journey: { branch: "dubai" },
      amount: 20,
    },
  },
];
vi.mock("./db", () => ({
  getDb: async () => {
    const db = {
      select: () => ({
        from: (table: unknown) => {
          const data =
            table === users
              ? [
                  {
                    id: 8,
                    openId: "branch-test",
                    name: "Office manager",
                    email: "manager@example.test",
                    loginMethod: "email",
                    accountType: "employee",
                    role: "user",
                    passwordHash: "configured-hash",
                    mustChangePassword: false,
                  },
                ]
              : table === memberRoles
                ? [
                    {
                      role: "office_manager",
                      offices: state.offices,
                      homeOffice: state.homeOffice,
                      version: 1,
                      permissions: state.permissions,
                    },
                  ]
                : table === records
                  ? rows
                  : [];
          const builder: any = {
            where: () => builder,
            limit: () => builder,
            for: () => builder,
            then: (resolve: any, reject: any) =>
              Promise.resolve(data).then(resolve, reject),
          };
          return builder;
        },
      }),
      transaction: state.transaction,
    };
    state.transaction.mockImplementation(async (callback: any) => callback(db));
    return db;
  },
}));
function caller() {
  return appRouter.createCaller({
    user: {
      id: 8,
      openId: "branch-test",
      role: "user",
      name: "Office manager",
      email: "manager@example.test",
      loginMethod: "email",
      accountType: "employee",
      passwordHash: "configured-hash",
      mustChangePassword: false,
    },
    req: { headers: {} },
    res: { setHeader: vi.fn() },
  } as never);
}
beforeEach(() => {
  state.offices = ["dubai"];
  state.homeOffice = "dubai";
  state.transaction.mockClear();
  state.permissions = null;
});
describe("Office manager API enforcement", () => {
  it("exposes only own office records, not cargo from another origin passing through it", async () => {
    const result = await caller().operations.snapshot();
    expect(result.accounts.map(account => account.id)).toEqual(["A-dubai"]);
    expect(result.shipments).toEqual([]);
  });
  it("reports its locked role and office", async () => {
    expect(await caller().operations.access()).toMatchObject({
      role: "office_manager",
      offices: ["dubai"],
      homeOffice: "dubai",
    });
  });
  it("fails closed for null, multiple or unsupported office assignments", async () => {
    for (const offices of [null, [], ["dubai", "china"], ["unknown"]]) {
      state.offices = offices;
      state.homeOffice = offices?.[0] ?? null;
      expect(await caller().operations.access()).toMatchObject({
        role: "office_manager",
        offices: [],
      });
      expect((await caller().operations.snapshot()).accounts).toEqual([]);
    }
  });
  it("cannot list or reassign employee privileges after management is revoked", async () => {
    state.permissions = {
      ...defaultPermissions({ role: "office_manager", offices: ["dubai"] }),
      employees: "none",
    };
    await expect(caller().branches.members()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller().operations.members()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller().branches.assignMember({
        userId: 8,
        role: "office_manager",
        offices: ["china"],
        homeOffice: "china",
        expectedVersion: 1,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.transaction).toHaveBeenCalledTimes(1);
  });
  it("cannot reset another account's password or enroll itself as general manager", async () => {
    await expect(
      caller().operations.resetPassword({
        userId: 7,
        temporaryPassword: "temporary-test-1234",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller().auth.configureEmail({ password: "temporary-test-1234" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it("cannot open other office dashboards or edit other office profiles", async () => {
    await expect(
      caller().branches.dashboard({ officeId: "china" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller().branches.update({
        officeId: "china",
        address: "",
        phone: "",
        timezone: "Asia/Shanghai",
        gps: null,
        hours: [],
        employees: [],
        expectedVersion: 0,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it("cannot transfer shipments", async () => {
    await expect(
      caller().tracking.commit({
        shipmentId: "S1",
        expectedVersion: 1,
        requestId: "R1",
        command: { type: "transfer", branch: "china", reason: "test" },
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.transaction).not.toHaveBeenCalled();
  });

  it("reads its own Dubai wallet but rejects other offices and wallet updates", async () => {
    expect(await caller().office.get()).toMatchObject({ office: "dubai" });
    await expect(
      caller().office.get({ officeId: "china" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller().office.update({
        office: "dubai",
        methods: [
          { id: "cash", label: "Cash", enabled: true, showToCustomers: true },
        ],
        expectedVersion: 0,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
