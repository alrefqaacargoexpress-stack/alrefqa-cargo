import { z } from "zod";
import { officeIdSchema, officeIds, type OfficeId } from "./branches";

export const paymentMethodSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_-]{1,64}$/),
    label: z.string().trim().min(1).max(120),
    enabled: z.boolean(),
    accountNumber: z
      .string()
      .trim()
      .max(64)
      .regex(/^\+?[0-9][0-9 -]*$/, "invalid_account_number")
      .optional(),
    accountName: z.string().trim().max(160).optional(),
    instructions: z.string().trim().max(500).optional(),
    showToCustomers: z.boolean().optional(),
  })
  .strict()
  .superRefine((method, ctx) => {
    if (
      method.id !== "cash" &&
      method.enabled &&
      method.showToCustomers === true &&
      !method.accountNumber
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["accountNumber"],
        message: "public_wallet_requires_account_number",
      });
    }
  });
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const officeSettingsSchema = z
  .object({
    office: officeIdSchema,
    methods: z.array(paymentMethodSchema).min(1).max(50),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (new Set(v.methods.map(m => m.id)).size !== v.methods.length)
      ctx.addIssue({ code: "custom", message: "duplicate_payment_method" });
  });
export type OfficeSettings = z.infer<typeof officeSettingsSchema> & {
  version: number;
};

/** New per-office rows use the same validated method payload as the legacy singleton. */
export const officePaymentSettingsSchema = z
  .object({
    officeId: officeIdSchema,
    methods: z.array(paymentMethodSchema).min(1).max(50),
    version: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (new Set(v.methods.map(m => m.id)).size !== v.methods.length)
      ctx.addIssue({ code: "custom", message: "duplicate_payment_method" });
  });
export type OfficePaymentSettings = z.infer<
  typeof officePaymentSettingsSchema
>;

export const defaultPaymentMethods: PaymentMethod[] = [
  { id: "bankily", label: "Bankily", enabled: true, showToCustomers: false },
  { id: "masrvi", label: "Masrvi", enabled: true, showToCustomers: false },
  { id: "gazapay", label: "Gazapay", enabled: true, showToCustomers: false },
  { id: "sedad", label: "Sedad", enabled: true, showToCustomers: false },
  { id: "cash", label: "نقدي", enabled: true, showToCustomers: false },
];

/** Source offices start with cash only; wallet methods are never invented globally. */
export const defaultSourcePaymentMethods: PaymentMethod[] = [
  { id: "cash", label: "نقدي", enabled: true, showToCustomers: false },
];

export const invoicePaymentSchema = z
  .object({
    office: officeIdSchema,
    methodId: z.string().regex(/^[a-z0-9_-]{1,64}$/),
    methodLabel: z.string().trim().min(1).max(120),
    reference: z.string().trim().max(240).optional(),
  })
  .strict();
export type InvoicePayment = z.infer<typeof invoicePaymentSchema>;

export function defaultOfficeSettings(
  office: OfficeId = "nouakchott"
): OfficeSettings {
  return {
    office,
    methods: structuredClone(
      office === "nouakchott"
        ? defaultPaymentMethods
        : defaultSourcePaymentMethods
    ),
    version: 0,
  };
}

export function defaultOfficeIds(): readonly OfficeId[] {
  return officeIds;
}
