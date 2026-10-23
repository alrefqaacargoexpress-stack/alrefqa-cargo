import { z } from "zod";
import type { AppRole, Shipment, PendingChange } from "./operations";
import type { OfficeId } from "./branches";

export const shipmentDeletionSchema = z
  .object({
    at: z.string().datetime(),
    reason: z.string().trim().min(1).max(240),
  })
  .strict();
export const shipmentActionSchema = z.enum([
  "delete-shipment",
  "restore-shipment",
]);
export function canDeleteShipment(
  role: AppRole | null,
  shipment: Shipment,
  offices?: readonly OfficeId[] | null
): boolean {
  if (role === "admin") return true;
  if (role !== "office_manager") return false;
  // The server performs the authoritative office check in assertOfficeRecordWrite.
  // Callers that have a cached/known scope should pass it so offline UI cannot offer
  // an action for a shipment from another office.
  if (offices === undefined) return true;
  const owner = shipment.officeId ?? shipment.packing?.source;
  return Boolean(offices?.length === 1 && owner && offices[0] === owner);
}
export function deleteShipment<T extends Shipment>(
  shipment: T,
  reason: string
): T {
  if (shipment.deleted) throw new Error("shipment_already_deleted");
  return {
    ...structuredClone(shipment),
    deleted: shipmentDeletionSchema.parse({
      at: new Date().toISOString(),
      reason,
    }),
    scope: "pending",
  };
}
export function restoreShipment<T extends Shipment>(shipment: T): T {
  if (!shipment.deleted) throw new Error("shipment_not_deleted");
  const next = structuredClone(shipment);
  delete next.deleted;
  return { ...next, scope: "pending" };
}
/** An older editor cannot silently clear a tombstone. Only explicit actions may change it. */
export function assertShipmentAction(
  role: AppRole | null,
  next: Shipment,
  current: Shipment | null,
  action?: PendingChange["action"]
): void {
  if (!action) {
    if (current?.deleted || next.deleted)
      throw new Error("explicit_shipment_action_required");
    return;
  }
  if (!canDeleteShipment(role, current ?? next))
    throw new Error("shipment_deletion_forbidden");
  if (action === "delete-shipment") {
    if (!next.deleted) throw new Error("invalid_shipment_deletion");
    shipmentDeletionSchema.parse(next.deleted);
    if (current?.deleted) throw new Error("shipment_already_deleted");
  } else if (next.deleted) throw new Error("invalid_shipment_restore");
}
/** Comparisons deliberately exclude presentation and concurrency metadata, never actual cargo/finance. */
export function shipmentContent(shipment: Shipment): string {
  const { deleted, scope, version, ...content } = shipment;
  const stable = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(stable)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .filter(([, v]) => v !== undefined)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, stable(v)])
          )
        : value;
  return JSON.stringify(stable(content));
}
