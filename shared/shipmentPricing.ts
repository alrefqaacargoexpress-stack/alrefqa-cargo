import { z } from "zod";
import { officeIdSchema, type OfficeId } from "./branches";
import type { Shipment } from "./operations";
import { sourceCurrency, type PackingSource } from "./packing";

export const shipmentPriceSides = ["source", "destination"] as const;
export type ShipmentPriceSide = (typeof shipmentPriceSides)[number];

export const shipmentPriceSideSchema = z.enum(shipmentPriceSides);
export const shipmentPriceCurrencySchema = z.enum(["AED", "TRY", "CNY", "MRU"]);
export type ShipmentPriceCurrency = z.infer<typeof shipmentPriceCurrencySchema>;

export type ShipmentPricingTarget = {
  side: ShipmentPriceSide;
  officeId: OfficeId;
  currency: ShipmentPriceCurrency;
};

export function shipmentPricingTarget(
  shipment: Pick<Shipment, "packing">,
  side: ShipmentPriceSide
): ShipmentPricingTarget {
  const source = shipment.packing?.source;
  if (!source) throw new Error("shipment_packing_required");
  if (side === "destination")
    return { side, officeId: "nouakchott", currency: "MRU" };
  return {
    side,
    officeId: source,
    currency: sourceCurrency[source] as ShipmentPriceCurrency,
  };
}

export const priceProjectionSchema = z
  .object({
    shipmentId: z.string().trim().min(1).max(128),
    side: shipmentPriceSideSchema,
    officeId: z.string().trim().min(1).max(32),
    currency: shipmentPriceCurrencySchema,
    /** Effective rate (override when present, otherwise the immutable original). */
    pricePerKg: z.number().finite().nonnegative(),
    /** Null means no override exists; the original is never backfilled into this field. */
    overridePricePerKg: z.number().finite().positive().nullable(),
    revision: z.number().int().nonnegative(),
    expectedPricingRevision: z.number().int().nonnegative(),
    recordVersion: z.number().int().positive(),
    overrideId: z.string().trim().min(1).max(190).nullable(),
    createdAt: z.string().datetime().nullable(),
  })
  .strict();
export type PriceProjection = z.infer<typeof priceProjectionSchema>;

export const shipmentPricingProjectionSchema = z
  .object({
    shipmentId: z.string().trim().min(1).max(128),
    source: priceProjectionSchema.nullable(),
    destination: priceProjectionSchema.nullable(),
  })
  .strict();
export type ShipmentPricingProjection = z.infer<
  typeof shipmentPricingProjectionSchema
>;

export const shipmentPriceInputSchema = z
  .object({
    shipmentId: z.string().trim().min(1).max(128),
    // Optional in the wire type so cached/legacy finance drafts keep parsing.
    // The server override command requires all three explicit fields below.
    side: shipmentPriceSideSchema.optional(),
    pricePerKg: z
      .number()
      .finite()
      .positive()
      .max(999999999)
      .refine(
        value => Math.abs(value * 100 - Math.round(value * 100)) < 0.0001,
        "invalid_rate"
      ),
    reason: z.string().trim().min(1).max(500).optional(),
    expectedPricingRevision: z.number().int().nonnegative().optional(),
    expectedVersion: z.number().int().positive(),
    // TypeScript compatibility for cached/old clients; superRefine below rejects them.
    sourceOfficeId: officeIdSchema.optional(),
    pricePerKgMRU: z.number().finite().nonnegative().optional(),
  })
  .strict();
export type ShipmentPriceInput = {
  shipmentId: string;
  side?: ShipmentPriceSide;
  pricePerKg: number;
  reason?: string;
  expectedPricingRevision?: number;
  expectedVersion: number;
  sourceOfficeId?: OfficeId;
  pricePerKgMRU?: number;
};

export type ExplicitShipmentPriceInput = ShipmentPriceInput & {
  side: ShipmentPriceSide;
  reason: string;
  expectedPricingRevision: number;
};

/** Legacy drafts may omit new fields, but writes require an explicit override contract. */
export function parseExplicitShipmentPriceInput(
  input: ShipmentPriceInput
): ExplicitShipmentPriceInput {
  if (
    input.side === undefined ||
    input.reason === undefined ||
    input.expectedPricingRevision === undefined
  )
    throw new Error("shipment_price_override_fields_required");
  return input as ExplicitShipmentPriceInput;
}

export function originalPricePerKg(
  shipment: Pick<Shipment, "packing">,
  side: ShipmentPriceSide
): number {
  if (!shipment.packing) throw new Error("shipment_packing_required");
  return side === "source"
    ? shipment.packing.pricePerKg
    : (shipment.packing.pricePerKgMRU ?? 0);
}

export function effectiveRate(
  original: number,
  override: Pick<PriceProjection, "overridePricePerKg"> | null | undefined
): number {
  if (
    override?.overridePricePerKg !== null &&
    override?.overridePricePerKg !== undefined
  )
    return override.overridePricePerKg;
  return original;
}

export function effectiveShipmentRate(
  shipment: Pick<Shipment, "packing">,
  side: ShipmentPriceSide,
  projection?: Pick<PriceProjection, "overridePricePerKg"> | null
): number {
  return effectiveRate(originalPricePerKg(shipment, side), projection);
}

export function sideForCurrency(currency: string): ShipmentPriceSide {
  if (currency === "MRU") return "destination";
  if (currency === "AED" || currency === "TRY" || currency === "CNY")
    return "source";
  throw new Error("shipment_price_currency_mismatch");
}

export function sourceCurrencyFor(
  source: PackingSource
): ShipmentPriceCurrency {
  return sourceCurrency[source] as ShipmentPriceCurrency;
}
