import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Link2, RefreshCw } from "lucide-react";
import type { Account, Shipment } from "@shared/operations";
import { useLanguage } from "@/contexts/LanguageContext";
import { customerTrackingCopy } from "@/lib/customerTrackingCopy";
import { trpc } from "@/lib/trpc";
import type { PackingSource } from "@shared/packing";
import type { TrackingLanguage } from "@/lib/trackingCopy";
import type { useOperationsWorkspace } from "@/hooks/useOperationsWorkspace";

type OperationsWorkspace = ReturnType<typeof useOperationsWorkspace>;

type Props = {
  account: Account;
  workspace: OperationsWorkspace;
};

type SafeGood = {
  id: string;
  name: string;
  pieces: number;
  unitWeight: number;
  deleted?: unknown;
};

export function activeGoodsForCustomerTracking(shipment: Shipment): SafeGood[] {
  return (shipment.packing?.cartons ?? []).flatMap(carton =>
    carton.goods
      .filter(good => !good.deleted)
      .map(good => ({
        id: good.id,
        name: good.name,
        pieces: good.pieces,
        unitWeight: good.unitWeight,
      }))
  );
}

function shipmentOffice(shipment: Shipment) {
  return (
    shipment.officeId ?? (shipment.packing?.source as PackingSource | undefined)
  );
}

function localizedError(
  error: unknown,
  copy: (typeof customerTrackingCopy)["ar"]
) {
  const code = (error as { data?: { code?: string } } | null)?.data?.code;
  if (code === "CONFLICT") return copy.conflict;
  if (code === "FORBIDDEN" || code === "UNAUTHORIZED") return copy.forbidden;
  if (code === "NOT_FOUND") return copy.notFound;
  return copy.failed;
}

export default function CustomerTrackingGrantPanel({
  account,
  workspace,
}: Props) {
  const { language, dir } = useLanguage();
  const copy = customerTrackingCopy[language];
  const roleAllowed =
    workspace.role === "admin" || workspace.role === "office_manager";
  const accountOffice = account.officeId;
  const officeAllowed = Boolean(
    accountOffice &&
      (workspace.offices === null || workspace.offices.includes(accountOffice))
  );
  const shipments = useMemo(
    () =>
      workspace.state.shipments.filter(
        shipment =>
          !shipment.deleted &&
          shipmentOffice(shipment) === accountOffice &&
          (workspace.offices === null ||
            workspace.offices.includes(shipmentOffice(shipment) as never))
      ),
    [accountOffice, workspace.offices, workspace.state.shipments]
  );
  const [shipmentId, setShipmentId] = useState("");
  const [targetEmail, setTargetEmail] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const selectedShipment = shipments.find(
    shipment => shipment.id === shipmentId
  );
  const goods = selectedShipment
    ? activeGoodsForCustomerTracking(selectedShipment)
    : [];
  const accessQuery = trpc.customerTracking.listAccess.useQuery(
    { customerAccountId: account.id, shipmentId },
    {
      enabled: Boolean(roleAllowed && officeAllowed && selectedShipment),
      retry: false,
      refetchOnWindowFocus: false,
    }
  );
  const utils = trpc.useUtils();
  const grant = trpc.customerTracking.grant.useMutation({
    onSuccess: async () => {
      setNotice(copy.saved);
      setSelected(new Set());
      await utils.customerTracking.listAccess.invalidate({
        customerAccountId: account.id,
        shipmentId,
      });
    },
    onError: error => setNotice(localizedError(error, copy)),
  });
  const revoke = trpc.customerTracking.revoke.useMutation({
    onSuccess: async () => {
      setNotice(copy.saved);
      setSelected(new Set());
      await utils.customerTracking.listAccess.invalidate({
        customerAccountId: account.id,
        shipmentId,
      });
    },
    onError: error => setNotice(localizedError(error, copy)),
  });
  const accessByGood = new Map(
    (accessQuery.data?.items ?? []).map(item => [item.goodsId, item])
  );
  const selectedActive = goods.filter(good => {
    const access = accessByGood.get(good.id);
    return selected.has(good.id) && access?.status === "active";
  });
  const selectedNewOrRevoked = goods.filter(good => {
    const access = accessByGood.get(good.id);
    return selected.has(good.id) && access?.status !== "active";
  });

  if (!roleAllowed || !officeAllowed) return null;

  const toggleGood = (id: string) => {
    setNotice(null);
    setSelected(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectShipment = (value: string) => {
    setShipmentId(value);
    setSelected(new Set());
    setNotice(null);
  };
  const runGrant = () => {
    if (!selectedShipment || !selectedNewOrRevoked.length) {
      setNotice(copy.noneSelected);
      return;
    }
    if (!targetEmail.trim()) {
      setNotice(copy.targetEmailHint);
      return;
    }
    if (!window.confirm(copy.confirmGrant)) return;
    grant.mutate({
      targetEmail: targetEmail.trim(),
      customerAccountId: account.id,
      shipmentId: selectedShipment.id,
      goods: selectedNewOrRevoked.map(good => ({
        goodsId: good.id,
        expectedVersion: accessByGood.get(good.id)?.version ?? 0,
      })),
    });
  };
  const runRevoke = () => {
    if (!selectedShipment || !selectedActive.length) {
      setNotice(copy.noneSelected);
      return;
    }
    if (!window.confirm(copy.confirmRevoke)) return;
    revoke.mutate({
      customerAccountId: account.id,
      shipmentId: selectedShipment.id,
      goods: selectedActive.map(good => ({
        goodsId: good.id,
        expectedVersion: accessByGood.get(good.id)?.version ?? 0,
      })),
    });
  };

  return (
    <details
      className="rounded-2xl border border-[#d8e4e7] bg-[#f8fbfa]"
      dir={dir}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 text-[#092d50]">
        <span className="flex items-center gap-2 font-black">
          <Link2 size={18} aria-hidden="true" />
          {copy.grantTitle}
        </span>
        <ChevronDown size={18} aria-hidden="true" />
      </summary>
      <div className="space-y-4 border-t border-[#d8e4e7] p-5">
        <p className="text-sm leading-6 text-[#526b73]">{copy.grantHint}</p>
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
          <AlertTriangle
            className="me-1 inline-block align-text-bottom"
            size={14}
            aria-hidden="true"
          />
          {copy.manualCheck}
        </p>
        <div className="rounded-xl border border-[#e1e9e8] bg-white p-3 text-sm">
          <span className="text-[#718088]">{copy.customerAccount}: </span>
          <strong>{account.name}</strong>
        </div>
        <label className="block text-sm font-bold text-[#23445d]">
          {copy.targetEmail}
          <input
            type="email"
            value={targetEmail}
            onChange={event => setTargetEmail(event.target.value)}
            placeholder="name@example.com"
            autoComplete="off"
            maxLength={320}
            className="mt-2 min-h-11 w-full rounded-xl border border-[#dce4e7] bg-white px-3 font-normal outline-none focus:border-[#2d6380]"
            dir="ltr"
          />
          <span className="mt-1 block text-xs font-normal text-[#718088]">
            {copy.targetEmailHint}
          </span>
        </label>
        <label className="block text-sm font-bold text-[#23445d]">
          {copy.shipmentSelect}
          <select
            value={shipmentId}
            onChange={event => selectShipment(event.target.value)}
            className="mt-2 min-h-11 w-full rounded-xl border border-[#dce4e7] bg-white px-3 font-normal"
          >
            <option value="">{copy.chooseShipment}</option>
            {shipments.map(shipment => (
              <option key={shipment.id} value={shipment.id}>
                {shipment.tracking} · {shipment.id}
              </option>
            ))}
          </select>
        </label>
        {!shipments.length && (
          <p className="text-sm text-[#718088]">{copy.noShipment}</p>
        )}
        {selectedShipment && (
          <section className="rounded-xl border border-[#e1e9e8] bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-black text-[#092d50]">{copy.chooseGoods}</h3>
              {accessQuery.isFetching && (
                <RefreshCw
                  size={15}
                  className="animate-spin text-[#2d6380]"
                  aria-label={copy.loading}
                />
              )}
            </div>
            {accessQuery.error && (
              <p
                role="alert"
                className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
              >
                {localizedError(accessQuery.error, copy)}
              </p>
            )}
            {!goods.length ? (
              <p className="text-sm text-[#718088]">{copy.noGoods}</p>
            ) : (
              <div className="space-y-2">
                {goods.map(good => {
                  const access = accessByGood.get(good.id);
                  return (
                    <label
                      key={good.id}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#e5eceb] p-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(good.id)}
                        onChange={() => toggleGood(good.id)}
                        className="mt-1 size-4 accent-[#092d50]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold text-[#183d4d]">
                          {good.name}
                        </span>
                        <span className="mt-1 block text-xs text-[#718088]">
                          {good.pieces} · {good.unitWeight} {copy.weight}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-bold text-[#718088]">
                        {copy.currentAccess}:{" "}
                        {access?.status === "active"
                          ? copy.active
                          : access?.status === "revoked"
                            ? copy.revoked
                            : "—"}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>
        )}
        {notice && (
          <p
            role="status"
            className="rounded-xl border border-[#d8e4e7] bg-white p-3 text-sm font-bold text-[#23445d]"
          >
            {notice}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={runGrant}
            disabled={grant.isPending || revoke.isPending || !selectedShipment}
            className="min-h-11 rounded-xl bg-[#092d50] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {grant.isPending ? copy.loading : copy.grant}
          </button>
          <button
            type="button"
            onClick={runRevoke}
            disabled={grant.isPending || revoke.isPending || !selectedShipment}
            className="min-h-11 rounded-xl border border-[#c9d8dc] bg-white px-4 text-sm font-bold text-[#2d6380] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {revoke.isPending ? copy.loading : copy.revoke}
          </button>
        </div>
      </div>
    </details>
  );
}
