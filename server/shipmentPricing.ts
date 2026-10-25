import { and, eq } from "drizzle-orm";
import {
  financeEntries,
  financeGoods,
  records,
  shipmentChargeComponents,
  shipmentPriceOverrides,
} from "../drizzle/schema";
import type { User } from "../drizzle/schema";
import type { AppRole, Shipment } from "@shared/operations";
import type { OfficeId } from "@shared/branches";
import { canReadOfficeRecord } from "@shared/branches";
import { permissionAllowed, type PermissionMap } from "@shared/permissions";
import {
  effectiveShipmentRate,
  originalPricePerKg,
  priceProjectionSchema,
  shipmentPriceInputSchema,
  shipmentPricingProjectionSchema,
  shipmentPricingTarget,
  parseExplicitShipmentPriceInput,
  type PriceProjection,
  type ShipmentPriceInput,
  type ShipmentPriceSide,
  type ShipmentPricingProjection,
} from "@shared/shipmentPricing";
import { assertActiveEntity } from "./lifecycle";
import { appendAudit } from "./audit";

export type ShipmentPricingScope = {
  role: AppRole | null;
  offices: OfficeId[] | null;
  permissions?: PermissionMap | null;
};
export type ShipmentPricingActor = Pick<User, "id" | "name">;

type OverrideRow = typeof shipmentPriceOverrides.$inferSelect;

function actorName(user: ShipmentPricingActor) {
  return user.name?.trim() || `user-${user.id}`;
}

function lockQuery(query: any) {
  return typeof query?.for === "function" ? query.for("update") : query;
}

function targetAllowed(
  scope: ShipmentPricingScope,
  target: { officeId: OfficeId }
) {
  return (
    scope.role === "admin" ||
    (scope.offices !== null &&
      Boolean(scope.offices?.includes(target.officeId)))
  );
}

export function canViewShipmentPriceSide(
  scope: ShipmentPricingScope,
  shipment: Shipment,
  side: ShipmentPriceSide
) {
  if (!permissionAllowed(scope, "shipment_prices", "view")) return false;
  const target = shipmentPricingTarget(shipment, side);
  return (
    targetAllowed(scope, target) &&
    canReadOfficeRecord(scope.role, scope.offices, "shipment", shipment)
  );
}

function assertManageShipmentPriceSide(
  scope: ShipmentPricingScope,
  shipment: Shipment,
  side: ShipmentPriceSide
) {
  if (!permissionAllowed(scope, "shipment_prices", "manage"))
    throw new Error("shipment_prices_manage_forbidden");
  const target = shipmentPricingTarget(shipment, side);
  if (
    scope.role !== "admin" &&
    (scope.offices === null ||
      scope.offices?.length !== 1 ||
      !targetAllowed(scope, target))
  )
    throw new Error("shipment_price_office_forbidden");
  if (!canReadOfficeRecord(scope.role, scope.offices, "shipment", shipment))
    throw new Error("shipment_price_scope_forbidden");
}

function latest(
  rows: readonly OverrideRow[],
  shipmentId: string,
  side: ShipmentPriceSide,
  target?: { officeId: OfficeId; currency: string; side: ShipmentPriceSide }
) {
  const row = rows
    .filter(row => row.shipmentId === shipmentId && row.side === side)
    .sort((a, b) => b.revision - a.revision)[0];
  if (row && target) assertOverrideTarget(row, target);
  return row;
}

function assertOverrideTarget(
  row: OverrideRow,
  target: { officeId: OfficeId; currency: string; side: ShipmentPriceSide }
) {
  if (
    row.side !== target.side ||
    row.officeId !== target.officeId ||
    row.currency !== target.currency
  )
    throw new Error("shipment_price_target_mismatch");
}

function overrideNumber(row: OverrideRow | undefined): number | null {
  if (!row) return null;
  return Number(row.pricePerKg);
}

export function makePriceProjection(
  shipment: Shipment,
  recordVersion: number,
  side: ShipmentPriceSide,
  override?: OverrideRow
): PriceProjection {
  const target = shipmentPricingTarget(shipment, side);
  if (override) assertOverrideTarget(override, target);
  const overridePricePerKg = overrideNumber(override);
  const revision = override?.revision ?? 0;
  const projection = {
    shipmentId: shipment.id,
    side,
    officeId: target.officeId,
    currency: target.currency,
    pricePerKg: effectiveShipmentRate(shipment, side, {
      overridePricePerKg,
    }),
    overridePricePerKg,
    revision,
    expectedPricingRevision: revision,
    recordVersion,
    overrideId: override?.id ?? null,
    createdAt: override?.createdAt
      ? new Date(override.createdAt).toISOString()
      : null,
  };
  return priceProjectionSchema.parse(projection);
}

async function rowsForShipment(tx: any, shipmentId: string, lock = false) {
  const query = tx
    .select()
    .from(shipmentPriceOverrides)
    .where(eq(shipmentPriceOverrides.shipmentId, shipmentId));
  return lock ? lockQuery(query) : query;
}

export async function readPriceProjection(
  tx: any,
  shipment: Shipment,
  recordVersion: number,
  side: ShipmentPriceSide,
  lock = false
): Promise<PriceProjection> {
  const rows = await rowsForShipment(tx, shipment.id, lock);
  const target = shipmentPricingTarget(shipment, side);
  return makePriceProjection(
    shipment,
    recordVersion,
    side,
    latest(rows, shipment.id, side, target)
  );
}

export async function readShipmentPricingProjection(
  tx: any,
  shipment: Shipment,
  recordVersion: number,
  scope?: ShipmentPricingScope,
  lock = false
): Promise<ShipmentPricingProjection> {
  const source =
    !scope || canViewShipmentPriceSide(scope, shipment, "source")
      ? await readPriceProjection(tx, shipment, recordVersion, "source", lock)
      : null;
  const destination =
    !scope || canViewShipmentPriceSide(scope, shipment, "destination")
      ? await readPriceProjection(
          tx,
          shipment,
          recordVersion,
          "destination",
          lock
        )
      : null;
  return shipmentPricingProjectionSchema.parse({
    shipmentId: shipment.id,
    source,
    destination,
  });
}

async function assertNoFinancialHistory(tx: any, shipmentId: string) {
  const claims = await tx
    .select()
    .from(financeGoods)
    .where(eq(financeGoods.shipmentId, shipmentId));
  if (claims.length) throw new Error("shipment_price_financial_history");

  const components = await tx
    .select()
    .from(shipmentChargeComponents)
    .where(eq(shipmentChargeComponents.shipmentId, shipmentId));
  if (components.length) throw new Error("shipment_price_financial_history");

  // Deliberately inspect every invoice, including invoices later voided/retired.
  const claimGoodsIds = new Set(
    claims.map((claim: any) => String(claim.goodsId))
  );
  const invoiceRows = await tx
    .select()
    .from(records)
    .where(eq(records.entity, "invoice"));
  if (
    invoiceRows.some((row: any) => {
      const data = row.data ?? {};
      const finance = data.finance ?? {};
      return (
        data.shipmentId === shipmentId ||
        finance?.shipmentId === shipmentId ||
        finance?.goods?.some((good: any) =>
          claimGoodsIds.has(String(good.goodsId))
        ) ||
        data.goods?.some((good: any) => claimGoodsIds.has(String(good.goodsId)))
      );
    })
  )
    throw new Error("shipment_price_financial_history");

  // Gross revenue and other posted sale facts must also freeze the effective rate.
  const entries = await tx.select().from(financeEntries);
  if (
    entries.some(
      (row: any) =>
        row.shipmentId === shipmentId || row.data?.shipmentId === shipmentId
    )
  )
    throw new Error("shipment_price_financial_history");
}

async function shipmentRowForUpdate(tx: any, shipmentId: string) {
  const query = tx
    .select()
    .from(records)
    .where(
      and(eq(records.entity, "shipment"), eq(records.recordId, shipmentId))
    )
    .limit(1);
  const rows = await lockQuery(query);
  if (!rows[0] || rows[0].data?.deleted) throw new Error("shipment_not_found");
  await assertActiveEntity(tx, "shipment", shipmentId);
  return rows[0];
}

export type ShipmentPriceApplyResult = {
  entries: [];
  priceProjection: PriceProjection;
  expectedPricingRevision: number;
};

export async function applyShipmentPriceOverride(
  tx: any,
  user: ShipmentPricingActor,
  scope: ShipmentPricingScope,
  command: { id: string; payload: ShipmentPriceInput }
): Promise<ShipmentPriceApplyResult> {
  const input = parseExplicitShipmentPriceInput(
    shipmentPriceInputSchema.parse(command.payload) as ShipmentPriceInput
  );
  const row = await shipmentRowForUpdate(tx, input.shipmentId);
  const shipment = row.data as Shipment;
  assertManageShipmentPriceSide(scope, shipment, input.side);
  if (row.version !== input.expectedVersion)
    throw new Error("version_conflict");
  if (shipment.status !== "قيد التجهيز")
    throw new Error("shipment_price_not_preparing");
  await assertNoFinancialHistory(tx, shipment.id);

  const target = shipmentPricingTarget(shipment, input.side);
  const overrides = await rowsForShipment(tx, shipment.id, true);
  const requestKey = `shipment-price:${user.id}:${command.id}`;
  if (overrides.some((row: OverrideRow) => row.requestKey === requestKey))
    throw new Error("duplicate_request");
  const previous = latest(overrides, shipment.id, input.side, target);
  const currentRevision = previous?.revision ?? 0;
  if (currentRevision !== input.expectedPricingRevision)
    throw new Error("pricing_revision_conflict");
  const revision = currentRevision + 1;
  const override = {
    id: `shipment-price-override:${shipment.id}:${input.side}:${revision}`,
    shipmentId: shipment.id,
    officeId: target.officeId,
    side: input.side,
    currency: target.currency,
    pricePerKg: input.pricePerKg.toFixed(2),
    revision,
    recordVersion: row.version,
    reason: input.reason,
    previousOverrideId: previous?.id ?? null,
    requestKey,
    approvedBy: user.id,
  };
  await tx.insert(shipmentPriceOverrides).values(override);
  await appendAudit(tx, {
    actor: { id: user.id, name: actorName(user), role: scope.role! },
    entity: "shipment",
    recordId: shipment.id,
    action: "shipment_price_override",
    before: null,
    after: override,
    beforeVersion: row.version,
    afterVersion: row.version,
    requestKey,
  });
  const projection = makePriceProjection(shipment, row.version, input.side, {
    ...override,
    createdAt: new Date(),
  } as OverrideRow);
  return {
    entries: [],
    priceProjection: projection,
    expectedPricingRevision: revision,
  };
}

export function priceProjectionForCurrency(
  projection: ShipmentPricingProjection | null | undefined,
  currency: string
): PriceProjection | null {
  if (!projection) return null;
  return currency === "MRU" ? projection.destination : projection.source;
}

export function effectivePriceForProjection(
  shipment: Shipment,
  side: ShipmentPriceSide,
  projection?: PriceProjection | null
) {
  return effectiveShipmentRate(shipment, side, projection);
}

export const shipmentPriceInputContract = shipmentPriceInputSchema;
export { parseExplicitShipmentPriceInput };
