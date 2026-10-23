import { describe, expect, it } from "vitest";
import {
  addPackingGoods,
  closePackingCarton,
  createPackedShipment,
} from "@shared/packing";
import { applyTrackingCommand } from "./tracking";
import { effectiveJourneyStage } from "@shared/tracking";
import { deletionConfirmationMatches } from "../client/src/components/packing/ConfirmShipmentDeletionDialog";

const now = "2026-10-23T00:00:00.000Z";
const warehouse = { id: 41, name: "Dubai warehouse", role: "staff" as const };
const tracker = { id: 42, name: "Tracker", role: "tracking_staff" as const };
const viewer = { id: 43, name: "Viewer", role: "viewer" as const };

/** A shipment sent from the packing screen: closed carton, no tracking plan. */
const sentWithoutPlan = () => ({
  ...closePackingCarton(
    addPackingGoods(
      createPackedShipment({
        tracking: "SM 669",
        source: "dubai",
        pricePerKg: 0,
        pricePerKgMRU: 0,
      }),
      { name: "Brand", phone: "", unitWeight: 2, pieces: 3 }
    )
  ),
  status: "في الطريق" as const,
});

describe("Tracking after sending from the packing screen", () => {
  it("treats a sent shipment without a plan as just leaving preparation", () => {
    expect(effectiveJourneyStage(sentWithoutPlan())).toBe("preparing");
    expect(
      effectiveJourneyStage({ ...sentWithoutPlan(), status: "قيد التجهيز" })
    ).toBeNull();
  });

  it("lets the authorized warehouse employee start the journey at the next stage", () => {
    const original = sentWithoutPlan();
    const { shipment, action } = applyTrackingCommand(
      original,
      { type: "stage", stage: "dubai_airport", reason: "Handed to airport" },
      warehouse,
      now
    );
    expect(action).toBe("tracking_stage");
    expect(shipment.journey?.stage).toBe("dubai_airport");
    expect(shipment.journey?.branch).toBe("dubai");
    expect(shipment.journey?.notes).toHaveLength(1);
    expect(shipment.status).toBe("في الطريق");
    // Cargo and prices are untouched by a tracking command.
    expect(shipment.packing).toEqual(original.packing);
    expect(shipment.pricePerKg).toBe(original.pricePerKg);
  });

  it("allows tracking staff the same first step", () => {
    const { shipment } = applyTrackingCommand(
      sentWithoutPlan(),
      { type: "stage", stage: "dubai_airport", reason: "Airport" },
      tracker,
      now
    );
    expect(shipment.journey?.stage).toBe("dubai_airport");
  });

  it("refuses skipping stages, going back, or a viewer acting", () => {
    expect(() =>
      applyTrackingCommand(
        sentWithoutPlan(),
        { type: "stage", stage: "dubai_customs", reason: "Skip" },
        warehouse,
        now
      )
    ).toThrow("tracking_forbidden");
    expect(() =>
      applyTrackingCommand(
        sentWithoutPlan(),
        { type: "stage", stage: "dubai_airport", reason: "No" },
        viewer,
        now
      )
    ).toThrow("tracking_forbidden");
    expect(() =>
      applyTrackingCommand(
        sentWithoutPlan(),
        { type: "note", text: "Staff note" },
        warehouse,
        now
      )
    ).toThrow("tracking_forbidden");
  });
});

describe("Shipment deletion confirmation", () => {
  it("requires the exact shipment number, ignoring spaces and letter case", () => {
    expect(deletionConfirmationMatches("SM 669", "SM 669")).toBe(true);
    expect(deletionConfirmationMatches("sm669", "SM 669")).toBe(true);
    expect(deletionConfirmationMatches("SM 66", "SM 669")).toBe(false);
    expect(deletionConfirmationMatches("", "SM 669")).toBe(false);
    expect(deletionConfirmationMatches("   ", "SM 669")).toBe(false);
  });
});
