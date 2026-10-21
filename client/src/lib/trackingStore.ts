import { z } from "zod";
import {
  branchIds,
  journeySchema,
  stageIds,
  trackingCommandSchema,
  trackingRequestSchema,
  type TrackingCommand,
  type TrackingRequest,
  type TrackingSummary,
} from "@shared/tracking";
import type { AppRole, Shipment } from "@shared/operations";

export type TrackingShipment = Pick<
  Shipment,
  "id" | "tracking" | "route" | "service" | "status" | "eta" | "version"
> & {
  journey?: Shipment["journey"];
  deleted?: Shipment["deleted"];
};
export type TrackingAudit = {
  id: number;
  actorId: number;
  actorName: string;
  actorRole: AppRole;
  at: string;
  entity: string;
  recordId: string;
  action: string;
  version?: number;
};
export type TrackingPending = TrackingRequest & {
  queuedAt: string;
  role: AppRole;
};
export type TrackingCache = {
  userId: string;
  role: AppRole;
  summaries: TrackingSummary[];
  details: Record<string, TrackingShipment>;
  pending: TrackingPending[];
  revision: number;
  savedAt: string;
};

const PROFILE_KEY = "alrefqaa-operations-last-profile-v1";
const PREFIX = "alrefqaa-tracking-cache-v2-";
const roles = [
  "admin",
  "staff",
  "accountant",
  "viewer",
  "tracking_staff",
  "supervisor",
] as const;
const shipmentStatuses = [
  "في الطريق",
  "وصلت للمكتب",
  "جاهزة للتسليم",
  "بانتظار الدفع",
  "قيد التجهيز",
  "مسلّمة",
] as const;
const safeId = z.string().min(1).max(128);
const summarySchema = z
  .object({
    id: safeId,
    tracking: z.string().max(320),
    status: z.enum(shipmentStatuses),
    stage: z.enum(stageIds).nullable(),
    branch: z.enum(branchIds).nullable(),
    startedAt: z.string().datetime().nullable(),
    expectedDays: z.number().int().min(6).max(365).nullable(),
    updatedAt: z.string().datetime().nullable(),
    version: z.number().int().nonnegative(),
    deleted: z.boolean(),
  })
  .strict();
const detailSchema = z
  .object({
    id: safeId,
    tracking: z.string().max(320),
    route: z.string().max(500),
    service: z.enum(["جوي", "بحري", "سريع"]),
    status: z.enum(shipmentStatuses),
    eta: z.string().max(160),
    journey: journeySchema.optional(),
    version: z.number().int().positive().optional(),
    deleted: z.object({ at: z.string(), reason: z.string() }).optional(),
  })
  .passthrough()
  .transform(value => ({
    id: value.id,
    tracking: value.tracking,
    route: value.route,
    service: value.service,
    status: value.status,
    eta: value.eta,
    journey: value.journey,
    version: value.version,
    deleted: value.deleted,
  }));
const pendingSchema = z
  .object({
    requestId: safeId,
    shipmentId: safeId,
    expectedVersion: z.number().int().positive(),
    command: trackingCommandSchema,
    queuedAt: z.string().datetime(),
    role: z.enum(roles),
  })
  .strict();
const cacheSchema = z
  .object({
    userId: z.string().regex(/^\d+$/),
    role: z.enum(roles),
    summaries: z.array(summarySchema).max(5000),
    details: z.record(safeId, detailSchema),
    pending: z.array(pendingSchema).max(500),
    revision: z.number().int().nonnegative(),
    savedAt: z.string().datetime(),
  })
  .strict();

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export const emptyTrackingCache = (
  userId: string,
  role: AppRole
): TrackingCache => ({
  userId,
  role,
  summaries: [],
  details: {},
  pending: [],
  revision: 0,
  savedAt: new Date(0).toISOString(),
});
function storage(): Storage {
  if (typeof window === "undefined")
    throw new Error("local_storage_unavailable");
  return window.localStorage;
}
function cacheKey(userId: string, role: AppRole) {
  return `${PREFIX}${userId}-${role}`;
}
function parseCache(raw: string): TrackingCache {
  return cacheSchema.parse(JSON.parse(raw)) as TrackingCache;
}
export function loadTrackingCache(
  userId: string,
  role: AppRole
): TrackingCache {
  const raw = storage().getItem(cacheKey(userId, role));
  return raw ? parseCache(raw) : emptyTrackingCache(userId, role);
}
let lock: Promise<IDBDatabase> | null = null;
function openLockDb() {
  if (!lock)
    lock = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined")
        return reject(new Error("local_lock_unavailable"));
      const request = indexedDB.open("alrefqaa-tracking-locks", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("locks");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  return lock;
}
async function withLock(key: string, write: () => void) {
  if (typeof navigator !== "undefined" && navigator.locks) {
    await navigator.locks.request(key, write);
    return;
  }
  const db = await openLockDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("locks", "readwrite");
    tx.objectStore("locks").get(key).onsuccess = () => {
      try {
        write();
        tx.objectStore("locks").put(Date.now(), key);
      } catch (error) {
        tx.abort();
        reject(error);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function saveTrackingCache(
  value: TrackingCache
): Promise<TrackingCache> {
  cacheSchema.parse(value);
  const next = clone(value);
  await withLock(cacheKey(value.userId, value.role), () => {
    const store = storage();
    const raw = store.getItem(cacheKey(value.userId, value.role));
    const current = raw
      ? parseCache(raw)
      : emptyTrackingCache(value.userId, value.role);
    if (current.revision !== value.revision)
      throw new Error("tracking_cache_revision_conflict");
    next.revision = current.revision + 1;
    next.savedAt = new Date().toISOString();
    store.setItem(cacheKey(value.userId, value.role), JSON.stringify(next));
  });
  return next;
}

export function parseTrackingSummaries(value: unknown): {
  items: TrackingSummary[];
  total: number;
  truncated: boolean;
} {
  const result = z
    .object({
      items: z.array(z.unknown()).max(5000),
      total: z.number().int().nonnegative(),
      truncated: z.boolean(),
    })
    .strict()
    .parse(value);
  return {
    items: result.items.map(item => summarySchema.parse(item)),
    total: result.total,
    truncated: result.truncated,
  };
}
export function parseTrackingDetail(value: unknown): TrackingShipment {
  const input = (value as { shipment?: unknown })?.shipment ?? value;
  return detailSchema.parse(input);
}
export function parseTrackingAudit(value: unknown): {
  items: TrackingAudit[];
  nextCursor: number | null;
} {
  const result = z
    .object({
      items: z.array(z.unknown()),
      nextCursor: z.number().int().nonnegative().nullable(),
    })
    .strict()
    .parse(value);
  const auditSchema = z
    .object({
      id: z.number().int().positive(),
      actorId: z.number().int().positive(),
      actorName: z.string().max(320),
      role: z.enum(roles).optional(),
      actorRole: z.enum(roles).optional(),
      at: z.string().datetime().optional(),
      occurredAt: z.string().datetime().optional(),
      createdAt: z
        .preprocess(
          value => (value instanceof Date ? value.toISOString() : value),
          z.string().datetime()
        )
        .optional(),
      entity: z.string().max(80),
      recordId: safeId,
      action: z.string().max(120),
      beforeVersion: z.number().int().positive().nullable().optional(),
      afterVersion: z.number().int().positive().nullable().optional(),
    })
    .passthrough();
  return {
    items: result.items.map(item => {
      const row = auditSchema.parse(item);
      return {
        id: row.id,
        actorId: row.actorId,
        actorName: row.actorName,
        actorRole: row.role ?? row.actorRole ?? "viewer",
        at:
          row.occurredAt ??
          row.at ??
          row.createdAt ??
          new Date(0).toISOString(),
        entity: row.entity,
        recordId: row.recordId,
        action: row.action,
        version: row.afterVersion ?? row.beforeVersion ?? undefined,
      };
    }),
    nextCursor: result.nextCursor,
  };
}
function nextExpectedVersion(cache: TrackingCache, shipmentId: string) {
  const current = cache.pending
    .filter(item => item.shipmentId === shipmentId)
    .at(-1)?.expectedVersion;
  return current === undefined
    ? (cache.summaries.find(item => item.id === shipmentId)?.version ??
        cache.details[shipmentId]?.version ??
        1)
    : current + 1;
}
export function queueTrackingCommand(
  cache: TrackingCache,
  role: AppRole,
  shipmentId: string,
  command: TrackingCommand
): TrackingCache {
  if (cache.pending.length >= 500) throw new Error("tracking_queue_full");
  const parsed = trackingCommandSchema.parse(command);
  const request: TrackingPending = {
    requestId: crypto.randomUUID(),
    shipmentId: safeId.parse(shipmentId),
    expectedVersion: nextExpectedVersion(cache, shipmentId),
    command: parsed,
    queuedAt: new Date().toISOString(),
    role,
  };
  trackingRequestSchema.parse({
    requestId: request.requestId,
    shipmentId: request.shipmentId,
    expectedVersion: request.expectedVersion,
    command: request.command,
  });
  return { ...cache, pending: [...cache.pending, request] };
}
export function removeAcknowledged(
  cache: TrackingCache,
  requestId: string,
  response: { requestId: string; shipment: unknown; version: number }
): TrackingCache {
  if (response.requestId !== requestId) return cache;
  const shipment = parseTrackingDetail(response.shipment);
  const pending = cache.pending.find(item => item.requestId === requestId);
  if (!pending || pending.shipmentId !== shipment.id) return cache;
  const version = z.number().int().positive().parse(response.version);
  return {
    ...cache,
    pending: cache.pending.filter(item => item.requestId !== requestId),
    details: { ...cache.details, [shipment.id]: { ...shipment, version } },
    summaries: cache.summaries.map(item =>
      item.id === shipment.id
        ? {
            ...item,
            stage: shipment.journey?.stage ?? null,
            branch: shipment.journey?.branch ?? null,
            startedAt: shipment.journey?.startedAt ?? null,
            expectedDays: shipment.journey?.expectedDays ?? null,
            updatedAt: shipment.journey?.updatedAt ?? null,
            status: shipment.status,
            version,
            deleted: Boolean(shipment.deleted),
          }
        : item
    ),
  };
}
export function readLastTrackingProfile(): {
  userId: string;
  role: AppRole;
  name?: string;
} | null {
  try {
    const value = JSON.parse(
      storage().getItem(PROFILE_KEY) ?? "null"
    ) as Record<string, unknown> | null;
    return value &&
      /^\d+$/.test(String(value.userId)) &&
      roles.includes(value.role as (typeof roles)[number])
      ? {
          userId: String(value.userId),
          role: value.role as AppRole,
          name: typeof value.name === "string" ? value.name : undefined,
        }
      : null;
  } catch {
    return null;
  }
}
export function writeLastTrackingProfile(profile: {
  userId: string;
  role: AppRole;
  name?: string;
}) {
  storage().setItem(PROFILE_KEY, JSON.stringify(profile));
}
export const trackingRoleValues = roles;
