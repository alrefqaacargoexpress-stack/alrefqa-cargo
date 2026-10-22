import { describe, expect, it } from "vitest";
import {
  addPackingGoods,
  changePackingStatus,
  closePackingCarton,
  createPackedShipment,
  deletePackingGoods,
} from "@shared/packing";
import { prepareRecordForWrite } from "./operations";
import type { Shipment } from "@shared/operations";
const create = () =>
  addPackingGoods(
    createPackedShipment({
      tracking: "RF-AUDIT",
      source: "china",
      pricePerKg: 4,
      pricePerKgMRU: 120,
    }),
    { name: "Brand", phone: "", unitWeight: 2, pieces: 3 }
  );
describe("Financial lock and correction acknowledgments", () => {
  it("locks both rates after shipment leaves preparation", () => {
    const current = changePackingStatus(
      closePackingCarton(create()),
      "في الطريق"
    );
    for (const packing of [
      { ...current.packing, pricePerKg: 999 },
      { ...current.packing, pricePerKgMRU: 9999 },
    ])
      expect(() =>
        prepareRecordForWrite("admin", { ...current, packing }, current)
      ).toThrow("finance_command_required");
  });
  it("does not trust the client clock for a newly shared tombstone or mutate the input object", () => {
    const current = create();
    const next = deletePackingGoods(
      current,
      current.packing.cartons[0].goods[0].id,
      "wrong"
    );
    next.packing.cartons[0].goods[0].deleted!.at = "2000-01-01T00:00:00.000Z";
    const saved = prepareRecordForWrite("admin", next, current) as Shipment;
    expect(saved.packing?.cartons[0].goods[0].deleted?.at).not.toBe(
      "2000-01-01T00:00:00.000Z"
    );
    expect(next.packing.cartons[0].goods[0].deleted?.at).toBe(
      "2000-01-01T00:00:00.000Z"
    );
  });
  it("does not allow rewriting previously acknowledged deletion reason or timestamp", () => {
    const original = create();
    const removed = deletePackingGoods(
      original,
      original.packing.cartons[0].goods[0].id,
      "wrong"
    );
    const current = prepareRecordForWrite(
      "admin",
      removed,
      original
    ) as typeof original;
    const forged = structuredClone(current);
    forged.packing.cartons[0].goods[0].deleted!.reason = "tampered";
    expect(() => prepareRecordForWrite("admin", forged, current)).toThrow(
      "deletion_metadata_change_forbidden"
    );
    const changedClock = structuredClone(current);
    changedClock.packing.cartons[0].goods[0].deleted!.at =
      "2000-01-01T00:00:00.000Z";
    expect(() => prepareRecordForWrite("admin", changedClock, current)).toThrow(
      "deletion_metadata_change_forbidden"
    );
  });
});
