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

export type TrackingActor = {
  id: number;
  name: string;
  /** The real application role; preserve this value in audit records. */
  role: AppRole;
  /** Optional compatibility role derived from an explicit capability grant. */
  authorizationRole?: AppRole | null;
  /** Alias accepted by callers that label the preserved role explicitly. */
  actualRole?: AppRole;
};
export type TrackingMutation = { shipment: Shipment; action: string };

/**
 * A queued request may carry the user that created it. This is an ownership
 * fence, not an identity grant: the authenticated request user remains the
 * sole authority for authorization and actor data.
 */
export function assertTrackingOwnerFence(
  clientUserId: string | undefined,
  authenticatedUserId: number | string
): void {
  if (
    clientUserId !== undefined &&
    clientUserId !== String(authenticatedUserId)
  )
    throw new Error("sync_owner_mismatch");
}

export function parseTrackingRequest(input: unknown): TrackingRequest {
  return trackingRequestSchema.parse(input);
}

/** A bounded deterministic receipt key avoids the 128-byte sync_receipts key limit. */
export function trackingReceiptKey(requestId: string): string {
  return `tracking:${createHash("sha256").update(requestId).digest("hex")}`;
}

export function actorFromUser(
  user: Pick<User, "id" | "name">,
  role: AppRole,
  authorizationRole?: AppRole | null
): TrackingActor {
  const actor: TrackingActor = {
    id: user.id,
    name: user.name?.trim() || `user-${user.id}`,
    role,
  };
  if (authorizationRole && authorizationRole !== role) {
    actor.authorizationRole = authorizationRole;
    actor.actualRole = role;
  }
  return actor;
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
  const commandRole = actor.authorizationRole ?? actor.actualRole ?? actor.role;
  assertTrackingCommand(commandRole, current, parsed);
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

  if (
    !currentJourney &&
    actor.role === "staff" &&
    parsed.type === "stage" &&
    parsed.stage === "preparing"
  ) {
    next.journey = {
      stage: "preparing",
      branch: inferredBranch(current),
      startedAt: now,
      expectedDays: 9,
      updatedAt: now,
      notes: [noteFor({ type: "note", text: parsed.reason }, actor, now)],
    };
    journeySchema.parse(next.journey);
    return { shipment: next, action: "tracking_stage" };
  }
  if (
    !currentJourney &&
    parsed.type === "stage" &&
    current.status === "في الطريق" &&
    parsed.stage !== "preparing"
  ) {
    requireSendable(current);
    next.journey = {
      stage: parsed.stage,
      branch: inferredBranch(current),
      startedAt: now,
      expectedDays: 9,
      updatedAt: now,
      notes: [noteFor({ type: "note", text: parsed.reason }, actor, now)],
    };
    next.status = stageShipmentStatus(parsed.stage);
    journeySchema.parse(next.journey);
    return { shipment: next, action: "tracking_stage" };
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
