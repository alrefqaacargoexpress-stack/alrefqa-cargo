import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_STATE } from "@shared/operations";
import {
  addPackingGoods,
  createPackedShipment,
  deletePackingGoods,
  packingTotalsMRU,
  restorePackingGoods,
} from "@shared/packing";
import {
  applySyncResult,
  emptyWorkspace,
  loadWorkspace,
  mergeSnapshot,
  saveWorkspace,
  stageChange,
} from "./offlineStore";
describe("Persistent packing corrections", () => {
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
    addPackingGoods(
      createPackedShipment({
        tracking: "RF-X",
        source: "china",
        pricePerKg: 4,
        pricePerKgMRU: 120,
      }),
      { name: "Brand", phone: "", unitWeight: 2, pieces: 3 }
    );
  it("saves tombstones and MRU through reload without implicitly deleting shared or legacy data", async () => {
    const original = create();
    const removed = deletePackingGoods(
      original,
      original.packing.cartons[0].goods[0].id,
      "wrong entry"
    );
    const first = stageChange(
      emptyWorkspace(),
      "shipment",
      removed,
      "delete wrong"
    );
    await saveWorkspace(1, first);
    const restored = loadWorkspace(1);
    expect(
      restored.state.shipments[0].packing?.cartons[0].goods[0].deleted?.reason
    ).toBe("wrong entry");
    expect(restored.state.shipments[0].packing?.pricePerKgMRU).toBe(120);
    expect(restored.queue).toHaveLength(1);
    const merged = mergeSnapshot(restored, {
      ...EMPTY_STATE,
      shipments: [{ ...original, scope: "shared", version: 1 }],
    });
    expect(
      merged.state.shipments[0].packing?.cartons[0].goods[0].deleted
    ).toBeDefined();
    expect(merged.queue).toHaveLength(1);
  });
  it("keeps a rejected correction pending and restores the exact quantities after a later undo", async () => {
    const original = create();
    const removed = deletePackingGoods(
      original,
      original.packing.cartons[0].goods[0].id,
      "wrong"
    );
    const first = stageChange(emptyWorkspace(), "shipment", removed, "delete");
    await saveWorkspace(1, first);
    const conflicted = applySyncResult(first, {
      applied: [],
      conflicts: [
        {
          changeId: first.queue[0].id,
          reason: "version_conflict",
          current: { ...original, version: 2 },
        },
      ],
    });
    await saveWorkspace(1, conflicted);
    expect(loadWorkspace(1).queue).toHaveLength(1);
    const corrected = restorePackingGoods(
      removed,
      original.packing.cartons[0].goods[0].id
    );
    const final = stageChange(conflicted, "shipment", corrected, "restore");
    await saveWorkspace(1, final);
    const stored = loadWorkspace(1);
    expect(
      stored.state.shipments[0].packing?.cartons[0].goods[0].deleted
    ).toBeUndefined();
    expect(packingTotalsMRU(stored.state.shipments[0].packing!)?.amount).toBe(
      2 * 3 * 120
    );
    expect(stored.queue).toHaveLength(1);
  });
});
