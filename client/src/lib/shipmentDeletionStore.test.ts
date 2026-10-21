import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_STATE } from "@shared/operations";
import { createPackedShipment } from "@shared/packing";
import { deleteShipment, restoreShipment } from "@shared/shipmentDeletion";
import {
  applySyncResult,
  emptyWorkspace,
  loadWorkspace,
  mergeSnapshot,
  saveWorkspace,
  stageChange,
} from "./offlineStore";
describe("Offline shipment deletion safety", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
    });
    vi.stubGlobal("navigator", {
      locks: {
        request: async (_key: string, callback: () => void) => callback(),
      },
    });
    vi.stubGlobal("crypto", { randomUUID: () => `id-${Math.random()}` });
  });
  const create = () =>
    createPackedShipment({
      tracking: "RF-DEL",
      source: "china",
      pricePerKg: 4,
      pricePerKgMRU: 120,
    });
  it("persists the explicit action and entire archived shipment over a reload", async () => {
    const original = create();
    const pending = stageChange(
      emptyWorkspace(),
      "shipment",
      deleteShipment(original, "User request"),
      "Delete",
      "delete-shipment"
    );
    await saveWorkspace(1, pending);
    const saved = loadWorkspace(1);
    expect(saved.state.shipments).toHaveLength(1);
    expect(saved.state.shipments[0].deleted?.reason).toBe("User request");
    expect(saved.queue[0].action).toBe("delete-shipment");
    expect(saved.state.shipments[0].packing?.pricePerKgMRU).toBe(120);
  });
  it("keeps tombstones on snapshot refresh and conflict without discarding the pending action", () => {
    const original = create();
    const pending = stageChange(
      emptyWorkspace(),
      "shipment",
      deleteShipment(original, "wrong"),
      "Delete",
      "delete-shipment"
    );
    const merged = mergeSnapshot(pending, {
      ...EMPTY_STATE,
      shipments: [{ ...original, version: 2, scope: "shared" }],
    });
    expect(merged.state.shipments[0].deleted).toBeDefined();
    const rejected = applySyncResult(merged, {
      applied: [],
      conflicts: [
        {
          changeId: merged.queue[0].id,
          reason: "version_conflict",
          current: { ...original, version: 2 },
        },
      ],
    });
    expect(rejected.queue[0].action).toBe("delete-shipment");
    expect(rejected.state.shipments[0].deleted).toBeDefined();
  });
  it("replaces an unshared deletion with an explicit restore using the original server version", () => {
    const original = { ...create(), version: 7, scope: "shared" as const };
    const base = {
      ...emptyWorkspace(),
      state: { ...EMPTY_STATE, shipments: [original] },
    };
    const pending = stageChange(
      base,
      "shipment",
      deleteShipment(original, "wrong"),
      "Delete",
      "delete-shipment"
    );
    const undo = stageChange(
      pending,
      "shipment",
      restoreShipment(pending.state.shipments[0]),
      "Restore",
      "restore-shipment"
    );
    expect(undo.queue).toHaveLength(1);
    expect(undo.queue[0].action).toBe("restore-shipment");
    expect(undo.queue[0].expectedVersion).toBe(7);
    expect(undo.state.shipments[0].deleted).toBeUndefined();
  });
  it("acknowledges soft deletion without removing rows, accounts or invoices", () => {
    const original = create();
    const account = {
      id: "A",
      name: "Account",
      phone: "p",
      city: "c",
      shipments: 9,
      balance: 300,
      updatedAt: "now",
    };
    const invoice = {
      id: "I",
      account: "Account",
      amount: 300,
      status: "مدفوعة" as const,
      issuedAt: "now",
    };
    const base = {
      ...emptyWorkspace(),
      state: { ...EMPTY_STATE, accounts: [account], invoices: [invoice] },
    };
    const pending = stageChange(
      base,
      "shipment",
      deleteShipment(original, "wrong"),
      "Delete",
      "delete-shipment"
    );
    const result = applySyncResult(pending, {
      applied: [
        {
          changeId: pending.queue[0].id,
          entity: "shipment",
          record: { ...pending.state.shipments[0], version: 1 },
        },
      ],
      conflicts: [],
    });
    expect(result.state.shipments).toHaveLength(1);
    expect(result.state.shipments[0].deleted).toBeDefined();
    expect(result.state.accounts).toEqual([account]);
    expect(result.state.invoices).toEqual([invoice]);
    expect(result.queue).toEqual([]);
  });
});
