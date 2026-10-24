import { z } from "zod";
import type { Shipment } from "./operations";
import { branchIds, stageIds, journeySchema } from "./tracking";

export function latinDigits(value: string): string {
  return value.normalize("NFKC").replace(/[٠-٩۰-۹]/g, char => {
    const code = char.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

export function normalizePublicTracking(value: string): string {
  return latinDigits(value).trim().toLowerCase();
}

/** Full phone identity only. No suffix matching, guessed country or leading-zero removal. */
export function normalizePublicPhone(value: string): string | null {
  const formatted = latinDigits(value)
    .trim()
    .replace(/[\s().-]/g, "");
  if (!/^\+?\d{7,17}$/.test(formatted)) return null;
  const digits = formatted.replace(/^\+/, "").replace(/^00/, "");
  return /^\d{7,15}$/.test(digits) ? digits : null;
}

export const publicTrackingInputSchema = z
  .object({
    tracking: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .refine(v => !/[\u0000-\u001f\u007f]/.test(v)),
    phone: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .refine(v => normalizePublicPhone(v) !== null, "invalid_phone"),
  })
  .strict();
export type PublicTrackingInput = z.infer<typeof publicTrackingInputSchema>;
export const publicTrackingStatusValues = [
  "preparing",
  "in_transit",
  "arrived_office",
  "ready_for_delivery",
  "delivered",
  "processing",
] as const;
export const publicTrackingPaymentStatusValues = [
  "unbilled",
  "paid",
  "partial",
  "on_account",
  "review",
] as const;
export type PublicTrackingPaymentStatus =
  (typeof publicTrackingPaymentStatusValues)[number];
const publicGoodsSchema = z
  .object({
    cartonNumber: z.number().int().positive(),
    name: z.string().max(240),
    pieces: z.number().int().positive(),
    unitWeight: z.number().finite().positive(),
    weight: z.number().finite().positive(),
  })
  .strict();
export const publicTrackingShipmentSchema = z
  .object({
    tracking: z.string(),
    status: z.enum(publicTrackingStatusValues),
    /** Coarse status only; no amount, currency, invoice, or customer identity. */
    paymentStatus: z.enum(publicTrackingPaymentStatusValues).optional(),
    stage: z.enum(stageIds).nullable(),
    branch: z.enum(branchIds).nullable(),
    updatedAt: z.string().datetime().nullable(),
    source: z.enum(["dubai", "turkey", "china"]).nullable(),
    goods: z.array(publicGoodsSchema).max(20000),
    totalPieces: z.number().int().positive(),
    totalWeight: z.number().finite().positive(),
  })
  .strict();
export const publicTrackingResultSchema = z.discriminatedUnion("found", [
  z.object({ found: z.literal(false) }).strict(),
  z
    .object({ found: z.literal(true), shipment: publicTrackingShipmentSchema })
    .strict(),
]);
export type PublicTrackingResult = z.infer<typeof publicTrackingResultSchema>;
export type PublicTrackingShipment = z.infer<
  typeof publicTrackingShipmentSchema
>;

export function publicTrackingProjection(
  shipment: Shipment,
  input: PublicTrackingInput,
  recordUpdatedAt?: Date | string | null,
  paymentStatus?: PublicTrackingPaymentStatus
): PublicTrackingResult {
  const expected = normalizePublicTracking(input.tracking);
  const phone = normalizePublicPhone(input.phone);
  if (
    !phone ||
    shipment.deleted ||
    !shipment.packing ||
    normalizePublicTracking(shipment.tracking) !== expected
  )
    return { found: false };
  const goods: z.infer<typeof publicGoodsSchema>[] = [];
  let grams = 0;
  let totalPieces = 0;
  for (const carton of shipment.packing.cartons) {
    for (const item of carton.goods) {
      if (item.deleted || normalizePublicPhone(item.phone) !== phone) continue;
      const weightGrams = Math.round(item.unitWeight * 1000) * item.pieces;
      if (!Number.isSafeInteger(weightGrams) || weightGrams <= 0)
        return { found: false };
      goods.push({
        cartonNumber: carton.number,
        name: item.name,
        pieces: item.pieces,
        unitWeight: item.unitWeight,
        weight: weightGrams / 1000,
      });
      totalPieces += item.pieces;
      grams += weightGrams;
    }
  }
  if (
    !goods.length ||
    !Number.isSafeInteger(grams) ||
    !Number.isSafeInteger(totalPieces)
  )
    return { found: false };
  const journey = journeySchema.safeParse(shipment.journey);
  let status: PublicTrackingShipment["status"];
  if (shipment.status === "مسلّمة") status = "delivered";
  else if (shipment.status === "بانتظار الدفع") status = "processing";
  else if (shipment.status === "جاهزة للتسليم") status = "ready_for_delivery";
  else if (journey.success)
    status =
      journey.data.stage === "preparing"
        ? "preparing"
        : journey.data.stage === "arrived_office"
          ? "arrived_office"
          : "in_transit";
  else
    status =
      shipment.status === "وصلت للمكتب"
        ? "arrived_office"
        : shipment.status === "قيد التجهيز"
          ? "preparing"
          : "in_transit";
  const candidateDate = journey.success
    ? journey.data.updatedAt
    : recordUpdatedAt;
  const date = candidateDate ? new Date(candidateDate) : null;
  const result: PublicTrackingResult = {
    found: true,
    shipment: {
      tracking: shipment.tracking,
      status,
      ...(paymentStatus ? { paymentStatus } : {}),
      stage: journey.success ? journey.data.stage : null,
      branch: journey.success ? journey.data.branch : null,
      updatedAt:
        date && !Number.isNaN(date.valueOf()) ? date.toISOString() : null,
      source: shipment.packing.source,
      goods,
      totalPieces,
      totalWeight: grams / 1000,
    },
  };
  return publicTrackingResultSchema.parse(result);
}
