import { z } from "zod";
import type { Shipment } from "./operations";
import {
  branchIds,
  stageIds,
  type TrackingBranch,
  type TrackingStage,
} from "./tracking";
import { normalizePublicTracking } from "./publicTracking";

const boundedId = z.string().trim().min(1).max(128);
const expectedVersion = z.number().int().nonnegative().max(2_000_000_000);

/** One small, explicit optimistic-concurrency item per good. */
export const customerLinkGoodSchema = z
  .object({ goodsId: boundedId, expectedVersion })
  .strict();
export type CustomerLinkGood = z.infer<typeof customerLinkGoodSchema>;

const linkBaseSchema = z.object({
  targetEmail: z.string().trim().email().max(320),
  customerAccountId: boundedId,
  shipmentId: boundedId,
  goods: z.array(customerLinkGoodSchema).min(1).max(100),
});

/** The email is an exact target selector; it is never a directory/list response. */
export const customerLinkGrantInputSchema = linkBaseSchema
  .superRefine((value, ctx) => {
    const ids = value.goods.map(item => item.goodsId);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        path: ["goods"],
        message: "duplicate_goods",
      });
  })
  .strict();
export type CustomerLinkGrantInput = z.infer<
  typeof customerLinkGrantInputSchema
>;

export const customerLinkRevokeInputSchema = z
  .object({
    customerAccountId: boundedId,
    shipmentId: boundedId,
    goods: z.array(customerLinkGoodSchema).min(1).max(100),
  })
  .superRefine((value, ctx) => {
    const ids = value.goods.map(item => item.goodsId);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        path: ["goods"],
        message: "duplicate_goods",
      });
  })
  .strict();
export type CustomerLinkRevokeInput = z.infer<
  typeof customerLinkRevokeInputSchema
>;

export const customerTrackingRequestSchema = z.object({}).strict();
export type CustomerTrackingRequest = z.infer<
  typeof customerTrackingRequestSchema
>;

export const customerTrackingStageSchema = z.enum(stageIds);
export const customerTrackingBranchSchema = z.enum(branchIds);

export const customerTrackingTimelineItemSchema = z
  .object({
    stage: customerTrackingStageSchema.nullable(),
    branch: customerTrackingBranchSchema.nullable(),
    at: z.string().datetime(),
  })
  .strict();
export type CustomerTrackingTimelineItem = z.infer<
  typeof customerTrackingTimelineItemSchema
>;

export const customerTrackingLocationSchema = z
  .object({
    officeLabel: z.string().trim().min(1).max(160),
    warehouseLabel: z.string().trim().min(1).max(160).nullable(),
    placeLabel: z.string().trim().min(1).max(160).nullable(),
    at: z.string().datetime().nullable(),
  })
  .strict();
export type CustomerTrackingLocation = z.infer<
  typeof customerTrackingLocationSchema
>;

export const customerTrackingDeliverySchema = z
  .object({
    status: z.enum(["pending", "delivered"]),
    deliveredAt: z.string().datetime().nullable(),
  })
  .strict();
export type CustomerTrackingDelivery = z.infer<
  typeof customerTrackingDeliverySchema
>;

const customerGoodsSchema = z
  .object({
    name: z.string().trim().min(1).max(240),
    pieces: z.number().int().positive(),
    unitWeight: z.number().finite().positive(),
    weight: z.number().finite().positive(),
    delivery: customerTrackingDeliverySchema,
    location: customerTrackingLocationSchema.nullable(),
  })
  .strict();
export type CustomerTrackingGoods = z.infer<typeof customerGoodsSchema>;

export const customerTrackingShipmentSchema = z
  .object({
    tracking: z.string().trim().min(1).max(128),
    status: z.enum([
      "preparing",
      "in_transit",
      "arrived_office",
      "ready_for_delivery",
      "delivered",
      "processing",
    ]),
    stage: customerTrackingStageSchema.nullable(),
    branch: customerTrackingBranchSchema.nullable(),
    updatedAt: z.string().datetime().nullable(),
    goods: z.array(customerGoodsSchema).min(1).max(100),
    totalPieces: z.number().int().positive(),
    totalWeight: z.number().finite().positive(),
    timeline: z.array(customerTrackingTimelineItemSchema).max(100),
  })
  .strict();
export type CustomerTrackingShipment = z.infer<
  typeof customerTrackingShipmentSchema
>;

export const customerTrackingResultSchema = z
  .object({ shipments: z.array(customerTrackingShipmentSchema).max(500) })
  .strict();
export type CustomerTrackingResult = z.infer<
  typeof customerTrackingResultSchema
>;

export type CustomerTrackingProjectionOptions = {
  timeline?: readonly CustomerTrackingTimelineItem[];
  deliveryByGoods?: ReadonlyMap<string, string | null>;
  locationByGoods?: ReadonlyMap<string, CustomerTrackingLocation | null>;
  /** A legacy global delivered marker is safe only when every active good is linked. */
  allActiveGoodsLinked?: boolean;
};

const officeLabels: Record<string, string> = {
  dubai: "دبي",
  turkey: "تركيا",
  china: "الصين",
  dakar: "داكار",
  nouakchott: "نواكشوط",
};

export function officeLabel(office: string | null | undefined): string {
  return officeLabels[office ?? ""] ?? "مكتب الشحن";
}

function activeGoods(shipment: Shipment) {
  return (
    shipment.packing?.cartons.flatMap(carton =>
      carton.goods
        .filter(item => !item.deleted)
        .map(item => ({ cartonNumber: carton.number, item }))
    ) ?? []
  );
}

function statusForShipment(
  shipment: Shipment,
  deliveredCount: number,
  selectedCount: number,
  allActiveGoodsLinked: boolean
): CustomerTrackingShipment["status"] {
  if (selectedCount > 0 && deliveredCount === selectedCount) return "delivered";
  if (shipment.status === "بانتظار الدفع") return "processing";
  if (shipment.status === "جاهزة للتسليم") return "ready_for_delivery";
  if (shipment.status === "مسلّمة") return "ready_for_delivery";
  const stage = shipment.journey?.stage;
  if (stage === "arrived_office") return "arrived_office";
  if (stage === "preparing") return "preparing";
  return shipment.status === "قيد التجهيز" ? "preparing" : "in_transit";
}

function timelineForShipment(
  shipment: Shipment,
  timeline: readonly CustomerTrackingTimelineItem[]
): CustomerTrackingTimelineItem[] {
  const fallback = shipment.journey
    ? [
        {
          stage: shipment.journey.stage,
          branch: shipment.journey.branch,
          at: shipment.journey.updatedAt,
        },
      ]
    : [];
  return (timeline.length ? timeline : fallback).slice(-100);
}

/**
 * Projects only explicitly-linked goods. It intentionally never returns goodsId,
 * customerAccountId, userId, phone, account names, amounts, invoices, actors, or notes.
 */
export function projectCustomerShipment(
  shipment: Shipment,
  goodsIds: readonly string[],
  options: CustomerTrackingProjectionOptions = {}
): CustomerTrackingShipment | null {
  if (shipment.deleted || !shipment.packing) return null;
  const wanted = new Set(goodsIds);
  const selected = activeGoods(shipment).filter(({ item }) =>
    wanted.has(item.id)
  );
  if (!selected.length) return null;

  let totalPieces = 0;
  let totalGrams = 0;
  let deliveredCount = 0;
  const goods = selected.map(({ item }) => {
    const grams = Math.round(item.unitWeight * 1000) * item.pieces;
    if (!Number.isSafeInteger(grams) || grams <= 0)
      throw new Error("invalid_goods_weight");
    const deliveredAt = options.deliveryByGoods?.get(item.id) ?? null;
    const delivered = typeof deliveredAt === "string";
    if (delivered) deliveredCount++;
    totalPieces += item.pieces;
    totalGrams += grams;
    return {
      name: item.name,
      pieces: item.pieces,
      unitWeight: item.unitWeight,
      weight: grams / 1000,
      delivery: {
        status: delivered ? ("delivered" as const) : ("pending" as const),
        deliveredAt,
      },
      location: options.locationByGoods?.get(item.id) ?? null,
    };
  });
  if (!Number.isSafeInteger(totalPieces) || !Number.isSafeInteger(totalGrams))
    throw new Error("totals_too_large");

  const timeline = timelineForShipment(shipment, options.timeline ?? []);
  const result = {
    tracking: shipment.tracking,
    status: statusForShipment(
      shipment,
      deliveredCount,
      selected.length,
      options.allActiveGoodsLinked ?? false
    ),
    stage: shipment.journey?.stage ?? null,
    branch: shipment.journey?.branch ?? null,
    updatedAt: shipment.journey?.updatedAt ?? null,
    goods,
    totalPieces,
    totalWeight: totalGrams / 1000,
    timeline,
  } satisfies CustomerTrackingShipment;
  return customerTrackingShipmentSchema.parse(result);
}

/** Normalizes the public tracking string without accepting it as an ownership claim. */
export function customerTrackingKey(value: string): string {
  return normalizePublicTracking(value);
}

export const CUSTOMER_LINK_MAX_GOODS = 100;
export const CUSTOMER_TRACKING_MAX_SHIPMENTS = 500;
