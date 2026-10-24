import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  allocateCentsByWeight,
  billComponentsInputSchema,
  fromCents,
  goodsForPacking,
  isClosedForExport,
  isConfirmedArrival,
  localCostInputSchema,
  registerExportInputSchema,
  settlementSnapshotInputSchema,
  storedExportCents,
  toCents,
  type BillComponentsInput,
  type LocalCostInput,
  type RegisterExportInput,
  type RecordComponentPaymentInput,
  type RegisterExportResult,
  type LocalCostResult,
  type ShipmentChargeAllocation,
  type ShipmentChargeComponent,
  type SettlementComponentView,
  type ShipmentSettlementSnapshot,
} from "@shared/shipmentSettlement";
import {
  financeEntrySchema,
  financialInvoiceSchema,
  type FinanceEntry,
  type FinancialInvoiceDetails,
} from "@shared/finance";
import { normalizeName, sourceCurrency } from "@shared/packing";
import type { Account, AppRole, Invoice, Shipment } from "@shared/operations";
import type { OfficeId } from "@shared/branches";
import { permissionAllowed } from "@shared/permissions";
import {
  cashMovements,
  cashRegisters,
  financeEntries,
  financeGoods,
  financeReceipts,
  records,
  shipmentCostApprovals,
  shipmentChargeAllocations,
  shipmentChargeComponents,
  users,
} from "../drizzle/schema";
import type { User } from "../drizzle/schema";
import {
  readOfficeScope,
  type OfficeScope,
  recordVisibleInOffice,
} from "./branches";
import { appendAudit } from "./audit";
import {
  canonicalInvoicePayment,
  readOfficeSettings,
  recordWalletReceipt,
} from "./office";
import { getDb } from "./db";
import { protectedProcedure, router } from "./_core/trpc";
import { assertActiveEntity } from "./lifecycle";

export type SettlementActor = Pick<User, "id" | "name" | "openId" | "role">;

const isoNow = () => new Date().toISOString();
const actorName = (user: Pick<User, "id" | "name">) =>
  user.name?.trim() || `user-${user.id}`;
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map(
      k =>
        `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`
    )
    .join(",")}}`;
}
const hash = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex");
const componentId = (shipmentId: string, goodsId: string, chargeKey: string) =>
  `shipment-component:${hash({ shipmentId, goodsId, chargeKey })}`;
const allocationId = (component: string, kind: string, requestKey: string) =>
  `shipment-allocation:${hash({ component, kind, requestKey })}`;
const entryId = (requestKey: string, suffix: string) =>
  `shipment-settlement-entry:${hash({ requestKey, suffix })}`;

function subject(scope: OfficeScope) {
  return scope;
}
function financeManage(
  scope: OfficeScope,
  key: "invoices" | "payments" | "expenses" | "shipment_prices"
) {
  return permissionAllowed(subject(scope), key, "manage");
}
export function settlementCanManage(
  scope: OfficeScope,
  key: "invoices" | "payments" | "expenses" | "shipment_prices"
) {
  return financeManage(scope, key);
}
export function settlementOfficeVisible(scope: OfficeScope, office: OfficeId) {
  return scope.role === "admin" || Boolean(scope.offices?.includes(office));
}
export function canRecordArrivalCost(scope: OfficeScope) {
  return Boolean(
    scope.role === "admin" ||
      (scope.offices?.length === 1 &&
        scope.offices[0] === "nouakchott" &&
        ["accountant", "general_accountant"].includes(scope.role ?? "") &&
        permissionAllowed(scope, "arrival_cost", "manage"))
  );
}
function financeView(scope: OfficeScope) {
  return [
    "invoices",
    "payments",
    "expenses",
    "shipment_prices",
    "finance_reports",
  ].some(key => permissionAllowed(subject(scope), key as any, "view"));
}
function forbidden(message = "finance_forbidden"): never {
  throw new TRPCError({ code: "FORBIDDEN", message });
}
function conflict(message = "version_conflict"): never {
  throw new TRPCError({ code: "CONFLICT", message });
}
function bad(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}
function asShipment(row: any): Shipment {
  return row.data as Shipment;
}
function activeShipment(shipment: Shipment) {
  if (shipment.deleted) bad("shipment_deleted");
  if (!shipment.packing) bad("shipment_unavailable");
}
function sourceOfficeOf(shipment: Shipment): OfficeId {
  const source = shipment.packing?.source as OfficeId | undefined;
  if (!source) bad("shipment_source_missing");
  return source;
}
function ensureTracking(shipment: Shipment, trackingNumber: string) {
  if (
    shipment.tracking.trim().toLowerCase() !==
    trackingNumber.trim().toLowerCase()
  )
    bad("tracking_confirmation_mismatch");
}
function ensureScope(scope: OfficeScope, office: OfficeId) {
  if (scope.role !== "admin" && !scope.offices?.includes(office)) forbidden();
}
async function lockActor(tx: any, user: SettlementActor) {
  await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)
    .for("update");
}
async function lockedShipment(tx: any, shipmentId: string) {
  await assertActiveEntity(tx, "shipment", shipmentId);
  const rows = await tx
    .select()
    .from(records)
    .where(
      and(eq(records.entity, "shipment"), eq(records.recordId, shipmentId))
    )
    .limit(1)
    .for("update");
  if (!rows[0])
    throw new TRPCError({ code: "NOT_FOUND", message: "shipment_not_found" });
  return { row: rows[0], shipment: asShipment(rows[0]) };
}
async function accountFor(tx: any, customerId: string): Promise<Account> {
  await assertActiveEntity(tx, "account", customerId);
  const rows = await tx
    .select()
    .from(records)
    .where(and(eq(records.entity, "account"), eq(records.recordId, customerId)))
    .limit(1)
    .for("update");
  if (!rows[0]) bad("customer_not_found");
  return rows[0].data as Account;
}
function goodsForShipment(shipment: Shipment) {
  return goodsForPacking(shipment.packing!);
}
function goodsById(shipment: Shipment) {
  return new Map(goodsForShipment(shipment).map(g => [g.id, g]));
}
function componentFromRow(row: any): ShipmentChargeComponent {
  return {
    id: row.id,
    shipmentId: row.shipmentId,
    goodsId: row.goodsId,
    chargeKey: row.chargeKey,
    kind: row.kind,
    officeId: row.officeId,
    currency: row.currency,
    amount: fromCents(toCents(row.amount)),
    actorId: row.actorId,
    requestKey: row.requestKey,
    data: (row.data ?? {}) as Record<string, unknown>,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
  };
}
function allocationFromRow(row: any): ShipmentChargeAllocation {
  return {
    id: row.id,
    componentId: row.componentId,
    invoiceId: row.invoiceId,
    kind: row.kind,
    amount: fromCents(toCents(row.amount)),
    actorId: row.actorId,
    requestKey: row.requestKey,
    data: row.data as Record<string, unknown> | null,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
  };
}
async function componentRows(tx: any, shipmentId: string) {
  return tx
    .select()
    .from(shipmentChargeComponents)
    .where(eq(shipmentChargeComponents.shipmentId, shipmentId));
}
async function allocationRows(tx: any, componentIds?: string[]) {
  const rows = await tx.select().from(shipmentChargeAllocations);
  return componentIds?.length
    ? rows.filter((r: any) => componentIds.includes(r.componentId))
    : rows;
}
function allocationSums(rows: any[]) {
  const map = new Map<
    string,
    { invoice: number; void: number; payment: number }
  >();
  for (const row of rows) {
    const current = map.get(row.componentId) ?? {
      invoice: 0,
      void: 0,
      payment: 0,
    };
    if (row.kind === "invoice") current.invoice += toCents(row.amount);
    else if (row.kind === "void") current.void += toCents(row.amount);
    else if (row.kind === "payment") current.payment += toCents(row.amount);
    map.set(row.componentId, current);
  }
  return map;
}
function writeEntry(
  kind: FinanceEntry["kind"],
  id: string,
  officeId: OfficeId,
  currency: FinanceEntry["currency"],
  amountCents: number,
  description: string,
  user: SettlementActor,
  extra: Partial<FinanceEntry> = {}
): FinanceEntry {
  return financeEntrySchema.parse({
    id,
    kind,
    officeId,
    currency,
    amount: fromCents(amountCents),
    date: new Date().toISOString().slice(0, 10),
    description,
    actorId: user.id,
    actorName: actorName(user),
    recordedAt: isoNow(),
    ...extra,
  });
}
async function insertEntry(tx: any, row: FinanceEntry) {
  await tx.insert(financeEntries).values({
    id: row.id,
    kind: row.kind,
    officeId: row.officeId,
    currency: row.currency,
    data: row,
    invoiceId: row.invoiceId ?? null,
    shipmentId: row.shipmentId ?? null,
    actorId: row.actorId,
  });
}
async function ensureOpenCashRegister(
  tx: any,
  officeId: OfficeId,
  currency: FinanceEntry["currency"],
  userId: number,
  requestKey: string
) {
  const rows = await tx
    .select()
    .from(cashRegisters)
    .where(
      and(
        eq(cashRegisters.officeId, officeId),
        eq(cashRegisters.currency, currency),
        eq(cashRegisters.status, "open")
      )
    )
    .limit(1)
    .for("update");
  if (rows[0]) return rows[0].id as string;
  const id = `cash-register:${officeId}:${currency}:${hash(requestKey)}`;
  await tx.insert(cashRegisters).values({
    id,
    officeId,
    currency,
    openingBalance: "0.00",
    status: "open",
    openedBy: userId,
    version: 1,
  });
  return id;
}
async function appendReceipt(
  tx: any,
  userId: number,
  requestKey: string,
  payload: unknown,
  result: unknown
) {
  await tx.insert(financeReceipts).values({
    actorId: userId,
    commandId: `shipment-settlement:${hash(requestKey)}`,
    payloadHash: hash(payload),
    result,
  });
}
async function priorReceipt(
  tx: any,
  userId: number,
  requestKey: string,
  payload: unknown
) {
  const rows = await tx
    .select()
    .from(financeReceipts)
    .where(
      and(
        eq(financeReceipts.actorId, userId),
        eq(financeReceipts.commandId, `shipment-settlement:${hash(requestKey)}`)
      )
    )
    .limit(1)
    .for("update");
  if (!rows[0]) return null;
  if (rows[0].payloadHash !== hash(payload))
    throw new Error("replay_payload_mismatch");
  return rows[0].result;
}
function auditActor(user: SettlementActor, scope: OfficeScope) {
  return {
    id: user.id,
    name: actorName(user),
    role: (scope.role ?? "staff") as AppRole,
  };
}
async function insertComponent(tx: any, component: ShipmentChargeComponent) {
  await tx.insert(shipmentChargeComponents).values({
    id: component.id,
    shipmentId: component.shipmentId,
    goodsId: component.goodsId,
    chargeKey: component.chargeKey,
    kind: component.kind,
    officeId: component.officeId,
    currency: component.currency,
    amount: component.amount.toFixed(2),
    actorId: component.actorId,
    requestKey: component.requestKey,
    data: component.data,
  });
}
async function insertAllocation(tx: any, allocation: ShipmentChargeAllocation) {
  await tx.insert(shipmentChargeAllocations).values({
    id: allocation.id,
    componentId: allocation.componentId,
    invoiceId: allocation.invoiceId,
    kind: allocation.kind,
    amount: allocation.amount.toFixed(2),
    actorId: allocation.actorId,
    requestKey: allocation.requestKey,
    data: allocation.data ?? null,
  });
}
function allocationFor(
  componentId: string,
  invoiceId: string,
  kind: ShipmentChargeAllocation["kind"],
  amountCents: number,
  user: SettlementActor,
  requestKey: string,
  data?: Record<string, unknown>
): ShipmentChargeAllocation {
  return {
    id: allocationId(componentId, kind, requestKey),
    componentId,
    invoiceId,
    kind,
    amount: fromCents(amountCents),
    actorId: user.id,
    requestKey: hash(requestKey),
    data,
    createdAt: isoNow(),
  };
}
async function legacyInvoiceForClaim(
  tx: any,
  shipmentId: string,
  goodsId: string
) {
  const claims = await tx
    .select()
    .from(financeGoods)
    .where(
      and(
        eq(financeGoods.shipmentId, shipmentId),
        eq(financeGoods.goodsId, goodsId)
      )
    )
    .limit(1)
    .for("update");
  if (!claims[0]) return null;
  await assertActiveEntity(tx, "invoice", claims[0].invoiceId);
  const invoices = await tx
    .select()
    .from(records)
    .where(
      and(
        eq(records.entity, "invoice"),
        eq(records.recordId, claims[0].invoiceId)
      )
    )
    .limit(1)
    .for("update");
  if (!invoices[0]) throw new Error("legacy_export_invoice_requires_review");
  const invoice = invoices[0].data as Invoice;
  if (
    invoice.finance?.chargeKind !== "shipping" ||
    invoice.finance.shipmentId !== shipmentId ||
    !invoice.finance.goods.some(g => g.goodsId === goodsId)
  )
    throw new Error("legacy_export_invoice_requires_review");
  return invoice;
}

export async function registerShipmentExport(
  tx: any,
  user: SettlementActor,
  input: RegisterExportInput
): Promise<RegisterExportResult> {
  const parsed = registerExportInputSchema.parse(input);
  await lockActor(tx, user);
  const scope = await readOfficeScope(tx, user, new Set(), true);
  if (!financeManage(scope, "shipment_prices")) forbidden();
  if ("shipmentId" in parsed && typeof parsed.shipmentId === "string")
    await assertActiveEntity(tx, "shipment", parsed.shipmentId);
  if ("invoiceId" in parsed && typeof parsed.invoiceId === "string")
    await assertActiveEntity(tx, "invoice", parsed.invoiceId);
  const prior = await priorReceipt(tx, user.id, parsed.id, parsed);
  if (prior) {
    const x = prior as RegisterExportResult;
    for (const c of x.components) ensureScope(scope, c.officeId);
    return x;
  }
  const found = await lockedShipment(tx, parsed.shipmentId);
  const shipment = found.shipment;
  activeShipment(shipment);
  const sourceOffice = sourceOfficeOf(shipment);
  ensureScope(scope, sourceOffice);
  if (!recordVisibleInOffice(scope, sourceOffice, "shipment", shipment))
    forbidden();
  if (found.row.version !== parsed.expectedVersion)
    conflict("shipment_version_conflict");
  ensureTracking(shipment, parsed.confirmation.trackingNumber);
  if (
    !shipment.packing!.cartons.every(
      c => !c.goods.some(g => !g.deleted) || c.closed
    )
  )
    bad("shipment_not_closed");
  const v2 =
    (shipment as Shipment & { accountingModelVersion?: number })
      .accountingModelVersion === 2;
  if (!v2 && !parsed.includeLegacyApproval) bad("legacy_approval_required");
  const goods = goodsForShipment(shipment);
  if (!goods.length) bad("shipment_empty");
  const amounts = storedExportCents(goods, shipment.packing!);
  if (shipment.packing!.pricePerKg <= 0) bad("shipment_price_unapproved");
  const currency = sourceCurrency[shipment.packing!.source] as any;
  const existing = (await componentRows(tx, shipment.id)).filter(
    (r: any) => r.kind === "export"
  );
  if (existing.length && existing.length !== goods.length)
    bad("partial_export_enrollment_requires_review");
  const components: ShipmentChargeComponent[] = existing.length
    ? existing.map(componentFromRow)
    : [];
  const entries: FinanceEntry[] = [];
  if (!existing.length) {
    const legacyMapped = new Map<
      string,
      { invoice: Invoice; components: ShipmentChargeComponent[] }
    >();
    for (const good of goods) {
      const amount = amounts.get(good.id) ?? 0;
      if (!amount) bad("shipment_price_unapproved");
      const component: ShipmentChargeComponent = {
        id: componentId(shipment.id, good.id, "export"),
        shipmentId: shipment.id,
        goodsId: good.id,
        chargeKey: "export",
        kind: "export",
        officeId: sourceOffice,
        currency,
        amount: fromCents(amount),
        actorId: user.id,
        requestKey: parsed.id,
        data: {
          tracking: shipment.tracking,
          source: shipment.packing!.source,
          packingCreatedAt: shipment.packing!.createdAt,
          frozenPricePerKg: shipment.packing!.pricePerKg,
          frozenGoods: {
            id: good.id,
            name: good.name,
            phone: good.phone,
            unitWeight: good.unitWeight,
            pieces: good.pieces,
          },
          explicitLegacyApproval: !v2,
        },
        createdAt: isoNow(),
      };
      const legacyInvoice = await legacyInvoiceForClaim(
        tx,
        shipment.id,
        good.id
      );
      await insertComponent(tx, component);
      if (legacyInvoice) {
        const group = legacyMapped.get(legacyInvoice.id) ?? {
          invoice: legacyInvoice,
          components: [],
        };
        group.components.push(component);
        legacyMapped.set(legacyInvoice.id, group);
      }
      components.push(component);
    }
    for (const { invoice, components: group } of legacyMapped.values()) {
      const total = group.reduce((sum, c) => sum + toCents(c.amount), 0);
      if (
        !invoice.finance ||
        invoice.finance.currency !== currency ||
        toCents(invoice.amount) !== total ||
        invoice.finance.adjustment.amount !== 0
      )
        bad("legacy_export_invoice_requires_review");
      const paid = Math.min(total, toCents(invoice.finance.paidAmount));
      const shares = group.map(c =>
        Number((BigInt(paid) * BigInt(toCents(c.amount))) / BigInt(total))
      );
      let remainder = paid - shares.reduce((a, b) => a + b, 0);
      for (let i = 0; i < group.length; i++) {
        const c = group[i];
        const amount = toCents(c.amount);
        if (remainder > 0) {
          shares[i]++;
          remainder--;
        }
        await insertAllocation(
          tx,
          allocationFor(
            c.id,
            invoice.id,
            "invoice",
            amount,
            user,
            `legacy-map:${parsed.id}:${c.goodsId}`,
            { legacyMapped: true, source: "finance_goods" }
          )
        );
        if (shares[i])
          await insertAllocation(
            tx,
            allocationFor(
              c.id,
              invoice.id,
              "payment",
              shares[i],
              user,
              `legacy-pay:${parsed.id}:${c.goodsId}`,
              { legacyMapped: true, source: "finance_goods" }
            )
          );
      }
    }
    const total = components.reduce((sum, c) => sum + toCents(c.amount), 0);
    const priorRevenue = await tx
      .select()
      .from(financeEntries)
      .where(
        and(
          eq(financeEntries.kind, "shipment_revenue"),
          eq(financeEntries.shipmentId, shipment.id)
        )
      )
      .limit(1)
      .for("update");
    if (!priorRevenue[0]) {
      const revenue = writeEntry(
        "shipment_revenue",
        entryId(parsed.id, "source-income"),
        sourceOffice,
        currency,
        total,
        "shipment_export_revenue",
        user,
        { shipmentId: shipment.id }
      );
      await insertEntry(tx, revenue);
      entries.push(revenue);
    }
    await appendAudit(tx, {
      actor: auditActor(user, scope),
      entity: "shipment_charge_component",
      recordId: shipment.id,
      action: "shipment_export_enrolled",
      before: null,
      after: components,
      beforeVersion: parsed.expectedVersion,
      afterVersion: parsed.expectedVersion,
      requestKey: parsed.id,
    });
  }
  const result = {
    shipmentId: shipment.id,
    version: found.row.version,
    components,
    entries,
  };
  await appendReceipt(tx, user.id, parsed.id, parsed, result);
  return result;
}

export async function registerExport(
  db: any,
  user: SettlementActor,
  input: RegisterExportInput
) {
  return db.transaction((tx: any) => registerShipmentExport(tx, user, input));
}

export async function recordShipmentLocalCost(
  tx: any,
  user: SettlementActor,
  input: LocalCostInput
): Promise<LocalCostResult> {
  const parsed = localCostInputSchema.parse(input);
  await lockActor(tx, user);
  const scope = await readOfficeScope(tx, user, new Set(), true);
  if (!canRecordArrivalCost(scope)) forbidden("arrival_cost_forbidden");
  if ("shipmentId" in parsed && typeof parsed.shipmentId === "string")
    await assertActiveEntity(tx, "shipment", parsed.shipmentId);
  if ("invoiceId" in parsed && typeof parsed.invoiceId === "string")
    await assertActiveEntity(tx, "invoice", parsed.invoiceId);
  const prior = await priorReceipt(tx, user.id, parsed.id, parsed);
  if (prior) return prior as LocalCostResult;
  const found = await lockedShipment(tx, parsed.shipmentId);
  const shipment = found.shipment;
  activeShipment(shipment);
  if (found.row.version !== parsed.expectedVersion)
    conflict("shipment_version_conflict");
  ensureTracking(shipment, parsed.confirmation.trackingNumber);
  if (!isConfirmedArrival(shipment)) bad("arrival_not_confirmed");
  ensureScope(scope, "nouakchott");
  const costReference =
    parsed.referenceKey ?? parsed.costReference ?? "destination_shipping";
  const claimed = await tx
    .select()
    .from(shipmentCostApprovals)
    .where(
      and(
        eq(shipmentCostApprovals.shipmentId, shipment.id),
        eq(shipmentCostApprovals.officeId, "nouakchott"),
        eq(shipmentCostApprovals.referenceKey, costReference)
      )
    )
    .limit(1)
    .for("update");
  if (claimed[0]) bad("arrival_cost_duplicate");
  const goods = goodsForShipment(shipment);
  const amountCents = toCents(parsed.amount);
  const allocations = allocateCentsByWeight(amountCents, goods);
  const components: ShipmentChargeComponent[] = [];
  for (const good of goods) {
    const cents = allocations.get(good.id) ?? 0;
    if (!cents) continue;
    const component: ShipmentChargeComponent = {
      id: componentId(shipment.id, good.id, `destination_local:${parsed.id}`),
      shipmentId: shipment.id,
      goodsId: good.id,
      chargeKey: `destination_local:${parsed.id}`,
      kind: "destination_local",
      officeId: "nouakchott",
      currency: parsed.currency,
      amount: fromCents(cents),
      actorId: user.id,
      requestKey: parsed.id,
      data: {
        tracking: shipment.tracking,
        description: parsed.description,
        passedToCustomer: parsed.passedToCustomer,
        weightAllocation: true,
      },
      createdAt: isoNow(),
    };
    await insertComponent(tx, component);
    components.push(component);
  }
  const entry = writeEntry(
    "shipment_cost",
    entryId(parsed.id, "cost"),
    "nouakchott",
    parsed.currency,
    amountCents,
    parsed.description,
    user,
    { shipmentId: shipment.id }
  );
  await insertEntry(tx, entry);
  await tx.insert(shipmentCostApprovals).values({
    id: `shipment-cost-approval:${hash({ shipmentId: shipment.id, officeId: "nouakchott", referenceKey: costReference })}`,
    shipmentId: shipment.id,
    officeId: "nouakchott",
    currency: parsed.currency,
    referenceKey: costReference,
    financeEntryId: entry.id,
    actorId: user.id,
  });
  if (parsed.paidInCash) {
    const registerId = await ensureOpenCashRegister(
      tx,
      "nouakchott",
      parsed.currency,
      user.id,
      parsed.id
    );
    await tx.insert(cashMovements).values({
      id: `cash-movement:${hash(parsed.id)}`,
      registerId,
      officeId: "nouakchott",
      kind: "expense",
      amount: parsed.amount.toFixed(2),
      currency: parsed.currency,
      actorId: user.id,
      data: {
        source: "shipment_local_cost",
        shipmentId: shipment.id,
        passedToCustomer: parsed.passedToCustomer,
      },
    });
  }
  await appendAudit(tx, {
    actor: auditActor(user, scope),
    entity: "shipment_charge_component",
    recordId: shipment.id,
    action: "shipment_destination_cost",
    before: null,
    after: { components, entry },
    beforeVersion: parsed.expectedVersion,
    afterVersion: parsed.expectedVersion,
    requestKey: parsed.id,
  });
  const result = {
    shipmentId: shipment.id,
    version: found.row.version,
    components,
    entry,
  };
  await appendReceipt(tx, user.id, parsed.id, parsed, result);
  return result;
}

export async function localCost(
  db: any,
  user: SettlementActor,
  input: LocalCostInput
) {
  return db.transaction((tx: any) => recordShipmentLocalCost(tx, user, input));
}

function customerOwnsGoods(
  customer: Account,
  good: { name: string; phone: string }
) {
  return (
    normalizeName(customer.name) === normalizeName(good.name) ||
    Boolean(customer.phone && good.phone && customer.phone === good.phone)
  );
}
async function billComponentsTx(
  tx: any,
  user: SettlementActor,
  input: BillComponentsInput
): Promise<import("@shared/shipmentSettlement").BillComponentsResult> {
  const parsed = billComponentsInputSchema.parse(input);
  await lockActor(tx, user);
  const scope = await readOfficeScope(tx, user, new Set(), true);
  if (!financeManage(scope, "invoices")) forbidden();
  if ("shipmentId" in parsed && typeof parsed.shipmentId === "string")
    await assertActiveEntity(tx, "shipment", parsed.shipmentId);
  if ("invoiceId" in parsed && typeof parsed.invoiceId === "string")
    await assertActiveEntity(tx, "invoice", parsed.invoiceId);
  const prior = await priorReceipt(tx, user.id, parsed.id, parsed);
  if (prior) {
    const x = prior as any;
    ensureScope(
      scope,
      x.invoice?.finance?.financialOfficeId ?? x.invoice?.officeId
    );
    if (x.invoice?.finance?.shipmentId)
      await assertActiveEntity(tx, "shipment", x.invoice.finance.shipmentId);
    return x;
  }
  const account = await accountFor(tx, parsed.customerId);
  await tx
    .select()
    .from(shipmentChargeComponents)
    .where(eq(shipmentChargeComponents.id, parsed.componentIds[0]))
    .for("update");
  const allRows = await tx.select().from(shipmentChargeComponents);
  const selected: any[] = allRows.filter((r: any) =>
    parsed.componentIds.includes(r.id)
  );
  if (selected.length !== parsed.componentIds.length)
    bad("component_not_found");
  const shipmentId = selected[0].shipmentId;
  if (selected.some((r: any) => r.shipmentId !== shipmentId))
    bad("mixed_shipments");
  const found = await lockedShipment(tx, shipmentId);
  const shipment = found.shipment;
  activeShipment(shipment);
  if (found.row.version !== parsed.expectedShipmentVersion)
    conflict("shipment_version_conflict");
  const components = selected.map(componentFromRow);
  const assigned =
    scope.homeOffice ?? (scope.offices?.length === 1 ? scope.offices[0] : null);
  const office =
    scope.role === "admin"
      ? (parsed.issuingOfficeId ?? components[0].officeId)
      : assigned;
  if (
    !office ||
    (scope.role !== "admin" &&
      parsed.issuingOfficeId &&
      parsed.issuingOfficeId !== office)
  )
    forbidden("office_forbidden");
  const currency = components[0].currency;
  if (account.officeId !== office) forbidden("customer_office_mismatch");
  if (
    components.some(
      c => c.currency !== parsed.currency || c.currency !== currency
    )
  )
    bad("mixed_currencies");
  ensureScope(scope, office);
  if (office === "nouakchott" && !isConfirmedArrival(shipment))
    bad("arrival_not_confirmed");
  if (office !== "nouakchott" && components.some(c => c.officeId !== office))
    forbidden("component_office_mismatch");
  if (
    components.some(
      c => c.kind === "destination_local" && office !== "nouakchott"
    )
  )
    bad("destination_component_office_mismatch");
  const goods = goodsById(shipment);
  for (const component of components) {
    const good = goods.get(component.goodsId);
    if (!good || !customerOwnsGoods(account, good))
      bad("customer_goods_mismatch");
    if (
      component.kind === "destination_local" &&
      component.data.passedToCustomer !== true
    )
      bad("component_not_billable");
  }
  const sums = allocationSums(await allocationRows(tx, parsed.componentIds));
  const totalCents = components.reduce((sum, c) => sum + toCents(c.amount), 0);
  for (const c of components) {
    const sum = sums.get(c.id) ?? { invoice: 0, void: 0, payment: 0 };
    if (sum.invoice - sum.void > 0) bad("component_already_billed");
    if (c.kind === "export") {
      const claim = await legacyInvoiceForClaim(tx, shipmentId, c.goodsId);
      if (claim && claim.id !== parsed.invoiceId)
        bad("export_already_claimed_requires_review");
    }
  }
  const invoiceRows = await tx
    .select()
    .from(records)
    .where(
      and(eq(records.entity, "invoice"), eq(records.recordId, parsed.invoiceId))
    )
    .limit(1)
    .for("update");
  if (invoiceRows[0]) bad("invoice_exists");
  const goodsDetails = components.map((c: ShipmentChargeComponent) => {
    const good = goods.get(c.goodsId)!;
    const carton = shipment.packing!.cartons.find(cart =>
      cart.goods.some(g => g.id === c.goodsId)
    );
    return {
      goodsId: c.goodsId,
      cartonNumber: carton?.number ?? 1,
      name: good.name,
      phone: good.phone,
      weight: Math.round(good.unitWeight * good.pieces * 1000) / 1000,
      pieces: good.pieces,
    };
  });
  const total = fromCents(totalCents);
  const paidAmount = parsed.paymentMode === "on_account" ? 0 : total;
  let payment = parsed.payment;
  if (payment)
    payment = canonicalInvoicePayment(
      payment,
      null,
      await readOfficeSettings(tx, office),
      office
    );
  const details: FinancialInvoiceDetails = financialInvoiceSchema.parse({
    customerId: account.id,
    chargeKind: "shipping",
    paymentMode: parsed.paymentMode,
    issuingOfficeId: office,
    financialOfficeId: office,
    actorId: user.id,
    actorName: actorName(user),
    recordedAt: isoNow(),
    currency,
    shipmentId,
    goods: goodsDetails,
    baseAmount: total,
    adjustment: { direction: "increase", amount: 0 },
    paidAmount,
  });
  const invoice: Invoice = {
    id: parsed.invoiceId,
    account: account.name,
    amount: total,
    status: paidAmount >= total ? "مدفوعة" : "دين",
    issuedAt: isoNow(),
    officeId: office,
    ...(payment ? { payment } : {}),
    finance: details,
  };
  const rows: FinanceEntry[] = [];
  const localRevenue = components
    .filter(c => c.kind === "destination_local")
    .reduce((sum, c) => sum + toCents(c.amount), 0);
  if (localRevenue)
    rows.push(
      writeEntry(
        "invoice_revenue",
        entryId(parsed.id, "local-income"),
        office,
        currency,
        localRevenue,
        "shipment_local_charge_revenue",
        user,
        { invoiceId: invoice.id, shipmentId }
      )
    );
  rows.push(
    writeEntry(
      parsed.paymentMode === "on_account" ? "customer_debt" : "collection",
      entryId(
        parsed.id,
        parsed.paymentMode === "on_account" ? "debt" : "collection"
      ),
      office,
      currency,
      totalCents,
      parsed.paymentMode === "on_account"
        ? "shipment_component_customer_debt"
        : "shipment_component_collection",
      user,
      {
        invoiceId: invoice.id,
        shipmentId,
        customerId: account.id,
        customerName: account.name,
        ...(payment ? { payment } : {}),
      }
    )
  );
  await tx.insert(records).values({
    entity: "invoice",
    recordId: invoice.id,
    version: 1,
    data: invoice,
    updatedBy: user.id,
  });
  for (const c of components) {
    const amount = toCents(c.amount);
    await insertAllocation(
      tx,
      allocationFor(c.id, invoice.id, "invoice", amount, user, parsed.id, {
        source: "shipment_component_billing",
      })
    );
    if (parsed.paymentMode !== "on_account")
      await insertAllocation(
        tx,
        allocationFor(
          c.id,
          invoice.id,
          "payment",
          amount,
          user,
          `${parsed.id}:payment`,
          { paymentMode: parsed.paymentMode }
        )
      );
    if (c.kind === "export") {
      const claim = await tx
        .select()
        .from(financeGoods)
        .where(
          and(
            eq(financeGoods.shipmentId, shipmentId),
            eq(financeGoods.goodsId, c.goodsId)
          )
        )
        .limit(1)
        .for("update");
      if (!claim[0])
        await tx
          .insert(financeGoods)
          .values({ shipmentId, goodsId: c.goodsId, invoiceId: invoice.id });
    }
  }
  if (parsed.paymentMode === "cash") {
    const registerId = await ensureOpenCashRegister(
      tx,
      office,
      currency,
      user.id,
      parsed.id
    );
    await tx.insert(cashMovements).values({
      id: `cash-movement:${hash(parsed.id)}`,
      registerId,
      officeId: office,
      kind: "receipt",
      amount: total.toFixed(2),
      currency,
      invoiceId: invoice.id,
      actorId: user.id,
      data: { source: "shipment_component_invoice" },
    });
  }
  for (const row of rows) await insertEntry(tx, row);
  if (payment && payment.methodId !== "cash") {
    const collection = rows.find(row => row.kind === "collection");
    if (collection)
      await recordWalletReceipt(tx, {
        officeId: office,
        methodId: payment.methodId,
        currency,
        amount: total,
        invoiceId: invoice.id,
        financeEntryId: collection.id,
        actorId: user.id,
        data: { source: "shipment_component_invoice" },
      });
  }
  await appendAudit(tx, {
    actor: auditActor(user, scope),
    entity: "invoice",
    recordId: invoice.id,
    action: "shipment_components_billed",
    before: null,
    after: invoice,
    beforeVersion: 0,
    afterVersion: 1,
    requestKey: parsed.id,
  });
  const result = {
    invoice: { ...invoice, version: 1, scope: "shared" as const },
    entries: rows,
    allocations: (await allocationRows(tx, parsed.componentIds))
      .filter((r: any) => r.invoiceId === invoice.id)
      .map(allocationFromRow),
  };
  await appendReceipt(tx, user.id, parsed.id, parsed, result);
  return result;
}

export async function billComponents(
  db: any,
  user: SettlementActor,
  input: BillComponentsInput
) {
  return db.transaction((tx: any) => billComponentsTx(tx, user, input));
}

/** Hook for the existing finance settlement transaction. It only appends component payment allocations. */
export async function recordComponentPayment(
  tx: any,
  input: RecordComponentPaymentInput
) {
  await assertActiveEntity(tx, "invoice", input.invoiceId);
  const amountCents = toCents(input.amount);
  if (!amountCents) bad("payment_required");
  const rows = await tx
    .select()
    .from(shipmentChargeAllocations)
    .where(eq(shipmentChargeAllocations.invoiceId, input.invoiceId))
    .for("update");
  const replayed = rows.filter(
    (row: any) =>
      row.kind === "payment" && row.data?.paymentRequestHash === hash(input)
  );
  if (replayed.length) return replayed.map(allocationFromRow);
  const invoiceAllocations = rows.filter((r: any) => r.kind === "invoice");
  if (!invoiceAllocations.length) return [] as ShipmentChargeAllocation[];
  const sums = allocationSums(rows);
  const outstanding = invoiceAllocations.reduce((sum: number, row: any) => {
    const x = sums.get(row.componentId) ?? { invoice: 0, void: 0, payment: 0 };
    return sum + Math.max(0, x.invoice - x.void - x.payment);
  }, 0);
  if (amountCents > outstanding) bad("overpayment");
  let remaining = amountCents;
  const created: ShipmentChargeAllocation[] = [];
  for (const row of invoiceAllocations) {
    if (!remaining) break;
    const x = sums.get(row.componentId) ?? { invoice: 0, void: 0, payment: 0 };
    const share = Math.min(
      remaining,
      Math.max(0, x.invoice - x.void - x.payment)
    );
    if (!share) continue;
    const requestKey = `${input.requestKey}:${row.componentId}`;
    const allocation = allocationFor(
      row.componentId,
      input.invoiceId,
      "payment",
      share,
      { id: input.actorId, name: "settlement" } as SettlementActor,
      requestKey,
      { ...input.data, paymentRequestHash: hash(input) }
    );
    await insertAllocation(tx, allocation);
    created.push(allocation);
    remaining -= share;
  }
  if (remaining) bad("overpayment");
  return created;
}

export async function shipmentSettlementSnapshot(
  db: any,
  user: SettlementActor,
  input: { shipmentId: string }
): Promise<ShipmentSettlementSnapshot> {
  const parsed = settlementSnapshotInputSchema.parse(input);
  const scope = await readOfficeScope(db, user);
  if (!financeView(scope)) forbidden();
  const rows = await db
    .select()
    .from(records)
    .where(
      and(
        eq(records.entity, "shipment"),
        eq(records.recordId, parsed.shipmentId)
      )
    )
    .limit(1);
  if (!rows[0])
    throw new TRPCError({ code: "NOT_FOUND", message: "shipment_not_found" });
  const shipment = asShipment(rows[0]);
  activeShipment(shipment);
  const sourceOffice = sourceOfficeOf(shipment);
  const sourceVisible =
    scope.role === "admin" || Boolean(scope.offices?.includes(sourceOffice));
  const destinationVisible =
    scope.role === "admin" ||
    Boolean(
      scope.offices?.includes("nouakchott") && isConfirmedArrival(shipment)
    );
  if (!sourceVisible && !destinationVisible) forbidden();
  const rawComponents = await db
    .select()
    .from(shipmentChargeComponents)
    .where(eq(shipmentChargeComponents.shipmentId, shipment.id));
  await assertActiveEntity(db, "shipment", parsed.shipmentId);
  const rawAllocations = await db.select().from(shipmentChargeAllocations);
  const sums = allocationSums(
    rawAllocations.filter((r: any) =>
      rawComponents.some((c: any) => c.id === r.componentId)
    )
  );
  const allComponents = rawComponents.map(componentFromRow);
  const views: SettlementComponentView[] = allComponents.map(
    (component: ShipmentChargeComponent) => {
      const sum = sums.get(component.id) ?? { invoice: 0, void: 0, payment: 0 };
      const recognized = Math.max(0, sum.invoice - sum.void);
      return {
        ...component,
        allocated: fromCents(recognized),
        unbilled:
          component.kind === "destination_local" &&
          component.data.passedToCustomer !== true
            ? 0
            : fromCents(Math.max(0, toCents(component.amount) - recognized)),
        paid: fromCents(sum.payment),
        settled: fromCents(Math.min(recognized, sum.payment)),
      };
    }
  );
  const destinationOnly = !sourceVisible && destinationVisible;
  const visibleViews = destinationOnly
    ? views.filter(v => v.officeId === "nouakchott")
    : views;
  const breakdownMap = new Map<
    string,
    {
      currency: any;
      componentTotal: number;
      unbilled: number;
      customerDebt: number;
      paid: number;
      settled: number;
    }
  >();
  for (const view of visibleViews) {
    if (
      view.kind === "destination_local" &&
      view.data?.passedToCustomer !== true
    )
      continue;
    const row = breakdownMap.get(view.currency) ?? {
      currency: view.currency,
      componentTotal: 0,
      unbilled: 0,
      customerDebt: 0,
      paid: 0,
      settled: 0,
    };
    row.componentTotal += toCents(view.amount);
    row.unbilled += toCents(view.unbilled);
    row.customerDebt += Math.max(
      0,
      toCents(view.allocated) - toCents(view.paid)
    );
    row.paid += toCents(view.paid);
    row.settled += toCents(view.settled);
    breakdownMap.set(view.currency, row);
  }
  const breakdown = [...breakdownMap.values()].map(row =>
    Object.fromEntries(
      Object.entries(row).map(([k, v]) => [
        k,
        k === "currency" ? v : fromCents(v as number),
      ])
    )
  ) as any;
  const goods = goodsForShipment(shipment);
  const undelivered = shipment.status === "مسلّمة" ? [] : goods.map(g => g.id);
  const paidUndelivered = new Map<string, number>();
  for (const view of visibleViews.filter(v => undelivered.includes(v.goodsId)))
    paidUndelivered.set(
      view.currency,
      (paidUndelivered.get(view.currency) ?? 0) + toCents(view.settled)
    );
  return {
    shipmentId: shipment.id,
    tracking: shipment.tracking,
    shipmentVersion: rows[0].version,
    visibleOffice: destinationOnly ? "nouakchott" : sourceOffice,
    sourceOffice,
    destinationOffice: "nouakchott",
    components: destinationOnly
      ? views
          .filter(v => v.officeId === "nouakchott")
          .map(({ data: _data, ...rest }) => rest)
      : views,
    breakdown,
    physical: {
      undeliveredGoodsIds: undelivered,
      undeliveredWeight: goods
        .filter(g => undelivered.includes(g.id))
        .reduce((sum, g) => sum + g.unitWeight * g.pieces, 0),
      paidUndeliveredByCurrency: [...paidUndelivered].map(
        ([currency, cents]) => ({
          currency: currency as any,
          amount: fromCents(cents),
        })
      ),
    },
  };
}

export const shipmentSettlementRouter = router({
  snapshot: protectedProcedure
    .input(settlementSnapshotInputSchema)
    .query(async ({ ctx, input }) =>
      shipmentSettlementSnapshot(await getDbOrThrow(), ctx.user, input)
    ),
  registerExport: protectedProcedure
    .input(registerExportInputSchema)
    .mutation(async ({ ctx, input }) =>
      registerExport(await getDbOrThrow(), ctx.user, input)
    ),
  localCost: protectedProcedure
    .input(localCostInputSchema)
    .mutation(async ({ ctx, input }) =>
      localCost(await getDbOrThrow(), ctx.user, input)
    ),
  billComponents: protectedProcedure
    .input(billComponentsInputSchema)
    .mutation(async ({ ctx, input }) =>
      billComponents(await getDbOrThrow(), ctx.user, input)
    ),
});

async function getDbOrThrow() {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database is not available",
    });
  return db;
}

/** Once the financial model is approved, preserve the goods/value identity; operational stages remain editable. */
export async function assertFrozenShipmentComponents(
  tx: any,
  current: Shipment,
  next: Shipment
) {
  if (next.deleted) return;
  const components = (await componentRows(tx, current.id)).filter(
    (r: any) => r.kind === "export"
  );
  if (!components.length) return;
  if (!next.packing || next.packing.source !== current.packing?.source)
    bad("shipment_financial_components_frozen");
  const goods = goodsForPacking(next.packing);
  if (goods.length !== components.length)
    bad("shipment_financial_components_frozen");
  for (const c of components) {
    const g = goods.find(g => g.id === c.goodsId);
    const old = c.data?.frozenGoods;
    if (
      !g ||
      !old ||
      canonical({
        id: g.id,
        name: g.name,
        phone: g.phone,
        unitWeight: g.unitWeight,
        pieces: g.pieces,
      }) !== canonical(old) ||
      next.packing.pricePerKg !== c.data.frozenPricePerKg
    )
      bad("shipment_financial_components_frozen");
  }
}
