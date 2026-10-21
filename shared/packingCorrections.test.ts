import { describe, expect, it } from "vitest";
import {
  addPackingGoods,
  canonicalPackingShipment,
  cartonGroups,
  changePackingStatus,
  closePackingCarton,
  createPackedShipment,
  customerDirectory,
  deletePackingGoods,
  goodsTotals,
  matchesPackingGoods,
  matchesShipment,
  packingCustomers,
  packingTotals,
  packingTotalsMRU,
  restorePackingGoods,
} from "./packing";
const create = () =>
  createPackedShipment({
    tracking: "RF-01",
    source: "china",
    pricePerKg: 4,
    pricePerKgMRU: 120,
  });
const goods = (name = "Brand", unitWeight = 2, pieces = 3, phone = "") => ({
  name,
  unitWeight,
  pieces,
  phone,
});
describe("Ouguiya pricing, grouped cartons and reversible corrections", () => {
  it("keeps an independent MRU price without changing source prices or assuming conversion", () => {
    const s = addPackingGoods(create(), goods());
    expect(s.packing.pricePerKg).toBe(4);
    expect(s.packing.pricePerKgMRU).toBe(120);
    expect(packingTotals(s.packing).amount).toBe(2 * 3 * 4);
    expect(packingTotalsMRU(s.packing)?.amount).toBe(2 * 3 * 120);
  });
  it("does not set or reinterpret legacy prices when the MRU field is missing", () => {
    const s = createPackedShipment({
      tracking: "old",
      source: "turkey",
      pricePerKg: 9,
    });
    expect(s.packing.pricePerKgMRU).toBeUndefined();
    expect(packingTotalsMRU(s.packing)).toBeNull();
    expect(s.packing.pricePerKg).toBe(9);
  });
  it("treats an explicit zero MRU price as a specified zero, not missing", () => {
    const s = createPackedShipment({
      tracking: "zero",
      source: "dubai",
      pricePerKg: 0,
      pricePerKgMRU: 0,
    });
    expect(packingTotalsMRU(s.packing)?.amount).toBe(0);
  });
  it("groups duplicate names into one carton item while preserving actual quantity, weight and repetitions", () => {
    let s = addPackingGoods(create(), goods("Brand", 2, 3));
    s = addPackingGoods(s, goods(" BRAND ", 4, 2));
    const groups = cartonGroups(s.packing.cartons[0], 4);
    expect(groups).toHaveLength(1);
    expect(groups[0].repetitions).toBe(2);
    expect(groups[0].pieces).toBe(3 + 2);
    expect(groups[0].weight).toBe(2 * 3 + 4 * 2);
    expect(groups[0].entries).toHaveLength(2);
    expect(s.packing.cartons[0].goods).toHaveLength(2);
  });
  it("never merges different names or different cartons", () => {
    let s = addPackingGoods(create(), goods("A"));
    s = addPackingGoods(s, goods("B"));
    expect(cartonGroups(s.packing.cartons[0])).toHaveLength(2);
    s = closePackingCarton(s);
    s = addPackingGoods(s, goods("A"));
    expect(cartonGroups(s.packing.cartons[1])).toHaveLength(1);
    expect(s.packing.cartons[0].goods).toHaveLength(2);
  });
  it("excludes a deleted repetition from weights, quantities and both prices while retaining its raw entry", () => {
    let s = addPackingGoods(create(), goods("A", 2, 3));
    s = addPackingGoods(s, goods("a", 4, 2));
    const original = s.packing.cartons[0].goods[0];
    const next = deletePackingGoods(s, original.id, "wrong entry");
    expect(next.packing.cartons[0].goods).toHaveLength(2);
    expect(next.packing.cartons[0].goods[0]).toMatchObject({
      ...original,
      deleted: { reason: "wrong entry" },
    });
    expect(packingTotals(next.packing).pieces).toBe(2);
    expect(packingTotals(next.packing).weight).toBe(4 * 2);
    expect(packingTotals(next.packing).amount).toBe(4 * 2 * 4);
    expect(packingTotalsMRU(next.packing)?.amount).toBe(4 * 2 * 120);
    expect(cartonGroups(next.packing.cartons[0])[0].repetitions).toBe(1);
    expect(packingCustomers(next.packing)[0].pieces).toBe(2);
  });
  it("restores the exact original entry and totals after saving and reloading", () => {
    const s = addPackingGoods(create(), goods());
    const id = s.packing.cartons[0].goods[0].id;
    const removed = deletePackingGoods(s, id, "wrong");
    const reloaded = JSON.parse(JSON.stringify(removed));
    expect(customerDirectory([], [reloaded])).toEqual([]);
    const restored = restorePackingGoods(reloaded, id);
    expect(restored.packing.cartons[0].goods[0].deleted).toBeUndefined();
    expect(packingTotals(restored.packing)).toEqual(packingTotals(s.packing));
    expect(packingTotalsMRU(restored.packing)).toEqual(
      packingTotalsMRU(s.packing)
    );
  });
  it("retains closed carton numbers even if all its goods are corrected", () => {
    let s = closePackingCarton(addPackingGoods(create(), goods()));
    const id = s.packing.cartons[0].goods[0].id;
    s = deletePackingGoods(s, id, "wrong");
    expect(s.packing.cartons.map(c => [c.number, c.closed])).toEqual([
      [1, true],
      [2, false],
    ]);
    expect(packingTotals(s.packing).pieces).toBe(0);
    expect(() => changePackingStatus(s, "في الطريق")).toThrow("shipment_empty");
    expect(cartonGroups(s.packing.cartons[0])).toEqual([]);
  });
  it("does not let inactive goods close the current carton or send an empty shipment", () => {
    let s = addPackingGoods(create(), goods());
    s = deletePackingGoods(s, s.packing.cartons[0].goods[0].id, "wrong");
    expect(() => closePackingCarton(s)).toThrow("carton_empty");
    expect(() => changePackingStatus(s, "في الطريق")).toThrow("shipment_empty");
  });
  it("prohibits corrections after shipping, unknown IDs and missing deletion reasons", () => {
    let s = addPackingGoods(create(), goods());
    const id = s.packing.cartons[0].goods[0].id;
    expect(() => deletePackingGoods(s, "unknown", "wrong")).toThrow(
      "goods_not_found"
    );
    expect(() => deletePackingGoods(s, id, "")).toThrow();
    s = changePackingStatus(closePackingCarton(s), "في الطريق");
    expect(() => deletePackingGoods(s, id, "wrong")).toThrow(
      "shipment_not_open"
    );
    expect(() => restorePackingGoods(s, id)).toThrow("shipment_not_open");
  });
  it("searches stored tracking, name, optional phone and carton without using deleted entries as active matches", () => {
    const s = addPackingGoods(create(), goods("Brand", 2, 3, "+22200123"));
    const item = s.packing.cartons[0].goods[0];
    expect(matchesShipment(s, "rf-01")).toBe(true);
    expect(matchesShipment(s, "BRAND")).toBe(true);
    expect(matchesShipment(s, "00123")).toBe(true);
    expect(matchesPackingGoods(item, 3, "3")).toBe(true);
    expect(matchesShipment(s, "unknown")).toBe(false);
    expect(
      matchesShipment(deletePackingGoods(s, item.id, "wrong"), "Brand")
    ).toBe(false);
  });
  it("validates MRU amounts against the same numeric limits as source currency", () => {
    const s = addPackingGoods(create(), goods());
    s.packing.pricePerKgMRU = 999999999;
    expect(() => canonicalPackingShipment(s)).toThrow("totals_too_large");
  });
});
