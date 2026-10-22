import { describe, expect, it } from "vitest";
import {
  assertShipmentAction,
  canDeleteShipment,
  deleteShipment,
  restoreShipment,
  shipmentContent,
} from "./shipmentDeletion";
import {
  addPackingGoods,
  closePackingCarton,
  changePackingStatus,
  createPackedShipment,
  customerDirectory,
  shipmentReports,
} from "./packing";
const create = () =>
  addPackingGoods(
    createPackedShipment({
      tracking: "RF-DEL",
      source: "china",
      pricePerKg: 4,
      pricePerKgMRU: 120,
    }),
    { name: "Brand", phone: "+22200123", unitWeight: 2, pieces: 3 }
  );
describe("Reversible shipment deletion", () => {
  it("retains the complete raw shipment, cartons, prices, status and tracking when deleting", () => {
    const original = create();
    const removed = deleteShipment(original, "User request");
    expect(removed.deleted?.reason).toBe("User request");
    expect(shipmentContent(removed)).toBe(shipmentContent(original));
    expect(original.deleted).toBeUndefined();
    expect(removed.packing.cartons[0].goods).toHaveLength(1);
  });
  it("restores the exact original payload and does not mutate the archive", () => {
    const original = create();
    const removed = deleteShipment(original, "wrong");
    const restored = restoreShipment(removed);
    expect(restored.deleted).toBeUndefined();
    expect(shipmentContent(restored)).toBe(shipmentContent(original));
    expect(removed.deleted).toBeDefined();
  });
  it("allows deletion only for the general admin and never warehouse/accountant/viewer", () => {
    const original = create();
    const transit = changePackingStatus(
      closePackingCarton(original),
      "في الطريق"
    );
    expect(canDeleteShipment("admin", transit)).toBe(true);
    expect(canDeleteShipment("staff", original)).toBe(false);
    expect(canDeleteShipment("staff", transit)).toBe(false);
    for (const role of ["viewer", "accountant", null] as const)
      expect(canDeleteShipment(role, original)).toBe(false);
  });
  it("requires explicit delete and restore actions and forbids an older editor silently restoring", () => {
    const original = create();
    const removed = deleteShipment(original, "wrong");
    expect(() => assertShipmentAction("admin", removed, original)).toThrow(
      "explicit_shipment_action_required"
    );
    expect(() =>
      assertShipmentAction("admin", restoreShipment(removed), removed)
    ).toThrow("explicit_shipment_action_required");
    expect(() =>
      assertShipmentAction("admin", removed, original, "delete-shipment")
    ).not.toThrow();
    expect(() =>
      assertShipmentAction(
        "admin",
        restoreShipment(removed),
        removed,
        "restore-shipment"
      )
    ).not.toThrow();
  });
  it("rejects malformed tombstones and contradictory action payloads", () => {
    const original = create();
    expect(() => deleteShipment(original, "")).toThrow();
    expect(() =>
      assertShipmentAction("admin", original, original, "delete-shipment")
    ).toThrow("invalid_shipment_deletion");
    const removed = deleteShipment(original, "wrong");
    expect(() =>
      assertShipmentAction("admin", removed, original, "restore-shipment")
    ).toThrow("invalid_shipment_restore");
  });
  it("excludes deleted cargo from real reports and derived customers while preserving real accounts", () => {
    const original = create();
    const removed = deleteShipment(original, "wrong");
    expect(shipmentReports([removed]).total).toBe(0);
    expect(customerDirectory([], [removed])).toEqual([]);
    const account = {
      id: "A",
      name: "Brand",
      phone: "phone",
      city: "city",
      shipments: 99,
      balance: 800,
      updatedAt: "now",
    };
    const directory = customerDirectory([account], [removed]);
    expect(directory[0].accountIds).toEqual(["A"]);
    expect(directory[0].pieces).toBe(0);
    expect(account.balance).toBe(800);
    expect(account.shipments).toBe(99);
    expect(shipmentReports([original, removed]).total).toBe(1);
  });
  it("prevents packing, closing cartons and changing status while a shipment is deleted", () => {
    const removed = deleteShipment(create(), "wrong");
    expect(() =>
      addPackingGoods(removed, {
        name: "X",
        phone: "",
        unitWeight: 1,
        pieces: 1,
      })
    ).toThrow("shipment_deleted");
    expect(() => closePackingCarton(removed)).toThrow("shipment_deleted");
    expect(() => changePackingStatus(removed, "في الطريق")).toThrow(
      "shipment_deleted"
    );
  });
});
