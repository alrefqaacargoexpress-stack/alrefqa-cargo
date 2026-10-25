import { beforeEach, describe, expect, it, vi } from "vitest";
import { AutoSyncCoordinator } from "./autoSync";

beforeEach(() => {
  vi.stubGlobal("navigator", { onLine: true });
});

describe("AutoSyncCoordinator", () => {
  it("coalesces concurrent tab requests and runs operations before finance", async () => {
    const coordinator = new AutoSyncCoordinator();
    coordinator.setSession("7", true, "scope-a");
    const order: string[] = [];
    let resolveOperations!: () => void;
    const operationsDone = new Promise<void>(
      resolve => (resolveOperations = resolve)
    );
    const operations = vi.fn(async () => {
      order.push("operations");
      await operationsDone;
      return { applied: [], conflicts: [] };
    });
    const finance = vi.fn(async () => {
      order.push("finance");
      return { applied: [], conflicts: [] };
    });
    coordinator.registerOperations({
      userId: "7",
      authReady: true,
      online: true,
      pending: () => [],
      sync: operations,
    });
    coordinator.registerFinance({
      userId: "7",
      authReady: true,
      online: true,
      pending: () => [],
      sync: finance,
    });
    const first = coordinator.request("local-save");
    const second = coordinator.request("focus");
    resolveOperations();
    await Promise.all([first, second]);
    expect(operations).toHaveBeenCalledTimes(1);
    expect(finance).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["operations", "finance"]);
  });

  it("drops later stages when the authenticated account changes in flight", async () => {
    const coordinator = new AutoSyncCoordinator();
    coordinator.setSession("7", true, "scope-a");
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    const finance = vi.fn(async () => ({ applied: [], conflicts: [] }));
    coordinator.registerOperations({
      userId: "7",
      authReady: true,
      online: true,
      pending: () => [],
      sync: async () => {
        await gate;
        return { applied: [], conflicts: [] };
      },
    });
    coordinator.registerFinance({
      userId: "7",
      authReady: true,
      online: true,
      pending: () => [],
      sync: finance,
    });
    const run = coordinator.request("auth-ready");
    coordinator.setSession("8", true, "scope-b");
    release();
    await run;
    expect(finance).not.toHaveBeenCalled();
  });

  it("keeps a warehouse request id stable while unrelated requests remain eligible", async () => {
    const coordinator = new AutoSyncCoordinator();
    coordinator.setSession("7", true, "scope-a");
    const requestIds = ["warehouse-request-a", "warehouse-request-b"];
    const sync = vi.fn(async () => requestIds);
    coordinator.registerWarehouse({
      userId: "7",
      authReady: true,
      online: true,
      pending: () =>
        requestIds.map(requestId => ({
          requestId,
          shipmentId: requestId,
          goodsId: requestId,
          warehouse: "W",
          shelf: "S",
          expectedVersion: 1,
          createdAt: new Date().toISOString(),
        })),
      sync,
    });
    const result = await coordinator.request("online");
    expect(result.warehouseApplied).toEqual(requestIds);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(coordinator.getState().warehouseCount).toBe(2);
  });

  it("does not retry a review error and exposes review status", async () => {
    const coordinator = new AutoSyncCoordinator();
    coordinator.setSession("7", true, "scope-a");
    coordinator.registerOperations({
      userId: "7",
      authReady: true,
      online: true,
      pending: () => [],
      sync: async () => {
        throw new Error("FORBIDDEN");
      },
    });
    await expect(coordinator.request("online")).rejects.toThrow("FORBIDDEN");
    expect(coordinator.getState().status).toBe("review");
  });

  it("keeps a conflicted operation blocked while an unrelated pending record proceeds", async () => {
    const coordinator = new AutoSyncCoordinator();
    coordinator.setSession("7", false, "scope-a");
    const pending = [
      { id: "change-a", entity: "account" as const, recordId: "a" },
      { id: "change-b", entity: "account" as const, recordId: "b" },
    ];
    const sync = vi.fn(
      async (selection?: Array<{ entity: "account"; recordId: string }>) =>
        selection?.some(item => item.recordId === "a")
          ? {
              applied: [],
              conflicts: [
                { changeId: "change-a", reason: "version", current: null },
              ],
            }
          : { applied: [], conflicts: [] }
    );
    coordinator.registerOperations({
      userId: "7",
      authReady: true,
      online: true,
      pending: () => pending as never,
      sync,
    });

    coordinator.setSession("7", true, "scope-a");
    await new Promise(resolve => setTimeout(resolve, 0));
    await coordinator.request("focus");

    expect(sync).toHaveBeenCalledTimes(2);
    expect(sync.mock.calls[1]?.[0]).toEqual([
      { entity: "account", recordId: "b" },
    ]);
    expect(coordinator.getState().status).toBe("review");
  });

  it("requests a run on the false-to-true auth edge for the same user and scope", async () => {
    const coordinator = new AutoSyncCoordinator();
    const sync = vi.fn(async () => ({ applied: [], conflicts: [] }));
    coordinator.setSession("7", false, "scope-a");
    coordinator.registerOperations({
      userId: "7",
      authReady: true,
      online: true,
      pending: () => [],
      sync,
    });
    coordinator.setSession("7", true, "scope-a");
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("keeps the root adapter after a later widget adapter unregisters", async () => {
    const coordinator = new AutoSyncCoordinator();
    coordinator.setSession("7", true, "scope-a");
    const rootSync = vi.fn(async () => ({ applied: [], conflicts: [] }));
    const widgetSync = vi.fn(async () => ({ applied: [], conflicts: [] }));
    const adapter = (sync: typeof rootSync) => ({
      userId: "7",
      scopeFingerprint: "scope-a",
      authReady: true,
      online: true,
      pending: () => [],
      sync,
    });

    coordinator.registerOperations(adapter(rootSync));
    const unregisterWidget = coordinator.registerOperations(
      adapter(widgetSync)
    );
    unregisterWidget();

    await coordinator.request("manual");

    expect(rootSync).toHaveBeenCalledTimes(1);
    expect(widgetSync).not.toHaveBeenCalled();
  });

  it("does not select an old same-user adapter after the scope changes", async () => {
    const coordinator = new AutoSyncCoordinator();
    coordinator.setSession("7", false, "scope-a");
    const oldSync = vi.fn(async () => ({ applied: [], conflicts: [] }));
    const newSync = vi.fn(async () => ({ applied: [], conflicts: [] }));

    coordinator.registerOperations({
      userId: "7",
      scopeFingerprint: "scope-a",
      authReady: true,
      online: true,
      pending: () => [],
      sync: oldSync,
    });
    coordinator.setSession("7", true, "scope-a");
    await coordinator.request("manual");
    oldSync.mockClear();
    coordinator.setSession("7", false, "scope-b");
    coordinator.registerOperations({
      userId: "7",
      scopeFingerprint: "scope-b",
      authReady: true,
      online: true,
      pending: () => [],
      sync: newSync,
    });
    coordinator.setSession("7", true, "scope-b");

    await coordinator.request("manual");

    expect(oldSync).not.toHaveBeenCalled();
    expect(newSync).toHaveBeenCalledTimes(1);
  });
});
