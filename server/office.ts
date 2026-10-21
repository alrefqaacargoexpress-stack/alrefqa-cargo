import { eq } from "drizzle-orm";
import { z } from "zod";
import { defaultOfficeSettings, invoicePaymentSchema, officeSettingsSchema, type InvoicePayment, type OfficeSettings, type PaymentMethod } from "@shared/office";
import { officeSettings } from "../drizzle/schema";
import type { Invoice } from "@shared/operations";

export const officeUpdateSchema = officeSettingsSchema.safeExtend({
  expectedVersion: z.number().int().nonnegative(),
});

export type OfficeExecutor = { select: (...args: any[]) => any };

export async function readOfficeSettings(db: OfficeExecutor): Promise<OfficeSettings> {
  const rows = await db.select().from(officeSettings).where(eq(officeSettings.id, 1)).limit(1);
  const row = rows[0];
  if (!row) return defaultOfficeSettings();
  return settingsWithVersion(row);
}

export function settingsWithVersion(row: { office: string; methods: unknown; version: number }): OfficeSettings {
  const parsed = officeSettingsSchema.parse({ office: row.office, methods: row.methods });
  return { ...parsed, version: row.version };
}

function methodFor(settings: OfficeSettings, methodId: string): PaymentMethod | undefined {
  return settings.methods.find(method => method.id === methodId);
}

/** Payment labels are always canonicalized from server settings; clients cannot invent labels. */
export function canonicalInvoicePayment(
  payment: InvoicePayment | undefined,
  current: Invoice | null,
  settings: OfficeSettings
): InvoicePayment | undefined {
  if (!payment) return undefined;
  const parsed = invoicePaymentSchema.parse(payment);
  const old = current?.payment;
  const selected = methodFor(settings, parsed.methodId);
  const unchangedExisting = Boolean(old && old.office === parsed.office && old.methodId === parsed.methodId && old.reference === parsed.reference);
  if (!selected && !unchangedExisting) throw new Error("payment_method_unknown");
  if (selected && !selected.enabled && !unchangedExisting) throw new Error("payment_method_disabled");
  return {
    office: "nouakchott",
    methodId: parsed.methodId,
    methodLabel: unchangedExisting ? old!.methodLabel : selected?.label ?? parsed.methodLabel,
    ...(parsed.reference === undefined ? {} : { reference: parsed.reference }),
  };
}

export function validateInvoicePaymentRecord(next: Invoice, current: Invoice | null, settings: OfficeSettings): Invoice {
  const payment = canonicalInvoicePayment(next.payment, current, settings);
  return payment ? { ...next, payment } : { ...next, payment: undefined };
}
