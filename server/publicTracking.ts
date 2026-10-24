import { createHash } from "node:crypto";
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import {
  entityLifecycle,
  financeGoods,
  recordKeys,
  records,
  shipmentChargeAllocations,
  shipmentChargeComponents,
} from "../drizzle/schema";
import type { Shipment } from "@shared/operations";
import {
  normalizePublicTracking,
  normalizePublicPhone,
  publicTrackingInputSchema,
  publicTrackingProjection,
  publicTrackingResultSchema,
  type PublicTrackingPaymentStatus,
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

type LifecycleFact = { recordId?: unknown; action?: unknown };
type LegacyClaim = {
  shipmentId?: unknown;
  goodsId?: unknown;
  invoiceId?: unknown;
};
type ChargeComponent = {
  id?: unknown;
  shipmentId?: unknown;
  goodsId?: unknown;
  amount?: unknown;
};
type ChargeAllocation = {
  componentId?: unknown;
  invoiceId?: unknown;
  kind?: unknown;
  amount?: unknown;
};
type InvoiceFact = { recordId?: unknown; data?: unknown };
type PaymentState = {
  status: PublicTrackingPaymentStatus;
  billed: boolean;
  paid: boolean;
};

function asRows<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function amount(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function invoiceData(value: unknown): Record<string, any> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, any>)
    : null;
}

function invoiceIsPaid(data: unknown): boolean {
  return invoiceData(data)?.status === "مدفوعة";
}

function invoiceIsOnAccount(data: unknown): boolean {
  const invoice = invoiceData(data);
  return (
    invoice?.status === "دين" ||
    invoice?.finance?.paymentMode === "on_account" ||
    invoice?.paymentMode === "on_account"
  );
}

function invoiceIsPending(data: unknown): boolean {
  return invoiceData(data)?.status === "بانتظار الدفع";
}

function matchedGoods(
  shipment: Shipment,
  input: PublicTrackingInput
): string[] {
  const phone = normalizePublicPhone(input.phone);
  if (!phone || !shipment.packing) return [];
  return shipment.packing.cartons.flatMap(carton =>
    carton.goods
      .filter(
        item => !item.deleted && normalizePublicPhone(item.phone) === phone
      )
      .map(item => item.id)
  );
}

async function lifecycleFacts(
  db: PublicTrackingDb,
  entity: "shipment" | "invoice",
  ids: readonly string[]
): Promise<LifecycleFact[]> {
  if (!ids.length) return [];
  const rows = await db
    .select({
      recordId: entityLifecycle.recordId,
      action: entityLifecycle.action,
    })
    .from(entityLifecycle)
    .where(
      and(
        eq(entityLifecycle.entity, entity),
        inArray(entityLifecycle.recordId, ids)
      )
    )
    .limit(ids.length + 1);
  return asRows<LifecycleFact>(rows).filter(
    row => typeof row.recordId === "string" && ids.includes(row.recordId)
  );
}

function retired(facts: readonly LifecycleFact[], id: string): boolean {
  return facts.some(
    fact =>
      fact.recordId === id &&
      ["delete", "disable", "void"].includes(String(fact.action))
  );
}

function invoiceById(rows: readonly InvoiceFact[]) {
  const result = new Map<string, Record<string, any>>();
  for (const row of rows) {
    if (typeof row.recordId !== "string") continue;
    const data = invoiceData(row.data);
    if (data) result.set(row.recordId, data);
  }
  return result;
}

function combineStates(
  states: readonly PaymentState[],
  incomplete: boolean
): PublicTrackingPaymentStatus {
  if (incomplete || states.some(state => state.status === "review"))
    return "review";
  if (states.length && states.every(state => state.paid)) return "paid";
  if (states.length && states.every(state => state.status === "on_account"))
    return "on_account";
  if (states.some(state => state.billed || state.paid)) return "partial";
  return "unbilled";
}

/** Derive only a coarse status from exact phone-matched goods. */
export async function derivePublicPaymentStatus(
  db: PublicTrackingDb,
  shipment: Shipment,
  input: PublicTrackingInput
): Promise<PublicTrackingPaymentStatus> {
  const goodsIds = [...new Set(matchedGoods(shipment, input))];
  if (!goodsIds.length) return "review";
  const shipmentId = shipment.id;
  const [claimsRaw, componentsRaw] = await Promise.all([
    db
      .select({
        shipmentId: financeGoods.shipmentId,
        goodsId: financeGoods.goodsId,
        invoiceId: financeGoods.invoiceId,
      })
      .from(financeGoods)
      .where(
        and(
          eq(financeGoods.shipmentId, shipmentId),
          inArray(financeGoods.goodsId, goodsIds)
        )
      )
      .limit(goodsIds.length + 1),
    db
      .select({
        id: shipmentChargeComponents.id,
        shipmentId: shipmentChargeComponents.shipmentId,
        goodsId: shipmentChargeComponents.goodsId,
        amount: shipmentChargeComponents.amount,
      })
      .from(shipmentChargeComponents)
      .where(
        and(
          eq(shipmentChargeComponents.shipmentId, shipmentId),
          inArray(shipmentChargeComponents.goodsId, goodsIds)
        )
      )
      .limit(goodsIds.length + 1),
  ]);
  const claims = asRows<LegacyClaim>(claimsRaw).filter(
    row =>
      row.shipmentId === shipmentId &&
      typeof row.goodsId === "string" &&
      goodsIds.includes(row.goodsId)
  );
  const components = asRows<ChargeComponent>(componentsRaw).filter(
    row =>
      row.shipmentId === shipmentId &&
      typeof row.id === "string" &&
      typeof row.goodsId === "string" &&
      goodsIds.includes(row.goodsId)
  );
  const componentIds = components.map(row => row.id as string);
  const allocations = componentIds.length
    ? asRows<ChargeAllocation>(
        await db
          .select({
            componentId: shipmentChargeAllocations.componentId,
            invoiceId: shipmentChargeAllocations.invoiceId,
            kind: shipmentChargeAllocations.kind,
            amount: shipmentChargeAllocations.amount,
          })
          .from(shipmentChargeAllocations)
          .where(inArray(shipmentChargeAllocations.componentId, componentIds))
          .limit(componentIds.length * 20 + 1)
      ).filter(
        row =>
          typeof row.componentId === "string" &&
          componentIds.includes(row.componentId) &&
          typeof row.invoiceId === "string"
      )
    : [];
  const invoiceIds = [
    ...new Set(
      [
        ...claims.map(row => row.invoiceId),
        ...allocations.map(row => row.invoiceId),
      ].filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];
  const invoiceRows = invoiceIds.length
    ? await db
        .select({ recordId: records.recordId, data: records.data })
        .from(records)
        .where(
          and(
            eq(records.entity, "invoice"),
            inArray(records.recordId, invoiceIds)
          )
        )
        .limit(invoiceIds.length + 1)
    : [];
  const invoiceLifecycle = await lifecycleFacts(db, "invoice", invoiceIds);
  const invoices = invoiceById(asRows<InvoiceFact>(invoiceRows));
  const activeInvoice = (id: string) =>
    invoices.has(id) &&
    !retired(invoiceLifecycle, id) &&
    !invoiceData(invoices.get(id))?.deleted;
  const states: PaymentState[] = [];
  let incomplete = false;
  const claimsByGood = new Map<string, LegacyClaim[]>();
  const componentsByGood = new Map<string, ChargeComponent[]>();
  for (const claim of claims) {
    const list = claimsByGood.get(claim.goodsId as string) ?? [];
    list.push(claim);
    claimsByGood.set(claim.goodsId as string, list);
  }
  for (const component of components) {
    const list = componentsByGood.get(component.goodsId as string) ?? [];
    list.push(component);
    componentsByGood.set(component.goodsId as string, list);
  }

  for (const goodId of goodsIds) {
    const goodComponents = componentsByGood.get(goodId) ?? [];
    if (goodComponents.length) {
      for (const component of goodComponents) {
        const required = amount(component.amount);
        if (required === null || required <= 0) {
          states.push({ status: "review", billed: false, paid: false });
          continue;
        }
        const rows = allocations.filter(
          row => row.componentId === component.id
        );
        const voidedInvoices = new Set(
          rows
            .filter(row => row.kind === "void")
            .map(row => row.invoiceId as string)
        );
        const activeRows = rows.filter(
          row =>
            row.kind !== "void" &&
            !voidedInvoices.has(row.invoiceId as string) &&
            activeInvoice(row.invoiceId as string)
        );
        const missingInvoice = rows.some(
          row =>
            row.kind !== "void" &&
            !voidedInvoices.has(row.invoiceId as string) &&
            !activeInvoice(row.invoiceId as string)
        );
        let billed = 0;
        let paid = 0;
        for (const row of activeRows) {
          const value = amount(row.amount);
          if (value === null) {
            incomplete = true;
            continue;
          }
          if (row.kind === "invoice") billed += value;
          if (row.kind === "payment") paid += value;
        }
        billed = Math.min(required, billed + paid);
        paid = Math.min(required, paid);
        const fullyPaid =
          paid >= required ||
          (billed >= required &&
            activeRows.some(row =>
              invoiceIsPaid(invoices.get(row.invoiceId as string))
            ));
        const onAccount =
          billed >= required &&
          activeRows.some(row =>
            invoiceIsOnAccount(invoices.get(row.invoiceId as string))
          );
        states.push({
          status: missingInvoice
            ? "review"
            : fullyPaid
              ? "paid"
              : onAccount
                ? "on_account"
                : billed > 0
                  ? "partial"
                  : "unbilled",
          billed: billed > 0,
          paid: fullyPaid,
        });
      }
      continue;
    }

    const goodClaims = claimsByGood.get(goodId) ?? [];
    if (!goodClaims.length) {
      if (components.length || claims.length) incomplete = true;
      states.push({ status: "unbilled", billed: false, paid: false });
      continue;
    }
    const claimInvoices = goodClaims
      .map(claim =>
        typeof claim.invoiceId === "string" ? claim.invoiceId : null
      )
      .filter((id): id is string => Boolean(id));
    if (!claimInvoices.length || claimInvoices.some(id => !activeInvoice(id))) {
      states.push({ status: "review", billed: false, paid: false });
      continue;
    }
    const facts = claimInvoices
      .map(id => invoices.get(id))
      .filter((data): data is Record<string, any> => Boolean(data));
    const allPaid = facts.length > 0 && facts.every(invoiceIsPaid);
    const allOnAccount = facts.length > 0 && facts.every(invoiceIsOnAccount);
    const anyPending = facts.some(invoiceIsPending);
    states.push({
      status: allPaid
        ? "paid"
        : allOnAccount
          ? "on_account"
          : anyPending
            ? "partial"
            : "review",
      billed: true,
      paid: allPaid,
    });
  }
  return combineStates(states, incomplete);
}

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
    if (row) {
      const retiredShipment = await lifecycleFacts(db, "shipment", [
        keyedRecordId,
      ]);
      if (retired(retiredShipment, keyedRecordId))
        return publicTrackingResultSchema.parse({ found: false });
      const result = project(row, parsed);
      if (!result.found) return publicTrackingResultSchema.parse(result);
      const shipment = {
        ...(row.data as Shipment),
        scope: "shared",
      } as Shipment;
      const paymentStatus = await derivePublicPaymentStatus(
        db,
        shipment,
        parsed
      );
      return publicTrackingResultSchema.parse(
        publicTrackingProjection(shipment, parsed, row.updatedAt, paymentStatus)
      );
    }
  }

  const fallback = await rowByTrackingFallback(db, tracking);
  if (!fallback) return publicTrackingResultSchema.parse({ found: false });
  const fallbackId =
    typeof fallback.recordId === "string"
      ? fallback.recordId
      : isShipmentData(fallback.data) && typeof fallback.data.id === "string"
        ? fallback.data.id
        : null;
  if (fallbackId) {
    const retiredShipment = await lifecycleFacts(db, "shipment", [fallbackId]);
    if (retired(retiredShipment, fallbackId))
      return publicTrackingResultSchema.parse({ found: false });
  }
  const result = project(fallback, parsed);
  if (!result.found) return publicTrackingResultSchema.parse(result);
  const shipment = {
    ...(fallback.data as Shipment),
    scope: "shared",
  } as Shipment;
  const paymentStatus = await derivePublicPaymentStatus(db, shipment, parsed);
  return publicTrackingResultSchema.parse(
    publicTrackingProjection(
      shipment,
      parsed,
      fallback.updatedAt,
      paymentStatus
    )
  );
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
