import { describe, expect, it } from "vitest";
import { roleWorkspaceTasks, splitRoleWorkspaceTasks, workspaceSyncStatus } from "./roleWorkspace";
import { blankPermissions } from "@shared/permissions";

describe("role workspace", () => {
  it("derives compact tasks from effective permissions rather than role labels", () => {
    const permissions = blankPermissions();
    permissions.shipments = "manage";
    permissions.shipment_send = "manage";
    permissions.tracking = "view";
    const tasks = roleWorkspaceTasks({
      role: "source_warehouse",
      offices: ["dubai"],
      permissions,
    });
    expect(tasks.map(task => task.id)).toEqual(["new-shipment", "shipments", "tracking"]);
  });

  it("keeps an unassigned employee without operational tasks", () => {
    expect(roleWorkspaceTasks({ role: "staff", offices: [], permissions: blankPermissions() })).toEqual([]);
  });

  it("splits primary tasks and granted overflow", () => {
    const tasks = roleWorkspaceTasks({ role: "admin", offices: null, permissions: null });
    const result = splitRoleWorkspaceTasks(tasks, 5);
    expect(result.primary.length).toBeLessThanOrEqual(5);
    expect(result.primary.length + result.more.length).toBe(tasks.length);
  });

  it("reports offline, pending, syncing and review explicitly", () => {
    expect(workspaceSyncStatus({ online: true, localOnly: false, pendingCount: 0, syncing: false, conflictCount: 0 })).toBe("idle");
    expect(workspaceSyncStatus({ online: true, localOnly: false, pendingCount: 1, syncing: false, conflictCount: 0 })).toBe("pending");
    expect(workspaceSyncStatus({ online: true, localOnly: false, pendingCount: 1, syncing: true, conflictCount: 0 })).toBe("syncing");
    expect(workspaceSyncStatus({ online: false, localOnly: true, pendingCount: 0, syncing: false, conflictCount: 0 })).toBe("offline");
    expect(workspaceSyncStatus({ online: true, localOnly: false, pendingCount: 0, syncing: false, conflictCount: 1 })).toBe("review");
  });
});
