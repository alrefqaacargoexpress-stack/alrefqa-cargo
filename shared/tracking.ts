import { z } from "zod";
import type { AppRole, Shipment } from "./operations";
export const stageIds = [
  "preparing",
  "dubai_airport",
  "dubai_customs",
  "to_dakar",
  "dakar_airport",
  "to_nouakchott",
  "arrived_office",
] as const;
export type TrackingStage = (typeof stageIds)[number];
export const branchIds = [
  "dubai",
  "turkey",
  "china",
  "dakar",
  "nouakchott",
] as const;
export type TrackingBranch = (typeof branchIds)[number];
export const stageDurations = [
  { min: 1, max: 2 },
  { min: 1, max: 1 },
  { min: 1, max: 2 },
  { min: 1, max: 2 },
  { min: 1, max: 1 },
  { min: 1, max: 3 },
  { min: 0, max: 0 },
] as const;
export const staffStageTargets: TrackingStage[] = [
  "dubai_airport",
  "to_dakar",
  "to_nouakchott",
];
export const warehouseStageTargets: TrackingStage[] = stageIds.filter(
  stage => stage !== "preparing"
);
export const trackingNoteSchema = z
  .object({
    id: z.string().min(1).max(128),
    text: z.string().trim().min(1).max(2000),
    at: z.string().datetime(),
    actorId: z.number().int().positive(),
    actorName: z.string().max(320),
  })
  .strict();
export const journeySchema = z
  .object({
    stage: z.enum(stageIds),
    branch: z.enum(branchIds),
    startedAt: z.string().datetime(),
    expectedDays: z.number().int().min(6).max(365),
    updatedAt: z.string().datetime(),
    notes: z.array(trackingNoteSchema).max(5000),
  })
  .strict();
export type ShipmentJourney = z.infer<typeof journeySchema>;
const reason = z.string().trim().min(1).max(500);
export const trackingCommandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("plan"),
      stage: z.enum(stageIds),
      startedAt: z.string().datetime(),
      expectedDays: z.number().int().min(6).max(365),
      reason,
    })
    .strict(),
  z
    .object({ type: z.literal("stage"), stage: z.enum(stageIds), reason })
    .strict(),
  z
    .object({
      type: z.literal("note"),
      text: z.string().trim().min(1).max(2000),
    })
    .strict(),
  z
    .object({ type: z.literal("transfer"), branch: z.enum(branchIds), reason })
    .strict(),
  z.object({ type: z.literal("cancel"), reason }).strict(),
]);
export type TrackingCommand = z.infer<typeof trackingCommandSchema>;
export const trackingRequestSchema = z
  .object({
    requestId: z.string().min(1).max(128),
    shipmentId: z.string().min(1).max(128),
    expectedVersion: z.number().int().positive(),
    command: trackingCommandSchema,
  })
  .strict();
export type TrackingRequest = z.infer<typeof trackingRequestSchema>;
export type TrackingSummary = {
  id: string;
  tracking: string;
  status: Shipment["status"];
  stage: TrackingStage | null;
  branch: TrackingBranch | null;
  startedAt: string | null;
  expectedDays: number | null;
  updatedAt: string | null;
  version: number;
  deleted: boolean;
};
export function canTrackingDetails(role: AppRole | null) {
  return Boolean(role && role !== "viewer");
}
export function canNoteTracking(role: AppRole | null) {
  return (
    role === "admin" ||
    role === "office_manager" ||
    role === "supervisor" ||
    role === "tracking_staff" ||
    role === "staff"
  );
}
export function canSuperviseTracking(role: AppRole | null) {
  return role === "admin" || role === "supervisor" || role === "office_manager";
}
export function canExportTracking(role: AppRole | null) {
  return canSuperviseTracking(role);
}
export function canUseOperations(role: AppRole | null) {
  return Boolean(role && role !== "viewer" && role !== "tracking_staff");
}
export function assertTrackingCommand(
  role: AppRole | null,
  shipment: Shipment,
  command: TrackingCommand
) {
  if (shipment.deleted) throw new Error("shipment_deleted");
  if (role === "staff" && command.type !== "stage")
    throw new Error("tracking_forbidden");
  if (
    role === "staff" &&
    command.type === "stage" &&
    !shipment.journey &&
    command.stage === "preparing" &&
    shipment.status === "قيد التجهيز"
  )
    return;
  if (command.type === "cancel") {
    if (role !== "admin") throw new Error("tracking_forbidden");
    return;
  }
  if (command.type === "note") {
    if (!canNoteTracking(role)) throw new Error("tracking_forbidden");
  } else if (!canSuperviseTracking(role)) {
    if (
      command.type !== "stage" ||
      !canNoteTracking(role) ||
      !shipment.journey ||
      stageIds.indexOf(command.stage) !==
        stageIds.indexOf(shipment.journey.stage) + 1 ||
      !(role === "staff" ? warehouseStageTargets : staffStageTargets).includes(
        command.stage
      )
    )
      throw new Error("tracking_forbidden");
  }
  if (command.type !== "plan" && !shipment.journey)
    throw new Error("tracking_plan_required");
}
export function stageShipmentStatus(stage: TrackingStage): Shipment["status"] {
  return stage === "preparing"
    ? "قيد التجهيز"
    : stage === "arrived_office"
      ? "وصلت للمكتب"
      : "في الطريق";
}
export function summaryOf(
  shipment: Shipment,
  version = shipment.version ?? 1
): TrackingSummary {
  return {
    id: shipment.id,
    tracking: shipment.tracking,
    status: shipment.status,
    stage: shipment.journey?.stage ?? null,
    branch: shipment.journey?.branch ?? null,
    startedAt: shipment.journey?.startedAt ?? null,
    expectedDays: shipment.journey?.expectedDays ?? null,
    updatedAt: shipment.journey?.updatedAt ?? null,
    version,
    deleted: Boolean(shipment.deleted),
  };
}
/** Planned dates never advance the recorded stage. Allocate every selected day exactly once. */
export function trackingSchedule(
  journey: Pick<ShipmentJourney, "stage" | "startedAt" | "expectedDays">
) {
  const days = z.number().int().min(6).max(365).parse(journey.expectedDays);
  const weights = stageDurations.slice(0, 6).map(d => (d.min + d.max) / 2);
  const total = weights.reduce((a, b) => a + b, 0);
  const spare = days - 6;
  const shares = weights.map(w => (spare * w) / total);
  const allocated = shares.map(n => 1 + Math.floor(n));
  let left = days - allocated.reduce((a, b) => a + b, 0);
  const order = shares
    .map((n, i) => ({ i, f: n - Math.floor(n) }))
    .sort((a, b) => b.f - a.f || a.i - b.i);
  for (const row of order) {
    if (!left) break;
    allocated[row.i]++;
    left--;
  }
  let cursor = new Date(journey.startedAt);
  if (Number.isNaN(cursor.valueOf())) throw new Error("invalid_tracking_date");
  const current = stageIds.indexOf(journey.stage);
  return stageIds.map((id, index) => {
    const startsAt = cursor.toISOString();
    const length = allocated[index] ?? 0;
    cursor = new Date(cursor.valueOf() + length * 86400000);
    return {
      id,
      ...stageDurations[index],
      days: length,
      startsAt,
      endsAt: cursor.toISOString(),
      state:
        index < current
          ? ("completed" as const)
          : index === current
            ? ("current" as const)
            : ("upcoming" as const),
    };
  });
}
