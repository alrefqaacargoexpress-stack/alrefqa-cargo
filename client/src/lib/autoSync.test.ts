import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutoSyncCoordinator, setTransportLockTestHooks } from "./autoSync";

beforeEach(() => {
  vi.stubGlobal("navigator", { onLine: true });
});

afterEach(() => {
  setTransportLockTestHooks(null);
});

function fakeLeaseDb(records: Map<string, unknown>): IDBDatabase {
  return {
    transaction: () => {
      const tx = {
        error: null,
        onabort: null as (() => void) | null,
        oncomplete: null as (() => void) | null,
        onerror: null as (() => void) | null,
        objectStore: () => ({
          delete: (key: string) => records.delete(key),
          get: (key: string) => {
            const request = {
              result: records.get(key),
              onsuccess: null as (() => void) | null,
            };
            queueMicrotask(() => {
              request.onsuccess?.();
              queueMicrotask(() => tx.oncomplete?.());
            });
            return request;
          },
          put: (value: { key: string }) => records.set(value.key, value),
        }),
      };
      return tx;
    },
  } as unknown as IDBDatabase;
}

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

  it("blocks the attempted operation after a real forbidden RPC until scope changes", async () => {
    const coordinator = new AutoSyncCoordinator();
    coordinator.setSession("7", true, "scope-a");
    const pending = [
      { id: "change-a", entity: "account" as const, recordId: "a" },
    ];
    const sync = vi.fn(async () => {
      if (sync.mock.calls.length === 1)
        throw { data: { code: "FORBIDDEN" }, message: "غير مصرح" };
      return { applied: [], conflicts: [] };
    });
    const adapter = {
      userId: "7",
      scopeFingerprint: "scope-a",
      authReady: true,
      online: true,
      pending: () => pending,
      sync,
    };
    coordinator.registerOperations(adapter);

    await expect(coordinator.request("online")).rejects.toThrow("FORBIDDEN");
    await coordinator.request("focus");
    await coordinator.request("online");
    expect(sync).toHaveBeenCalledTimes(1);

    adapter.scopeFingerprint = "scope-b";
    coordinator.setSession("7", true, "scope-b");
    await coordinator.request("focus");
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it("blocks the attempted finance command after a forbidden RPC until scope changes", async () => {
    const coordinator = new AutoSyncCoordinator();
    coordinator.setSession("7", true, "scope-a");
    const pending = [{ id: "finance-a" }] as never;
    const sync = vi.fn(async () => {
      if (sync.mock.calls.length === 1)
        throw { data: { code: "FORBIDDEN" }, message: "غير مصرح" };
      return { applied: [], conflicts: [] };
    });
    const adapter = {
      userId: "7",
      scopeFingerprint: "scope-a",
      authReady: true,
      online: true,
      pending: () => pending,
      sync,
    };
    coordinator.registerFinance(adapter);

    await expect(coordinator.request("online")).rejects.toThrow("FORBIDDEN");
    await coordinator.request("focus");
    expect(sync).toHaveBeenCalledTimes(1);

    adapter.scopeFingerprint = "scope-b";
    coordinator.setSession("7", true, "scope-b");
    await coordinator.request("focus");
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it("holds a forbidden warehouse stage until the scope changes", async () => {
    const coordinator = new AutoSyncCoordinator();
    coordinator.setSession("7", true, "scope-a");
    const sync = vi.fn(async () => {
      if (sync.mock.calls.length === 1)
        throw { data: { code: "FORBIDDEN" }, message: "غير مصرح" };
      return ["warehouse-a"];
    });
    const adapter = {
      userId: "7",
      scopeFingerprint: "scope-a",
      authReady: true,
      online: true,
      pending: () => [
        {
          requestId: "warehouse-a",
          shipmentId: "shipment-a",
          goodsId: "goods-a",
          warehouse: "W",
          shelf: "S",
          expectedVersion: 1,
          createdAt: new Date().toISOString(),
        },
      ],
      sync,
    };
    coordinator.registerWarehouse(adapter);

    await expect(coordinator.request("online")).rejects.toThrow("FORBIDDEN");
    await coordinator.request("focus");
    expect(sync).toHaveBeenCalledTimes(1);

    adapter.scopeFingerprint = "scope-b";
    coordinator.setSession("7", true, "scope-b");
    await coordinator.request("focus");
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it("holds all sends after unauthorized until the same user reauthenticates", async () => {
    const coordinator = new AutoSyncCoordinator();
    coordinator.setSession("7", true, "scope-a");
    const sync = vi.fn(async () => {
      if (sync.mock.calls.length === 1)
        throw { data: { code: "UNAUTHORIZED" }, message: "انتهت الجلسة" };
      return { applied: [], conflicts: [] };
    });
    coordinator.registerOperations({
      userId: "7",
      scopeFingerprint: "scope-a",
      authReady: true,
      online: true,
      pending: () => [
        { id: "change-a", entity: "account" as const, recordId: "a" },
      ],
      sync,
    });

    await expect(coordinator.request("online")).rejects.toThrow("UNAUTHORIZED");
    await coordinator.request("focus");
    expect(sync).toHaveBeenCalledTimes(1);

    coordinator.setSession("7", false, "scope-a");
    coordinator.setSession("7", true, "scope-a");
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(sync).toHaveBeenCalledTimes(2);
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

  it("blocks only the rejected tracking request while unrelated work proceeds", async () => {
    const coordinator = new AutoSyncCoordinator();
    coordinator.setSession("7", true, "scope-a");
    const items = [
      {
        requestId: "tracking-a",
        shipmentId: "shipment-a",
        expectedVersion: 1,
        command: { type: "note", text: "first" },
      },
      {
        requestId: "tracking-b",
        shipmentId: "shipment-b",
        expectedVersion: 1,
        command: { type: "note", text: "second" },
      },
    ];
    const sync = vi.fn(async (selection?: string[]) => {
      if (selection?.[0] === "tracking-a")
        return {
          applied: [],
          conflicts: [
            {
              requestId: "tracking-a",
              kind: "blocked",
              message: "tracking_forbidden",
            },
          ],
          attempted: 1,
          pending: 2,
          network: false,
          blocked: true,
        };
      items.splice(1, 1);
      return {
        applied: [
          { requestId: "tracking-b", shipmentId: "shipment-b", version: 2 },
        ],
        conflicts: [],
        attempted: 1,
        pending: 1,
        network: false,
        blocked: false,
      };
    });
    coordinator.registerTracking({
      userId: "7",
      scopeFingerprint: "scope-a",
      authReady: true,
      online: true,
      pending: () => items.length,
      pendingItems: () => items,
      sync,
    });

    await coordinator.request("manual");
    await coordinator.request("focus");
    await coordinator.request("focus");

    expect(sync.mock.calls.map(call => call[0])).toEqual([
      ["tracking-a", "tracking-b"],
      ["tracking-b"],
    ]);
  });

  it("unblocks tracking when payload, version, scope, or explicit review changes", async () => {
    const coordinator = new AutoSyncCoordinator();
    coordinator.setSession("7", true, "scope-a");
    const item = {
      requestId: "tracking-a",
      shipmentId: "shipment-a",
      expectedVersion: 1,
      command: { type: "note", text: "first" },
    };
    const sync = vi.fn(async (selection?: string[]) => ({
      applied: [],
      conflicts: selection?.length
        ? [
            {
              requestId: "tracking-a",
              kind: "blocked" as const,
              message: "tracking_forbidden",
            },
          ]
        : [],
      attempted: 1,
      pending: 1,
      network: false,
      blocked: Boolean(selection?.length),
    }));
    const adapter = {
      userId: "7",
      scopeFingerprint: "scope-a",
      authReady: true,
      online: true,
      pending: () => 1,
      pendingItems: () => [item],
      sync,
    };
    coordinator.registerTracking(adapter);

    await coordinator.request("manual");
    await coordinator.request("focus");
    item.command = { type: "note", text: "changed" };
    await coordinator.request("focus");
    item.expectedVersion = 2;
    await coordinator.request("focus");
    await coordinator.request("manual", { trackingSelection: ["tracking-a"] });

    expect(sync).toHaveBeenCalledTimes(4);
    expect(sync.mock.calls.map(call => call[0])).toEqual([
      ["tracking-a"],
      ["tracking-a"],
      ["tracking-a"],
      ["tracking-a"],
    ]);

    coordinator.setSession("7", true, "scope-b");
    const scopeAdapter = { ...adapter, scopeFingerprint: "scope-b" };
    coordinator.registerTracking(scopeAdapter);
    await coordinator.request("manual");
    expect(sync).toHaveBeenCalledTimes(5);
  });

  it("stops later stages after lease loss and lets in-flight work settle", async () => {
    const records = new Map<string, unknown>();
    setTransportLockTestHooks({
      openDb: async () => fakeLeaseDb(records),
      leaseTtlMs: 100,
      heartbeatMs: 1,
    });
    const coordinator = new AutoSyncCoordinator();
    coordinator.setSession("7", true, "scope-a");
    let workSettled = false;
    const operations = vi.fn(async () => {
      for (const key of records.keys())
        records.set(key, {
          key,
          owner: "another-tab",
          expiresAt: Date.now() + 100,
        });
      await new Promise(resolve => setTimeout(resolve, 8));
      workSettled = true;
      return { applied: [], conflicts: [] };
    });
    const finance = vi.fn(async () => ({ applied: [], conflicts: [] }));
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

    await expect(coordinator.request("manual")).rejects.toThrow(
      "TRANSPORT_LOCK_LOST"
    );
    expect(workSettled).toBe(true);
    expect(finance).not.toHaveBeenCalled();
  });
});
