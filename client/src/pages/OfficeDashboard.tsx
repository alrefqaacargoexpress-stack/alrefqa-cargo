import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  MapPin,
  Package,
  Phone,
  Users,
} from "lucide-react";
import PackingLayout from "@/components/packing/PackingLayout";
import { useOperationsWorkspace } from "@/hooks/useOperationsWorkspace";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import {
  branchDashboardCopy,
  shipmentStatusLabel,
  stageLabel,
  weekdayLabel,
} from "@/lib/branchDashboardCopy";
import { officeNames } from "@shared/branches";
import {
  officeIds,
  type OfficeId,
  type OfficeDashboardData,
} from "@shared/branches";
import {
  canViewFinance,
  type Entity,
  type EntityRecord,
  type Shipment,
} from "@shared/operations";

function officeFromLocation(location: string): OfficeId {
  const value = new URLSearchParams(location).get("office");
  return value && officeIds.includes(value as OfficeId)
    ? (value as OfficeId)
    : "nouakchott";
}

export default function OfficeDashboard() {
  const { language, dir } = useLanguage();
  const c = branchDashboardCopy(language);
  const workspace = useOperationsWorkspace();
  const [, navigate] = useLocation();
  const query = useSearch();
  const [officeId, setOfficeId] = useState<OfficeId>(() =>
    officeFromLocation(query)
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [arrivalShipment, setArrivalShipment] = useState<Shipment | null>(null);
  const utils = trpc.useUtils();
  const dashboard = trpc.branches.dashboard.useQuery(
    { officeId },
    {
      enabled: Boolean(
        workspace.role && workspace.online && !workspace.localOnly
      ),
      retry: false,
      refetchOnWindowFocus: false,
    }
  );
  const confirmArrival = trpc.branches.confirmArrival.useMutation();
  const assignRecord = trpc.branches.assignRecord.useMutation();

  useEffect(() => {
    setOfficeId(officeFromLocation(query));
  }, [query]);

  const selectOffice = (next: OfficeId) => {
    setOfficeId(next);
    navigate(`/operations/offices?office=${encodeURIComponent(next)}`);
  };

  const canConfirm =
    Boolean(
      workspace.role &&
        ["admin", "supervisor", "staff"].includes(workspace.role)
    ) && officeId === "nouakchott";
  const financeVisible = Boolean(
    dashboard.data?.financial && canViewFinance(workspace.role)
  );
  const unknownRecords = useMemo(() => {
    if (workspace.role !== "admin") return [];
    const rows: Array<{ entity: Entity; record: EntityRecord }> = [];
    for (const account of workspace.state.accounts)
      if (!account.officeId) rows.push({ entity: "account", record: account });
    for (const invoice of workspace.state.invoices)
      if (!invoice.officeId) rows.push({ entity: "invoice", record: invoice });
    // A shipment with packing.source or a journey branch is already classified by its origin/route.
    for (const shipment of workspace.state.shipments) {
      if (
        !shipment.officeId &&
        !shipment.packing?.source &&
        !shipment.journey?.branch
      )
        rows.push({ entity: "shipment", record: shipment });
    }
    return rows;
  }, [workspace.role, workspace.state]);

  const refreshBranchData = async () => {
    await Promise.all([
      utils.branches.dashboard.invalidate({ officeId }),
      utils.operations.snapshot.invalidate(),
      utils.operations.access.invalidate(),
    ]);
    await utils.invalidate();
  };

  const submitArrival = async (reason: string) => {
    if (!arrivalShipment || !workspace.online || !arrivalShipment.version)
      return;
    try {
      await confirmArrival.mutateAsync({
        shipmentId: arrivalShipment.id,
        expectedVersion: arrivalShipment.version,
        requestId: crypto.randomUUID(),
        reason,
      });
      setArrivalShipment(null);
      setNotice(c.confirmed);
      await refreshBranchData();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : c.unavailable);
    }
  };

  const requestArrival = (shipment: Shipment) => {
    if (!workspace.online) {
      setNotice(c.offlineArrival);
      return;
    }
    if (!shipment.version) {
      setNotice(c.unavailable);
      return;
    }
    setArrivalShipment(shipment);
  };

  const handleAssign = async (entity: Entity, record: EntityRecord) => {
    if (!record.version) return;
    if (!window.confirm(`${c.assignConfirm}: ${recordLabel(entity, record)}`))
      return;
    const reason = window.prompt(c.assignPrompt)?.trim();
    if (!reason) return;
    try {
      await assignRecord.mutateAsync({
        entity,
        recordId: record.id,
        officeId,
        expectedVersion: record.version,
        reason,
      });
      setNotice(c.assigned);
      await refreshBranchData();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : c.unavailable);
    }
  };

  return (
    <PackingLayout
      title={c.dashboard}
      description={c.profile}
      workspace={workspace}
    >
      <div dir={dir} className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-[#dce4e7] bg-white p-4">
          <label className="grid gap-1 text-sm font-bold text-[#092d50]">
            {c.office}
            <select
              aria-label={c.office}
              value={officeId}
              onChange={event => selectOffice(event.target.value as OfficeId)}
              className="min-h-11 rounded-xl border border-[#cbd9de] bg-white px-3 text-sm font-semibold"
            >
              {officeIds.map(id => (
                <option key={id} value={id}>
                  {officeNames[language][id]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2 text-xs">
            {workspace.canEditShipments && (
              <Link
                href={`/operations/shipments/new?office=${officeId}`}
                className="rounded-xl bg-[#092d50] px-3 py-2 font-bold text-white"
              >
                {c.newShipment}
              </Link>
            )}
            {["admin", "accountant", "staff"].includes(
              workspace.role ?? ""
            ) && (
              <Link
                href={`/operations?tab=accounts&office=${officeId}`}
                className="rounded-xl border border-[#cbd9de] px-3 py-2 font-bold text-[#2e6280]"
              >
                {c.accountsLink}
              </Link>
            )}
            {financeVisible && (
              <Link
                href={`/operations?tab=invoices&office=${officeId}`}
                className="rounded-xl border border-[#cbd9de] px-3 py-2 font-bold text-[#2e6280]"
              >
                {c.invoicesLink}
              </Link>
            )}
            {workspace.role === "admin" && (
              <Link
                href={`/operations/settings?office=${officeId}`}
                className="rounded-xl border border-[#cbd9de] px-3 py-2 font-bold text-[#2e6280]"
              >
                {c.settingsLink}
              </Link>
            )}
          </div>
        </div>

        {dashboard.isLoading && <Panel>{c.loadingDashboard}</Panel>}
        {dashboard.error && (
          <Panel tone="warning">
            <AlertTriangle size={16} />
            {dashboard.error.data?.code === "FORBIDDEN"
              ? c.noAccess
              : c.unavailable}
          </Panel>
        )}
        {notice && (
          <Panel tone="success">
            <CheckCircle2 size={16} />
            {notice}
          </Panel>
        )}

        {dashboard.data && (
          <>
            <ProfileCard data={dashboard.data} language={language} c={c} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                icon={<Package size={17} />}
                label={c.shipments}
                value={String(dashboard.data.shipments.length)}
              />
              <Metric
                icon={<Users size={17} />}
                label={c.accounts}
                value={String(dashboard.data.accounts.length)}
              />
              <Metric
                icon={<CircleDollarSign size={17} />}
                label={c.invoices}
                value={String(dashboard.data.invoices.length)}
              />
              <Metric
                icon={<MapPin size={17} />}
                label={c.office}
                value={officeNames[language][officeId]}
              />
            </div>
            <ShipmentTable
              shipments={dashboard.data.shipments}
              language={language}
              c={c}
              canConfirm={canConfirm}
              online={workspace.online}
              busy={confirmArrival.isPending}
              onConfirm={requestArrival}
            />
            {financeVisible ? (
              <FinanceTables data={dashboard.data} c={c} />
            ) : (
              <Panel>{c.financeHidden}</Panel>
            )}
          </>
        )}

        {workspace.role === "admin" && (
          <UnassignedRecords
            records={unknownRecords}
            officeName={officeNames[language][officeId]}
            c={c}
            busy={assignRecord.isPending}
            onAssign={record => void handleAssign(record.entity, record.record)}
          />
        )}
      </div>
      {arrivalShipment && (
        <ArrivalDialog
          shipment={arrivalShipment}
          c={c}
          busy={confirmArrival.isPending}
          onCancel={() => setArrivalShipment(null)}
          onConfirm={reason => void submitArrival(reason)}
        />
      )}
    </PackingLayout>
  );
}

function ProfileCard({
  data,
  language,
  c,
}: {
  data: OfficeDashboardData;
  language: "ar" | "en" | "zh" | "tr";
  c: ReturnType<typeof branchDashboardCopy>;
}) {
  const map = data.profile.gps
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${data.profile.gps.lat},${data.profile.gps.lng}`)}`
    : null;
  return (
    <section className="rounded-2xl border border-[#dce4e7] bg-white p-4">
      <h2 className="text-lg font-black text-[#092d50]">{c.profile}</h2>
      <div className="mt-3 grid gap-3 text-sm text-[#52636e] md:grid-cols-2">
        <div>
          <span className="font-bold text-[#092d50]">{c.address}: </span>
          {data.profile.address || c.addressUnknown}
        </div>
        <div>
          <span className="font-bold text-[#092d50]">{c.phone}: </span>
          {data.profile.phone || c.noPhone}
        </div>
        <div>
          <span className="font-bold text-[#092d50]">{c.timezone}: </span>
          <span dir="ltr">{data.profile.timezone}</span>
        </div>
        {map && (
          <a
            href={map}
            target="_blank"
            rel="noreferrer"
            className="font-bold text-[#2e6280]"
          >
            {c.map}
          </a>
        )}
      </div>
      {data.profile.hours.length > 0 && (
        <div className="mt-4 grid gap-1 text-xs text-[#63737a] sm:grid-cols-2 lg:grid-cols-4">
          {[...data.profile.hours]
            .sort((a, b) => a.day - b.day)
            .map(day => (
              <div
                key={day.day}
                className="flex justify-between gap-2 rounded-lg bg-[#f5f8f6] px-2 py-1"
              >
                <span>{weekdayLabel(day.day, language)}</span>
                <span dir="ltr">
                  {day.closed || !day.work
                    ? c.closed
                    : `${day.work.start}–${day.work.end}`}
                </span>
              </div>
            ))}
        </div>
      )}
      {data.profile.employees.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {data.profile.employees.map(employee => (
            <span
              key={employee.id}
              className="rounded-full bg-[#eef3f0] px-3 py-1 text-xs text-[#456e61]"
            >
              {employee.name} · {employee.phone}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function ShipmentTable({
  shipments,
  language,
  c,
  canConfirm,
  online,
  busy,
  onConfirm,
}: {
  shipments: Shipment[];
  language: "ar" | "en" | "zh" | "tr";
  c: ReturnType<typeof branchDashboardCopy>;
  canConfirm: boolean;
  online: boolean;
  busy: boolean;
  onConfirm: (shipment: Shipment) => void;
}) {
  return (
    <section className="rounded-2xl border border-[#dce4e7] bg-white p-4">
      <h2 className="text-lg font-black text-[#092d50]">{c.shipments}</h2>
      {!shipments.length ? (
        <p className="mt-3 text-sm text-[#718088]">{c.noRecords}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] text-start text-sm">
            <thead className="border-b border-[#edf0f0] text-xs text-[#718088]">
              <tr>
                <th className="p-2">{c.tracking}</th>
                <th className="p-2">{c.account}</th>
                <th className="p-2">{c.stage}</th>
                <th className="p-2">{c.status}</th>
                <th className="p-2">{c.confirmArrival}</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map(shipment => {
                const eligible =
                  canConfirm &&
                  !shipment.deleted &&
                  shipment.journey?.stage === "to_nouakchott";
                return (
                  <tr
                    key={shipment.id}
                    className="border-b border-[#f1f3f3] last:border-0"
                  >
                    <td className="p-2 font-semibold" dir="ltr">
                      {shipment.tracking}
                    </td>
                    <td className="p-2">{shipment.account}</td>
                    <td className="p-2">
                      {stageLabel(shipment.journey?.stage, language)}
                    </td>
                    <td className="p-2">
                      {shipmentStatusLabel(shipment.status, language)}
                    </td>
                    <td className="p-2">
                      {eligible ? (
                        <button
                          type="button"
                          title={!online ? c.offlineArrival : undefined}
                          disabled={!online || busy}
                          onClick={() => onConfirm(shipment)}
                          className="rounded-lg bg-[#2b7656] px-2.5 py-1.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-[#9aa9a9]"
                        >
                          {c.confirmArrival}
                        </button>
                      ) : (
                        <span className="text-xs text-[#87949a]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FinanceTables({
  data,
  c,
}: {
  data: OfficeDashboardData;
  c: ReturnType<typeof branchDashboardCopy>;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-2xl border border-[#dce4e7] bg-white p-4">
        <h2 className="text-lg font-black text-[#092d50]">{c.accounts}</h2>
        <div className="mt-3 space-y-2">
          {data.accounts.length ? (
            data.accounts.map(account => (
              <div
                key={account.id}
                className="flex items-center justify-between gap-3 border-b border-[#f1f3f3] pb-2 text-sm last:border-0"
              >
                <span>{account.name}</span>
                <span className="text-[#63737a]">
                  {account.balance.toLocaleString()} · {c.amount}
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-[#718088]">{c.noRecords}</p>
          )}
        </div>
      </section>
      <section className="rounded-2xl border border-[#dce4e7] bg-white p-4">
        <h2 className="text-lg font-black text-[#092d50]">{c.invoices}</h2>
        <div className="mt-3 space-y-2">
          {data.invoices.length ? (
            data.invoices.map(invoice => (
              <div
                key={invoice.id}
                className="flex items-center justify-between gap-3 border-b border-[#f1f3f3] pb-2 text-sm last:border-0"
              >
                <span>{invoice.account}</span>
                <span>
                  {invoice.amount.toLocaleString()} ·{" "}
                  {invoice.status === "مدفوعة" ? c.paid : c.awaiting}
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-[#718088]">{c.noRecords}</p>
          )}
        </div>
      </section>
    </div>
  );
}

function UnassignedRecords({
  records,
  officeName,
  c,
  busy,
  onAssign,
}: {
  records: Array<{ entity: Entity; record: EntityRecord }>;
  officeName: string;
  c: ReturnType<typeof branchDashboardCopy>;
  busy: boolean;
  onAssign: (record: { entity: Entity; record: EntityRecord }) => void;
}) {
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-black text-amber-950">{c.unassigned}</h2>
          <p className="mt-1 text-xs text-amber-900">{c.unassignedDetail}</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-amber-900">
          {records.length} · {c.unknownCount}
        </span>
      </div>
      {records.length > 0 && (
        <div className="mt-3 grid gap-2">
          {records.map(({ entity, record }) => (
            <div
              key={`${entity}-${record.id}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 text-sm"
            >
              <span>
                <b>
                  {entity === "account"
                    ? c.entityAccount
                    : entity === "invoice"
                      ? c.entityInvoice
                      : c.shipments}
                </b>{" "}
                · {recordLabel(entity, record)}
              </span>
              <button
                type="button"
                disabled={busy || !record.version}
                onClick={() => onAssign({ entity, record })}
                className="rounded-lg bg-[#092d50] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
              >
                {c.assign} {officeName}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ArrivalDialog({
  shipment,
  c,
  busy,
  onCancel,
  onConfirm,
}: {
  shipment: Shipment;
  c: ReturnType<typeof branchDashboardCopy>;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[#092d50]/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="arrival-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
        <h2 id="arrival-title" className="text-xl font-black text-[#092d50]">
          {c.confirmArrival}
        </h2>
        <p className="mt-2 text-sm text-[#63737a]">
          {shipment.tracking} · {c.arrivalPrompt}
        </p>
        <label className="mt-4 grid gap-2 text-sm font-bold text-[#092d50]">
          {c.arrivalReason}
          <textarea
            value={reason}
            onChange={event => setReason(event.target.value)}
            maxLength={500}
            rows={4}
            className="rounded-xl border border-[#cbd9de] p-3 font-normal"
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-[#cbd9de] px-4 py-2 text-sm font-bold text-[#52636e]"
          >
            {c.cancel}
          </button>
          <button
            type="button"
            disabled={busy || !reason.trim()}
            onClick={() => onConfirm(reason.trim())}
            className="rounded-xl bg-[#2b7656] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {c.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

function Panel({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "warning" | "success";
}) {
  const style =
    tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-950"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-950"
        : "border-[#dce4e7] bg-white text-[#52636e]";
  return (
    <div
      className={`flex items-center gap-2 rounded-2xl border p-4 text-sm ${style}`}
    >
      {children}
    </div>
  );
}
function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-[#dce4e7] bg-white p-4">
      <div className="flex items-center gap-2 text-xs text-[#718088]">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-xl font-black text-[#092d50]">{value}</div>
    </div>
  );
}
function recordLabel(entity: Entity, record: EntityRecord) {
  if ("name" in record) return `${record.id} · ${record.name}`;
  if (!("tracking" in record)) return `${record.id} · ${record.account}`;
  return `${record.id} · ${record.tracking}`;
}
