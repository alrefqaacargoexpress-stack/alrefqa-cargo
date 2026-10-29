import { z } from "zod";
import {
  adjustedInvoiceTotal,
  financialInvoiceSchema,
  type FinancialInvoiceDetails,
} from "@shared/finance";
import type { AppRole, Invoice, Shipment } from "@shared/operations";
import type { OfficeId } from "@shared/branches";

export const marketWarehouseSearchSchema = z
  .object({
    search: z.string().trim().max(240).optional(),
    limit: z.number().int().min(1).max(100).default(50),
    cursor: z.number().int().nonnegative().default(0),
  })
  .default({ limit: 50, cursor: 0 });

export const marketStageIds = [
  "registered",
  "in_transit",
  "arrived_destination",
  "ready_for_pickup",
  "delivered",
] as const;
export type MarketStageId = (typeof marketStageIds)[number];

export type MarketPaymentStatus = "paid" | "outstanding" | "no_invoice";

export type MarketWarehouseTimelineItem = {
  id: string;
  stage: MarketStageId;
  status: string;
  actorName: string;
  actorRole: AppRole;
  officeId: OfficeId | null;
  reason: string | null;
  createdAt: string;
};

export function marketStageForShipment(shipment: Shipment): MarketStageId {
  if (shipment.status === "مسلّمة") return "delivered";
  const activeGoods = shipmentGoods(shipment);
  const storedGoods = new Set(
    (shipment.destinationStorage ?? []).map(item => item.goodsId)
  );
  if (
    activeGoods.length > 0 &&
    activeGoods.every(item => storedGoods.has(item.id))
  )
    return "ready_for_pickup";
  if (shipment.status === "جاهزة للتسليم") return "ready_for_pickup";
  if (
    shipment.status === "وصلت للمكتب" ||
    shipment.journey?.stage === "arrived_office"
  )
    return "arrived_destination";
  if (
    shipment.status === "في الطريق" ||
    (shipment.journey && shipment.journey.stage !== "preparing")
  )
    return "in_transit";
  return "registered";
}

export function paymentStatusForShipment(
  invoices: readonly Invoice[],
  shipmentId: string
): MarketPaymentStatus {
  const related = invoices
    .map(invoice => {
      const parsed = financialInvoiceSchema.safeParse(invoice.finance);
      return parsed.success && parsed.data.shipmentId === shipmentId
        ? parsed.data
        : null;
    })
    .filter((value): value is FinancialInvoiceDetails => Boolean(value));
  if (!related.length) return "no_invoice";
  return related.some(details => {
    try {
      return (
        details.paidAmount <
        adjustedInvoiceTotal(details.baseAmount, details.adjustment)
      );
    } catch {
      return true;
    }
  })
    ? "outstanding"
    : "paid";
}

export function shipmentGoods(shipment: Shipment) {
  return (shipment.packing?.cartons ?? []).flatMap(carton =>
    carton.goods
      .filter(item => !item.deleted)
      .map(item => ({
        id: item.id,
        cartonNumber: carton.number,
        name: item.name,
        phone: item.phone,
        weight: item.unitWeight,
        pieces: item.pieces,
      }))
  );
}

export function normalizedMarketSearch(value: string | undefined) {
  return value?.trim().toLocaleLowerCase("ar") || "";
}

export function marketShipmentMatches(
  shipment: Shipment,
  search: string
): boolean {
  if (!search) return true;
  const goods = shipmentGoods(shipment);
  const fields = [
    shipment.id,
    shipment.tracking,
    shipment.account,
    ...(shipment.packing?.cartons ?? []).flatMap(carton =>
      carton.goods.flatMap(item => [item.name, item.phone])
    ),
    ...goods.map(item => item.id),
  ];
  return fields.some(value =>
    String(value ?? "")
      .toLocaleLowerCase("ar")
      .includes(search)
  );
}

export function actorOfficeForShipment(shipment: Shipment): OfficeId | null {
  return shipment.packing?.source ?? shipment.officeId ?? null;
}

export function safeTimelineItems(
  rows: readonly {
    id: string;
    stage: MarketStageId;
    status: string;
    actorName: string;
    actorRole: AppRole;
    officeId: string | null;
    reason: string | null;
    createdAt: Date;
  }[]
): MarketWarehouseTimelineItem[] {
  return rows.map(row => ({
    id: row.id,
    stage: row.stage,
    status: row.status,
    actorName: row.actorName,
    actorRole: row.actorRole,
    officeId: (row.officeId as OfficeId | null) ?? null,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  }));
}
