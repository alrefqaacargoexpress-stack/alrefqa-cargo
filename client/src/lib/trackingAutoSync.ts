import {
  actionRole,
  permissionAllowed,
  type PermissionMap,
} from "@shared/permissions";
import {
  assertTrackingCommand,
  canSuperviseTracking,
  type TrackingCommitInput,
  type TrackingCommand,
} from "@shared/tracking";
import type { AppRole, Shipment } from "@shared/operations";
import type { OfficeId } from "@shared/branches";
import {
  acknowledgeTrackingCommit,
  loadTrackingCache,
  type TrackingCache,
  type TrackingPending,
  type TrackingShipment,
} from "./trackingStore";

export type TrackingCommitResult = {
  requestId: string;
  shipment: unknown;
  version: number;
};

export type TrackingSyncEnvironment = {
  userId: string;
  role: AppRole;
  permissions?: PermissionMap;
  offices: OfficeId[] | null;
  /** Optional explicit capability returned by the access endpoint. */
  canUpdateTracking?: boolean;
  isCurrent: () => boolean;
  commit: (
    input: TrackingCommitInput & { clientUserId?: string }
  ) => Promise<TrackingCommitResult>;
};

export type TrackingSyncConflictKind =
  | "blocked"
  | "conflict"
  | "network"
  | "error";

export type TrackingSyncConflict = {
  requestId: string;
  shipmentId: string;
  kind: TrackingSyncConflictKind;
  message: string;
};

export type TrackingSyncApplied = {
  requestId: string;
  shipmentId: string;
  version: number;
};

export type TrackingSyncResult = {
  applied: TrackingSyncApplied[];
  conflicts: TrackingSyncConflict[];
  attempted: number;
  pending: number;
  network: boolean;
  blocked: boolean;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "tracking_sync_failed";
}

function isNetworkError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return Boolean(
    (typeof navigator !== "undefined" && navigator.onLine === false) ||
      /network|fetch|timeout|offline|abort|econn|socket|unavailable/.test(message)
  );
}

function isBlockedError(error: unknown): boolean {
  return /forbidden|permission|unauthorized|owner|scope|office|role|blocked/.test(
    errorMessage(error).toLowerCase()
  );
}

function conflictKind(error: unknown): TrackingSyncConflictKind {
  if (isNetworkError(error)) return "network";
  if (isBlockedError(error)) return "blocked";
  if (/conflict|version|stale|reuse/.test(errorMessage(error).toLowerCase()))
    return "conflict";
  return "error";
}

function officeAllowed(
  env: TrackingSyncEnvironment,
  shipment: TrackingShipment | undefined
): boolean {
  if (env.role === "admin") return true;
  if (!env.offices?.length || !shipment) return false;
  if (env.role === "office_manager")
    return Boolean(shipment.officeId && env.offices.includes(shipment.officeId));
  // Server writes are governed by ownerOffice (officeId/source), not by the
  // journey branch. If the sanitized detail has no owner office, fail closed.
  return Boolean(shipment.officeId && env.offices.includes(shipment.officeId));
}

function commandAllowed(
  env: TrackingSyncEnvironment,
  cache: TrackingCache,
  pending: TrackingPending
): void {
  const subject = {
    role: env.role,
    offices: env.offices,
    permissions: env.permissions,
    canUpdateTracking: env.canUpdateTracking,
  };
  if (!permissionAllowed(subject, "tracking", "manage"))
    throw new Error("tracking_forbidden");
  if (env.canUpdateTracking === false && env.role === "staff")
    throw new Error("tracking_forbidden");
  if (env.role === "staff" && pending.command.type !== "stage")
    throw new Error("tracking_forbidden");
  if (
    env.role === "office_manager" &&
    pending.command.type === "transfer"
  )
    throw new Error("tracking_forbidden");
  if (pending.command.type === "cancel" && env.role !== "admin")
    throw new Error("tracking_forbidden");

  const shipment = cache.details[pending.shipmentId];
  if (!shipment && !canSuperviseTracking(env.role))
    throw new Error("tracking_scope_required");
  if (shipment) {
    if (!officeAllowed(env, shipment)) throw new Error("tracking_office_forbidden");
    const validationRole = actionRole(subject, "tracking", "manage") ?? env.role;
    assertTrackingCommand(
      validationRole,
      shipment as unknown as Shipment,
      pending.command as TrackingCommand
    );
  }
}

function emptyResult(): TrackingSyncResult {
  return {
    applied: [],
    conflicts: [],
    attempted: 0,
    pending: 0,
    network: false,
    blocked: false,
  };
}

/**
 * Sends the current user's stable tracking queue. The coordinator owns the
 * cross-workspace transport lock; this function owns only tracking storage
 * merging and request-level ownership checks.
 */
export async function syncTrackingQueue(
  env: TrackingSyncEnvironment
): Promise<TrackingSyncResult> {
  if (!env.isCurrent()) throw new Error("sync_owner_mismatch");
  const cache = loadTrackingCache(env.userId, env.role);
  const queue = cache.pending.slice();
  const result = emptyResult();
  result.attempted = queue.length;

  for (const pending of queue) {
    if (!env.isCurrent()) throw new Error("sync_owner_mismatch");
    let latest: TrackingCache;
    try {
      latest = loadTrackingCache(env.userId, env.role);
      commandAllowed(env, latest, pending);
    } catch (error) {
      const kind = conflictKind(error);
      result.conflicts.push({
        requestId: pending.requestId,
        shipmentId: pending.shipmentId,
        kind,
        message: errorMessage(error),
      });
      result.blocked ||= kind === "blocked";
      result.network ||= kind === "network";
      if (kind === "network") break;
      continue;
    }

    const input: TrackingCommitInput & { clientUserId: string } = {
      requestId: pending.requestId,
      shipmentId: pending.shipmentId,
      expectedVersion: pending.expectedVersion,
      command: pending.command,
      clientUserId: env.userId,
    };
    let response: TrackingCommitResult;
    try {
      // This is deliberately immediately before the network request: a stale
      // tab must not submit a previous user's queue under a new session.
      if (!env.isCurrent()) throw new Error("sync_owner_mismatch");
      response = await env.commit(input);
      // A session change during an in-flight request prevents local removal;
      // the server's receipt remains safely idempotent for the original owner.
      if (!env.isCurrent()) throw new Error("sync_owner_mismatch");
    } catch (error) {
      if (errorMessage(error) === "sync_owner_mismatch") throw error;
      const kind = conflictKind(error);
      result.conflicts.push({
        requestId: pending.requestId,
        shipmentId: pending.shipmentId,
        kind,
        message: errorMessage(error),
      });
      result.blocked ||= kind === "blocked";
      result.network ||= kind === "network";
      // A network/timeout result is uncertain: never invent a new request ID
      // and never remove the original queue entry.
      if (kind === "network") break;
      continue;
    }

    if (!env.isCurrent()) throw new Error("sync_owner_mismatch");
    const merged = await acknowledgeTrackingCommit(
      env.userId,
      env.role,
      pending.requestId,
      response
    );
    if (!env.isCurrent()) throw new Error("sync_owner_mismatch");
    result.applied.push({
      requestId: pending.requestId,
      shipmentId: pending.shipmentId,
      version: response.version,
    });
    // The merged cache is intentionally read back only for the final stats;
    // appended requests remain untouched by acknowledgeTrackingCommit.
    latest = merged;
  }

  result.pending = loadTrackingCache(env.userId, env.role).pending.length;
  return result;
}

export { isNetworkError as isTrackingNetworkError };
