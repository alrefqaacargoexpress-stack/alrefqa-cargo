import { describe, expect, it } from "vitest";
import { createPackedShipment } from "./packing";
import {
  assertTrackingCommand,
  canTrackingDetails,
  canSuperviseTracking,
  canExportTracking,
  stageIds,
  stageDurations,
  stageShipmentStatus,
  summaryOf,
  trackingSchedule,
  type ShipmentJourney,
} from "./tracking";
const journey: ShipmentJourney = {
  stage: "dubai_airport",
  branch: "dubai",
  startedAt: "2026-10-21T00:00:00.000Z",
  updatedAt: "2026-10-21T00:00:00.000Z",
  expectedDays: 9,
  notes: [],
};
const shipment = () => ({
  ...createPackedShipment({
    tracking: "TRACE",
    source: "dubai",
    pricePerKg: 12,
    pricePerKgMRU: 100,
  }),
  journey,
});
describe("Tracking phases and projected duration", () => {
  it("keeps the departure milestone and the existing phases and the supplied minimum/maximum windows", () => {
    expect(stageIds).toEqual([
      "preparing",
      "dubai_airport",
      "dubai_customs",
      "to_dakar",
      "departed_dakar",
      "dakar_airport",
      "to_nouakchott",
      "arrived_office",
    ]);
    expect(stageDurations.reduce((n, d) => n + d.min, 0)).toBe(6);
    expect(stageDurations.reduce((n, d) => n + d.max, 0)).toBe(12);
  });
  it("allocates the exact selected total, preserving every stage and never advancing real status by date", () => {
    for (const expectedDays of [6, 7, 8, 9, 10, 11, 30, 365]) {
      const schedule = trackingSchedule({ ...journey, expectedDays });
      expect(schedule.reduce((n, s) => n + s.days, 0)).toBe(expectedDays);
      expect(
        schedule
          .slice(0, -1)
          .filter(s => s.id !== "departed_dakar")
          .every(s => s.days >= 1)
      ).toBe(true);
      expect(schedule.at(-1)?.days).toBe(0);
      expect(schedule.filter(s => s.state === "current")[0].id).toBe(
        "dubai_airport"
      );
      expect(
        (new Date(schedule.at(-1)!.endsAt).valueOf() -
          new Date(journey.startedAt).valueOf()) /
          86400000
      ).toBe(expectedDays);
    }
  });
  it("rejects an unrealistic total below six days or invalid date", () => {
    expect(() => trackingSchedule({ ...journey, expectedDays: 5 })).toThrow();
    expect(() => trackingSchedule({ ...journey, startedAt: "bad" })).toThrow();
  });
  it("makes office arrival final tracking, distinct from delivery to the customer", () => {
    expect(stageShipmentStatus("arrived_office")).toBe("وصلت للمكتب");
    expect(stageShipmentStatus("preparing")).toBe("قيد التجهيز");
    expect(stageShipmentStatus("to_dakar")).toBe("في الطريق");
  });
  it("only exposes tracking metadata in a viewer summary", () => {
    const s = shipment();
    s.account = "Private customer";
    const summary = summaryOf(s, 9);
    expect(Object.keys(summary).sort()).toEqual(
      [
        "id",
        "tracking",
        "status",
        "stage",
        "branch",
        "startedAt",
        "expectedDays",
        "updatedAt",
        "version",
        "deleted",
      ].sort()
    );
    expect(JSON.stringify(summary)).not.toContain("Private customer");
    expect(summary.version).toBe(9);
    expect(canTrackingDetails("viewer")).toBe(false);
  });
  it("allows tracker notes and only permitted immediate forward milestones", () => {
    const s = shipment();
    expect(() =>
      assertTrackingCommand("tracking_staff", s, {
        type: "note",
        text: "Checked",
      })
    ).not.toThrow();
    expect(() =>
      assertTrackingCommand(
        "tracking_staff",
        { ...s, journey: { ...journey, stage: "preparing" } },
        { type: "stage", stage: "dubai_airport", reason: "Dispatched" }
      )
    ).not.toThrow();
    expect(() =>
      assertTrackingCommand("tracking_staff", s, {
        type: "stage",
        stage: "dubai_customs",
        reason: "Checked",
      })
    ).toThrow("tracking_forbidden");
    expect(() =>
      assertTrackingCommand("tracking_staff", s, {
        type: "stage",
        stage: "arrived_office",
        reason: "Skip",
      })
    ).toThrow("arrival_confirmation_required");
  });
  it("records departure explicitly without skipping ahead or claiming office arrival", () => {
    const current = {
      ...shipment(),
      journey: { ...journey, stage: "to_dakar" as const },
    };
    expect(() =>
      assertTrackingCommand("staff", current, {
        type: "stage",
        stage: "departed_dakar",
        reason: "Flight departed",
      })
    ).not.toThrow();
    expect(() =>
      assertTrackingCommand("staff", current, {
        type: "stage",
        stage: "dakar_airport",
        reason: "Skip departure",
      })
    ).toThrow("tracking_forbidden");
    expect(() =>
      assertTrackingCommand("admin", current, {
        type: "plan",
        stage: "arrived_office",
        startedAt: journey.startedAt,
        expectedDays: 9,
        reason: "Bypass receiving",
      })
    ).toThrow("arrival_confirmation_required");
    expect(current.journey.stage).toBe("to_dakar");
  });
  it("keeps supervisors on tracking and reports, with cancellations for the admin only", () => {
    const s = shipment();
    expect(canSuperviseTracking("supervisor")).toBe(true);
    expect(canExportTracking("supervisor")).toBe(true);
    expect(canExportTracking("tracking_staff")).toBe(false);
    expect(() =>
      assertTrackingCommand("supervisor", s, {
        type: "transfer",
        branch: "nouakchott",
        reason: "Transferred",
      })
    ).not.toThrow();
    expect(() =>
      assertTrackingCommand("supervisor", s, {
        type: "cancel",
        reason: "Canceled",
      })
    ).toThrow("tracking_forbidden");
    expect(() =>
      assertTrackingCommand("admin", s, { type: "cancel", reason: "Canceled" })
    ).not.toThrow();
  });
  it("does not let viewer or accountant mutate a tracking plan and rejects actions on archives", () => {
    const s = shipment();
    for (const role of ["viewer", "accountant", null] as const)
      expect(() =>
        assertTrackingCommand(role, s, { type: "note", text: "note" })
      ).toThrow("tracking_forbidden");
    expect(() =>
      assertTrackingCommand(
        "admin",
        { ...s, deleted: { at: journey.startedAt, reason: "old" } },
        { type: "note", text: "note" }
      )
    ).toThrow("shipment_deleted");
  });
});
