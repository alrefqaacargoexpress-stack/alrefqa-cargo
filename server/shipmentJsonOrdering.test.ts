import { describe, expect, it } from "vitest";
import {
  addPackingGoods,
  closePackingCarton,
  changePackingStatus,
  createPackedShipment,
} from "../shared/packing";
import {
  deleteShipment,
  restoreShipment,
  shipmentContent,
} from "../shared/shipmentDeletion";
import { parseChange, prepareRecordForWrite } from "./operations";
import type { Shipment } from "../shared/operations";

function reorder<T>(input: T): T {
  if (Array.isArray(input)) return input.map(reorder) as T;
  if (input && typeof input === "object")
    return Object.fromEntries(
      Object.entries(input)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => [key, reorder(value)])
    ) as T;
  return input;
}
function fixture(): Shipment {
  const shipment = changePackingStatus(
    closePackingCarton(
      addPackingGoods(
        createPackedShipment({
          tracking: "JSON-ORDER-TEST",
          source: "dubai",
          officeId: "dubai",
          pricePerKg: 4,
          pricePerKgMRU: 425,
          service: "airRegular",
          rateSnapshot: {
            service: "airRegular",
            sourceOffice: "dubai",
            sourceRate: { amount: 4, currency: "AED", unit: "kg" },
            nouakchottRate: { amount: 425, currency: "MRU", unit: "kg" },
            sourceProfileVersion: 1,
            nouakchottProfileVersion: 1,
            capturedAt: "2026-10-22T20:00:00.000Z",
          },
        }),
        { name: "Fixture", phone: "", unitWeight: 1, pieces: 3 }
      )
    ),
    "في الطريق"
  );
  shipment.journey = {
    stage: "preparing",
    branch: "dubai",
    expectedDays: 9,
    startedAt: "2026-10-22T20:00:00.000Z",
    updatedAt: "2026-10-22T20:00:00.000Z",
    notes: [],
  };
  return reorder(shipment);
}
function parsed(
  next: Shipment,
  action: "delete-shipment" | "restore-shipment"
) {
  return parseChange({
    id: "fixture-request",
    entity: "shipment",
    recordId: next.id,
    expectedVersion: 4,
    label: "Archive fixture",
    createdAt: "now",
    action,
    data: next,
  }).data as Shipment;
}
describe("Order-independent JSON content validation", () => {
  it("accepts unchanged tariff and journey when JSON keys are reordered during parsing", () => {
    const current = fixture();
    const next = parsed(
      deleteShipment(current, "Duplicate fixture"),
      "delete-shipment"
    );
    expect(JSON.stringify(next.packing?.rateSnapshot)).not.toBe(
      JSON.stringify(current.packing?.rateSnapshot)
    );
    const archived = prepareRecordForWrite(
      "office_manager",
      next,
      current,
      "delete-shipment"
    ) as Shipment;
    expect(archived.deleted).toBeDefined();
    expect(shipmentContent(archived)).toBe(shipmentContent(current));
    const restored = prepareRecordForWrite(
      "office_manager",
      parsed(restoreShipment(archived), "restore-shipment"),
      reorder(archived),
      "restore-shipment"
    ) as Shipment;
    expect(restored.deleted).toBeUndefined();
    expect(shipmentContent(restored)).toBe(shipmentContent(current));
    expect(current.deleted).toBeUndefined();
  });
  it("still rejects a changed monetary tariff", () => {
    const current = fixture();
    const next = parsed(deleteShipment(current, "Fixture"), "delete-shipment");
    next.packing!.rateSnapshot!.nouakchottRate!.amount = 426;
    expect(() =>
      prepareRecordForWrite("office_manager", next, current, "delete-shipment")
    ).toThrow("finance_command_required");
  });
  it("still rejects a changed journey stage or goods quantity", () => {
    const current = fixture();
    const stage = parsed(deleteShipment(current, "Fixture"), "delete-shipment");
    stage.journey!.stage = "dubai_airport";
    expect(() =>
      prepareRecordForWrite("office_manager", stage, current, "delete-shipment")
    ).toThrow("tracking_command_required");
    const goods = parsed(deleteShipment(current, "Fixture"), "delete-shipment");
    goods.packing!.cartons[0].goods[0].pieces = 99;
    expect(() =>
      prepareRecordForWrite("office_manager", goods, current, "delete-shipment")
    ).toThrow("shipment_action_content_change_forbidden");
  });
});
