import { useEffect, useMemo, useState } from "react";
import type { OfficeId } from "@shared/branches";
import { isShipmentSent, type FinanceCommand } from "@shared/finance";
import {
  effectiveRate,
  originalPricePerKg,
  shipmentPricingTarget,
  type PriceProjection,
  type ShipmentPriceSide,
} from "@shared/shipmentPricing";
import type { PermissionMap } from "@shared/permissions";
import { permissionAllowed } from "@shared/permissions";
import type { AppRole, Invoice, Shipment } from "@shared/operations";
import { useLanguage } from "@/contexts/LanguageContext";
import { shipmentPriceCopyFor } from "@/lib/shipmentPriceCopy";
import {
  formatLocalNumber,
  PackingField,
  packingInputClass,
  packingPrimaryClass,
} from "./PackingPrimitives";

type FinanceLikeWorkspace = {
  role?: AppRole | null;
  offices?: OfficeId[] | null;
  homeOffice?: OfficeId | null;
  permissions?: PermissionMap | null;
  online: boolean;
  canEdit: boolean;
  saveCommand: (command: FinanceCommand) => Promise<boolean>;
  queue?: (
    command: FinanceCommand,
    options?: { confirmed?: boolean }
  ) => Promise<unknown>;
  syncCommands?: (commandIds: string[]) => Promise<unknown>;
  commands?: FinanceCommand[];
  invoices?: Invoice[];
  snapshot?: {
    invoices?: Invoice[];
    entries?: Array<{ shipmentId?: string; invoiceId?: string }>;
    shipmentReceivables?: Array<{
      shipments: Array<{ shipmentId: string }>;
    }>;
    receivables?: Array<{ shipments: Array<{ shipmentId: string }> }>;
    pricingProjections?: PriceProjection[];
  };
  pricingProjections?: PriceProjection[];
};

type Props = {
  shipments: readonly Shipment[];
  workspace: FinanceLikeWorkspace;
  projections?: readonly PriceProjection[];
  initialShipmentId?: string;
  className?: string;
  onSaved?: () => void;
};

export function stableShipmentPriceCommandId(
  shipmentId: string,
  side: ShipmentPriceSide
) {
  return `shipment-price:${shipmentId}:${side}`.slice(0, 128);
}

export function createShipmentPriceOverrideCommand(input: {
  shipment: Pick<Shipment, "id">;
  side: ShipmentPriceSide;
  pricePerKg: number;
  reason: string;
  projection: Pick<
    PriceProjection,
    "expectedPricingRevision" | "recordVersion"
  >;
  createdAt?: string;
}): FinanceCommand {
  return {
    id: stableShipmentPriceCommandId(input.shipment.id, input.side),
    createdAt: input.createdAt ?? new Date().toISOString(),
    kind: "shipment_price",
    payload: {
      shipmentId: input.shipment.id,
      side: input.side,
      pricePerKg: input.pricePerKg,
      reason: input.reason.trim(),
      expectedPricingRevision: input.projection.expectedPricingRevision,
      expectedVersion: input.projection.recordVersion,
    },
  };
}

export function projectionForShipmentSide(
  shipment: Pick<Shipment, "id" | "packing">,
  side: ShipmentPriceSide,
  projections: readonly PriceProjection[]
): PriceProjection | null {
  if (!shipment.packing) return null;
  const target = shipmentPricingTarget(shipment, side);
  return (
    projections.find(
      projection =>
        projection.shipmentId === shipment.id &&
        projection.side === side &&
        projection.officeId === target.officeId &&
        projection.currency === target.currency
    ) ?? null
  );
}

export function sideIsInScope(
  shipment: Pick<Shipment, "packing">,
  side: ShipmentPriceSide,
  workspace: Pick<
    FinanceLikeWorkspace,
    "role" | "offices" | "homeOffice" | "permissions"
  >
) {
  if (!shipment.packing) return false;
  const target = shipmentPricingTarget(shipment, side);
  return (
    permissionAllowed(
      {
        role: workspace.role ?? null,
        offices: workspace.offices ?? null,
        homeOffice: workspace.homeOffice ?? null,
        permissions: workspace.permissions ?? null,
      },
      "shipment_prices",
      "view"
    ) &&
    (workspace.role === "admin" ||
      Boolean(workspace.offices?.includes(target.officeId)))
  );
}

export function hasShipmentFinancialHistory(
  shipmentId: string,
  workspace: Pick<
    FinanceLikeWorkspace,
    "commands" | "invoices" | "snapshot"
  >
) {
  const commands = workspace.commands ?? [];
  if (
    commands.some(
      command =>
        (command.kind === "invoice" && command.payload.shipmentId === shipmentId) ||
        (command.kind === "expense" && command.payload.shipmentId === shipmentId)
    )
  )
    return true;
  const invoices = [...(workspace.invoices ?? []), ...(workspace.snapshot?.invoices ?? [])];
  if (invoices.some(invoice => invoice.finance?.shipmentId === shipmentId))
    return true;
  const settlementInvoiceIds = new Set(
    commands
      .filter(command => command.kind === "settlement")
      .map(command => command.payload.invoiceId)
  );
  if (
    invoices.some(
      invoice =>
        settlementInvoiceIds.has(invoice.id) &&
        invoice.finance?.shipmentId === shipmentId
    )
  )
    return true;
  if (
    (workspace.snapshot?.entries ?? []).some(
      entry => entry.shipmentId === shipmentId || entry.invoiceId === shipmentId
    )
  )
    return true;
  const receivables = [
    ...(workspace.snapshot?.shipmentReceivables ?? []),
    ...(workspace.snapshot?.receivables ?? []),
  ];
  return receivables.some(row =>
    row.shipments.some(item => item.shipmentId === shipmentId)
  );
}

function hasPendingOverride(
  shipmentId: string,
  side: ShipmentPriceSide,
  commands: readonly FinanceCommand[]
) {
  return commands.some(command => {
    if (command.kind !== "shipment_price") return false;
    return (
      command.payload.shipmentId === shipmentId &&
      (command.payload.side === undefined || command.payload.side === side)
    );
  });
}

function overrideHistory(
  projection: PriceProjection | null,
  original: number,
  effective: number,
  c: ReturnType<typeof shipmentPriceCopyFor>,
  language: string
) {
  if (!projection || projection.overridePricePerKg === null) return null;
  return (
    <div className="mt-3 rounded-xl bg-[#f7faf8] p-3 text-xs text-[#52636e]">
      <b className="block text-[#092d50]">{c.history}</b>
      <span>
        {c.originLabel}: {formatLocalNumber(original, language, 2)} {projection.currency}/{c.kg}
      </span>
      <span className="ms-3">
        {c.approvedLabel}: {formatLocalNumber(effective, language, 2)} {projection.currency}/{c.kg}
      </span>
    </div>
  );
}

export default function ShipmentPriceOverrideForm({
  shipments,
  workspace,
  projections: suppliedProjections,
  initialShipmentId,
  className = "",
  onSaved,
}: Props) {
  const { language, dir } = useLanguage();
  const c = shipmentPriceCopyFor(language);
  const projections =
    suppliedProjections ??
    workspace.pricingProjections ??
    workspace.snapshot?.pricingProjections ??
    [];
  const [shipmentId, setShipmentId] = useState(
    initialShipmentId ?? shipments[0]?.id ?? ""
  );
  const [side, setSide] = useState<ShipmentPriceSide>("source");
  const [rate, setRate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!shipments.some(shipment => shipment.id === shipmentId))
      setShipmentId(initialShipmentId ?? shipments[0]?.id ?? "");
  }, [initialShipmentId, shipmentId, shipments]);

  const shipment = shipments.find(item => item.id === shipmentId) ?? null;
  const sides = useMemo(
    () =>
      shipment
        ? (["source", "destination"] as const).filter(candidate =>
            sideIsInScope(shipment, candidate, workspace)
          )
        : [],
    [shipment, workspace]
  );
  useEffect(() => {
    if (!sides.includes(side)) setSide(sides[0] ?? "source");
  }, [side, sides]);

  const projection = shipment
    ? projectionForShipmentSide(shipment, side, projections)
    : null;
  const target = shipment?.packing
    ? shipmentPricingTarget(shipment, side)
    : null;
  const canManage =
    target !== null &&
    permissionAllowed(
      {
        role: workspace.role ?? null,
        offices: workspace.offices ?? null,
        homeOffice: workspace.homeOffice ?? null,
        permissions: workspace.permissions ?? null,
      },
      "shipment_prices",
      "manage"
    ) &&
    (workspace.role === "admin" ||
      Boolean(workspace.offices?.includes(target.officeId)));
  const finalState = shipment
    ? Boolean(shipment.deleted) || isShipmentSent(shipment)
    : false;
  const financialHistory = shipment
    ? hasShipmentFinancialHistory(shipment.id, workspace)
    : false;
  const pending = shipment
    ? hasPendingOverride(shipment.id, side, workspace.commands ?? [])
    : false;
  const hasExactProjection = Boolean(projection);
  const blocked = finalState || financialHistory || pending;
  const canSubmit = Boolean(
    shipment &&
      projection &&
      canManage &&
      workspace.canEdit &&
      workspace.online !== undefined &&
      !blocked &&
      !busy
  );
  const original = shipment?.packing ? originalPricePerKg(shipment, side) : 0;
  const effective = projection?.pricePerKg ?? original;

  useEffect(() => {
    setRate("");
    setReason("");
    setError("");
    setNotice("");
  }, [shipmentId, side]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!shipment || !projection || !target || !canSubmit)
      return setError(
        blocked
          ? finalState
            ? c.finalBlocked
            : financialHistory
              ? c.invoiceBlocked
              : c.pendingBlocked
          : c.waitSync
      );
    const value = Number(rate);
    if (
      !reason.trim() ||
      !Number.isFinite(value) ||
      value <= 0 ||
      value > 999999999 ||
      Math.abs(value * 100 - Math.round(value * 100)) > 0.0001
    )
      return setError(c.invalid);
    if (!window.confirm(`${c.confirm}\n\n${c.shipment}: ${shipment.tracking}\n${c.side}: ${side === "source" ? c.source : c.destination}\n${c.rate}: ${value} ${target.currency}/${c.kg}`))
      return;
    const command = createShipmentPriceOverrideCommand({
      shipment,
      side,
      pricePerKg: value,
      reason,
      projection,
    });
    setBusy(true);
    try {
      if (workspace.queue) {
        await workspace.queue(command, { confirmed: true });
      } else {
        const saved = await workspace.saveCommand(command);
        if (!saved) {
          setError(c.noAccess);
          return;
        }
      }
      if (workspace.queue) {
        setNotice(workspace.online ? c.synced : c.savedOffline);
        setRate("");
        setReason("");
        onSaved?.();
        return;
      }
      if (!workspace.online || !workspace.syncCommands) {
        setNotice(c.savedOffline);
        onSaved?.();
        return;
      }
      const result = await workspace.syncCommands([command.id]);
      const receipt = result as { applied?: Array<{ commandId?: string; priceProjection?: PriceProjection }>; conflicts?: unknown[] } | null;
      if (receipt?.applied?.some(item => item.commandId === command.id))
        setNotice(c.synced);
      else setNotice(c.saved);
      setRate("");
      setReason("");
      onSaved?.();
    } catch {
      setNotice(c.saved);
    } finally {
      setBusy(false);
    }
  };

  if (!shipments.length)
    return <section className={className}>{c.noShipments}</section>;
  if (!sides.length)
    return (
      <section dir={dir} className={`${className} rounded-2xl border border-slate-200 bg-white p-4`}>
        <h2 className="text-lg font-black text-[#092d50]">{c.title}</h2>
        <p className="mt-2 text-sm text-[#718088]">{c.noAccess}</p>
      </section>
    );

  return (
    <section dir={dir} className={`${className} rounded-2xl border border-[#dce4e7] bg-white p-5 shadow-sm`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#edf1f1] pb-4">
        <div>
          <h2 className="text-lg font-black text-[#092d50]">{c.title}</h2>
          <p className="mt-1 text-xs text-[#718088]">
            {target?.officeId === "nouakchott" ? c.destinationOffice : c.sourceOffice}
          </p>
        </div>
        {!canManage && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{c.readOnly}</span>}
      </div>
      <form onSubmit={submit} className="mt-4 grid gap-4 md:grid-cols-2">
        {shipments.length > 1 && (
          <PackingField label={c.shipment} required>
            <select className={packingInputClass} value={shipmentId} disabled={busy} onChange={event => setShipmentId(event.target.value)}>
              {shipments.map(item => <option key={item.id} value={item.id}>{item.tracking} · {item.id}</option>)}
            </select>
          </PackingField>
        )}
        <PackingField label={c.side} required>
          <select className={packingInputClass} value={side} disabled={busy || sides.length < 2} onChange={event => setSide(event.target.value as ShipmentPriceSide)}>
            {sides.map(item => <option key={item} value={item}>{item === "source" ? c.source : c.destination}</option>)}
          </select>
        </PackingField>
        <PackingField label={`${c.rate} (${target?.currency ?? "—"}/${c.kg})`} required>
          <input className={packingInputClass} type="number" min="0.01" step="0.01" value={rate} disabled={!canSubmit} onChange={event => setRate(event.target.value)} />
        </PackingField>
        <PackingField label={c.reason} required>
          <input className={packingInputClass} maxLength={500} value={reason} disabled={!canSubmit} placeholder={c.reasonPlaceholder} onChange={event => setReason(event.target.value)} />
        </PackingField>
        <div className="rounded-xl bg-[#f7faf8] p-3 text-sm">
          <span className="block text-xs text-[#718088]">{c.original}</span>
          <b>{formatLocalNumber(original, language, 2)} {target?.currency ?? "—"}/{c.kg}</b>
          <span className="mt-2 block text-xs text-[#718088]">{c.approved}</span>
          <b>{formatLocalNumber(effective, language, 2)} {target?.currency ?? "—"}/{c.kg}</b>
          {overrideHistory(projection, original, effective, c, language)}
        </div>
        <div className="rounded-xl bg-slate-50 p-3 text-xs text-[#718088]">
          <p>{c.expectedRevision}: {projection?.expectedPricingRevision ?? "—"}</p>
          <p>{c.expectedVersion}: {projection?.recordVersion ?? "—"}</p>
          {!hasExactProjection && <p className="mt-2 font-bold text-amber-800">{c.projectionMissing}</p>}
          {finalState && <p className="mt-2 font-bold text-amber-800">{c.finalBlocked}</p>}
          {financialHistory && <p className="mt-2 font-bold text-amber-800">{c.invoiceBlocked}</p>}
          {pending && <p className="mt-2 font-bold text-amber-800">{c.pendingBlocked}</p>}
        </div>
        {error && <p role="alert" className="md:col-span-2 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p>}
        {notice && <p role="status" className="md:col-span-2 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{notice}</p>}
        <div className="md:col-span-2 flex justify-end">
          <button className={`${packingPrimaryClass} ${!canSubmit ? "opacity-50" : ""}`} type="submit" disabled={!canSubmit}>
            {busy ? c.saving : canManage ? c.save : c.readOnly}
          </button>
        </div>
      </form>
    </section>
  );
}
