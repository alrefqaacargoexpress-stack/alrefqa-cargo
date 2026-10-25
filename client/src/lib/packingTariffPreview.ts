import type { PendingChange } from "../../../shared/operations";
import {
  packingRateSnapshotSchema,
  sourceCurrency,
  type PackedShipment,
  type PackingSession,
} from "../../../shared/packing";
import {
  shipmentPricingTarget,
  type PriceProjection,
} from "../../../shared/shipmentPricing";

export type PackingPricingView = {
  packingForDisplay: PackingSession;
  isPendingCreation: boolean;
  isPreview: boolean;
  hasSourceRate: boolean;
  hasMruRate: boolean;
  confirmed: boolean;
  issue: string | null;
};

const positiveRate = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/**
 * Read-only display quote, NEVER a financial command or a replacement record.
 * Only a pending creation with no server version may use a local publication.
 * The server still replaces client pricing with creation-time tariff evidence.
 */
export function packingPricingView(
  shipment: PackedShipment,
  queue: readonly PendingChange[],
  canViewFinance: boolean,
  projections: readonly PriceProjection[] = []
): PackingPricingView {
  const matching = queue.filter(
    change => change.entity === "shipment" && change.recordId === shipment.id
  );
  const change = matching[0];
  const isPendingCreation =
    !shipment.deleted &&
    shipment.scope === "pending" &&
    shipment.version === undefined &&
    matching.length === 1 &&
    change.expectedVersion === null &&
    change.action === undefined &&
    change.data.id === shipment.id &&
    change.data.version === undefined;
  const confirmed =
    shipment.scope === "shared" ||
    (Number.isInteger(shipment.version) && (shipment.version ?? 0) > 0);
  const sourceTarget = shipmentPricingTarget(shipment, "source");
  const destinationTarget = shipmentPricingTarget(shipment, "destination");
  const sourceProjection = projections.find(
    projection =>
      projection.shipmentId === shipment.id &&
      projection.side === "source" &&
      projection.officeId === sourceTarget.officeId &&
      projection.currency === sourceTarget.currency
  );
  const destinationProjection = projections.find(
    projection =>
      projection.shipmentId === shipment.id &&
      projection.side === "destination" &&
      projection.officeId === destinationTarget.officeId &&
      projection.currency === destinationTarget.currency
  );
  let packingForDisplay = shipment.packing;
  if (!canViewFinance || isPendingCreation) {
    const { pricePerKgMRU: _mru, ...packing } = shipment.packing;
    packingForDisplay = { ...packing, pricePerKg: 0 };
  } else if (sourceProjection || destinationProjection) {
    packingForDisplay = {
      ...shipment.packing,
      ...(sourceProjection ? { pricePerKg: sourceProjection.pricePerKg } : {}),
      ...(destinationProjection
        ? { pricePerKgMRU: destinationProjection.pricePerKg }
        : {}),
    };
  }
  const result = (): PackingPricingView => ({
    packingForDisplay,
    isPendingCreation,
    isPreview: false,
    hasSourceRate: positiveRate(packingForDisplay.pricePerKg),
    hasMruRate: positiveRate(packingForDisplay.pricePerKgMRU),
    confirmed,
    issue: null,
  });
  if (!canViewFinance || !isPendingCreation) return result();

  const parsed = packingRateSnapshotSchema.safeParse(
    shipment.packing.rateSnapshot
  );
  if (!parsed.success) return { ...result(), issue: "snapshot_unavailable" };
  const snapshot = parsed.data;
  const createdAt = Date.parse(shipment.packing.createdAt);
  const capturedAt = Date.parse(snapshot.capturedAt);
  // Before this change the snapshot was evaluated just before createPackedShipment.
  // Preserve such local drafts without inventing a different publication date.
  if (
    snapshot.sourceOffice !== shipment.packing.source ||
    (shipment.officeId !== undefined &&
      shipment.officeId !== shipment.packing.source) ||
    snapshot.service !== shipment.packing.service ||
    !Number.isFinite(createdAt) ||
    !Number.isFinite(capturedAt) ||
    capturedAt > createdAt ||
    createdAt - capturedAt > 1000
  )
    return { ...result(), issue: "snapshot_mismatch" };

  const source = snapshot.sourceRate;
  const destination = snapshot.nouakchottRate;
  const hasSourceRate =
    source?.currency === sourceCurrency[shipment.packing.source] &&
    source.unit === "kg" &&
    positiveRate(source.amount);
  const hasMruRate =
    destination?.currency === "MRU" &&
    destination.unit === "kg" &&
    positiveRate(destination.amount);
  packingForDisplay = {
    ...packingForDisplay,
    pricePerKg: hasSourceRate ? source!.amount : 0,
    ...(hasMruRate ? { pricePerKgMRU: destination!.amount } : {}),
  };
  return {
    ...result(),
    isPreview: Boolean(hasSourceRate || hasMruRate),
    hasSourceRate: Boolean(hasSourceRate),
    hasMruRate: Boolean(hasMruRate),
    issue: !hasSourceRate
      ? "source_rate_unavailable"
      : !hasMruRate
        ? "destination_rate_unavailable"
        : null,
  };
}
