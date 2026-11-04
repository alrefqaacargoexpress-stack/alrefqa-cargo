import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  buildAdjustedAccountingEntries,
  financialVoidHash,
  requestKeyOf,
  type FinancialVoidResult,
  type VoidEntryInput,
  type VoidInvoiceInput,
  voidEntryInputSchema,
  voidInvoiceInputSchema,
} from "@shared/financialVoids";
import {
  financeEntrySchema,
  type FinanceEntry,
  type FinancialInvoiceDetails,
} from "@shared/finance";
import type { Invoice } from "@shared/operations";
import { permissionAllowed } from "@shared/permissions";
import {
  officeIsAssigned,
  readOfficeScope,
  type OfficeScope,
} from "./branches";
import { appendAudit } from "./audit";
import { getDb } from "./db";
import {
  cashMovements,
  entityLifecycle,
  financeEntries,
  financeReversals,
  records,
  shipmentChargeAllocations,
  users,
} from "../drizzle/schema";
import { protectedProcedure, router } from "./_core/trpc";
import type { User } from "../drizzle/schema";

export type FinancialVoidUser = Pick<User, "id" | "name" | "openId" | "role">;

type VoidMetadata = {
  operation: "invoice_void" | "entry_void";
  requestKey: string;
  payloadHash: string;
  recordId: string;
  expectedVersion: number;
  confirmation: string;
  reason: string;
  reversalIds: string[];
  allocationVoidIds: string[];
  customerCreditEntryId: string | null;
  customerCreditAmount: number;
};

type LifecycleSnapshot = {
  metadata: VoidMetadata;
  original: unknown;
  result: FinancialVoidResult;
};

const forbiddenMessages = new Set([
  "invoice_void_forbidden",
  "entry_void_forbidden",
  "finance_forbidden",
  "office_forbidden",
]);

function actorName(user: { id: number; name?: string | null }) {
  return user.name?.trim() || `user-${user.id}`;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map(
      key =>
        `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`
    )
    .join(",")}}`;
}

function decimal(value: number | string): number {
  const result = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(result)) throw new Error("invalid_money");
  return Math.round(result * 100) / 100;
}

function signedDecimal(value: number | string, sign: -1 | 1) {
  return (sign * Math.abs(decimal(value))).toFixed(2);
}

function hashedId(prefix: string, value: unknown) {
  return `${prefix}:${createHash("sha256").update(stable(value)).digest("hex")}`;
}

function ensureScopePermission(
  scope: OfficeScope,
  operation: "invoice_void" | "entry_void"
) {
  if (!permissionAllowed(scope, operation, "manage"))
    throw new Error(`${operation}_forbidden`);
}

async function lockActor(tx: any, user: FinancialVoidUser) {
  const rows = await tx
    .select()
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)
    .for("update");
  if (!rows[0]) throw new Error("actor_not_found");
}

function metadataFrom(row: any): VoidMetadata | null {
  const metadata = row?.snapshot?.metadata;
  return metadata && typeof metadata === "object"
    ? (metadata as VoidMetadata)
    : null;
}

async function replayForRequest(
  tx: any,
  userId: number,
  requestKey: string,
  payloadHash: string
): Promise<FinancialVoidResult | null> {
  const rows = await tx
    .select()
    .from(entityLifecycle)
    .where(
      and(
        eq(entityLifecycle.actorId, userId),
        eq(entityLifecycle.requestKey, requestKey)
      )
    )
    .limit(1)
    .for("update");
  if (!rows[0]) return null;
  const metadata = metadataFrom(rows[0]);
  if (!metadata || metadata.payloadHash !== payloadHash)
    throw new Error("replay_payload_mismatch");
  const result = rows[0].snapshot?.result as FinancialVoidResult | undefined;
  if (!result) throw new Error("replay_result_missing");
  return { ...result, replayed: true };
}

async function existingLifecycle(
  tx: any,
  entity: "invoice" | "finance_entry",
  recordId: string
) {
  return (
    await tx
      .select()
      .from(entityLifecycle)
      .where(
        and(
          eq(entityLifecycle.entity, entity),
          eq(entityLifecycle.recordId, recordId)
        )
      )
      .limit(1)
      .for("update")
  )[0];
}

function assertOffice(scope: OfficeScope, officeId: string | undefined) {
  if (!officeId || !officeIsAssigned(scope, officeId as any))
    throw new Error("office_forbidden");
}

function parseInvoice(row: any): Invoice {
  const invoice = row?.data as Invoice | undefined;
  if (!invoice?.id) throw new Error("invoice_invalid");
  return invoice;
}

function invoiceFinance(invoice: Invoice): FinancialInvoiceDetails | null {
  return invoice.finance ?? null;
}

function metadataHash(input: unknown, operation: string, requestKey: string) {
  return financialVoidHash({ operation, requestKey, input });
}

function resultFromMetadata(metadata: VoidMetadata): FinancialVoidResult {
  return {
    operation: metadata.operation,
    entity: metadata.operation === "invoice_void" ? "invoice" : "finance_entry",
    recordId: metadata.recordId,
    requestKey: metadata.requestKey,
    expectedVersion: metadata.expectedVersion,
    replayed: false,
    reversalIds: metadata.reversalIds,
    allocationVoidIds: metadata.allocationVoidIds,
    customerCreditEntryId: metadata.customerCreditEntryId,
    customerCreditAmount: metadata.customerCreditAmount,
  };
}

async function insertReversal(
  tx: any,
  input: {
    lifecycleId: string;
    original: FinanceEntry;
    actorId: number;
    operation: "invoice_void" | "entry_void";
    requestKey: string;
  }
) {
  const id = hashedId("finance-reversal", {
    lifecycleId: input.lifecycleId,
    originalEntryId: input.original.id,
  });
  await tx.insert(financeReversals).values({
    id,
    lifecycleId: input.lifecycleId,
    originalEntryId: input.original.id,
    originalKind: input.original.kind,
    officeId: input.original.officeId,
    currency: input.original.currency,
    amount: signedDecimal(input.original.amount, -1),
    invoiceId: input.original.invoiceId ?? null,
    shipmentId: input.original.shipmentId ?? null,
    customerId: input.original.customerId ?? null,
    actorId: input.actorId,
    data: {
      source: input.operation,
      requestKey: input.requestKey,
      originalEffect: {
        kind: input.original.kind,
        amount: input.original.amount,
        currency: input.original.currency,
        officeId: input.original.officeId,
      },
    },
  });
  return id;
}

function creditEntry(
  invoice: Invoice,
  finance: FinancialInvoiceDetails,
  user: FinancialVoidUser,
  requestKey: string
): FinanceEntry {
  const entry: FinanceEntry = {
    id: hashedId("finance-credit", { invoiceId: invoice.id, requestKey }),
    kind: "customer_credit",
    officeId: finance.financialOfficeId,
    currency: finance.currency,
    amount: decimal(finance.paidAmount),
    cashEffect: "none",
    date: new Date().toISOString().slice(0, 10),
    description: "invoice_void_customer_credit",
    actorId: user.id,
    actorName: actorName(user),
    recordedAt: new Date().toISOString(),
    invoiceId: invoice.id,
    customerId: finance.customerId,
    customerName: invoice.account,
  };
  return financeEntrySchema.parse(entry);
}

async function voidInvoiceTransaction(
  tx: any,
  user: FinancialVoidUser,
  input: VoidInvoiceInput,
  scope: OfficeScope
): Promise<FinancialVoidResult> {
  ensureScopePermission(scope, "invoice_void");
  const requestKey = requestKeyOf(input);
  const payloadHash = metadataHash(input, "invoice_void", requestKey);

  const rows = await tx
    .select()
    .from(records)
    .where(
      and(eq(records.entity, "invoice"), eq(records.recordId, input.invoiceId))
    )
    .limit(1)
    .for("update");
  if (!rows[0]) throw new Error("invoice_not_found");
  const row = rows[0];
  const invoice = parseInvoice(row);
  const finance = invoiceFinance(invoice);
  assertOffice(scope, finance?.financialOfficeId ?? invoice.officeId);
  const replay = await replayForRequest(tx, user.id, requestKey, payloadHash);
  if (replay) return replay;

  if (row.version !== input.expectedVersion)
    throw new Error("version_conflict");
  if (await existingLifecycle(tx, "invoice", invoice.id))
    throw new Error("already_void");

  const originalRows = finance
    ? await tx
        .select()
        .from(financeEntries)
        .where(eq(financeEntries.invoiceId, invoice.id))
        .for("update")
    : [];
  const originals = originalRows.map((item: any) =>
    financeEntrySchema.parse(item.data)
  );
  const reversible = originals.filter(
    (entry: FinanceEntry) =>
      entry.kind === "invoice_revenue" || entry.kind === "customer_debt"
  );
  const reversalIds = reversible.map((entry: FinanceEntry) =>
    hashedId("finance-reversal", {
      lifecycleId: hashedId("entity-lifecycle", {
        entity: "invoice",
        recordId: invoice.id,
      }),
      originalEntryId: entry.id,
    })
  );
  const allocationRows = finance
    ? await tx
        .select()
        .from(shipmentChargeAllocations)
        .where(eq(shipmentChargeAllocations.invoiceId, invoice.id))
        .for("update")
    : [];
  const invoiceAllocations = allocationRows.filter(
    (allocation: any) => allocation.kind === "invoice"
  );
  const allocationVoidIds = invoiceAllocations.map((allocation: any) =>
    hashedId("charge-void", {
      componentId: allocation.componentId,
      invoiceId: invoice.id,
      requestKey,
    })
  );
  const shouldCredit = Boolean(
    finance && finance.paymentMode !== "on_account" && finance.paidAmount > 0
  );
  const customerCreditAmount = shouldCredit ? decimal(finance!.paidAmount) : 0;
  const customerCreditEntryId = shouldCredit
    ? hashedId("finance-credit", { invoiceId: invoice.id, requestKey })
    : null;
  const metadata: VoidMetadata = {
    operation: "invoice_void",
    requestKey,
    payloadHash,
    recordId: invoice.id,
    expectedVersion: input.expectedVersion,
    confirmation: input.confirmation,
    reason: input.reason,
    reversalIds,
    allocationVoidIds,
    customerCreditEntryId,
    customerCreditAmount,
  };
  const lifecycleId = await insertLifecycleForVoid(tx, user, scope, {
    entity: "invoice",
    recordId: invoice.id,
    officeId: finance?.financialOfficeId ?? invoice.officeId ?? null,
    expectedVersion: input.expectedVersion,
    requestKey,
    reason: input.reason,
    snapshot: {
      metadata,
      original: invoice,
      result: resultFromMetadata(metadata),
    } satisfies LifecycleSnapshot,
  });

  for (const original of reversible)
    await insertReversal(tx, {
      lifecycleId,
      original,
      actorId: user.id,
      operation: "invoice_void",
      requestKey,
    });
  if (shouldCredit) {
    const entry = creditEntry(invoice, finance!, user, requestKey);
    await tx.insert(financeEntries).values({
      id: entry.id,
      kind: entry.kind,
      officeId: entry.officeId,
      currency: entry.currency,
      data: entry,
      invoiceId: entry.invoiceId ?? null,
      shipmentId: entry.shipmentId ?? null,
      actorId: entry.actorId,
    });
  }
  for (const allocation of invoiceAllocations) {
    // Allocation.kind carries the minus sign; all allocation magnitudes stay positive.
    const amount = signedDecimal(allocation.amount, 1);
    await tx.insert(shipmentChargeAllocations).values({
      id: hashedId("charge-void", {
        componentId: allocation.componentId,
        invoiceId: invoice.id,
        requestKey,
      }),
      componentId: allocation.componentId,
      invoiceId: invoice.id,
      kind: "void",
      amount,
      actorId: user.id,
      requestKey,
      data: {
        source: "invoice_void",
        originalAllocationId: allocation.id,
        originalAmount: allocation.amount,
        lifecycleId,
      },
    });
  }
  const result = resultFromMetadata(metadata);
  await appendAudit(tx, {
    actor: { id: user.id, name: actorName(user), role: scope.role! },
    entity: "invoice",
    recordId: invoice.id,
    action: "invoice_void",
    before: invoice,
    after: { void: true, operation: "invoice_void", reason: input.reason },
    beforeVersion: row.version,
    afterVersion: row.version,
    requestKey,
  });
  return result;
}

async function insertLifecycleForVoid(
  tx: any,
  user: FinancialVoidUser,
  scope: OfficeScope,
  input: {
    entity: "invoice" | "finance_entry";
    recordId: string;
    officeId: string | null;
    expectedVersion: number;
    requestKey: string;
    reason: string;
    snapshot: LifecycleSnapshot;
  }
) {
  const id = hashedId("entity-lifecycle", {
    entity: input.entity,
    recordId: input.recordId,
  });
  await tx.insert(entityLifecycle).values({
    id,
    entity: input.entity,
    recordId: input.recordId,
    action: "void",
    officeId: input.officeId,
    reason: input.reason,
    expectedVersion: input.expectedVersion,
    actorId: user.id,
    requestKey: input.requestKey,
    snapshot: input.snapshot,
  });
  return id;
}

async function voidEntryTransaction(
  tx: any,
  user: FinancialVoidUser,
  input: VoidEntryInput,
  scope: OfficeScope
): Promise<FinancialVoidResult> {
  ensureScopePermission(scope, "entry_void");
  const requestKey = requestKeyOf(input);
  const payloadHash = metadataHash(input, "entry_void", requestKey);

  const rows = await tx
    .select()
    .from(financeEntries)
    .where(eq(financeEntries.id, input.entryId))
    .limit(1)
    .for("update");
  if (!rows[0]) throw new Error("entry_not_found");
  const row = rows[0];
  const entry = financeEntrySchema.parse(row.data);
  assertOffice(scope, entry.officeId);
  const replay = await replayForRequest(tx, user.id, requestKey, payloadHash);
  if (replay) return replay;

  if (await existingLifecycle(tx, "finance_entry", entry.id))
    throw new Error("already_void");
  if (entry.invoiceId) throw new Error("entry_requires_invoice_void");
  if (entry.kind === "opening_balance" || entry.kind === "shipment_revenue")
    throw new Error("entry_protected");

  const cashRows =
    entry.kind === "daily_expense" ||
    entry.kind === "monthly_expense" ||
    entry.kind === "shipment_cost" ||
    entry.kind === "profit_withdrawal" ||
    entry.kind === "customer_credit" ||
    entry.kind === "customer_debit"
      ? await tx
          .select()
          .from(cashMovements)
          .where(
            and(
              eq(cashMovements.officeId, entry.officeId),
              eq(
                cashMovements.kind,
                entry.kind === "customer_credit" ? "receipt" : "expense"
              )
            )
          )
          .for("update")
      : [];
  const hasRealPayment = cashRows.some((cash: any) => {
    const data = cash.data && typeof cash.data === "object" ? cash.data : {};
    if (cash.officeId !== entry.officeId || cash.currency !== entry.currency)
      return false;
    return (
      data.entryId === entry.id ||
      data.expenseId === entry.id ||
      (data.source === "expense" &&
        cash.currency === entry.currency &&
        decimal(cash.amount) === decimal(entry.amount) &&
        cash.actorId === entry.actorId)
    );
  });
  if (hasRealPayment) throw new Error("entry_refund_required");

  const lifecycleId = hashedId("entity-lifecycle", {
    entity: "finance_entry",
    recordId: entry.id,
  });
  const reversalId = hashedId("finance-reversal", {
    lifecycleId,
    originalEntryId: entry.id,
  });
  const metadata: VoidMetadata = {
    operation: "entry_void",
    requestKey,
    payloadHash,
    recordId: entry.id,
    expectedVersion: 1,
    confirmation: input.confirmation,
    reason: input.reason,
    reversalIds: [reversalId],
    allocationVoidIds: [],
    customerCreditEntryId: null,
    customerCreditAmount: 0,
  };
  await insertLifecycleForVoid(tx, user, scope, {
    entity: "finance_entry",
    recordId: entry.id,
    officeId: entry.officeId,
    expectedVersion: 1,
    requestKey,
    reason: input.reason,
    snapshot: {
      metadata,
      original: entry,
      result: resultFromMetadata(metadata),
    } satisfies LifecycleSnapshot,
  });
  await insertReversal(tx, {
    lifecycleId,
    original: entry,
    actorId: user.id,
    operation: "entry_void",
    requestKey,
  });
  const result = resultFromMetadata(metadata);
  await appendAudit(tx, {
    actor: { id: user.id, name: actorName(user), role: scope.role! },
    entity: "finance_entry",
    recordId: entry.id,
    action: "entry_void",
    before: entry,
    after: { void: true, operation: "entry_void", reason: input.reason },
    beforeVersion: 1,
    afterVersion: 1,
    requestKey,
  });
  return result;
}

export async function voidInvoice(
  db: any,
  user: FinancialVoidUser,
  input: VoidInvoiceInput
): Promise<FinancialVoidResult> {
  return db.transaction(async (tx: any) => {
    await lockActor(tx, user);
    const scope = await readOfficeScope(tx, user);
    return voidInvoiceTransaction(tx, user, input, scope);
  });
}

export async function voidEntry(
  db: any,
  user: FinancialVoidUser,
  input: VoidEntryInput
): Promise<FinancialVoidResult> {
  return db.transaction(async (tx: any) => {
    await lockActor(tx, user);
    const scope = await readOfficeScope(tx, user);
    return voidEntryTransaction(tx, user, input, scope);
  });
}

/** Parent finance integration can apply these signed effects to its summary. */
export { buildAdjustedAccountingEntries } from "@shared/financialVoids";

function trpcError(error: unknown): TRPCError {
  const message =
    error instanceof Error ? error.message : "financial_void_failed";
  if (forbiddenMessages.has(message))
    return new TRPCError({ code: "FORBIDDEN", message });
  if (
    ["invoice_not_found", "entry_not_found", "actor_not_found"].includes(
      message
    )
  )
    return new TRPCError({ code: "NOT_FOUND", message });
  if (
    [
      "version_conflict",
      "already_void",
      "replay_payload_mismatch",
      "replay_result_missing",
    ].includes(message)
  )
    return new TRPCError({ code: "CONFLICT", message });
  if (
    message === "entry_refund_required" ||
    message === "entry_requires_invoice_void" ||
    message === "entry_protected"
  )
    return new TRPCError({ code: "CONFLICT", message });
  if (/^[a-z][a-z0-9_]{0,80}$/.test(message))
    return new TRPCError({ code: "BAD_REQUEST", message });
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "financial_void_failed",
  });
}

async function dbOrThrow() {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database is not available",
    });
  return db;
}

export const financialVoidsRouter = router({
  voidInvoice: protectedProcedure
    .input(voidInvoiceInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await voidInvoice(await dbOrThrow(), ctx.user, input);
      } catch (error) {
        throw trpcError(error);
      }
    }),
  voidEntry: protectedProcedure
    .input(voidEntryInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await voidEntry(await dbOrThrow(), ctx.user, input);
      } catch (error) {
        throw trpcError(error);
      }
    }),
});
