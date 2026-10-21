import { z } from "zod";

export const shippingRateKeys = [
  "airRegular",
  "airExpress",
  "sensitive",
  "sea",
] as const;
export type ShippingRateKey = (typeof shippingRateKeys)[number];
export const publicShippingRateSchema = z
  .object({
    amount: z
      .number()
      .finite()
      .nonnegative()
      .max(999999999)
      .refine(
        value => Math.abs(value * 100 - Math.round(value * 100)) < 0.00001,
        { message: "rate_two_decimals" }
      ),
    currency: z.enum(["MRU", "AED", "CNY", "TRY", "USD", "EUR"]),
    unit: z.enum(["kg", "m3", "shipment"]),
  })
  .strict();
export type PublicShippingRate = z.infer<typeof publicShippingRateSchema>;
export const publicShippingRatesSchema = z
  .object({
    airRegular: publicShippingRateSchema.nullable(),
    airExpress: publicShippingRateSchema.nullable(),
    sensitive: publicShippingRateSchema.nullable(),
    sea: publicShippingRateSchema.nullable(),
  })
  .strict();
export type PublicShippingRates = z.infer<typeof publicShippingRatesSchema>;
export function emptyPublicShippingRates(): PublicShippingRates {
  return { airRegular: null, airExpress: null, sensitive: null, sea: null };
}

/** Source-specific customer tariffs belong only to the Nouakchott profile. */
export const nouakchottRateSources = ["dubai", "turkey", "china"] as const;
export type NouakchottRateSource = (typeof nouakchottRateSources)[number];
export const mruPublicShippingRateSchema = publicShippingRateSchema.extend({
  currency: z.literal("MRU"),
});
export const mruPublicShippingRatesSchema = z
  .object({
    airRegular: mruPublicShippingRateSchema.nullable(),
    airExpress: mruPublicShippingRateSchema.nullable(),
    sensitive: mruPublicShippingRateSchema.nullable(),
    sea: mruPublicShippingRateSchema.nullable(),
  })
  .strict();
export type MRUPublicShippingRates = z.infer<
  typeof mruPublicShippingRatesSchema
>;
export const nouakchottSourceRatesSchema = z
  .object({
    dubai: mruPublicShippingRatesSchema,
    turkey: mruPublicShippingRatesSchema,
    china: mruPublicShippingRatesSchema,
  })
  .strict();
export type NouakchottSourceRates = z.infer<typeof nouakchottSourceRatesSchema>;
export function emptyNouakchottSourceRates(): NouakchottSourceRates {
  const empty = (): MRUPublicShippingRates => ({
    airRegular: null,
    airExpress: null,
    sensitive: null,
    sea: null,
  });
  return { dubai: empty(), turkey: empty(), china: empty() };
}
