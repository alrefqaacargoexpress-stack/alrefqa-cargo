import { describe, expect, it } from "vitest";
import {
  addPackingGoods,
  changePackingStatus,
  closePackingCarton,
  createPackedShipment,
  deletePackingGoods,
  packingTotalsMRU,
  restorePackingGoods,
} from "@shared/packing";
import {
  applyChangeInMemory,
  hideFinance,
  isFinancialPayloadNonZero,
  parseChange,
  prepareRecordForWrite,
} from "./operations";
import type { Shipment } from "@shared/operations";
const create = () =>
  addPackingGoods(
    createPackedShipment({
      tracking: "new",
      source: "dubai",
      pricePerKg: 4,
      pricePerKgMRU: 120,
    }),
    { name: "Brand", phone: "", unitWeight: 2, pieces: 3 }
  );
describe("Safe packing corrections on the server", () => {
  it("masks both prices for non-finance roles", () => {
    const s = create();
    for (const role of ["staff", "viewer"] as const) {
      const hidden = hideFinance(s, role);
      expect(hidden.packing.pricePerKg).toBe(0);
      expect(hidden.packing.pricePerKgMRU).toBe(0);
      expect(hidden.amount).toBe(0);
    }
  });
  it("retains actual MRU and source rates when staff correct an erroneous entry", () => {
    const before = create();
    const next = deletePackingGoods(
      hideFinance(before, "staff"),
      before.packing.cartons[0].goods[0].id,
      "wrong"
    );
    const saved = prepareRecordForWrite("staff", next, before) as Shipment;
    expect(saved.packing?.pricePerKg).toBe(4);
    expect(saved.packing?.pricePerKgMRU).toBe(120);
    expect(saved.amount).toBe(0);
    expect(packingTotalsMRU(saved.packing!)?.amount).toBe(0);
    const restored = restorePackingGoods(
      hideFinance(saved, "staff") as typeof before,
      before.packing.cartons[0].goods[0].id
    );
    const back = prepareRecordForWrite("staff", restored, saved) as Shipment;
    expect(back.amount).toBe(2 * 3 * 4);
    expect(packingTotalsMRU(back.packing!)?.amount).toBe(2 * 3 * 120);
  });
  it("does not allow staff to set MRU prices, even zero on a record without a price", () => {
    const s = create();
    expect(() =>
      prepareRecordForWrite(
        "staff",
        {
          ...hideFinance(s, "staff"),
          packing: { ...hideFinance(s, "staff").packing, pricePerKgMRU: 2 },
        },
        s
      )
    ).toThrow("financial_write_forbidden");
    const legacy = createPackedShipment({
      tracking: "old",
      source: "china",
      pricePerKg: 0,
    });
    expect(() =>
      prepareRecordForWrite(
        "staff",
        { ...legacy, packing: { ...legacy.packing, pricePerKgMRU: 0 } },
        legacy
      )
    ).toThrow("financial_write_forbidden");
  });
  it("does not permit accountant or viewer packing corrections", () => {
    const s = create();
    const next = deletePackingGoods(
      s,
      s.packing.cartons[0].goods[0].id,
      "wrong"
    );
    for (const role of ["viewer", "accountant"] as const)
      expect(() => prepareRecordForWrite(role, next, s)).toThrow("forbidden");
  });
  it("allows reversible corrections to closed cartons while retaining raw entries and ordering", () => {
    const s = closePackingCarton(create());
    const next = deletePackingGoods(
      s,
      s.packing.cartons[0].goods[0].id,
      "wrong"
    );
    const saved = prepareRecordForWrite("admin", next, s) as Shipment;
    expect(saved.packing?.cartons[0].closed).toBe(true);
    expect(saved.packing?.cartons[0].goods).toHaveLength(1);
    expect(saved.packing?.cartons[1].number).toBe(2);
  });
  it("blocks physical data removal, hidden field edits and corrections after transit", () => {
    const s = create();
    const removed = structuredClone(s);
    removed.packing.cartons[0].goods = [];
    expect(() => prepareRecordForWrite("admin", removed, s)).toThrow(
      "packing_data_loss_forbidden"
    );
    const changed = deletePackingGoods(
      s,
      s.packing.cartons[0].goods[0].id,
      "wrong"
    );
    changed.packing.cartons[0].goods[0].pieces = 50;
    expect(() => prepareRecordForWrite("admin", changed, s)).toThrow(
      "packing_data_loss_forbidden"
    );
    const transit = changePackingStatus(closePackingCarton(s), "في الطريق");
    const forged = structuredClone(transit);
    forged.packing.cartons[0].goods[0].deleted = {
      at: new Date().toISOString(),
      reason: "wrong",
    };
    expect(() => prepareRecordForWrite("admin", forged, transit)).toThrow(
      "shipment_not_open"
    );
  });
  it("requires real concurrency versions and never discards a rejected correction", () => {
    const s = create();
    const next = deletePackingGoods(
      s,
      s.packing.cartons[0].goods[0].id,
      "wrong"
    );
    const change = parseChange({
      id: "fix",
      entity: "shipment",
      recordId: s.id,
      data: next,
      expectedVersion: 1,
      label: "delete wrong",
      createdAt: "now",
    });
    const state = new Map([
      [
        `shipment:${s.id}`,
        { entity: "shipment" as const, recordId: s.id, version: 2, data: s },
      ],
    ]);
    const result = applyChangeInMemory(state, change, "admin");
    expect(result.result.applied).toEqual([]);
    expect(result.result.conflicts[0].reason).toBe("version_conflict");
    expect(result.nextState.get(`shipment:${s.id}`)?.data).toEqual(s);
  });
  it("recognizes MRU pricing as financial even when source price and amount are zero", () => {
    const s = createPackedShipment({
      tracking: "MRU",
      source: "china",
      pricePerKg: 0,
      pricePerKgMRU: 5,
    });
    const change = parseChange({
      id: "fix",
      entity: "shipment",
      recordId: s.id,
      data: s,
      expectedVersion: null,
      label: "new",
      createdAt: "now",
    });
    expect(isFinancialPayloadNonZero(change)).toBe(true);
    expect(
      applyChangeInMemory(new Map(), change, "staff").result.applied
    ).toEqual([]);
  });
});
