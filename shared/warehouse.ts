import { z } from "zod";

const isoDate = z.string().datetime({ offset: true });
const text = (max: number) => z.string().trim().min(1).max(max);

/** The only shipment-owned data that warehouse staff may change. */
export const destinationStorageItemSchema = z
  .object({
    goodsId: text(128),
    warehouse: text(160),
    shelf: text(160),
    updatedAt: isoDate,
    updatedBy: z.number().int().positive(),
  })
  .strict();

export const destinationStorageSchema = z
  .array(destinationStorageItemSchema)
  .max(20000)
  .superRefine((items, ctx) => {
    const ids = new Set<string>();
    items.forEach((item, index) => {
      if (ids.has(item.goodsId))
        ctx.addIssue({
          code: "custom",
          path: [index, "goodsId"],
          message: "duplicate_goods_id",
        });
      ids.add(item.goodsId);
    });
  });

export type DestinationStorageItem = z.infer<
  typeof destinationStorageItemSchema
>;

export const warehouseBillingSchema = z
  .object({
    status: z.enum(["unbilled", "partial", "paid", "debt", "unpriced"]),
    amount: z.number().nonnegative(),
    billedAmount: z.number().nonnegative(),
    remainingAmount: z.number().nonnegative(),
    currency: z.enum(["MRU", "AED", "TRY", "CNY", "USD", "EUR"]),
  })
  .strict();
export type WarehouseBilling = z.infer<typeof warehouseBillingSchema>;

export const warehouseCommandSchema = z
  .object({
    requestId: text(128),
    shipmentId: text(128),
    goodsId: text(128),
    warehouse: text(160),
    shelf: text(160),
    expectedVersion: z.number().int().positive(),
    clientUserId: z.string().trim().min(1).max(128).optional(),
  })
  .strict();

export type WarehouseCommand = z.infer<typeof warehouseCommandSchema>;
