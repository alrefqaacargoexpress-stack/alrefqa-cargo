import { describe, expect, it } from "vitest";
import {
  addPackingGoods,
  closePackingCarton,
  changePackingStatus,
  createPackedShipment,
} from "@shared/packing";
import {
  deleteShipment,
  restoreShipment,
  shipmentContent,
} from "@shared/shipmentDeletion";
import {
  applyChangeInMemory,
  hideFinance,
  parseChange,
  prepareRecordForWrite,
} from "./operations";
import type { PendingChange, Shipment } from "@shared/operations";
const create = () =>
  addPackingGoods(
    createPackedShipment({
      tracking: "RF-DEL",
      source: "china",
      pricePerKg: 4,
      pricePerKgMRU: 120,
    }),
    { name: "Brand", phone: "", unitWeight: 2, pieces: 3 }
  );
const change = (s: Shipment, action: PendingChange["action"]) =>
  parseChange({
    id: "delete-id",
    entity: "shipment",
    recordId: s.id,
    label: "Delete shipment",
    createdAt: "now",
    expectedVersion: 1,
    data: s,
    action,
  });
describe("Server shipment deletion rules", () => {
  it("allows admin deletion of transit shipments without changing quantities, status, price or amount", () => {
    const original = changePackingStatus(
      closePackingCarton(create()),
      "في الطريق"
    );
    const next = deleteShipment(original, "wrong");
    const saved = prepareRecordForWrite(
      "admin",
      next,
      original,
      "delete-shipment"
    ) as Shipment;
    expect(saved.deleted).toBeDefined();
    expect(shipmentContent(saved)).toBe(shipmentContent(original));
  });
  it("rejects staff deletion or restoration of any shipped state", () => {
    const original = changePackingStatus(
      closePackingCarton(create()),
      "في الطريق"
    );
    const removed = deleteShipment(original, "wrong");
    expect(() =>
      prepareRecordForWrite(
        "staff",
        hideFinance(removed, "staff"),
        original,
        "delete-shipment"
      )
    ).toThrow("shipment_deletion_forbidden");
    expect(() =>
      prepareRecordForWrite(
        "staff",
        hideFinance(restoreShipment(removed), "staff"),
        removed,
        "restore-shipment"
      )
    ).toThrow("shipment_deletion_forbidden");
  });
  it("rejects viewer/accountant actions even when the payload is forged", () => {
    const original = create();
    for (const role of ["accountant", "viewer"] as const)
      expect(() =>
        prepareRecordForWrite(
          role,
          deleteShipment(original, "wrong"),
          original,
          "delete-shipment"
        )
      ).toThrow("shipment_deletion_forbidden");
  });
  it("retains actual hidden finance while staff delete and restore a preparing shipment", () => {
    const original = create();
    const removed = deleteShipment(hideFinance(original, "staff"), "wrong");
    const saved = prepareRecordForWrite(
      "staff",
      removed,
      original,
      "delete-shipment"
    ) as Shipment;
    expect(saved.packing?.pricePerKg).toBe(4);
    expect(saved.packing?.pricePerKgMRU).toBe(120);
    expect(saved.amount).toBe(24);
    const restored = prepareRecordForWrite(
      "staff",
      restoreShipment(hideFinance(saved, "staff")),
      saved,
      "restore-shipment"
    ) as Shipment;
    expect(restored.deleted).toBeUndefined();
    expect(shipmentContent(restored)).toBe(shipmentContent(original));
  });
  it("rejects ordinary writes to an archive even if an older client omitted the tombstone", () => {
    const original = create();
    const removed = deleteShipment(original, "wrong");
    expect(() => prepareRecordForWrite("admin", original, removed)).toThrow(
      "explicit_shipment_action_required"
    );
    expect(() => prepareRecordForWrite("admin", removed, removed)).toThrow(
      "explicit_shipment_action_required"
    );
  });
  it("does not allow altering cargo, price or status while restoring an archived record", () => {
    const original = create();
    const removed = deleteShipment(original, "wrong");
    const forged = restoreShipment(removed);
    forged.packing.cartons[0].goods[0].pieces = 99;
    expect(() =>
      prepareRecordForWrite("admin", forged, removed, "restore-shipment")
    ).toThrow("deleted_shipment_readonly");
    const price = restoreShipment(removed);
    price.packing.pricePerKgMRU = 900;
    expect(() =>
      prepareRecordForWrite("admin", price, removed, "restore-shipment")
    ).toThrow("deleted_shipment_readonly");
  });
  it("acknowledges deletion time on the server without mutating the draft", () => {
    const original = create();
    const removed = deleteShipment(original, "wrong");
    removed.deleted!.at = "2000-01-01T00:00:00.000Z";
    const saved = prepareRecordForWrite(
      "admin",
      removed,
      original,
      "delete-shipment"
    ) as Shipment;
    expect(saved.deleted?.at).not.toBe(removed.deleted?.at);
    expect(removed.deleted?.at).toBe("2000-01-01T00:00:00.000Z");
  });
  it("preserves legacy shipments and allows their reversible deletion by admin", () => {
    const legacy: Shipment = {
      id: "legacy",
      tracking: "OLD",
      account: "Old",
      route: "Old",
      service: "جوي",
      status: "بانتظار الدفع",
      eta: "Later",
      amount: 800,
    };
    const saved = prepareRecordForWrite(
      "admin",
      deleteShipment(legacy, "wrong"),
      legacy,
      "delete-shipment"
    ) as Shipment;
    expect(saved.amount).toBe(800);
    expect(
      prepareRecordForWrite(
        "admin",
        restoreShipment(saved),
        saved,
        "restore-shipment"
      )
    ).toEqual({ ...legacy, scope: "pending" });
  });
  it("rejects shipment actions on an account payload", () => {
    expect(() =>
      parseChange({
        id: "C",
        entity: "account",
        recordId: "A",
        label: "wrong",
        createdAt: "now",
        expectedVersion: null,
        action: "delete-shipment",
        data: {
          id: "A",
          name: "Name",
          phone: "p",
          city: "city",
          shipments: 0,
          balance: 0,
          updatedAt: "now",
        },
      })
    ).toThrow("invalid_shipment_action");
  });
  it("keeps all rows and rejects an outdated deletion with a version conflict", () => {
    const original = create();
    const removed = deleteShipment(original, "wrong");
    const rows = new Map([
      [
        `shipment:${original.id}`,
        {
          entity: "shipment" as const,
          recordId: original.id,
          version: 2,
          data: original,
        },
      ],
    ]);
    const result = applyChangeInMemory(
      rows,
      change(removed, "delete-shipment"),
      "admin"
    );
    expect(result.result.applied).toEqual([]);
    expect(result.result.conflicts[0].reason).toBe("version_conflict");
    expect(result.nextState.get(`shipment:${original.id}`)?.data).toEqual(
      original
    );
  });
  it("retains a tombstoned row with a new version and restores using that version", () => {
    const original = create();
    const removed = deleteShipment(original, "wrong");
    const rows = new Map([
      [
        `shipment:${original.id}`,
        {
          entity: "shipment" as const,
          recordId: original.id,
          version: 1,
          data: original,
        },
      ],
    ]);
    const applied = applyChangeInMemory(
      rows,
      change(removed, "delete-shipment"),
      "admin"
    );
    expect(applied.result.applied).toHaveLength(1);
    expect(applied.nextState.size).toBe(1);
    const saved = applied.result.applied[0].record as Shipment;
    expect(saved.version).toBe(2);
    expect(saved.deleted).toBeDefined();
    const undo = change(restoreShipment(saved), "restore-shipment");
    undo.expectedVersion = 2;
    const back = applyChangeInMemory(applied.nextState, undo, "admin");
    expect((back.result.applied[0].record as Shipment).deleted).toBeUndefined();
    expect(back.nextState.size).toBe(1);
  });
  it("allows canceling an unshared deletion without a false already-deleted conflict", () => {
    const original = create();
    const local = restoreShipment(deleteShipment(original, "wrong"));
    expect(() =>
      prepareRecordForWrite("admin", local, original, "restore-shipment")
    ).not.toThrow();
    expect(() =>
      prepareRecordForWrite("admin", local, null, "restore-shipment")
    ).not.toThrow();
  });
});
