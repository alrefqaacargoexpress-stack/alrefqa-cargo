import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { memberRoles, users, type User } from "../drizzle/schema";
import { blankPermissions, type PermissionMap } from "../shared/permissions";
import { assignPermissionMembership } from "./permissionMemberships";
import { readOfficeScope } from "./branches";
import { appendAudit } from "./audit";
vi.mock("./audit", () => ({ appendAudit: vi.fn(async () => {}) }));
const dialect = new MySqlDialect();
const root = {
  id: 1,
  openId: "permission-root",
  role: "admin",
  name: "Root",
} as User;
const manager = {
  id: 10,
  openId: "permission-manager",
  role: "user",
  name: "Manager",
  accountType: "employee",
} as User;
const employee = {
  id: 20,
  openId: "permission-employee",
  role: "user",
  name: "Employee",
  accountType: "employee",
} as User;
function fixture() {
  const userRows = [root, manager, employee];
  const ceiling = {
    ...blankPermissions(),
    employees: "manage",
    shipments: "manage",
    tracking: "view",
  } as PermissionMap;
  const rows: any[] = [
    {
      userId: 10,
      role: "office_manager",
      offices: ["dubai"],
      homeOffice: "dubai",
      permissions: ceiling,
      version: 1,
    },
    {
      userId: 20,
      role: "staff",
      offices: ["dubai"],
      homeOffice: "dubai",
      permissions: blankPermissions(),
      version: 1,
    },
  ];
  const idFrom = (condition: any) =>
    dialect.sqlToQuery(condition).params.find(n => typeof n === "number");
  const db: any = {
    select: () => ({
      from: (table: any) => {
        let selected = table === users ? userRows : rows;
        const b: any = {
          where: (c: any) => {
            const id = idFrom(c);
            selected = selected.filter(
              (r: any) => (table === users ? r.id : r.userId) === id
            );
            return b;
          },
          limit: () => b,
          for: () => Promise.resolve(selected),
          then: (f: any) => Promise.resolve(selected).then(f),
        };
        return b;
      },
    }),
    update: () => ({
      set: (values: any) => ({
        where: async (c: any) =>
          Object.assign(
            rows.find(r => r.userId === idFrom(c)),
            values
          ),
      }),
    }),
    insert: () => ({ values: async (values: any) => rows.push(values) }),
    transaction: async (callback: any) => {
      const saved = structuredClone(rows);
      try {
        return await callback(db);
      } catch (error) {
        rows.splice(0, rows.length, ...saved);
        throw error;
      }
    },
  };
  return { db, rows, ceiling };
}
const input = (permissions: PermissionMap) => ({
  userId: 20,
  role: "staff" as const,
  offices: ["dubai" as const],
  homeOffice: "dubai" as const,
  expectedVersion: 1,
  permissions,
});
describe("Scoped delegation and revocation", () => {
  beforeEach(() => vi.clearAllMocks());
  it("lets the general manager choose a full explicit matrix", async () => {
    const f = fixture();
    const permissions = { ...blankPermissions(), shipments: "view" as const };
    const result = await assignPermissionMembership(
      f.db,
      root,
      input(permissions)
    );
    expect(result.permissions.shipments).toBe("view");
    expect(result.delegatedBy).toBeNull();
    expect(result.version).toBe(2);
  });
  it("preserves legacy partial maps while defaulting newly introduced keys to none", async () => {
    const f = fixture();
    const result = await assignPermissionMembership(f.db, root, {
      ...input({ shipments: "view" } as PermissionMap),
      permissions: { shipments: "view" },
    } as any);
    expect(result.permissions.shipments).toBe("view");
    expect(result.permissions.invoice_void).toBe("none");
    expect(result.permissions.entry_void).toBe("none");
    expect(result.permissions.employee_disable).toBe("none");
  });
  it("lets a manager delegate only existing capabilities to their own employee", async () => {
    const f = fixture();
    const result = await assignPermissionMembership(
      f.db,
      manager,
      input({ ...blankPermissions(), shipments: "manage" })
    );
    expect(result.delegatedBy).toBe(manager.id);
    expect(appendAudit).toHaveBeenCalledWith(
      f.db,
      expect.objectContaining({
        actor: expect.objectContaining({ role: "office_manager" }),
      })
    );
  });
  it("rejects a write grant above the manager's view ceiling", async () => {
    const f = fixture();
    await expect(
      assignPermissionMembership(
        f.db,
        manager,
        input({ ...blankPermissions(), tracking: "manage" })
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.rows[1].version).toBe(1);
    expect(appendAudit).not.toHaveBeenCalled();
  });
  it("rejects another office, self editing and creating a manager", async () => {
    const f = fixture();
    for (const bad of [
      { ...input(blankPermissions()), offices: ["china"], homeOffice: "china" },
      { ...input(blankPermissions()), userId: 10 },
      { ...input(blankPermissions()), role: "office_manager" },
    ])
      await expect(
        assignPermissionMembership(f.db, manager, bad as any)
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("clamps delegated capabilities after the granting manager is revoked without rewriting employee data", async () => {
    const f = fixture();
    await assignPermissionMembership(
      f.db,
      manager,
      input({ ...blankPermissions(), shipments: "manage" })
    );
    f.rows[0].permissions.shipments = "none";
    const effective = await readOfficeScope(f.db, employee);
    expect(effective.permissions?.shipments).toBe("none");
    expect(f.rows[1].permissions.shipments).toBe("manage");
  });
  it("denies a stale delegation once the manager moves offices", async () => {
    const f = fixture();
    f.rows[1].delegatedBy = 10;
    f.rows[1].permissions = { ...blankPermissions(), shipments: "manage" };
    f.rows[0].offices = ["china"];
    f.rows[0].homeOffice = "china";
    expect((await readOfficeScope(f.db, employee)).permissions?.shipments).toBe(
      "none"
    );
  });
  it("never grants the global office-assignment permission to a non-root account", async () => {
    const f = fixture();
    await expect(
      assignPermissionMembership(
        f.db,
        root,
        input({ ...blankPermissions(), office_assign: "manage" })
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("rolls back grants when the audit write fails", async () => {
    const f = fixture();
    vi.mocked(appendAudit).mockRejectedValueOnce(
      new Error("Audit unavailable")
    );
    await expect(
      assignPermissionMembership(
        f.db,
        manager,
        input({ ...blankPermissions(), shipments: "manage" })
      )
    ).rejects.toThrow("Audit unavailable");
    expect(f.rows[1].version).toBe(1);
    expect(f.rows[1].delegatedBy).toBeUndefined();
  });
  it("assigns an office manager's necessary settings automatically from role and office", async () => {
    const f = fixture();
    f.rows[1].permissions = null;
    const result = await assignPermissionMembership(f.db, root, {
      userId: 20,
      role: "office_manager",
      offices: ["dubai"],
      expectedVersion: 1,
    });
    expect(result.permissions.office_settings).toBe("manage");
    expect(result.permissions.office_assign).toBe("none");
  });
  it("clamps automatic role defaults to a manager's ceiling without manual flags", async () => {
    const f = fixture();
    f.rows[1].permissions = null;
    const result = await assignPermissionMembership(f.db, manager, {
      userId: 20,
      role: "source_warehouse",
      offices: ["dubai"],
      expectedVersion: 1,
    });
    expect(result.permissions.shipments).toBe("manage");
    expect(result.permissions.shipment_send).toBe("none");
    expect(result.permissions.tracking).toBe("view");
    expect(result.delegatedBy).toBe(manager.id);
  });
  it("does not erase an existing explicit denial on unchanged-role automatic save", async () => {
    const f = fixture();
    const result = await assignPermissionMembership(f.db, root, {
      userId: 20,
      role: "staff",
      offices: ["dubai"],
      expectedVersion: 1,
    });
    expect(result.permissions.shipments).toBe("none");
    expect(result.permissions.shipment_send).toBe("none");
  });
  it("retains explicit denials after automatic role change", async () => {
    const f = fixture();
    const result = await assignPermissionMembership(f.db, root, {
      userId: 20,
      role: "source_warehouse",
      offices: ["dubai"],
      expectedVersion: 1,
    });
    expect(result.permissions.shipments).toBe("none");
    expect(result.permissions.shipment_send).toBe("none");
  });
  it("does not carry finance-management privileges into a viewer downgrade", async () => {
    const f = fixture();
    f.rows[1].role = "accountant";
    f.rows[1].permissions = {
      ...blankPermissions(),
      invoices: "manage",
      expenses: "manage",
    };
    const result = await assignPermissionMembership(f.db, root, {
      userId: 20,
      role: "viewer",
      offices: ["dubai"],
      expectedVersion: 1,
    });
    expect(result.permissions.invoices).not.toBe("manage");
    expect(result.permissions.expenses).not.toBe("manage");
  });
});
