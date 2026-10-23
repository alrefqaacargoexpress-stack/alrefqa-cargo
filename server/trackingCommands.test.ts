import { describe, expect, it } from "vitest";
import {
  addPackingGoods,
  closePackingCarton,
  createPackedShipment,
} from "@shared/packing";
import { applyTrackingCommand, trackingReceiptKey } from "./tracking";
import { summaryOf } from "@shared/tracking";
const now = "2026-10-21T16:00:00.000Z";
const supervisor = { id: 321, name: "Supervisor", role: "supervisor" as const };
const admin = { ...supervisor, role: "admin" as const };
const tracker = { id: 789, name: "Tracker", role: "tracking_staff" as const };
const create = () =>
  createPackedShipment({
    tracking: "TRACE-CMD",
    source: "dubai",
    pricePerKg: 12,
    pricePerKgMRU: 100,
  });
const ready = () =>
  closePackingCarton(
    addPackingGoods(create(), {
      name: "Brand",
      phone: "",
      unitWeight: 2,
      pieces: 3,
    })
  );
const plan = () =>
  applyTrackingCommand(
    ready(),
    {
      type: "plan",
      stage: "preparing",
      startedAt: now,
      expectedDays: 9,
      reason: "Plan reviewed",
    },
    supervisor,
    now
  ).shipment;
describe("Server tracking command integrity", () => {
  it("records the supervisor and server time without altering cargo or prices", () => {
    const original = ready();
    const saved = applyTrackingCommand(
      original,
      {
        type: "plan",
        stage: "preparing",
        startedAt: now,
        expectedDays: 9,
        reason: "Plan reviewed",
      },
      supervisor,
      now
    ).shipment;
    expect(saved.packing).toEqual(original.packing);
    expect(saved.amount).toBe(original.amount);
    expect(saved.journey?.notes[0]).toMatchObject({
      actorId: 321,
      actorName: "Supervisor",
      at: now,
      text: "Plan reviewed",
    });
    expect(original.journey).toBeUndefined();
  });
  it("allows only authorized staff milestones and never skips or advances merely because time passed", () => {
    const original = plan();
    const next = applyTrackingCommand(
      original,
      { type: "stage", stage: "dubai_airport", reason: "Sent" },
      tracker,
      now
    ).shipment;
    expect(next.journey?.stage).toBe("dubai_airport");
    expect(next.status).toBe("في الطريق");
    expect(() =>
      applyTrackingCommand(
        next,
        { type: "stage", stage: "dubai_customs", reason: "Checked" },
        tracker,
        now
      )
    ).toThrow("tracking_forbidden");
    expect(next.journey?.notes.at(-1)?.actorId).toBe(789);
  });
  it("rejects sending a packing shipment with an open nonempty carton", () => {
    const original = addPackingGoods(create(), {
      name: "Brand",
      phone: "",
      unitWeight: 1,
      pieces: 1,
    });
    const planned = applyTrackingCommand(
      original,
      {
        type: "plan",
        stage: "preparing",
        startedAt: now,
        expectedDays: 9,
        reason: "Plan",
      },
      supervisor,
      now
    ).shipment;
    expect(() =>
      applyTrackingCommand(
        planned,
        { type: "stage", stage: "dubai_airport", reason: "Sent" },
        supervisor,
        now
      )
    ).toThrow("close_carton_first");
  });
  it("keeps previous notes and records a supervisor correction without erasing history", () => {
    const original = plan();
    const outbound = applyTrackingCommand(
      original,
      { type: "stage", stage: "to_dakar", reason: "Confirmed location" },
      supervisor,
      now
    ).shipment;
    const corrected = applyTrackingCommand(
      outbound,
      {
        type: "stage",
        stage: "dubai_airport",
        reason: "Correct previous location",
      },
      supervisor,
      now
    ).shipment;
    expect(corrected.journey?.notes.length).toBe(3);
    expect(corrected.journey?.notes[1].text).toBe("Confirmed location");
    expect(outbound.journey?.stage).toBe("to_dakar");
  });
  it("requires the dedicated receiving-office confirmation for final arrival", () => {
    expect(() =>
      applyTrackingCommand(
        plan(),
        {
          type: "stage",
          stage: "arrived_office",
          reason: "Received at Nouakchott",
        },
        supervisor,
        now
      )
    ).toThrow("arrival_confirmation_required");
  });
  it("preserves cargo and invoices outside the shipment while admin cancellation sets a tombstone", () => {
    const original = plan();
    const canceled = applyTrackingCommand(
      original,
      { type: "cancel", reason: "Admin canceled" },
      admin,
      now
    ).shipment;
    expect(canceled.deleted).toEqual({ at: now, reason: "Admin canceled" });
    expect(canceled.packing).toEqual(original.packing);
    expect(canceled.journey).toEqual(original.journey);
    expect(summaryOf(canceled).deleted).toBe(true);
    expect(() =>
      applyTrackingCommand(
        original,
        { type: "cancel", reason: "No permission" },
        supervisor,
        now
      )
    ).toThrow("tracking_forbidden");
  });
  it("bounds an idempotency key and distinguishes request identifiers", () => {
    expect(trackingReceiptKey("x".repeat(128)).length).toBeLessThanOrEqual(128);
    expect(trackingReceiptKey("one")).toBe(trackingReceiptKey("one"));
    expect(trackingReceiptKey("one")).not.toBe(trackingReceiptKey("two"));
  });
});
