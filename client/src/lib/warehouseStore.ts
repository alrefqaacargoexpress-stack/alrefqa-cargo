import { z } from "zod";
import {
  warehouseCommandSchema,
  type WarehouseCommand,
} from "@shared/warehouse";

const keyPrefix = "alrefqa-warehouse-pending-v1-";
const pendingSchema = warehouseCommandSchema
  .extend({
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();
const stateSchema = z
  .object({
    schema: z.literal("warehouse-pending-v1"),
    revision: z.number().int().nonnegative(),
    pending: z.array(pendingSchema).max(20000),
  })
  .strict();
export type PendingWarehouseLocation = z.infer<typeof pendingSchema>;
export type WarehousePendingState = z.infer<typeof stateSchema>;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function localStorageOrThrow(): Storage {
  if (typeof window === "undefined" || !window.localStorage)
    throw new Error("warehouse_local_storage_unavailable");
  return window.localStorage;
}
function keyFor(userId: number | string): string {
  if (!/^\d+$/.test(String(userId)))
    throw new Error("warehouse_session_required");
  return `${keyPrefix}${String(userId)}`;
}
function empty(): WarehousePendingState {
  return { schema: "warehouse-pending-v1", revision: 0, pending: [] };
}
export function loadWarehousePending(
  userId: number | string
): WarehousePendingState {
  const raw = localStorageOrThrow().getItem(keyFor(userId));
  if (!raw) return empty();
  return stateSchema.parse(JSON.parse(raw));
}
export function saveWarehousePending(
  userId: number | string,
  next: WarehousePendingState
): WarehousePendingState {
  const storage = localStorageOrThrow();
  const current = loadWarehousePending(userId);
  if (current.revision !== next.revision)
    throw new Error("warehouse_local_revision_conflict");
  const saved = { ...clone(next), revision: current.revision + 1 };
  stateSchema.parse(saved);
  storage.setItem(keyFor(userId), JSON.stringify(saved));
  return saved;
}
export function queueWarehouseLocation(
  userId: number | string,
  command: WarehouseCommand
): WarehousePendingState {
  const current = loadWarehousePending(userId);
  const parsed = pendingSchema.parse({
    ...command,
    createdAt: new Date().toISOString(),
  });
  const pending = [
    ...current.pending.filter(
      item =>
        item.goodsId !== parsed.goodsId || item.shipmentId !== parsed.shipmentId
    ),
    parsed,
  ];
  return saveWarehousePending(userId, { ...current, pending });
}
export function removeWarehouseLocation(
  userId: number | string,
  requestId: string
): WarehousePendingState {
  const current = loadWarehousePending(userId);
  return saveWarehousePending(userId, {
    ...current,
    pending: current.pending.filter(item => item.requestId !== requestId),
  });
}
export function replaceWarehousePending(
  userId: number | string,
  pending: PendingWarehouseLocation[]
): WarehousePendingState {
  const current = loadWarehousePending(userId);
  return saveWarehousePending(userId, {
    ...current,
    pending: pendingSchema.array().parse(pending),
  });
}
