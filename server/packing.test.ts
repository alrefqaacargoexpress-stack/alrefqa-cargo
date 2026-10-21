import { describe, expect, it } from "vitest";
import {
  addPackingGoods,
  closePackingCarton,
  createPackedShipment,
} from "@shared/packing";
import {
  hideFinance,
  parseChange,
  prepareRecordForWrite,
  shipmentDataSchema,
} from "./operations";
import type { Shipment } from "@shared/operations";
const create = () =>
  createPackedShipment(
    { tracking: "RF-X", source: "dubai", pricePerKg: 5 },
    "2026-10-21T00:00:00.000Z"
  );
const line = { name: "Brand", phone: "", unitWeight: 2, pieces: 3 };
describe("Packing server safeguards", () => {
  it("derives the amount from verified weights and tariff rather than trusting a submitted amount", () => {
    const shipment = addPackingGoods(create(), line);
    const change = parseChange({
      id: "change",
      entity: "shipment",
      recordId: shipment.id,
      expectedVersion: null,
      label: "packing",
      createdAt: "now",
      data: { ...shipment, amount: 1 },
    });
    expect((change.data as Shipment).amount).toBe(2 * 3 * 5);
  });
  it("does not leak the tariff or calculated amount to staff and viewer", () => {
    const shipment = addPackingGoods(create(), line);
    for (const role of ["staff", "viewer"] as const) {
      const result = hideFinance(shipment, role);
      expect(result.amount).toBe(0);
      expect(result.packing.pricePerKg).toBe(0);
      expect(result.packing.cartons[0].goods[0].unitWeight).toBe(2);
    }
  });
  it("preserves the actual rate while staff append goods, then recomputes the actual amount", () => {
    const before = create();
    const hidden = hideFinance(before, "staff");
    const next = addPackingGoods(hidden, line);
    const result = prepareRecordForWrite("staff", next, before) as Shipment;
    expect(result.packing?.pricePerKg).toBe(5);
    expect(result.amount).toBe(2 * 3 * 5);
  });
  it("rejects staff tariff manipulation and source changes on existing goods", () => {
    const before = create();
    expect(() => prepareRecordForWrite("staff", before, before)).toThrow(
      "financial_write_forbidden"
    );
    expect(() =>
      prepareRecordForWrite(
        "admin",
        { ...before, packing: { ...before.packing, source: "china" } },
        before
      )
    ).toThrow("source_change_forbidden");
  });
  it("does not allow removal of existing packing through the legacy editor", () => {
    const before = create();
    const { packing, ...next } = before;
    expect(() => prepareRecordForWrite("admin", next, before)).toThrow(
      "packing_data_loss_forbidden"
    );
  });
  it("protects stored carton lines and closed cartons from loss", () => {
    const before = closePackingCarton(addPackingGoods(create(), line));
    const erased = structuredClone(before);
    erased.packing.cartons[0].goods = [];
    expect(() => prepareRecordForWrite("admin", erased, before)).toThrow(
      "packing_data_loss_forbidden"
    );
    const changed = structuredClone(before);
    changed.packing.cartons[0].goods[0].pieces = 4;
    expect(() => prepareRecordForWrite("admin", changed, before)).toThrow(
      "packing_data_loss_forbidden"
    );
  });
  it("preserves recorded creation dates during later edits", () => {
    const before = create();
    const next = addPackingGoods(before, line);
    next.packing.createdAt = "2026-10-22T00:00:00.000Z";
    const result = prepareRecordForWrite("admin", next, before) as Shipment;
    expect(result.packing?.createdAt).toBe(before.packing.createdAt);
  });
  it("keeps legacy shipments without packing valid and unchanged", () => {
    const legacy: Shipment = {
      id: "old",
      tracking: "RF-old",
      account: "Old",
      route: "Dubai",
      service: "جوي",
      status: "في الطريق",
      eta: "Later",
      amount: 12,
    };
    expect(shipmentDataSchema.parse(legacy)).toEqual(legacy);
    expect(prepareRecordForWrite("admin", legacy, legacy)).toEqual(legacy);
  });
});
