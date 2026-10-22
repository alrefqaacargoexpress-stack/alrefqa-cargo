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

export const warehouseCommandSchema = z
  .object({
    requestId: text(128),
    shipmentId: text(128),
    goodsId: text(128),
    warehouse: text(160),
    shelf: text(160),
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export type WarehouseCommand = z.infer<typeof warehouseCommandSchema>;
