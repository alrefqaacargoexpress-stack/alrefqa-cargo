import { createHash } from "node:crypto";
import { z } from "zod";
import {
  financeEntrySchema,
  type FinanceCurrency,
  type FinanceEntry,
} from "./finance";

const boundedId = z.string().trim().min(1).max(128);
const reasonSchema = z.string().trim().min(1).max(500);

const requestIdentityFields = {
  id: boundedId.optional(),
  requestKey: boundedId.optional(),
};

function refineRequestIdentity(
  value: { id?: string; requestKey?: string },
  ctx: z.RefinementCtx
) {
  if (!value.id && !value.requestKey)
    ctx.addIssue({ code: "custom", message: "request_key_required" });
  if (value.id && value.requestKey && value.id !== value.requestKey)
    ctx.addIssue({ code: "custom", message: "request_key_mismatch" });
}

export const voidInvoiceInputSchema = z
  .object({
    ...requestIdentityFields,
    invoiceId: boundedId,
    expectedVersion: z.number().int().positive(),
    confirmation: boundedId,
    reason: reasonSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    refineRequestIdentity(value, ctx);
    if (value.confirmation !== value.invoiceId)
      ctx.addIssue({
        code: "custom",
        path: ["confirmation"],
        message: "confirmation_mismatch",
      });
  });

export const voidEntryInputSchema = z
  .object({
    ...requestIdentityFields,
    entryId: boundedId,
    confirmation: boundedId,
    reason: reasonSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    refineRequestIdentity(value, ctx);
    if (value.confirmation !== value.entryId)
      ctx.addIssue({
        code: "custom",
        path: ["confirmation"],
        message: "confirmation_mismatch",
      });
  });

export type VoidInvoiceInput = z.infer<typeof voidInvoiceInputSchema>;
export type VoidEntryInput = z.infer<typeof voidEntryInputSchema>;
export type FinancialVoidOperation = "invoice_void" | "entry_void";

export type FinancialVoidResult = {
  operation: FinancialVoidOperation;
  entity: "invoice" | "finance_entry";
  recordId: string;
  requestKey: string;
  expectedVersion: number;
  replayed: boolean;
  reversalIds: string[];
  allocationVoidIds: string[];
  customerCreditEntryId: string | null;
  customerCreditAmount: number;
};

export type FinancialReversalLike = {
  id: string;
  originalEntryId: string;
  originalKind: string;
  officeId: string;
  currency: FinanceCurrency;
  amount: number | string;
  invoiceId?: string | null;
  shipmentId?: string | null;
  customerId?: string | null;
  actorId: number;
  data?: unknown;
};

export type AdjustedAccountingFact = {
  /** Always a schema-compatible nonnegative FinanceEntry fact. */
  entry: FinanceEntry;
  /** The signed effect to use for accounting summaries. */
  signedEffect: number;
  source: "original" | "reversal" | "generated";
  reversalOf?: string;
};

export function financialVoidHash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map(
      key =>
        `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`
    )
    .join(",")}}`;
}

function cents(value: number | string): number {
  const amount = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(amount)) throw new Error("invalid_reversal_amount");
  const result = Math.round(amount * 100);
  if (!Number.isSafeInteger(result)) throw new Error("invalid_reversal_amount");
  return result;
}

function dateOf(entry: FinanceEntry): string {
  return entry.date;
}

/**
 * Combines immutable original facts with signed reversal rows. Reversal facts
 * are emitted with positive amounts because FinanceEntry.amount is nonnegative;
 * callers must use signedEffect for totals and never feed reversal facts to an
 * old positive-only summary without applying that sign.
 */
export function buildAdjustedAccountingEntries(
  originalEntries: readonly FinanceEntry[],
  reversals: readonly FinancialReversalLike[],
  generatedEntries: readonly FinanceEntry[] = []
): AdjustedAccountingFact[] {
  const originalById = new Map<string, FinanceEntry>();
  const facts: AdjustedAccountingFact[] = [];
  for (const value of originalEntries) {
    const entry = financeEntrySchema.parse(value);
    originalById.set(entry.id, entry);
    facts.push({ entry, signedEffect: entry.amount, source: "original" });
  }
  for (const reversal of reversals) {
    const original = originalById.get(reversal.originalEntryId);
    if (!original) throw new Error("reversal_original_missing");
    if (reversal.originalKind !== original.kind)
      throw new Error("reversal_kind_mismatch");
    const signedCents = cents(reversal.amount);
    const magnitude = Math.abs(signedCents) / 100;
    const reversalEntry = financeEntrySchema.parse({
      id: `financial-reversal:${financialVoidHash(reversal.id)}`,
      kind: original.kind,
      officeId: reversal.officeId,
      currency: reversal.currency,
      amount: magnitude,
      date: dateOf(original),
      description: `void_reversal:${original.id}`,
      actorId: reversal.actorId,
      actorName: `void-${reversal.actorId}`,
      recordedAt: new Date().toISOString(),
      ...(original.invoiceId ? { invoiceId: original.invoiceId } : {}),
      ...(original.shipmentId ? { shipmentId: original.shipmentId } : {}),
      ...(original.customerId ? { customerId: original.customerId } : {}),
      ...(original.customerName ? { customerName: original.customerName } : {}),
    });
    facts.push({
      entry: reversalEntry,
      signedEffect: signedCents / 100,
      source: "reversal",
      reversalOf: original.id,
    });
  }
  for (const value of generatedEntries) {
    const entry = financeEntrySchema.parse(value);
    facts.push({ entry, signedEffect: entry.amount, source: "generated" });
  }
  return facts;
}

/** Operational ledger projection: cancel signed effects, retain the immutable database originals. */
export function buildNetAccountingEntries(
  originals: readonly FinanceEntry[],
  reversals: readonly FinancialReversalLike[]
): FinanceEntry[] {
  const facts = buildAdjustedAccountingEntries(originals, reversals);
  const amounts = new Map<string, number>();
  for (const fact of facts) {
    const id = fact.reversalOf ?? fact.entry.id;
    const previous = amounts.get(id) ?? 0;
    amounts.set(id, previous + cents(fact.signedEffect));
  }
  return originals.flatMap(original => {
    const net = amounts.get(original.id) ?? 0;
    if (net < 0) throw new Error("reversal_exceeds_original");
    if (net === 0) return [];
    return [financeEntrySchema.parse({ ...original, amount: net / 100 })];
  });
}

export function requestKeyOf(input: {
  id?: string;
  requestKey?: string;
}): string {
  const requestKey = input.requestKey ?? input.id;
  if (!requestKey) throw new Error("request_key_required");
  return requestKey;
}
