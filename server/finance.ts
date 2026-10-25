import { permissionAllowed } from "@shared/permissions";
import { buildNetAccountingEntries } from "../shared/financialVoids";
import { recordComponentPayment } from "./shipmentSettlement";
import {
  loadLifecycle,
  recordIsActive,
  isRetired,
  assertActiveEntity,
} from "./lifecycle";
import { canBillShipmentCurrency } from "@shared/officeFinanceVisibility";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  calculateFinanceInvoice,
  type FinanceMutationCommand,
  type FinanceEntry,
  type FinanceExpenseInput,
  type FinanceSnapshot,
  type FinanceSyncResult,
  type FinancialInvoiceDetails,
  financialInvoiceSchema,
  financeEntrySchema,
  financeSnapshotSchema,
  newInvoiceInputSchema,
  employeeFinanceOffice,
  canReadFinance,
  canWriteFinance,
  financeCan,
  financePermissionForCommand,
  financePermissionForEntry,
  deriveShipmentReceivables,
  openingBalanceInputSchema,
  shipmentPriceInputSchema,
} from "@shared/finance";
import { isShipmentSent } from "@shared/finance";
import {
  sourceCurrency,
  packingTotals,
  goodsTotals,
  canonicalPackingShipment,
} from "@shared/packing";
import type { AppRole, Invoice, Shipment } from "@shared/operations";
import type { OfficeId } from "@shared/branches";
import type { PermissionMap } from "@shared/permissions";
import { canReadOfficeRecord } from "@shared/branches";
import { adjustedInvoiceTotal } from "@shared/finance";
import { readOfficeScope } from "./branches";
import {
  canonicalInvoicePayment,
  readOfficeSettings,
  recordWalletReceipt,
} from "./office";
import { lockCashRegisterMutex } from "./cashRegisterMutex";
import { appendAudit } from "./audit";
import {
  applyShipmentPriceOverride,
  parseExplicitShipmentPriceInput,
  priceProjectionForCurrency,
  readPriceProjection,
  readShipmentPricingProjection,
} from "./shipmentPricing";
import {
  records,
  financeEntries,
  financeReceipts,
  financeGoods,
  invoiceAdjustments,
  cashRegisters,
  cashMovements,
  shipmentTariffSnapshots,
  financeReversals,
  shipmentCostApprovals,
  users,
} from "../drizzle/schema";
import type { User } from "../drizzle/schema";

export type FinanceScope = {
  role: AppRole | null;
  offices: OfficeId[] | null;
  homeOffice?: OfficeId | null;
  /** Effective permissions are projected by the current office scope. */
  permissions?: PermissionMap | null;
};
export type FinanceActor = Pick<User, "id" | "name">;
export type FinanceSyncUser = Pick<User, "id" | "name" | "openId" | "role">;
const invoiceId = (id: string) => `finance-invoice:${id}`;
const entryId = (id: string, suffix: string) =>
  `finance-entry:${hash({ id, suffix })}`;
const isoNow = () => new Date().toISOString();
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
function actorName(user: FinanceActor) {
  return user.name?.trim() || `user-${user.id}`;
}
function permissionSubject(scope: FinanceScope) {
  return {
    role: scope.role,
    offices: scope.offices,
    homeOffice: scope.homeOffice,
    permissions: scope.permissions,
  };
}
function assertFinance(scope: FinanceScope) {
  if (!canReadFinance(permissionSubject(scope)))
    throw new Error("finance_forbidden");
}
function assertFinanceCommand(
  scope: FinanceScope,
  command: FinanceMutationCommand
) {
  if (
    !financeCan(
      permissionSubject(scope),
      financePermissionForCommand(
        command.kind,
        command.kind === "expense" ? command.payload.category : undefined
      ),
      "manage"
    )
  )
    throw new Error(
      command.kind === "expense" && command.payload.category === "shipment_cost"
        ? "shipment_cost_forbidden"
        : "finance_forbidden"
    );
}
function inScope(scope: FinanceScope, office: OfficeId) {
  return (
    scope.role === "admin" ||
    scope.offices === null ||
    Boolean(scope.offices?.includes(office))
  );
}
function asEntry(value: unknown): FinanceEntry {
  return financeEntrySchema.parse(value);
}
function entry(
  kind: FinanceEntry["kind"],
  id: string,
  officeId: OfficeId,
  currency: FinanceEntry["currency"],
  amount: number,
  description: string,
  user: FinanceActor,
  extra: Partial<FinanceEntry> = {}
): FinanceEntry {
  return asEntry({
    id,
    kind,
    officeId,
    currency,
    amount,
    date: (extra.date as string) ?? new Date().toISOString().slice(0, 10),
    description,
    actorId: user.id,
    actorName: actorName(user),
    recordedAt: isoNow(),
    ...extra,
  });
}
async function insertEntry(tx: any, value: FinanceEntry) {
  await tx.insert(financeEntries).values({
    id: value.id,
    kind: value.kind,
    officeId: value.officeId,
    currency: value.currency,
    data: value,
    invoiceId: value.invoiceId ?? null,
    shipmentId: value.shipmentId ?? null,
    actorId: value.actorId,
  });
}

async function ensureOpenCashRegister(
  tx: any,
  officeId: OfficeId,
  currency: FinanceEntry["currency"],
  userId: number,
  requestId: string,
  mutexAlreadyHeld = false
) {
  if (!mutexAlreadyHeld) await lockCashRegisterMutex(tx, officeId, currency);
  const current = await tx
    .select()
    .from(cashRegisters)
    .where(
      and(
        eq(cashRegisters.officeId, officeId),
        eq(cashRegisters.currency, currency),
        eq(cashRegisters.status, "open")
      )
    )
    .for("update");
  if (current.length > 1) throw new Error("cash_register_review_required");
  if (current[0]) return current[0].id as string;
  const id = `cash-register:${officeId}:${currency}:${requestId}`;
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

async function lockCashForCommand(
  tx: any,
  scope: FinanceScope,
  command: FinanceMutationCommand
): Promise<{ officeId: OfficeId; currency: FinanceEntry["currency"] } | null> {
  if (command.kind === "invoice" && command.payload.paymentMode === "cash") {
    await lockCashRegisterMutex(
      tx,
      employeeFinanceOffice(scope, command.payload.employeeOfficeId),
      command.payload.currency
    );
    return null;
  } else if (command.kind === "expense") {
    await lockCashRegisterMutex(
      tx,
      employeeFinanceOffice(scope, command.payload.officeId),
      command.payload.currency
    );
    return null;
  } else if (
    command.kind === "customer_movement" &&
    command.payload.paymentMode === "cash"
  ) {
    await lockCashRegisterMutex(
      tx,
      employeeFinanceOffice(scope, command.payload.officeId),
      command.payload.currency
    );
    return null;
  } else if (
    command.kind === "settlement" &&
    command.payload.payment?.methodId === "cash"
  ) {
    // Resolve the lock identity from the stored invoice, never from the
    // settlement payload. This read must stay non-locking: the mutex is the
    // first lock in the cash path, followed by the invoice row lock below.
    const rows = await tx
      .select()
      .from(records)
      .where(
        and(
          eq(records.entity, "invoice"),
          eq(records.recordId, command.payload.invoiceId)
        )
      )
      .limit(1);
    if (!rows[0]) return null;
    const finance = invoiceFinance(rows[0].data as Invoice);
    const lock = {
      officeId: finance.financialOfficeId,
      currency: finance.currency,
    } satisfies { officeId: OfficeId; currency: FinanceEntry["currency"] };
    await lockCashRegisterMutex(tx, lock.officeId, lock.currency);
    return lock;
  }
  return null;
}

function publicInvoice(row: any): Invoice {
  const data = row.data as Invoice;
  return { ...data, version: row.version, scope: "shared" };
}
async function accountFor(tx: any, customerId: string) {
  const rows = await tx
    .select()
    .from(records)
    .where(and(eq(records.entity, "account"), eq(records.recordId, customerId)))
    .limit(1)
    .for("update");
  if (!rows[0]) throw new Error("customer_not_found");
  await assertActiveEntity(tx, "account", customerId);
  return rows[0].data as { id: string; name: string; officeId?: OfficeId };
}
async function shipmentFor(tx: any, shipmentId: string) {
  const rows = await tx
    .select()
    .from(records)
    .where(
      and(eq(records.entity, "shipment"), eq(records.recordId, shipmentId))
    )
    .limit(1)
    .for("update");
  if (!rows[0] || (rows[0].data as Shipment).deleted)
    throw new Error("shipment_not_found");
  await assertActiveEntity(tx, "shipment", shipmentId);
  return { row: rows[0], shipment: rows[0].data as Shipment };
}
function assertOffice(scope: FinanceScope, office: OfficeId) {
  if (!inScope(scope, office)) throw new Error("finance_forbidden");
}

/** Source expense authority is capability + actual single-office scope, never a role label alone. */
export function canPostShipmentCost(scope: FinanceScope, office: OfficeId) {
  if (scope.role === "admin") return office !== "nouakchott";
  return Boolean(
    office !== "nouakchott" &&
      scope.role === "general_accountant" &&
      scope.offices?.length === 1 &&
      scope.offices[0] === office &&
      (scope.homeOffice ?? office) === office &&
      financeCan(permissionSubject(scope), "shipment_cost", "manage")
  );
}

export async function financeSnapshot(
  db: any,
  scope: FinanceScope
): Promise<FinanceSnapshot> {
  assertFinance(scope);
  const retired = await loadLifecycle(db);
  const invoices: Invoice[] = [];
  const persistedInvoices: Invoice[] = [];
  const retiredInvoiceIds: string[] = [];
  for (const row of await db
    .select()
    .from(records)
    .where(eq(records.entity, "invoice"))) {
    const invoice = row.data as Invoice;
    if (!recordIsActive(retired, "invoice", invoice)) {
      if (
        inScope(
          scope,
          invoice.finance?.financialOfficeId ?? invoice.officeId ?? "nouakchott"
        ) &&
        financeCan(permissionSubject(scope), "invoices", "view")
      )
        retiredInvoiceIds.push(invoice.id);
      continue;
    }
    persistedInvoices.push(invoice);
    if (!financeCan(permissionSubject(scope), "invoices", "view")) continue;
    if (!canReadOfficeRecord(scope.role, scope.offices, "invoice", invoice))
      continue;
    invoices.push(publicInvoice(row));
  }
  const entries: FinanceEntry[] = [];
  const originals = (await db.select().from(financeEntries)).map((row: any) =>
    asEntry(row.data)
  );
  const reversals = await db.select().from(financeReversals);
  for (const parsed of buildNetAccountingEntries(originals, reversals)) {
    if (isRetired(retired, "finance_entry", parsed.id)) continue;
    if (
      inScope(scope, parsed.officeId) &&
      financeCan(
        permissionSubject(scope),
        financePermissionForEntry(parsed.kind),
        "view"
      )
    )
      entries.push(parsed);
  }
  const shipmentRows = (
    await db.select().from(records).where(eq(records.entity, "shipment"))
  ).filter((row: any) =>
    recordIsActive(retired, "shipment", row.data as Shipment)
  );
  const shipments = shipmentRows.map((row: any) => row.data as Shipment);
  const pricingProjections =
    [] as import("@shared/shipmentPricing").PriceProjection[];
  const pricingByShipment = new Map<
    string,
    Partial<
      Record<
        "source" | "destination",
        import("@shared/shipmentPricing").PriceProjection
      >
    >
  >();
  if (financeCan(permissionSubject(scope), "shipment_prices", "view")) {
    for (const row of shipmentRows) {
      if (!(row.data as Shipment).packing) continue;
      const projection = await readShipmentPricingProjection(
        db,
        row.data as Shipment,
        row.version,
        scope
      );
      const visible = [projection.source, projection.destination].filter(
        (item): item is import("@shared/shipmentPricing").PriceProjection =>
          Boolean(item)
      );
      if (visible.length) {
        pricingByShipment.set(
          projection.shipmentId,
          Object.fromEntries(visible.map(item => [item.side, item]))
        );
        pricingProjections.push(...visible);
      }
    }
  }
  const projectionFor = (shipment: Shipment, side: "source" | "destination") =>
    pricingByShipment.get(shipment.id)?.[side];
  const snapshot = {
    invoices,
    entries,
    retiredInvoiceIds,
    homeOffice:
      scope.homeOffice ??
      (scope.offices?.length === 1 ? scope.offices[0] : null),
    offices: scope.offices,
    lastReadAt: isoNow(),
    receivables: financeCan(permissionSubject(scope), "shipment_prices", "view")
      ? deriveShipmentReceivables(
          shipments,
          scope.offices === null ? null : scope.offices,
          persistedInvoices,
          projectionFor
        )
      : [],
    shipmentReceivables: financeCan(
      permissionSubject(scope),
      "shipment_prices",
      "view"
    )
      ? deriveShipmentReceivables(
          shipments,
          scope.offices === null ? null : scope.offices,
          persistedInvoices,
          projectionFor
        )
      : [],
    pricingProjections,
  } satisfies FinanceSnapshot;
  return financeSnapshotSchema.parse(snapshot) as FinanceSnapshot;
}

function totalOf(finance: FinancialInvoiceDetails) {
  return adjustedInvoiceTotal(finance.baseAmount, finance.adjustment);
}
function invoiceFinance(invoice: Invoice): FinancialInvoiceDetails {
  if (!invoice.finance) throw new Error("finance_invoice_required");
  return invoice.finance;
}

function assertNewShippingPriceApproved(
  input: Extract<FinanceMutationCommand, { kind: "invoice" }>["payload"],
  shipment: Shipment,
  projection?: import("@shared/shipmentPricing").PriceProjection | null
) {
  if (input.chargeKind !== "shipping") return;
  const packing = shipment.packing;
  if (!packing) throw new Error("shipment_price_unapproved");
  const selectedPerKg =
    projection?.pricePerKg ??
    (input.currency === "MRU"
      ? packing.pricePerKgMRU
      : input.currency === sourceCurrency[packing.source]
        ? packing.pricePerKg
        : undefined);
  if (!(selectedPerKg !== undefined && selectedPerKg > 0))
    throw new Error("shipment_price_unapproved");
  // The stored rate is authoritative: creation and explicit finance commands
  // validate it. Preserve positive legacy/manual rates without inventing or
  // requiring a publication snapshot retroactively.
}

async function claimGoods(
  tx: any,
  shipmentId: string,
  goods: { goodsId: string }[],
  invoice: string
) {
  for (const good of goods) {
    const old = await tx
      .select()
      .from(financeGoods)
      .where(
        and(
          eq(financeGoods.shipmentId, shipmentId),
          eq(financeGoods.goodsId, good.goodsId)
        )
      )
      .limit(1)
      .for("update");
    if (old[0]) throw new Error("goods_already_billed");
  }
  for (const good of goods)
    await tx
      .insert(financeGoods)
      .values({ shipmentId, goodsId: good.goodsId, invoiceId: invoice });
}

async function applyInvoice(
  tx: any,
  user: FinanceActor,
  scope: FinanceScope,
  command: Extract<FinanceMutationCommand, { kind: "invoice" }>
) {
  const input = command.payload;
  if (!newInvoiceInputSchema.safeParse(input).success)
    throw new Error("payment_mode_legacy_requires_review");
  const financialOfficeId = employeeFinanceOffice(
    scope,
    input.employeeOfficeId
  );
  if (input.issuingOfficeId !== financialOfficeId)
    throw new Error("issuing_office_mismatch");
  assertOffice(scope, financialOfficeId);
  const account = await accountFor(tx, input.customerId);
  if (
    !canReadOfficeRecord(scope.role, scope.offices, "account", account as any)
  )
    throw new Error("finance_forbidden");
  let shipment: Shipment | undefined;
  let shipmentRow: any;
  let pricingProjection:
    | import("@shared/shipmentPricing").PriceProjection
    | null = null;
  if (input.chargeKind === "shipping") {
    const found = await shipmentFor(tx, input.shipmentId!);
    shipment = found.shipment;
    shipmentRow = found.row;
    if (shipment.deleted || !shipment.packing)
      throw new Error("shipment_unavailable");
    if (!canReadOfficeRecord(scope.role, scope.offices, "shipment", shipment))
      throw new Error("finance_forbidden");
    if (
      !canBillShipmentCurrency(
        scope.role,
        scope.offices,
        shipment,
        input.currency
      )
    )
      throw new Error("finance_forbidden");
    pricingProjection = await readPriceProjection(
      tx,
      shipment,
      shipmentRow.version,
      input.currency === "MRU" ? "destination" : "source"
    );
    assertNewShippingPriceApproved(input, shipment, pricingProjection);
  }
  const calculated = calculateFinanceInvoice(
    input,
    shipment,
    pricingProjection
  );
  const total = calculated.totalAmount;
  const paidAmount = input.paymentMode === "on_account" ? 0 : total;
  const issuingOfficeId = input.issuingOfficeId;
  assertOffice(scope, issuingOfficeId);
  let payment = input.payment;
  if (payment)
    payment = canonicalInvoicePayment(
      payment,
      null,
      await readOfficeSettings(tx, financialOfficeId),
      financialOfficeId
    );
  const details = {
    customerId: input.customerId,
    chargeKind: input.chargeKind,
    paymentMode: input.paymentMode,
    issuingOfficeId,
    financialOfficeId,
    actorId: user.id,
    actorName: actorName(user),
    recordedAt: isoNow(),
    currency: input.currency,
    ...(input.shipmentId ? { shipmentId: input.shipmentId } : {}),
    goods: calculated.goods,
    baseAmount: calculated.baseAmount,
    adjustment: input.adjustment,
    paidAmount,
  } satisfies FinancialInvoiceDetails;
  const finance = financialInvoiceSchema.parse(details);
  const invoice: Invoice = {
    id: input.invoiceId,
    account: account.name,
    amount: total,
    status: paidAmount >= total ? "مدفوعة" : "دين",
    issuedAt: isoNow(),
    officeId: financialOfficeId,
    ...(payment ? { payment } : {}),
    finance,
  };
  const existing = await tx
    .select()
    .from(records)
    .where(and(eq(records.entity, "invoice"), eq(records.recordId, invoice.id)))
    .limit(1)
    .for("update");
  if (existing[0]) throw new Error("invoice_exists");
  if (shipment) await claimGoods(tx, shipment.id, calculated.goods, invoice.id);
  const rows: FinanceEntry[] = [];
  if (input.chargeKind === "general")
    rows.push(
      entry(
        "invoice_revenue",
        entryId(command.id, "revenue"),
        financialOfficeId,
        input.currency,
        total,
        "invoice_revenue",
        user,
        {
          invoiceId: invoice.id,
          customerId: account.id,
          customerName: account.name,
        }
      )
    );
  if (input.paymentMode === "on_account")
    rows.push(
      entry(
        "customer_debt",
        entryId(command.id, "debt"),
        financialOfficeId,
        input.currency,
        total,
        "customer_debt",
        user,
        {
          invoiceId: invoice.id,
          customerId: account.id,
          customerName: account.name,
          ...(input.shipmentId ? { shipmentId: input.shipmentId } : {}),
        }
      )
    );
  else
    rows.push(
      entry(
        "collection",
        entryId(command.id, "collection"),
        financialOfficeId,
        input.currency,
        total,
        "collection",
        user,
        {
          invoiceId: invoice.id,
          customerId: account.id,
          customerName: account.name,
          ...(input.shipmentId ? { shipmentId: input.shipmentId } : {}),
          ...(payment ? { payment } : {}),
          ...(input.paymentMode === "wallet"
            ? { cashEffect: "none" as const }
            : {}),
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
  if (input.adjustment.amount > 0) {
    await tx.insert(invoiceAdjustments).values({
      id: `invoice-adjustment:${command.id}`,
      invoiceId: invoice.id,
      officeId: financialOfficeId,
      direction: input.adjustment.direction,
      amount: input.adjustment.amount.toFixed(2),
      reason: "invoice_adjustment",
      actorId: user.id,
    });
  }
  if (input.paymentMode === "cash") {
    const registerId = await ensureOpenCashRegister(
      tx,
      financialOfficeId,
      input.currency,
      user.id,
      command.id,
      true
    );
    await tx.insert(cashMovements).values({
      id: `cash-movement:${command.id}`,
      registerId,
      officeId: financialOfficeId,
      kind: "receipt",
      amount: total.toFixed(2),
      currency: input.currency,
      invoiceId: invoice.id,
      actorId: user.id,
      data: { source: "invoice" },
    });
  }
  for (const row of rows) await insertEntry(tx, row);
  if (payment && payment.methodId !== "cash") {
    const collection = rows.find(row => row.kind === "collection");
    if (collection)
      await recordWalletReceipt(tx, {
        officeId: financialOfficeId,
        methodId: payment.methodId,
        currency: input.currency,
        amount: total,
        invoiceId: invoice.id,
        financeEntryId: collection.id,
        actorId: user.id,
        data: { source: "invoice" },
      });
  }
  await appendAudit(tx, {
    actor: { id: user.id, name: actorName(user), role: scope.role! },
    entity: "invoice",
    recordId: invoice.id,
    action: "finance_invoice",
    before: null,
    after: invoice,
    beforeVersion: 0,
    afterVersion: 1,
    requestKey: `finance:${command.id}`,
  });
  return {
    invoice: { ...invoice, version: 1, scope: "shared" as const },
    entries: rows,
  };
}

async function applyExpense(
  tx: any,
  user: FinanceActor,
  scope: FinanceScope,
  command: Extract<FinanceMutationCommand, { kind: "expense" }>
) {
  const input: FinanceExpenseInput = command.payload;
  const financialOfficeId = employeeFinanceOffice(scope, input.officeId);
  if (financialOfficeId !== input.officeId)
    throw new Error("financial_office_mismatch");
  let shipment: Shipment | undefined;
  let costReference: string | undefined;
  if (input.category === "shipment_cost") {
    if (!canPostShipmentCost(scope, input.officeId))
      throw new Error("shipment_cost_forbidden");
    const found = await shipmentFor(tx, input.shipmentId!);
    shipment = found.shipment;
    const owner = shipment.packing?.source as OfficeId | undefined;
    if (!owner || owner !== input.officeId)
      throw new Error("shipment_office_mismatch");
    if (shipment.deleted) throw new Error("shipment_deleted");
    const expectedCurrency = sourceCurrency[
      owner as Exclude<OfficeId, "nouakchott">
    ] as FinanceEntry["currency"];
    if (input.currency !== expectedCurrency)
      throw new Error("shipment_cost_currency_mismatch");
    costReference =
      input.referenceKey ?? input.costReference ?? "source_shipping";
    const claimed = await tx
      .select()
      .from(shipmentCostApprovals)
      .where(
        and(
          eq(shipmentCostApprovals.shipmentId, shipment.id),
          eq(shipmentCostApprovals.officeId, owner),
          eq(shipmentCostApprovals.referenceKey, costReference)
        )
      )
      .limit(1)
      .for("update");
    if (claimed[0]) throw new Error("shipment_cost_duplicate");
  }
  const duplicate = await tx
    .select()
    .from(financeEntries)
    .where(eq(financeEntries.id, input.expenseId))
    .limit(1)
    .for("update");
  if (duplicate[0]) throw new Error("expense_exists");
  const row = entry(
    input.category,
    input.expenseId,
    input.officeId,
    input.currency,
    input.amount,
    input.description,
    user,
    {
      date: input.date,
      ...(input.shipmentId ? { shipmentId: input.shipmentId } : {}),
    }
  );
  await insertEntry(tx, row);
  const registerId = await ensureOpenCashRegister(
    tx,
    financialOfficeId,
    input.currency,
    user.id,
    command.id,
    true
  );
  await tx.insert(cashMovements).values({
    id: `cash-movement:${command.id}`,
    registerId,
    officeId: financialOfficeId,
    kind: "expense",
    amount: input.amount.toFixed(2),
    currency: input.currency,
    actorId: user.id,
    data: {
      source: "expense",
      category: input.category,
      entryId: row.id,
      ...(costReference ? { referenceKey: costReference } : {}),
    },
  });
  if (shipment && costReference) {
    await tx.insert(shipmentCostApprovals).values({
      id: `shipment-cost-approval:${hash({ shipmentId: shipment.id, officeId: input.officeId, referenceKey: costReference })}`,
      shipmentId: shipment.id,
      officeId: input.officeId,
      currency: input.currency,
      referenceKey: costReference,
      financeEntryId: row.id,
      actorId: user.id,
    });
  }
  await appendAudit(tx, {
    actor: { id: user.id, name: actorName(user), role: scope.role! },
    entity: "finance_entry",
    recordId: row.id,
    action: "finance_expense",
    before: null,
    after: row,
    requestKey: `finance:${command.id}`,
  });
  return { entries: [row] };
}

async function applySettlement(
  tx: any,
  user: FinanceActor,
  scope: FinanceScope,
  command: Extract<FinanceMutationCommand, { kind: "settlement" }>,
  cashLock: { officeId: OfficeId; currency: FinanceEntry["currency"] } | null
) {
  const input = command.payload;
  const rows = await tx
    .select()
    .from(records)
    .where(
      and(eq(records.entity, "invoice"), eq(records.recordId, input.invoiceId))
    )
    .limit(1)
    .for("update");
  await assertActiveEntity(tx, "invoice", input.invoiceId);
  if (!rows[0]) throw new Error("invoice_not_found");
  const current = rows[0].data as Invoice;
  const finance = invoiceFinance(current);
  if (
    cashLock &&
    (finance.financialOfficeId !== cashLock.officeId ||
      finance.currency !== cashLock.currency)
  )
    throw new Error("cash_register_metadata_changed");
  assertOffice(scope, finance.financialOfficeId);
  if (rows[0].version !== input.expectedVersion)
    throw new Error("version_conflict");
  const outstandingCents =
    Math.round(totalOf(finance) * 100) - Math.round(finance.paidAmount * 100);
  const amountCents = Math.round(input.amount * 100);
  if (amountCents > outstandingCents) throw new Error("overpayment");
  let payment = input.payment;
  if (payment)
    payment = canonicalInvoicePayment(
      payment,
      current,
      await readOfficeSettings(tx, finance.financialOfficeId),
      finance.financialOfficeId
    );
  const nextFinance: FinancialInvoiceDetails = {
    ...finance,
    paidAmount: (Math.round(finance.paidAmount * 100) + amountCents) / 100,
  };
  const next: Invoice = {
    ...current,
    amount: totalOf(nextFinance),
    status: nextFinance.paidAmount >= totalOf(nextFinance) ? "مدفوعة" : "دين",
    finance: nextFinance,
    ...(payment ? { payment } : {}),
  };
  const customer = await accountFor(tx, finance.customerId);
  const ledger = entry(
    "debt_payment",
    entryId(command.id, "debt_payment"),
    finance.financialOfficeId,
    finance.currency,
    input.amount,
    input.description || "debt_payment",
    user,
    {
      invoiceId: current.id,
      customerId: finance.customerId,
      customerName: customer.name,
      ...(payment ? { payment } : {}),
      ...(payment && payment.methodId !== "cash"
        ? { cashEffect: "none" as const }
        : {}),
    }
  );
  await tx
    .update(records)
    .set({ version: rows[0].version + 1, data: next, updatedBy: user.id })
    .where(eq(records.id, rows[0].id));
  await insertEntry(tx, ledger);
  if (payment && payment.methodId !== "cash")
    await recordWalletReceipt(tx, {
      officeId: finance.financialOfficeId,
      methodId: payment.methodId,
      currency: finance.currency,
      amount: input.amount,
      invoiceId: current.id,
      financeEntryId: ledger.id,
      actorId: user.id,
      data: { source: "settlement" },
    });
  await recordComponentPayment(tx, {
    invoiceId: current.id,
    amount: input.amount,
    actorId: user.id,
    requestKey: createHash("sha256")
      .update(String(user.id) + ":" + command.id)
      .digest("hex"),
    data: { source: "finance_settlement" },
  });
  if (payment?.methodId === "cash") {
    const registerId = await ensureOpenCashRegister(
      tx,
      finance.financialOfficeId,
      finance.currency,
      user.id,
      command.id,
      true
    );
    await tx.insert(cashMovements).values({
      id: `cash-movement:${command.id}`,
      registerId,
      officeId: finance.financialOfficeId,
      kind: "receipt",
      amount: input.amount.toFixed(2),
      currency: finance.currency,
      invoiceId: current.id,
      actorId: user.id,
      data: { source: "settlement" },
    });
  }
  await appendAudit(tx, {
    actor: { id: user.id, name: actorName(user), role: scope.role! },
    entity: "invoice",
    recordId: current.id,
    action: "finance_settlement",
    before: current,
    after: next,
    beforeVersion: rows[0].version,
    afterVersion: rows[0].version + 1,
    requestKey: `finance:${command.id}`,
  });
  return {
    invoice: {
      ...next,
      version: rows[0].version + 1,
      scope: "shared" as const,
    },
    entries: [ledger],
  };
}

async function applyCustomerMovement(
  tx: any,
  user: FinanceActor,
  scope: FinanceScope,
  command: Extract<FinanceMutationCommand, { kind: "customer_movement" }>
) {
  const input = command.payload;
  // The requested office is only a claim until it is bound to the employee's
  // configured financial home office. Never persist the client-supplied office
  // as the financial office without this check.
  const financialOfficeId = employeeFinanceOffice(scope, input.officeId);
  assertOffice(scope, financialOfficeId);
  const customer = await accountFor(tx, input.customerId);
  if (customer.id !== input.customerId) throw new Error("customer_not_found");
  if (
    !canReadOfficeRecord(scope.role, scope.offices, "account", customer as any)
  )
    throw new Error("finance_forbidden");

  const duplicate = await tx
    .select()
    .from(financeEntries)
    .where(eq(financeEntries.id, input.movementId))
    .limit(1)
    .for("update");
  if (duplicate[0]) throw new Error("movement_exists");

  if (customer.officeId !== financialOfficeId)
    throw new Error("customer_office_mismatch");
  const settings = await readOfficeSettings(tx, financialOfficeId);
  const isWallet = input.paymentMode === "wallet";
  if (isWallet && !permissionAllowed(scope, "office_wallets", "view"))
    throw new Error("office_wallets_forbidden");
  const payment = canonicalInvoicePayment(
    isWallet
      ? input.payment
      : {
          office: financialOfficeId,
          methodId: "cash",
          methodLabel:
            settings.methods.find(method => method.id === "cash")?.label ??
            "Cash",
        },
    null,
    settings,
    financialOfficeId
  );

  const row = entry(
    input.direction === "credit" ? "customer_credit" : "customer_debit",
    input.movementId,
    financialOfficeId,
    input.currency,
    input.amount,
    input.description,
    user,
    {
      date: input.date,
      customerId: customer.id,
      customerName: customer.name,
      ...(payment ? { payment } : {}),
      ...(isWallet ? { cashEffect: "none" as const } : {}),
    }
  );
  await insertEntry(tx, row);
  if (isWallet && payment) {
    await recordWalletReceipt(tx, {
      officeId: financialOfficeId,
      methodId: payment.methodId,
      currency: input.currency,
      amount: input.amount,
      financeEntryId: row.id,
      actorId: user.id,
      kind: input.direction === "credit" ? "receipt" : "refund",
      data: { source: "customer_movement", customerId: customer.id },
    });
  } else {
    const registerId = await ensureOpenCashRegister(
      tx,
      financialOfficeId,
      input.currency,
      user.id,
      command.id,
      true
    );
    await tx.insert(cashMovements).values({
      id: `cash-movement:${command.id}`,
      registerId,
      officeId: financialOfficeId,
      kind: input.direction === "credit" ? "receipt" : "expense",
      amount: input.amount.toFixed(2),
      currency: input.currency,
      actorId: user.id,
      data: {
        source: "customer_movement",
        entryId: row.id,
        customerId: customer.id,
      },
    });
  }
  await appendAudit(tx, {
    actor: { id: user.id, name: actorName(user), role: scope.role! },
    entity: "finance_entry",
    recordId: row.id,
    action: "customer_movement",
    before: null,
    after: row,
    requestKey: `finance:${command.id}`,
  });
  return { entries: [row] };
}

async function applyOpeningBalance(
  tx: any,
  user: FinanceActor,
  scope: FinanceScope,
  command: Extract<FinanceMutationCommand, { kind: "opening_balance" }>
) {
  assertFinanceCommand(scope, command);
  const input = openingBalanceInputSchema.parse(command.payload);
  const office = employeeFinanceOffice(scope, input.officeId);
  if (office !== input.officeId) throw new Error("financial_office_mismatch");
  const duplicate = await tx
    .select()
    .from(financeEntries)
    .where(eq(financeEntries.id, input.openingId))
    .limit(1)
    .for("update");
  if (duplicate[0]) throw new Error("opening_exists");
  const prior = await tx
    .select()
    .from(financeEntries)
    .where(
      and(
        eq(financeEntries.kind, "opening_balance" as any),
        eq(financeEntries.officeId, input.officeId),
        eq(financeEntries.currency, input.currency)
      )
    )
    .limit(1)
    .for("update");
  if (prior[0]) throw new Error("opening_exists");
  const row = entry(
    "opening_balance",
    input.openingId,
    input.officeId,
    input.currency,
    input.amount,
    input.note,
    user,
    { date: input.date, direction: input.direction }
  );
  await insertEntry(tx, row);
  await appendAudit(tx, {
    actor: { id: user.id, name: actorName(user), role: scope.role! },
    entity: "finance_entry",
    recordId: row.id,
    action: "opening_balance",
    before: null,
    after: row,
    requestKey: `finance:${command.id}`,
  });
  return { entries: [row] };
}

async function applyShipmentPrice(
  tx: any,
  user: FinanceActor,
  scope: FinanceScope,
  command: Extract<FinanceMutationCommand, { kind: "shipment_price" }>
) {
  assertFinanceCommand(scope, command);
  // Classify the explicit override contract before Zod validates the numeric
  // rate. Otherwise a legacy zero-rate draft is surfaced as a generic
  // finance_failed error instead of a reviewable, non-mutating conflict.
  if (
    command.payload.side === undefined ||
    command.payload.reason === undefined ||
    command.payload.expectedPricingRevision === undefined
  )
    throw new Error("shipment_price_override_fields_required");
  if (!(command.payload.pricePerKg > 0)) throw new Error("invalid_rate");
  const parsed = shipmentPriceInputSchema.parse(command.payload);
  const found = await shipmentFor(tx, parsed.shipmentId);
  const shipment = found.shipment;
  if (!shipment.packing) throw new Error("shipment_unavailable");
  if (parsed.side === undefined) {
    const original = shipment.packing.pricePerKg;
    const snapshot = shipment.packing.rateSnapshot?.sourceRate;
    if (
      original > 0 &&
      snapshot?.currency === sourceCurrency[shipment.packing.source] &&
      snapshot.unit === "kg" &&
      snapshot.amount === original &&
      parsed.pricePerKg !== original
    )
      throw new Error("shipment_tariff_frozen");
    parseExplicitShipmentPriceInput(parsed);
  }
  const input = parseExplicitShipmentPriceInput(parsed);
  const original =
    input.side === "source"
      ? shipment.packing.pricePerKg
      : (shipment.packing.pricePerKgMRU ?? 0);
  const snapshot =
    input.side === "source"
      ? shipment.packing.rateSnapshot?.sourceRate
      : shipment.packing.rateSnapshot?.nouakchottRate;
  const expectedCurrency =
    input.side === "source" ? sourceCurrency[shipment.packing.source] : "MRU";
  if (
    original > 0 &&
    snapshot?.currency === expectedCurrency &&
    snapshot.unit === "kg" &&
    snapshot.amount === original &&
    input.pricePerKg !== original
  )
    throw new Error("shipment_tariff_frozen");
  if (found.row.version !== input.expectedVersion)
    throw new Error("version_conflict");
  return applyShipmentPriceOverride(tx, user, scope, command);
}

export async function applyFinanceCommand(
  tx: any,
  user: FinanceActor,
  scope: FinanceScope,
  command: FinanceMutationCommand
) {
  assertFinanceCommand(scope, command);
  const cashLock = await lockCashForCommand(tx, scope, command);
  if (command.kind === "invoice" || command.kind === "settlement")
    await assertActiveEntity(tx, "invoice", command.payload.invoiceId);
  if (command.kind === "invoice") return applyInvoice(tx, user, scope, command);
  if (command.kind === "expense") return applyExpense(tx, user, scope, command);
  if (command.kind === "customer_movement")
    return applyCustomerMovement(tx, user, scope, command);
  if (command.kind === "opening_balance")
    return applyOpeningBalance(tx, user, scope, command);
  if (command.kind === "shipment_price")
    return applyShipmentPrice(tx, user, scope, command);
  return applySettlement(tx, user, scope, command, cashLock);
}

export async function financeSync(
  db: any,
  user: FinanceSyncUser,
  scope: FinanceScope,
  commands: FinanceMutationCommand[]
): Promise<FinanceSyncResult>;
export async function financeSync(
  db: any,
  user: FinanceSyncUser,
  commands: FinanceMutationCommand[]
): Promise<FinanceSyncResult>;
export async function financeSync(
  db: any,
  user: FinanceSyncUser,
  scopeOrCommands: FinanceScope | FinanceMutationCommand[],
  maybeCommands?: FinanceMutationCommand[]
): Promise<FinanceSyncResult> {
  const fixedScope = Array.isArray(scopeOrCommands) ? null : scopeOrCommands;
  const commands = Array.isArray(scopeOrCommands)
    ? scopeOrCommands
    : (maybeCommands ?? []);
  const out: FinanceSyncResult = { applied: [], conflicts: [] };
  for (const command of commands) {
    const parsed = command;
    const payloadHash = hash(parsed);
    try {
      // Deliberately one transaction per command: a rejected command must roll
      // back its invoice, goods claim, ledger, audit, and receipt together,
      // without rolling back an earlier acknowledged command.
      const saved = await db.transaction(async (tx: any) => {
        await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1)
          .for("update");
        // The legacy overload is for trusted internal fixtures only; the HTTP
        // router never accepts a request-supplied or cached authorization scope.
        const scope =
          fixedScope ?? (await readOfficeScope(tx, user, new Set(), true));
        assertFinanceCommand(scope, parsed);
        const prior = await tx
          .select()
          .from(financeReceipts)
          .where(
            and(
              eq(financeReceipts.actorId, user.id),
              eq(financeReceipts.commandId, parsed.id)
            )
          )
          .limit(1)
          .for("update");
        if (prior[0]) {
          if (prior[0].payloadHash !== payloadHash)
            throw new Error("replay_payload_mismatch");
          const replay = prior[0].result as any;
          const replayInvoice = replay.invoice as Invoice | undefined;
          const retired = await loadLifecycle(tx);
          if (
            replayInvoice &&
            !recordIsActive(retired, "invoice", replayInvoice)
          )
            throw new Error("record_permanently_retired");
          const replayEntries = Array.isArray(replay.entries)
            ? (replay.entries as FinanceEntry[])
            : [];
          if (
            (Array.isArray(replay.entries) ? replay.entries : []).some(
              (item: FinanceEntry) =>
                isRetired(retired, "finance_entry", item.id)
            )
          )
            throw new Error("record_permanently_retired");
          if (
            (replayInvoice &&
              (!financeCan(permissionSubject(scope), "invoices", "view") ||
                !canReadOfficeRecord(
                  scope.role,
                  scope.offices,
                  "invoice",
                  replayInvoice
                ))) ||
            replayEntries.some(
              e =>
                !inScope(scope, e.officeId) ||
                !financeCan(
                  permissionSubject(scope),
                  financePermissionForEntry(e.kind),
                  "view"
                )
            )
          )
            throw new Error("finance_forbidden");
          return replay;
        }
        const result = await applyFinanceCommand(tx, user, scope, parsed);
        const resultWithId = { commandId: parsed.id, ...result };
        await tx.insert(financeReceipts).values({
          actorId: user.id,
          commandId: parsed.id,
          payloadHash,
          result: resultWithId,
        });
        return resultWithId;
      });
      out.applied.push(saved as any);
    } catch (error) {
      out.conflicts.push({
        commandId: parsed.id,
        code:
          error instanceof Error && /^[a-z][a-z0-9_]{0,80}$/.test(error.message)
            ? error.message
            : "finance_failed",
      });
    }
  }
  return out;
}

export async function maybePostShipmentRevenue(
  tx: any,
  shipment: Shipment,
  user: FinanceActor,
  officeOverride?: OfficeId,
  actorRole?: AppRole | null
) {
  if (!isShipmentSent(shipment) || !shipment.packing || shipment.deleted)
    return [];
  const owner = (shipment.officeId ?? shipment.packing.source) as OfficeId;
  if (officeOverride && officeOverride !== owner)
    throw new Error("shipment_office_mismatch");
  const office = owner;
  // Costs remain separate ledger facts in their entered currencies, but gross
  // shipment revenue is one derived credit per shipment. In particular, MRU
  // and AED costs must not create two gross credits.
  const costs = await tx
    .select()
    .from(financeEntries)
    .where(
      and(
        eq(financeEntries.kind, "shipment_cost"),
        eq(financeEntries.shipmentId, shipment.id)
      )
    )
    .for("update");
  if (!costs.length) return [];
  const exists = await tx
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
  if (exists[0]) return [];
  const currency: FinanceEntry["currency"] =
    owner === "nouakchott" && shipment.packing.pricePerKgMRU !== undefined
      ? "MRU"
      : (sourceCurrency[shipment.packing.source] as FinanceEntry["currency"]);
  const rate =
    currency === "MRU"
      ? shipment.packing.pricePerKgMRU
      : shipment.packing.pricePerKg;
  if (rate === undefined) return [];
  const amount = goodsTotals(
    shipment.packing.cartons.flatMap(c => c.goods),
    rate
  ).amount;
  if (!amount && rate !== 0) return [];
  const row = entry(
    "shipment_revenue",
    `shipment-revenue:${hash(shipment.id)}`,
    office,
    currency,
    amount,
    "gross_shipment_revenue",
    user,
    { shipmentId: shipment.id }
  );
  try {
    await insertEntry(tx, row);
  } catch {
    const won = await tx
      .select()
      .from(financeEntries)
      .where(eq(financeEntries.id, row.id))
      .limit(1);
    if (won[0]) return [];
    throw new Error("shipment_revenue_insert_failed");
  }
  await appendAudit(tx, {
    actor: { id: user.id, name: actorName(user), role: actorRole ?? "staff" },
    entity: "finance_entry",
    recordId: row.id,
    action: "shipment_revenue_derived",
    before: null,
    after: row,
    requestKey: `shipment-revenue:${row.id}`,
  });
  return [row];
}
