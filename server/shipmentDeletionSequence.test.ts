import { describe, expect, it, vi } from "vitest";
import { createPackedShipment, addPackingGoods } from "@shared/packing";
import { deleteShipment, restoreShipment } from "@shared/shipmentDeletion";
import { EMPTY_STATE, type Shipment } from "@shared/operations";
import {
  applyChangeInMemory,
  parseChange,
  prepareRecordForWrite,
} from "./operations";
import {
  emptyWorkspace,
  stageChange,
  applySyncResult,
} from "../client/src/lib/offlineStore";
const create = () =>
  createPackedShipment({
    tracking: "SEQ",
    source: "china",
    pricePerKg: 4,
    pricePerKgMRU: 120,
  });
describe("Immutable explicit actions with pending cargo edits", () => {
  it("rejects changing a live shipment field under a delete action", () => {
    const original = create();
    const forged = deleteShipment(original, "wrong");
    forged.account = "forged";
    expect(() =>
      prepareRecordForWrite("admin", forged, original, "delete-shipment")
    ).toThrow("shipment_action_content_change_forbidden");
  });
  it("allows cancellation of an unshared deletion only with unchanged current content", () => {
    const original = create();
    const restore = restoreShipment(deleteShipment(original, "wrong"));
    restore.account = "forged";
    expect(() =>
      prepareRecordForWrite("admin", restore, original, "restore-shipment")
    ).toThrow("shipment_action_content_change_forbidden");
  });
  it("does not coalesce a shared cargo edit away while archiving it offline", () => {
    vi.stubGlobal("crypto", { randomUUID: () => `change-${Math.random()}` });
    const original = { ...create(), version: 7, scope: "shared" as const };
    const base = {
      ...emptyWorkspace(),
      state: { ...EMPTY_STATE, shipments: [original] },
    };
    const edited = addPackingGoods(original, {
      name: "Brand",
      phone: "",
      unitWeight: 2,
      pieces: 3,
    });
    const draft = stageChange(base, "shipment", edited, "Add cargo");
    const archive = stageChange(
      draft,
      "shipment",
      deleteShipment(edited, "wrong"),
      "Delete",
      "delete-shipment"
    );
    expect(archive.queue).toHaveLength(2);
    expect(archive.queue.map(c => c.expectedVersion)).toEqual([7, 8]);
    const rows = new Map([
      [
        `shipment:${original.id}`,
        {
          entity: "shipment" as const,
          recordId: original.id,
          version: 7,
          data: original,
        },
      ],
    ]);
    const first = applyChangeInMemory(
      rows,
      parseChange(archive.queue[0]),
      "admin"
    );
    const second = applyChangeInMemory(
      first.nextState,
      parseChange(archive.queue[1]),
      "admin"
    );
    expect(first.result.applied).toHaveLength(1);
    expect(second.result.applied).toHaveLength(1);
    const record = second.result.applied[0].record as Shipment;
    expect(record.deleted).toBeDefined();
    expect(record.packing?.cartons[0].goods[0].name).toBe("Brand");
    expect(record.amount).toBe(24);
    expect(second.nextState.size).toBe(1);
    const ack = applySyncResult(archive, {
      applied: [...first.result.applied, ...second.result.applied],
      conflicts: [],
    });
    expect(ack.queue).toEqual([]);
    expect(ack.state.shipments[0].deleted).toBeDefined();
  });
  it("preserves the same upsert when an unshared archive is canceled before its batch is sent", () => {
    vi.stubGlobal("crypto", { randomUUID: () => `change-${Math.random()}` });
    const original = { ...create(), version: 7, scope: "shared" as const };
    const base = {
      ...emptyWorkspace(),
      state: { ...EMPTY_STATE, shipments: [original] },
    };
    const edited = addPackingGoods(original, {
      name: "Brand",
      phone: "",
      unitWeight: 2,
      pieces: 3,
    });
    const draft = stageChange(base, "shipment", edited, "Add cargo");
    const archived = stageChange(
      draft,
      "shipment",
      deleteShipment(edited, "wrong"),
      "Delete",
      "delete-shipment"
    );
    const undo = stageChange(
      archived,
      "shipment",
      restoreShipment(archived.state.shipments[0]),
      "Restore",
      "restore-shipment"
    );
    expect(undo.queue).toHaveLength(2);
    expect(undo.queue[0].action).toBeUndefined();
    expect(undo.queue[1].action).toBe("restore-shipment");
    expect(undo.queue.map(c => c.expectedVersion)).toEqual([7, 8]);
    expect(undo.state.shipments[0].deleted).toBeUndefined();
  });
});
