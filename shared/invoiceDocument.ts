import { officeIdSchema } from "./branches";
import {
  adjustedInvoiceTotal,
  financeCommandSchema,
  financialInvoiceSchema,
  financeMoneySchema,
  type FinanceCommand,
} from "./finance";
import { permissionAllowed, type PermissionSubject } from "./permissions";
import type { Invoice } from "./operations";

export type InvoiceDocumentAdjustment = {
  direction: "increase" | "decrease";
  amount: number;
};

export type InvoiceDocumentAmounts = {
  ok: true;
  baseAmount: number;
  total: number;
  paid: number;
  remaining: number;
  adjustment: InvoiceDocumentAdjustment;
  weight: number;
  pieces: number;
};

export type InvoiceDocumentAmountsResult =
  | InvoiceDocumentAmounts
  | {
      ok: false;
      reason: "missing_details" | "invalid_amounts" | "total_mismatch";
    };

export type InvoicePrintAccessResult =
  | {
      ok: true;
      amounts: InvoiceDocumentAmounts;
      pendingSettlement: boolean;
    }
  | {
      ok: false;
      reason:
        | "forbidden"
        | "not_confirmed"
        | "pending_invoice"
        | "missing_details"
        | "invalid_amounts"
        | "total_mismatch";
    };

function cents(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const result = Math.round(value * 100);
  return Number.isSafeInteger(result) ? result : null;
}

function safeGrams(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const result = Math.round(value * 1000);
  return Number.isSafeInteger(result) ? result : null;
}

function validOffice(value: unknown): boolean {
  return officeIdSchema.safeParse(value).success;
}

function validSharedVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/**
 * Derive printable financial facts from the persisted invoice snapshot only.
 * This intentionally never consults shipment prices, rates, or live records.
 */
export function invoiceDocumentAmounts(
  invoice: Invoice
): InvoiceDocumentAmountsResult {
  if (!invoice || typeof invoice !== "object" || !invoice.finance)
    return { ok: false, reason: "missing_details" };

  const detailsResult = financialInvoiceSchema.safeParse(invoice.finance);
  if (!detailsResult.success) return { ok: false, reason: "invalid_amounts" };

  const invoiceAmountResult = financeMoneySchema.safeParse(invoice.amount);
  if (!invoiceAmountResult.success)
    return { ok: false, reason: "invalid_amounts" };

  const details = detailsResult.data;
  const baseCents = cents(details.baseAmount);
  const invoiceCents = cents(invoiceAmountResult.data);
  const paidCents = cents(details.paidAmount);
  if (baseCents === null || invoiceCents === null || paidCents === null)
    return { ok: false, reason: "invalid_amounts" };

  let total: number;
  try {
    total = adjustedInvoiceTotal(details.baseAmount, details.adjustment);
  } catch {
    return { ok: false, reason: "invalid_amounts" };
  }
  const totalCents = cents(total);
  if (totalCents === null || totalCents !== invoiceCents)
    return { ok: false, reason: "total_mismatch" };
  if (paidCents > totalCents) return { ok: false, reason: "invalid_amounts" };

  let totalGrams = 0;
  let totalPieces = 0;
  for (const good of details.goods) {
    const grams = safeGrams(good.weight);
    if (grams === null || !Number.isSafeInteger(good.pieces) || good.pieces < 0)
      return { ok: false, reason: "invalid_amounts" };
    totalGrams += grams;
    totalPieces += good.pieces;
    if (!Number.isSafeInteger(totalGrams) || !Number.isSafeInteger(totalPieces))
      return { ok: false, reason: "invalid_amounts" };
  }

  const remainingCents = totalCents - paidCents;
  if (!Number.isSafeInteger(remainingCents) || remainingCents < 0)
    return { ok: false, reason: "invalid_amounts" };
  if (
    !["مدفوعة", "دين", "بانتظار الدفع"].includes(invoice.status) ||
    (invoice.status === "مدفوعة") !== (remainingCents === 0)
  )
    return { ok: false, reason: "invalid_amounts" };

  return {
    ok: true,
    baseAmount: baseCents / 100,
    total: totalCents / 100,
    paid: paidCents / 100,
    remaining: remainingCents / 100,
    adjustment: {
      direction: details.adjustment.direction,
      amount: cents(details.adjustment.amount)! / 100,
    },
    weight: totalGrams / 1000,
    pieces: totalPieces,
  };
}

function subjectCanReadInvoice(
  invoice: Invoice,
  subject: PermissionSubject
): boolean {
  if (!subject || typeof subject !== "object") return false;
  if (!validOffice(invoice.officeId)) return false;
  if (!invoice.finance || !validOffice(invoice.finance.financialOfficeId))
    return false;
  if (invoice.finance.financialOfficeId !== invoice.officeId) return false;
  if (!permissionAllowed(subject, "invoices", "view")) return false;

  if (subject.role === "admin") return true;
  if (!subject.role || !Array.isArray(subject.offices)) return false;
  if (subject.offices.length !== 1 || !validOffice(subject.offices[0]))
    return false;
  if (
    subject.homeOffice !== undefined &&
    subject.homeOffice !== null &&
    (!validOffice(subject.homeOffice) ||
      subject.homeOffice !== subject.offices[0])
  )
    return false;
  return subject.offices[0] === invoice.officeId;
}

function commandForInvoice(
  command: FinanceCommand,
  invoiceId: string
): boolean {
  const parsed = financeCommandSchema.safeParse(command);
  if (!parsed.success) return false;
  return (
    (parsed.data.kind === "invoice" || parsed.data.kind === "settlement") &&
    parsed.data.payload.invoiceId === invoiceId
  );
}

/**
 * Authorize print/PDF access without granting or performing any write action.
 */
export function invoicePrintAccess(
  invoice: Invoice,
  subject: PermissionSubject,
  pendingCommands: readonly FinanceCommand[] = []
): InvoicePrintAccessResult {
  if (!invoice || typeof invoice !== "object" || !invoice.finance)
    return { ok: false, reason: "missing_details" };
  if (!subjectCanReadInvoice(invoice, subject))
    return { ok: false, reason: "forbidden" };

  const pendingInvoice = pendingCommands.some(
    command =>
      command.kind === "invoice" && commandForInvoice(command, invoice.id)
  );
  if (pendingInvoice) return { ok: false, reason: "pending_invoice" };

  if (invoice.scope !== "shared" || !validSharedVersion(invoice.version))
    return { ok: false, reason: "not_confirmed" };

  const amounts = invoiceDocumentAmounts(invoice);
  if (!amounts.ok) return amounts;

  const pendingSettlement = pendingCommands.some(
    command =>
      command.kind === "settlement" && commandForInvoice(command, invoice.id)
  );
  return { ok: true, amounts, pendingSettlement };
}
