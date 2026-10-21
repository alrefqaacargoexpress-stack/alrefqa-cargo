import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  defaultOfficeSettings,
  invoicePaymentSchema,
  officeSettingsSchema,
  type InvoicePayment,
  type OfficeSettings,
  type PaymentMethod,
} from "@shared/office";
import { officeSettings } from "../drizzle/schema";
import type { Invoice } from "@shared/operations";

const accountNumberPattern = /^\+?[0-9][0-9 -]*$/;

export type PublicPaymentMethod = {
  id: string;
  label: string;
  instructions?: string;
  accountNumber?: string;
  accountName?: string;
};

export type PublicOfficeSettings = {
  office: "nouakchott";
  methods: PublicPaymentMethod[];
};

export const officeUpdateSchema = officeSettingsSchema.safeExtend({
  expectedVersion: z.number().int().nonnegative(),
});

function normalizedMethod(method: PaymentMethod) {
  return {
    id: method.id,
    label: method.label.trim(),
    enabled: method.enabled,
    accountNumber: method.accountNumber?.trim() || undefined,
    accountName: method.accountName?.trim() || undefined,
    instructions: method.instructions?.trim() || undefined,
    showToCustomers: method.showToCustomers === true,
  };
}

/** Compare the persisted payload semantically so a lost response can be retried safely. */
export function sameOfficeMethods(
  left: PaymentMethod[],
  right: PaymentMethod[]
): boolean {
  if (left.length !== right.length) return false;
  const rightById = new Map(
    right.map(method => [method.id, normalizedMethod(method)])
  );
  return left.every(method => {
    const other = rightById.get(method.id);
    return Boolean(
      other &&
        JSON.stringify(normalizedMethod(method)) === JSON.stringify(other)
    );
  });
}

export type OfficeExecutor = { select: (...args: any[]) => any };

export async function readOfficeSettings(
  db: OfficeExecutor
): Promise<OfficeSettings> {
  const rows = await db
    .select()
    .from(officeSettings)
    .where(eq(officeSettings.id, 1))
    .limit(1);
  const row = rows[0];
  if (!row) return defaultOfficeSettings();
  return settingsWithVersion(row);
}

export function settingsWithVersion(row: {
  office: string;
  methods: unknown;
  version: number;
}): OfficeSettings {
  const parsed = officeSettingsSchema.parse({
    office: row.office,
    methods: row.methods,
  });
  return { ...parsed, version: row.version };
}

/** Allowlist the customer-facing wallet payload; never expose settings metadata. */
export function publicOfficeSettings(
  settings: OfficeSettings
): PublicOfficeSettings {
  return {
    office: "nouakchott",
    methods: settings.methods.flatMap(method => {
      if (!method.enabled || method.showToCustomers !== true) return [];
      const instructions = method.instructions?.trim();
      if (method.id === "cash") {
        return [
          {
            id: method.id,
            label: method.label,
            ...(instructions ? { instructions } : {}),
          },
        ];
      }
      const accountNumber = method.accountNumber?.trim();
      if (!accountNumber || !accountNumberPattern.test(accountNumber))
        return [];
      const accountName = method.accountName?.trim();
      return [
        {
          id: method.id,
          label: method.label,
          accountNumber,
          ...(accountName ? { accountName } : {}),
          ...(instructions ? { instructions } : {}),
        },
      ];
    }),
  };
}

function methodFor(
  settings: OfficeSettings,
  methodId: string
): PaymentMethod | undefined {
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
  const unchangedExisting = Boolean(
    old &&
      old.office === parsed.office &&
      old.methodId === parsed.methodId &&
      old.reference === parsed.reference
  );
  if (!selected && !unchangedExisting)
    throw new Error("payment_method_unknown");
  if (selected && !selected.enabled && !unchangedExisting)
    throw new Error("payment_method_disabled");
  return {
    office: "nouakchott",
    methodId: parsed.methodId,
    methodLabel: unchangedExisting
      ? old!.methodLabel
      : (selected?.label ?? parsed.methodLabel),
    ...(parsed.reference === undefined ? {} : { reference: parsed.reference }),
  };
}

export function validateInvoicePaymentRecord(
  next: Invoice,
  current: Invoice | null,
  settings: OfficeSettings
): Invoice {
  const payment = canonicalInvoicePayment(next.payment, current, settings);
  return payment ? { ...next, payment } : { ...next, payment: undefined };
}
