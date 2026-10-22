import { createHash } from "node:crypto";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { recordKeys, records } from "../drizzle/schema";
import type { Shipment } from "@shared/operations";
import {
  normalizePublicTracking,
  publicTrackingInputSchema,
  publicTrackingProjection,
  publicTrackingResultSchema,
  type PublicTrackingInput,
  type PublicTrackingResult,
} from "@shared/publicTracking";

/**
 * Deliberately small structural type: the public lookup only needs Drizzle's
 * read-only select builder. Keeping this structural also makes the service
 * straightforward to exercise with an anonymous in-memory fake database.
 */
export type PublicTrackingDb = {
  select: (...args: any[]) => any;
};

type TrackingRow = {
  recordId?: unknown;
  data?: unknown;
  updatedAt?: Date | string | null;
};

function isShipmentData(data: unknown): data is Shipment {
  return typeof data === "object" && data !== null;
}

function project(
  row: TrackingRow | undefined,
  input: PublicTrackingInput
): PublicTrackingResult {
  if (!row || !isShipmentData(row.data)) return { found: false };
  // The trusted records table is shared. Sync preserves historical UI scope labels
  // in JSON; like publicRecord(), canonicalize only this read, never stored data.
  // Device-only drafts cannot reach this function because they have no DB row.
  const shipment: Shipment = { ...row.data, scope: "shared" };
  try {
    return publicTrackingProjection(shipment, input, row.updatedAt);
  } catch {
    // Malformed or legacy private data is indistinguishable from not found.
    return { found: false };
  }
}

async function rowByRecordId(
  db: PublicTrackingDb,
  recordId: string
): Promise<TrackingRow | undefined> {
  const rows = await db
    .select({
      data: records.data,
      updatedAt: records.updatedAt,
      recordId: records.recordId,
    })
    .from(records)
    .where(and(eq(records.entity, "shipment"), eq(records.recordId, recordId)))
    .limit(1);
  return (rows as TrackingRow[])[0];
}

export function canonicalTrackingExpression(): SQL {
  let expression: SQL = sql`JSON_UNQUOTE(JSON_EXTRACT(${records.data}, '$.tracking'))`;
  for (const digits of ["٠١٢٣٤٥٦٧٨٩", "۰۱۲۳۴۵۶۷۸۹"]) {
    for (let index = 0; index < 10; index++) {
      expression = sql`REPLACE(${expression}, ${digits[index]}, ${String(index)})`;
    }
  }
  return sql`LOWER(TRIM(${expression}))`;
}

async function rowByTrackingFallback(
  db: PublicTrackingDb,
  tracking: string
): Promise<TrackingRow | undefined> {
  // This remains a bounded, indexed-by-entity lookup; it never loads the project.
  // The JSON expression is intentionally exact (not a substring or broad scan).
  const rows = await db
    .select({
      data: records.data,
      updatedAt: records.updatedAt,
      recordId: records.recordId,
    })
    .from(records)
    .where(
      and(
        eq(records.entity, "shipment"),
        sql`${canonicalTrackingExpression()} = ${tracking}`
      )
    )
    .limit(1);
  return (rows as TrackingRow[])[0];
}

/**
 * Public, read-only shipment lookup. Only the normalized tracking number is
 * used to select a server record; the phone is used exclusively by the shared
 * projection to select matching goods.
 */
export async function lookupPublicTracking(
  db: PublicTrackingDb,
  input: PublicTrackingInput
): Promise<PublicTrackingResult> {
  const parsed = publicTrackingInputSchema.parse(input);
  const tracking = normalizePublicTracking(parsed.tracking);

  const keyRows = await db
    .select({ recordId: recordKeys.recordId })
    .from(recordKeys)
    .where(
      and(
        eq(recordKeys.keyType, "shipment-tracking"),
        eq(recordKeys.keyValue, tracking)
      )
    )
    .limit(1);
  const keyedRecordId = (keyRows as Array<{ recordId?: unknown }>)[0]?.recordId;

  if (typeof keyedRecordId === "string" && keyedRecordId.length > 0) {
    const row = await rowByRecordId(db, keyedRecordId);
    if (row) return publicTrackingResultSchema.parse(project(row, parsed));
  }

  const fallback = await rowByTrackingFallback(db, tracking);
  return publicTrackingResultSchema.parse(project(fallback, parsed));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export type PublicTrackingLimiterOptions = {
  ttlMs?: number;
  maxEntries?: number;
  maxPerInstance?: number;
  maxPerIp?: number;
  maxPerShipment?: number;
};

type LimitBucket = { expiresAt: number; count: number };

/**
 * Per-instance bounded limiter. It stores only SHA-256 identities, never raw
 * phones or IPs, and is intentionally generous for shared/proxy addresses.
 */
export class PublicTrackingLimiter {
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly maxPerInstance: number;
  private readonly maxPerIp: number;
  private readonly maxPerShipment: number;
  private readonly buckets = new Map<string, LimitBucket>();
  private readonly globalKey = `global:${sha256("public-tracking-instance")}`;

  constructor(options: PublicTrackingLimiterOptions = {}) {
    this.ttlMs = options.ttlMs ?? 10 * 60 * 1000;
    this.maxEntries = options.maxEntries ?? 4096;
    this.maxPerInstance = options.maxPerInstance ?? 5000;
    this.maxPerIp = options.maxPerIp ?? 120;
    this.maxPerShipment = options.maxPerShipment ?? 20;
  }

  check(clientAddress: string, tracking: string, now = Date.now()): boolean {
    this.prune(now);
    const addressHash = sha256(clientAddress || "unknown");
    const trackingHash = sha256(normalizePublicTracking(tracking));
    const ipKey = `ip:${addressHash}`;
    const shipmentKey = `shipment:${addressHash}:${trackingHash}`;
    const global = this.buckets.get(this.globalKey);
    const ip = this.buckets.get(ipKey);
    const shipment = this.buckets.get(shipmentKey);
    if (
      (global?.count ?? 0) >= this.maxPerInstance ||
      (ip?.count ?? 0) >= this.maxPerIp ||
      (shipment?.count ?? 0) >= this.maxPerShipment
    )
      return false;

    this.touch(this.globalKey, global, now);
    this.touch(ipKey, ip, now, this.maxPerIp);
    this.touch(shipmentKey, shipment, now, this.maxPerShipment);
    this.bound();
    return true;
  }

  reset(): void {
    this.buckets.clear();
  }

  get size(): number {
    return this.buckets.size;
  }

  private touch(
    key: string,
    current: LimitBucket | undefined,
    now: number,
    _limit?: number
  ): void {
    if (!current || current.expiresAt <= now) {
      this.buckets.set(key, { expiresAt: now + this.ttlMs, count: 1 });
      return;
    }
    current.count += 1;
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.expiresAt <= now) this.buckets.delete(key);
    }
  }

  private bound(): void {
    while (this.buckets.size > this.maxEntries) {
      const oldest = [...this.buckets.keys()].find(
        key => key !== this.globalKey
      );
      if (!oldest) break;
      this.buckets.delete(oldest);
    }
  }
}

export const publicTrackingLimiter = new PublicTrackingLimiter();

/** Uses Express's trusted req.ip/socket address only; never reads forwarded headers. */
export function trustedClientAddress(req: {
  ip?: string;
  socket?: { remoteAddress?: string | null };
}): string {
  if (typeof req.ip === "string" && req.ip.trim()) return req.ip.trim();
  if (
    typeof req.socket?.remoteAddress === "string" &&
    req.socket.remoteAddress.trim()
  )
    return req.socket.remoteAddress.trim();
  return "unknown";
}
