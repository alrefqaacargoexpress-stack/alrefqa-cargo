import { createHash } from "node:crypto";
import {
  trackingCommandSchema,
  trackingRequestSchema,
  journeySchema,
  assertTrackingCommand,
  stageShipmentStatus,
  type TrackingCommand,
  type TrackingRequest,
} from "@shared/tracking";
import type { AppRole, Shipment } from "@shared/operations";
import { canonicalPackingShipment, packingTotals } from "@shared/packing";
import type { User } from "../drizzle/schema";

export type TrackingActor = { id: number; name: string; role: AppRole };
export type TrackingMutation = { shipment: Shipment; action: string };

export function parseTrackingRequest(input: unknown): TrackingRequest {
  return trackingRequestSchema.parse(input);
}

/** A bounded deterministic receipt key avoids the 128-byte sync_receipts key limit. */
export function trackingReceiptKey(requestId: string): string {
  return `tracking:${createHash("sha256").update(requestId).digest("hex")}`;
}

export function actorFromUser(
  user: Pick<User, "id" | "name">,
  role: AppRole
): TrackingActor {
  return { id: user.id, name: user.name?.trim() || `user-${user.id}`, role };
}

function inferredBranch(
  shipment: Shipment
): "dubai" | "turkey" | "china" | "dakar" | "nouakchott" {
  const source = shipment.packing?.source;
  if (source === "dubai" || source === "turkey" || source === "china")
    return source;
  return "nouakchott";
}

function requireSendable(shipment: Shipment): Shipment {
  if (!shipment.packing) return shipment;
  const activeGoods = shipment.packing.cartons
    .flatMap(c => c.goods)
    .filter(g => !g.deleted);
  if (!activeGoods.length) throw new Error("shipment_empty");
  if (
    shipment.packing.cartons.some(
      c => !c.closed && c.goods.some(g => !g.deleted)
    )
  )
    throw new Error("close_carton_first");
  return canonicalPackingShipment({ ...shipment, status: "في الطريق" });
}

function noteFor(
  command: Extract<TrackingCommand, { type: "note" }>,
  actor: TrackingActor,
  at: string
) {
  return {
    id: crypto.randomUUID(),
    text: command.text,
    at,
    actorId: actor.id,
    actorName: actor.name,
  };
}

/** Applies one already-authorized command. It never consults wall-clock time to advance a stage. */
export function applyTrackingCommand(
  current: Shipment,
  command: TrackingCommand,
  actor: TrackingActor,
  now = new Date().toISOString()
): TrackingMutation {
  const parsed = trackingCommandSchema.parse(command);
  assertTrackingCommand(actor.role, current, parsed);
  const next = structuredClone(current);
  const currentJourney = current.journey;

  if (parsed.type === "cancel") {
    if (current.deleted) throw new Error("shipment_deleted");
    next.deleted = { at: now, reason: parsed.reason };
    return { shipment: next, action: "tracking_cancel" };
  }

  if (parsed.type === "plan") {
    if (parsed.stage !== "preparing") requireSendable(current);
    next.journey = {
      stage: parsed.stage,
      branch: currentJourney?.branch ?? inferredBranch(current),
      startedAt: parsed.startedAt,
      expectedDays: parsed.expectedDays,
      updatedAt: now,
      notes: currentJourney?.notes ? structuredClone(currentJourney.notes) : [],
    };
    next.status = stageShipmentStatus(parsed.stage);
    if (parsed.reason)
      next.journey.notes.push(
        noteFor({ type: "note", text: parsed.reason }, actor, now)
      );
    journeySchema.parse(next.journey);
    return { shipment: next, action: "tracking_plan" };
  }

  if (!currentJourney) throw new Error("tracking_plan_required");
  if (parsed.type === "stage") {
    if (parsed.stage !== "preparing") requireSendable(current);
    next.journey = {
      ...structuredClone(currentJourney),
      stage: parsed.stage,
      updatedAt: now,
    };
    next.status = stageShipmentStatus(parsed.stage);
    next.journey.notes.push(
      noteFor({ type: "note", text: parsed.reason }, actor, now)
    );
    journeySchema.parse(next.journey);
    return { shipment: next, action: "tracking_stage" };
  }
  if (parsed.type === "note") {
    next.journey = {
      ...structuredClone(currentJourney),
      updatedAt: now,
      notes: [...currentJourney.notes, noteFor(parsed, actor, now)],
    };
    journeySchema.parse(next.journey);
    return { shipment: next, action: "tracking_note" };
  }
  if (parsed.type === "transfer") {
    next.journey = {
      ...structuredClone(currentJourney),
      branch: parsed.branch,
      updatedAt: now,
    };
    journeySchema.parse(next.journey);
    return { shipment: next, action: "tracking_transfer" };
  }
  throw new Error("invalid_tracking_command");
}

/** Useful in tests and reporting; schedules are informational and do not mutate a shipment. */
export function hasSendablePacking(shipment: Shipment): boolean {
  if (!shipment.packing) return true;
  try {
    requireSendable(shipment);
    return true;
  } catch {
    return false;
  }
}

export { packingTotals };
