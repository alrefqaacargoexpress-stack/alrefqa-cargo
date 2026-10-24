import { z } from "zod";
import {
  currencySchema,
  financeCurrencies,
  type FinanceCurrency,
} from "./finance";
import { officeIdSchema, type OfficeId } from "./branches";
import type { PackingGoods, PackingSession } from "./packing";

export const settlementIdSchema = z.string().trim().min(1).max(128);
export const confirmationTrackingNumberSchema = z
  .string()
  .trim()
  .min(1)
  .max(240);
export const paymentModeSchema = z.enum(["cash", "wallet", "on_account"]);

export const settlementConfirmationSchema = z
  .object({ trackingNumber: confirmationTrackingNumberSchema })
  .strict();

export const settlementSnapshotInputSchema = z
  .object({ shipmentId: settlementIdSchema })
  .strict();
export type SettlementSnapshotInput = z.infer<
  typeof settlementSnapshotInputSchema
>;

export const registerExportInputSchema = z
  .object({
    id: settlementIdSchema,
    shipmentId: settlementIdSchema,
    expectedVersion: z.number().int().positive(),
    confirmation: settlementConfirmationSchema,
    includeLegacyApproval: z.boolean().default(false),
  })
  .strict();
export type RegisterExportInput = z.infer<typeof registerExportInputSchema>;

export const localCostInputSchema = z
  .object({
    id: settlementIdSchema,
    shipmentId: settlementIdSchema,
    expectedVersion: z.number().int().positive(),
    amount: z.number().finite().positive().max(999999999),
    currency: currencySchema,
    description: z.string().trim().min(1).max(500),
    passedToCustomer: z.boolean(),
    paidInCash: z.boolean().optional().default(false),
    confirmation: settlementConfirmationSchema,
  })
  .strict()
  .refine(v => Math.abs(v.amount * 100 - Math.round(v.amount * 100)) < 0.0001, {
    message: "invalid_money",
    path: ["amount"],
  });
export type LocalCostInput = z.infer<typeof localCostInputSchema>;

export const billComponentsInputSchema = z
  .object({
    id: settlementIdSchema,
    invoiceId: settlementIdSchema,
    customerId: settlementIdSchema,
    issuingOfficeId: officeIdSchema.optional(),
    componentIds: z.array(settlementIdSchema).min(1).max(500),
    currency: currencySchema,
    paymentMode: paymentModeSchema,
    payment: z
      .object({
        office: z.literal("nouakchott"),
        methodId: z.string().regex(/^[a-z0-9_-]{1,64}$/),
        methodLabel: z.string().trim().min(1).max(120),
        reference: z.string().trim().max(240).optional(),
      })
      .strict()
      .optional(),
    expectedShipmentVersion: z.number().int().positive(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (new Set(v.componentIds).size !== v.componentIds.length)
      ctx.addIssue({
        code: "custom",
        path: ["componentIds"],
        message: "duplicate_components",
      });
    if (v.paymentMode === "wallet" && !v.payment)
      ctx.addIssue({
        code: "custom",
        path: ["payment"],
        message: "wallet_required",
      });
    if (v.paymentMode !== "wallet" && v.payment)
      ctx.addIssue({
        code: "custom",
        path: ["payment"],
        message: "unexpected_payment",
      });
  });
export type BillComponentsInput = z.infer<typeof billComponentsInputSchema>;

export type SettlementComponentKind = "export" | "destination_local";
export type SettlementAllocationKind = "invoice" | "payment" | "void";

export type ShipmentChargeComponent = {
  id: string;
  shipmentId: string;
  goodsId: string;
  chargeKey: string;
  kind: SettlementComponentKind;
  officeId: OfficeId;
  currency: FinanceCurrency;
  amount: number;
  actorId: number;
  requestKey: string;
  data: Record<string, unknown>;
  createdAt: string;
};

export type ShipmentChargeAllocation = {
  id: string;
  componentId: string;
  invoiceId: string;
  kind: SettlementAllocationKind;
  amount: number;
  actorId: number;
  requestKey: string;
  data?: Record<string, unknown> | null;
  createdAt: string;
};

export type SettlementComponentView = Omit<ShipmentChargeComponent, "data"> & {
  data?: Record<string, unknown>;
  allocated: number;
  unbilled: number;
  paid: number;
  settled: number;
};

export type SettlementCurrencyBreakdown = {
  currency: FinanceCurrency;
  componentTotal: number;
  unbilled: number;
  customerDebt: number;
  paid: number;
  settled: number;
};

export type ShipmentSettlementSnapshot = {
  shipmentId: string;
  tracking: string;
  shipmentVersion: number;
  visibleOffice: OfficeId;
  sourceOffice: OfficeId;
  destinationOffice: "nouakchott";
  components: SettlementComponentView[];
  breakdown: SettlementCurrencyBreakdown[];
  physical: {
    undeliveredGoodsIds: string[];
    undeliveredWeight: number;
    paidUndeliveredByCurrency: { currency: FinanceCurrency; amount: number }[];
  };
};

export type RegisterExportResult = {
  shipmentId: string;
  version: number;
  components: ShipmentChargeComponent[];
  entries: unknown[];
};
export type LocalCostResult = {
  shipmentId: string;
  version: number;
  components: ShipmentChargeComponent[];
  entry: unknown;
};
export type BillComponentsResult = {
  invoice: unknown;
  entries: unknown[];
  allocations: ShipmentChargeAllocation[];
};

export type RecordComponentPaymentInput = {
  invoiceId: string;
  amount: number;
  actorId: number;
  requestKey: string;
  data?: Record<string, unknown>;
};

export function toCents(value: number | string): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n) || n < 0) throw new Error("invalid_money");
  const cents = Math.round(n * 100);
  if (!Number.isSafeInteger(cents)) throw new Error("totals_too_large");
  if (Math.abs(n * 100 - cents) > 0.0001) throw new Error("invalid_money");
  return cents;
}
export function fromCents(cents: number): number {
  if (!Number.isSafeInteger(cents) || cents < 0)
    throw new Error("invalid_money");
  return cents / 100;
}
export function sumCents(values: readonly (number | string)[]): number {
  const total = values.reduce<number>((sum, value) => sum + toCents(value), 0);
  if (!Number.isSafeInteger(total)) throw new Error("totals_too_large");
  return total;
}

/** Allocate cents by integer grams. Remainders go to stable goods order. */
export function allocateCentsByWeight(
  totalCents: number,
  goods: readonly Pick<PackingGoods, "id" | "unitWeight" | "pieces">[]
): Map<string, number> {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0)
    throw new Error("invalid_money");
  const weights = goods.map(g => ({
    id: g.id,
    grams: Math.round(g.unitWeight * 1000) * g.pieces,
  }));
  const totalWeight = weights.reduce((sum, g) => sum + g.grams, 0);
  if (!totalWeight) throw new Error("shipment_empty");
  const result = new Map<string, number>();
  let assigned = 0;
  for (const item of weights) {
    if (!Number.isSafeInteger(item.grams) || !Number.isSafeInteger(totalWeight))
      throw new Error("totals_too_large");
    const share = Number(
      (BigInt(totalCents) * BigInt(item.grams)) / BigInt(totalWeight)
    );
    result.set(item.id, share);
    assigned += share;
  }
  let remainder = totalCents - assigned;
  for (const item of weights) {
    if (remainder <= 0) break;
    result.set(item.id, (result.get(item.id) ?? 0) + 1);
    remainder--;
  }
  return result;
}

export function storedExportCents(
  goods: readonly Pick<PackingGoods, "id" | "unitWeight" | "pieces">[],
  packing: Pick<PackingSession, "pricePerKg">
): Map<string, number> {
  const priceCents = toCents(packing.pricePerKg);
  const result = new Map<string, number>();
  for (const good of goods) {
    const grams = Math.round(good.unitWeight * 1000) * good.pieces;
    result.set(
      good.id,
      Number((BigInt(grams) * BigInt(priceCents) + 500n) / 1000n)
    );
  }
  return result;
}

export function goodsForPacking(packing: PackingSession) {
  return packing.cartons.flatMap(carton =>
    carton.goods.filter(g => !g.deleted)
  );
}

export function isConfirmedArrival(shipment: {
  status: string;
  journey?: { stage?: string };
}) {
  return (
    shipment.journey?.stage === "arrived_office" ||
    shipment.status === "وصلت للمكتب"
  );
}

export function isClosedForExport(shipment: {
  status: string;
  journey?: { stage?: string };
}) {
  return (
    shipment.status !== "قيد التجهيز" && shipment.journey?.stage !== "preparing"
  );
}

export const settlementCurrencies = financeCurrencies;
export { currencySchema };
