import { describe, expect, it } from "vitest";
import { getTableName } from "drizzle-orm";
import { financeSync } from "./finance";
import { updateOfficePaymentSettings } from "./office";
import { assignPermissionMembership } from "./permissionMemberships";
import { blankPermissions } from "../shared/permissions";

const actor = {
  id: 8,
  openId: "local-test-actor",
  role: "user",
  name: "Actor",
  accountType: "employee",
} as any;
function revokedAtActorLock(
  initialRole: "general_accountant" | "office_manager"
) {
  let role: string = initialRole;
  let writes = 0;
  const trace: string[] = [];
  const db: any = {
    transaction: async (run: any) => run(db),
    insert: () => {
      writes++;
      throw new Error("unexpected write");
    },
    update: () => {
      writes++;
      throw new Error("unexpected write");
    },
    select: () => {
      let table = "";
      const rows = () => {
        if (table === "users") return [actor];
        if (table === "member_roles")
          return [
            {
              userId: actor.id,
              role,
              offices: ["dubai"],
              homeOffice: "dubai",
              version: 3,
              permissions: role === "viewer" ? blankPermissions() : null,
              delegatedBy: null,
              canUpdateTracking: false,
            },
          ];
        return [];
      };
      const query: any = {
        from: (value: any) => {
          table = getTableName(value);
          return query;
        },
        where: () => query,
        limit: () => query,
        for: () => {
          trace.push(`${table}:lock`);
          if (table === "users") role = "viewer";
          return query;
        },
        then: (resolve: any, reject: any) =>
          Promise.resolve(rows()).then(resolve, reject),
      };
      return query;
    },
  };
  return { db, trace, writes: () => writes };
}
function expectAuthoritativeLocks(fake: ReturnType<typeof revokedAtActorLock>) {
  expect(fake.trace[0]).toBe("users:lock");
  expect(fake.trace).toContain("member_roles:lock");
  expect(fake.writes()).toBe(0);
}

describe("revocation observed after actor lock, not an earlier cached scope", () => {
  it("financial HTTP-shaped sync rereads revoked membership before any ledger/cash write", async () => {
    const fake = revokedAtActorLock("general_accountant");
    const result = await financeSync(fake.db, actor, [
      {
        id: "source-cost-command",
        kind: "expense",
        payload: {
          id: "source-cost-entry",
          officeId: "dubai",
          currency: "AED",
          date: "2026-10-24",
          category: "shipment_cost",
          description: "Carrier cost",
          amount: 10,
          shipmentId: "shipment-1",
        },
      } as any,
    ]);
    expect(result.applied).toHaveLength(0);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].code).toBe("shipment_cost_forbidden");
    expectAuthoritativeLocks(fake);
  });
  it("source wallet settings reject revoked permission after user/member locks", async () => {
    const fake = revokedAtActorLock("general_accountant");
    await expect(
      updateOfficePaymentSettings(fake.db, actor, {
        officeId: "dubai",
        methods: [{ id: "cash", label: "Cash", enabled: true }],
        expectedVersion: 0,
      })
    ).rejects.toThrow("office_wallets_forbidden");
    expectAuthoritativeLocks(fake);
  });
  it("office-manager employee grant rejects the revoked manager before target writes", async () => {
    const fake = revokedAtActorLock("office_manager");
    await expect(
      assignPermissionMembership(fake.db, actor, {
        userId: 12,
        role: "accountant",
        offices: ["dubai"],
        homeOffice: "dubai",
        canUpdateTracking: false,
        expectedVersion: 0,
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "employee_management_required",
    });
    expectAuthoritativeLocks(fake);
  });
});
