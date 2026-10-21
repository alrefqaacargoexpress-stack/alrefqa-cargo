import { z } from "zod";
export const paymentMethodSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_-]{1,64}$/),
    label: z.string().trim().min(1).max(120),
    enabled: z.boolean(),
  })
  .strict();
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export const officeSettingsSchema = z
  .object({
    office: z.literal("nouakchott"),
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
export const defaultPaymentMethods: PaymentMethod[] = [
  { id: "bankily", label: "Bankily", enabled: true },
  { id: "masrvi", label: "Masrvi", enabled: true },
  { id: "gazapay", label: "Gazapay", enabled: true },
  { id: "sedad", label: "Sedad", enabled: true },
  { id: "cash", label: "نقدي", enabled: true },
];
export const invoicePaymentSchema = z
  .object({
    office: z.literal("nouakchott"),
    methodId: z.string().regex(/^[a-z0-9_-]{1,64}$/),
    methodLabel: z.string().trim().min(1).max(120),
    reference: z.string().trim().max(240).optional(),
  })
  .strict();
export type InvoicePayment = z.infer<typeof invoicePaymentSchema>;
export function defaultOfficeSettings(): OfficeSettings {
  return {
    office: "nouakchott",
    methods: structuredClone(defaultPaymentMethods),
    version: 0,
  };
}
