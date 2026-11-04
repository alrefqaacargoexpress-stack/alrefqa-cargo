import { describe, expect, it } from "vitest";
import {
  roleWorkspaceTasks,
  groupedWorkspaceTasks,
  splitRoleWorkspaceTasks,
  workspaceSyncStatus,
} from "./roleWorkspace";
import { blankPermissions, defaultPermissions } from "@shared/permissions";

describe("role workspace", () => {
  it("derives tasks from effective permissions rather than role labels", () => {
    const permissions = {
      ...blankPermissions(),
      shipments: "manage" as const,
      shipment_send: "manage" as const,
      tracking: "view" as const,
    };
    expect(
      roleWorkspaceTasks({
        role: "source_warehouse",
        offices: ["dubai"],
        permissions,
      }).map(task => task.id)
    ).toEqual(["new-shipment", "shipments", "tracking"]);
  });
  it("keeps an unassigned employee without operational tasks", () => {
    expect(
      roleWorkspaceTasks({
        role: "staff",
        offices: [],
        permissions: blankPermissions(),
      })
    ).toEqual([]);
  });
  it("puts office and employee management before shipment work for the owner", () => {
    const subject = {
      role: "admin" as const,
      offices: null,
      permissions: null,
    };
    expect(
      roleWorkspaceTasks(subject)
        .slice(0, 3)
        .map(task => task.id)
    ).toEqual(["offices", "employees", "settings"]);
    expect(groupedWorkspaceTasks(subject)[0].id).toBe("management");
  });
  it("prioritizes destination work without exposing source creation or finance", () => {
    const tasks = roleWorkspaceTasks({
      role: "destination_warehouse",
      offices: ["nouakchott"],
    });
    expect(tasks[0].id).toBe("warehouse-arrivals");
    expect(
      tasks.some(
        task =>
          task.id === "new-shipment" ||
          task.group === "finance" ||
          task.group === "sales"
      )
    ).toBe(false);
  });
  it("prioritizes source cost for a general accountant without claiming cash execution", () => {
    const tasks = roleWorkspaceTasks({
      role: "general_accountant",
      offices: ["dubai"],
    });
    expect(tasks[0].id).toBe("shipment-cost");
    expect(
      tasks.some(
        task =>
          task.id === "cash" ||
          task.id === "employees" ||
          task.id === "new-shipment"
      )
    ).toBe(false);
  });
  it("puts invoices first for a cashier and never allows role-based ungranted shortcuts", () => {
    expect(
      roleWorkspaceTasks({ role: "cashier", offices: ["dubai"] })[0].id
    ).toBe("invoices");
    const tasks = roleWorkspaceTasks({
      role: "cashier",
      offices: ["dubai"],
      permissions: blankPermissions(),
    });
    expect(tasks).toEqual([]);
  });
  it("keeps cashier work limited to cash invoices while full accountants get finance first", () => {
    const cashier = defaultPermissions({ role: "cashier", offices: ["dubai"] });
    expect(cashier.invoices).toBe("manage");
    expect(cashier.payments).toBe("manage");
    expect(cashier.expenses).toBe("none");
    expect(
      roleWorkspaceTasks({ role: "cashier", offices: ["dubai"] }).some(
        task => task.id === "cash"
      )
    ).toBe(false);
    expect(
      roleWorkspaceTasks({ role: "accountant", offices: ["dubai"] })[0].id
    ).toBe("cash");
  });
  it("does not mutate a stored permission map when ordering or grouping", () => {
    const permissions = {
      ...blankPermissions(),
      reports: "view" as const,
      tracking: "view" as const,
    };
    const before = JSON.stringify(permissions);
    groupedWorkspaceTasks({ role: "viewer", offices: ["dubai"], permissions });
    expect(JSON.stringify(permissions)).toBe(before);
  });
  it("splits primary tasks and granted overflow", () => {
    const tasks = roleWorkspaceTasks({
      role: "admin",
      offices: null,
      permissions: null,
    });
    const result = splitRoleWorkspaceTasks(tasks, 5);
    expect(result.primary.length).toBeLessThanOrEqual(5);
    expect(result.primary.length + result.more.length).toBe(tasks.length);
  });
  it("reports offline, pending, syncing and review explicitly", () => {
    expect(
      workspaceSyncStatus({
        online: true,
        localOnly: false,
        pendingCount: 0,
        syncing: false,
        conflictCount: 0,
      })
    ).toBe("idle");
    expect(
      workspaceSyncStatus({
        online: true,
        localOnly: false,
        pendingCount: 1,
        syncing: false,
        conflictCount: 0,
      })
    ).toBe("pending");
    expect(
      workspaceSyncStatus({
        online: true,
        localOnly: false,
        pendingCount: 1,
        syncing: true,
        conflictCount: 0,
      })
    ).toBe("syncing");
    expect(
      workspaceSyncStatus({
        online: false,
        localOnly: true,
        pendingCount: 0,
        syncing: false,
        conflictCount: 0,
      })
    ).toBe("offline");
    expect(
      workspaceSyncStatus({
        online: true,
        localOnly: false,
        pendingCount: 0,
        syncing: false,
        conflictCount: 1,
      })
    ).toBe("review");
  });
});
