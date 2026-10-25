import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft,
  FileSpreadsheet,
  LogIn,
  Menu,
  RefreshCw,
  ShieldCheck,
  WifiOff,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";
import { startLogin } from "@/const";
import { useLanguage } from "@/contexts/LanguageContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useTrackingWorkspace } from "@/hooks/useTrackingWorkspace";
import {
  branchLabel,
  stageLabel,
  trackingCopy,
  type TrackingLanguage,
} from "@/lib/trackingCopy";
import {
  branchIds,
  canNoteTracking,
  canSuperviseTracking,
  canTrackingDetails,
  canUseOperations,
  staffStageTargets,
  warehouseStageTargets,
  stageIds,
  trackingSchedule,
  type TrackingCommand,
  type TrackingStage,
} from "@shared/tracking";
import type { TrackingSummary } from "@shared/tracking";
import type { AppRole } from "@shared/operations";

const logo = "/icons/logo.webp";
const inputClass =
  "h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#56849a]";
const dateValue = (value: string) => value.slice(0, 10);
function languageCopy(language: string) {
  return trackingCopy[
    (language in trackingCopy ? language : "ar") as TrackingLanguage
  ];
}
function statusLabel(language: TrackingLanguage, status: string) {
  return (
    trackingCopy[language].statuses[
      status as keyof typeof trackingCopy.ar.statuses
    ] ?? status
  );
}
function findSelection(location: string) {
  const pathId = location.match(/^\/operations\/tracking\/([^/?#]+)/)?.[1];
  const query = location.split("?")[1]?.split("#")[0];
  return pathId
    ? decodeURIComponent(pathId)
    : query
      ? new URLSearchParams(query).get("id")
      : null;
}
function noticeText(key: string | null, c: ReturnType<typeof languageCopy>) {
  if (!key) return null;
  return (
    (
      {
        tracking_pending: c.pendingSaved,
        tracking_synced: c.syncSuccess,
        tracking_conflict: c.syncConflict,
        tracking_forbidden: c.accessDenied,
        tracking_plan_required: c.planRequired,
        tracking_cache_write: c.error,
        tracking_payload: c.error,
        tracking_cache_read: c.error,
      } as Record<string, string>
    )[key] ?? c.error
  );
}
function stateLabel(
  language: TrackingLanguage,
  row: TrackingSummary,
  c: ReturnType<typeof languageCopy>
) {
  return row.deleted
    ? c.canceled
    : row.stage
      ? stageLabel(language, row.stage)
      : statusLabel(language, row.status);
}
function exportReport(
  rows: TrackingSummary[],
  language: TrackingLanguage,
  truncated: boolean
) {
  const c = trackingCopy[language];
  const sheet = XLSX.utils.aoa_to_sheet([
    [c.trackingNumber, c.shipmentId, c.status, c.stage, c.updatedAt],
    ...rows.map(row => [
      row.tracking,
      row.id,
      stateLabel(language, row, c),
      row.stage ? stageLabel(language, row.stage) : "",
      row.updatedAt ?? "",
    ]),
  ]);
  sheet["!cols"] = [
    { wch: 22 },
    { wch: 18 },
    { wch: 24 },
    { wch: 24 },
    { wch: 28 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Tracking");
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      [c.status, rows.length],
      [c.truncated, truncated ? "yes" : "no"],
    ]),
    "Summary"
  );
  XLSX.writeFile(
    workbook,
    `alrefqaa-tracking-${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}

export default function Tracking() {
  const { language, dir } = useLanguage();
  const c = languageCopy(language);
  const [location, setLocation] = useLocation();
  const selectedId = findSelection(location);
  const [search, setSearch] = useState("");
  const workspace = useTrackingWorkspace(selectedId, search);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modal, setModal] = useState<
    "plan" | "stage" | "note" | "transfer" | "cancel" | null
  >(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [branch, setBranch] = useState<(typeof branchIds)[number]>("dubai");
  const [stage, setStage] = useState<TrackingStage>("preparing");
  const [startedAt, setStartedAt] = useState(() =>
    dateValue(new Date().toISOString())
  );
  const [expectedDays, setExpectedDays] = useState(9);
  const [cancelTracking, setCancelTracking] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const summary = selectedId
    ? (workspace.summaries.find(item => item.id === selectedId) ?? null)
    : null;
  const detail = workspace.detail;
  const currentJourney =
    detail?.journey ??
    (summary?.stage && summary.startedAt && summary.expectedDays
      ? {
          stage: summary.stage,
          branch: summary.branch ?? "dubai",
          startedAt: summary.startedAt,
          expectedDays: summary.expectedDays,
        }
      : null);
  const timeline = useMemo(() => {
    if (!currentJourney || !workspace.canDetails) return [];
    try {
      return trackingSchedule(currentJourney);
    } catch {
      return [];
    }
  }, [currentJourney, workspace.canDetails]);
  const availableStages = useMemo(() => {
    if (workspace.canSupervise)
      return stageIds.filter(id => id !== "arrived_office");
    if (workspace.role === "staff" && !workspace.canUpdateWarehouseStage)
      return [];
    if (!currentJourney) {
      if (detail?.status === "قيد التجهيز")
        return workspace.canUpdateWarehouseStage
          ? ["preparing" as TrackingStage]
          : [];
      // Sent from packing without a plan: the next stage starts the journey.
      return detail?.status === "في الطريق" && canNoteTracking(workspace.role)
        ? ["dubai_airport" as TrackingStage]
        : [];
    }
    if (!canNoteTracking(workspace.role)) return [];
    const next = stageIds[stageIds.indexOf(currentJourney.stage) + 1];
    return next &&
      (workspace.role === "staff"
        ? warehouseStageTargets
        : staffStageTargets
      ).includes(next)
      ? [next]
      : [];
  }, [
    currentJourney,
    workspace.canSupervise,
    workspace.role,
    workspace.canUpdateWarehouseStage,
    detail?.status,
  ]);
  const canCommand = workspace.canManageTracking;
  const canEditStage = workspace.canManageTracking;
  useEffect(() => {
    if (detail?.journey) {
      setStage(detail.journey.stage);
      setBranch(detail.journey.branch);
      setStartedAt(dateValue(detail.journey.startedAt));
      setExpectedDays(detail.journey.expectedDays);
    }
  }, [detail?.id, detail?.journey?.stage]);
  const selectedRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query
      ? workspace.summaries.filter(row =>
          [
            row.tracking,
            row.status,
            row.stage ?? "",
            ...(workspace.canDetails ? [row.id] : []),
          ].some(value => value.toLocaleLowerCase().includes(query))
        )
      : workspace.summaries;
  }, [search, workspace.canDetails, workspace.summaries]);
  const open = (id: string) =>
    setLocation(`/operations/tracking/${encodeURIComponent(id)}`);
  const closeDetail = () =>
    setLocation(
      `/operations/tracking${search ? `?search=${encodeURIComponent(search)}` : ""}`
    );
  const clearModal = () => {
    setModal(null);
    setReason("");
    setNote("");
    setCancelTracking("");
    setFormError(null);
  };
  const queue = async (command: TrackingCommand) => {
    if (!selectedId) return;
    const ok = await workspace.queue(selectedId, command);
    if (ok) clearModal();
  };
  const submit = () => {
    if (!selectedId) return;
    const trimmedReason = reason.trim();
    if (modal === "note") {
      if (!note.trim()) return setFormError(c.noteRequired);
      if (note.length > 2000) return setFormError(c.noteLimit);
      void queue({ type: "note", text: note.trim() });
      return;
    }
    if (!trimmedReason) return setFormError(c.reasonRequired);
    if (modal === "plan") {
      const parsed = new Date(`${startedAt}T12:00:00Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(startedAt) ||
        Number.isNaN(parsed.valueOf())
      )
        return setFormError(c.invalidDate);
      if (
        !Number.isInteger(expectedDays) ||
        expectedDays < 6 ||
        expectedDays > 365
      )
        return setFormError(c.expectedDaysInvalid);
      void queue({
        type: "plan",
        stage,
        startedAt: parsed.toISOString(),
        expectedDays,
        reason: trimmedReason,
      });
      return;
    }
    if (modal === "stage") {
      void queue({ type: "stage", stage, reason: trimmedReason });
      return;
    }
    if (modal === "transfer") {
      void queue({ type: "transfer", branch, reason: trimmedReason });
      return;
    }
    if (modal === "cancel") {
      if (cancelTracking.trim() !== (detail?.tracking ?? summary?.tracking))
        return setFormError(c.cancelTrackingRequired);
      void queue({ type: "cancel", reason: trimmedReason });
    }
  };
  const share = () => {
    if (!workspace.pending.length) return;
    const lines = workspace.pending.map((item, index) => {
      const command = item.command;
      const detail =
        command.type === "stage"
          ? `${c.stage}: ${stageLabel(language, command.stage)}`
          : command.type === "transfer"
            ? `${c.branch}: ${branchLabel(language, command.branch)}`
            : command.type === "note"
              ? `${c.note}: ${command.text}`
              : command.type === "plan"
                ? `${c.stage}: ${stageLabel(language, command.stage)} · ${c.expectedDays}: ${command.expectedDays}`
                : c.canceled;
      const why =
        "reason" in command ? ` · ${c.reason}: ${command.reason}` : "";
      return `${index + 1}. ${detail}${why}`;
    });
    if (
      !confirm(
        `${c.syncReview}\n${c.pending}: ${workspace.pending.length}\n${lines.join("\n")}`
      )
    )
      return;
    void workspace.share();
  };
  if (workspace.me.isLoading)
    return (
      <div className="min-h-screen bg-[#f7f8f5] p-8 text-[#112c43]">
        {c.loading}
      </div>
    );
  if (!workspace.authorized)
    return (
      <AuthGate
        copy={c}
        offlineCandidate={workspace.offlineCandidate}
        openOffline={workspace.openOffline}
        login={startLogin}
      />
    );
  const showLegacyOperations = canUseOperations(workspace.role);
  return (
    <div dir={dir} className="min-h-screen bg-[#f7f8f5] text-[#112c43]">
      <header className="border-b border-[#dce4e7] bg-white/95">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-3 sm:px-7">
          <div className="flex items-center gap-3">
            <button
              className="rounded-xl p-2 hover:bg-slate-100 md:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label={c.menu}
            >
              <Menu size={20} />
            </button>
            <img src={logo} className="h-9 w-9 rounded-xl" alt="Alrefqaa" />
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#b17b1f]">
                Alrefqaa · {c.nouakchottOffice}
              </div>
              <h1 className="text-xl font-bold text-[#092d50]">{c.title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`hidden rounded-full px-3 py-1 text-xs font-semibold sm:inline-flex ${workspace.online ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
            >
              {workspace.online ? c.online : c.offline}
            </span>
            <LanguageSwitcher />
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-[1440px]">
        <aside
          className={`${sidebarOpen ? "fixed inset-y-0 start-0 z-40 block w-72 shadow-2xl" : "hidden"} border-e border-[#dce4e7] bg-white p-4 md:relative md:block md:w-60 md:shrink-0 md:shadow-none`}
        >
          <div className="mb-5 flex items-center justify-between md:hidden">
            <strong>{c.title}</strong>
            <button onClick={() => setSidebarOpen(false)} aria-label={c.close}>
              <X size={19} />
            </button>
          </div>
          <nav className="grid gap-1 text-sm">
            <Link href="/" className="rounded-xl px-3 py-2 hover:bg-slate-50">
              Alrefqaa
            </Link>
            {showLegacyOperations && (
              <Link
                href="/operations"
                className="rounded-xl px-3 py-2 hover:bg-slate-50"
              >
                {c.operations}
              </Link>
            )}
            <Link
              href="/operations/tracking"
              className="rounded-xl bg-[#e8eff1] px-3 py-2 font-semibold text-[#092d50]"
            >
              {c.title}
            </Link>
            {workspace.canDetails && (
              <Link
                href="/operations?tab=shipments"
                className="rounded-xl px-3 py-2 hover:bg-slate-50"
              >
                {c.trackingNumber}
              </Link>
            )}
            {(workspace.role === "admin" ||
              workspace.role === "supervisor" ||
              workspace.role === "accountant") && (
              <Link
                href="/operations/reports"
                className="rounded-xl px-3 py-2 hover:bg-slate-50"
              >
                {c.reports}
              </Link>
            )}
            {(workspace.role === "admin" ||
              workspace.role === "accountant" ||
              workspace.role === "office_manager") && (
              <Link
                href="/operations/settings"
                className="rounded-xl px-3 py-2 hover:bg-slate-50"
              >
                {c.officeSettings}
              </Link>
            )}
          </nav>
          <div className="mt-8 rounded-2xl bg-[#f7f8f5] p-3 text-xs leading-6 text-[#718088]">
            {c.sourceCaution}
          </div>
        </aside>
        <main className="min-w-0 flex-1 p-4 sm:p-7">
          <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#b17b1f]">
                {c.nouakchottOffice} ·{" "}
                {workspace.role ? c.roles[workspace.role] : c.noRole}
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-[#092d50]">
                {selectedId ? c.details : c.title}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#718088]">
                {c.subtitle}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {workspace.canExport && !selectedId && (
                <button
                  onClick={() =>
                    exportReport(selectedRows, language, workspace.truncated)
                  }
                  className="inline-flex items-center gap-2 rounded-xl border border-[#dce4e7] bg-white px-4 py-2 text-sm font-semibold"
                >
                  <FileSpreadsheet size={16} />
                  {c.export}
                </button>
              )}
              <button
                onClick={workspace.refresh}
                className="rounded-xl border border-[#dce4e7] bg-white p-2"
                aria-label={c.loading}
              >
                <RefreshCw size={17} />
              </button>
            </div>
          </div>
          {workspace.notice && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {noticeText(workspace.notice, c)}
            </div>
          )}
          {workspace.auditError && (
            <div
              role="alert"
              className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
            >
              <span>{c.auditLoadError}</span>
              <button
                onClick={workspace.refresh}
                className="rounded-lg border border-red-200 bg-white px-3 py-1.5 font-semibold"
              >
                {c.retry}
              </button>
            </div>
          )}
          {workspace.offline && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <WifiOff size={16} />
              {c.localDataHint}
            </div>
          )}
          {!selectedId ? (
            <ListView
              copy={c}
              rows={selectedRows}
              search={search}
              setSearch={setSearch}
              open={open}
              loading={workspace.listLoading}
              truncated={workspace.truncated}
              total={workspace.total}
              language={language}
              canDetails={workspace.canDetails}
            />
          ) : (
            <DetailView
              dir={dir}
              copy={c}
              language={language}
              role={workspace.role}
              summary={summary}
              detail={detail}
              timeline={timeline}
              canDetails={workspace.canDetails}
              canSupervise={workspace.canSupervise}
              canTransfer={workspace.canTransfer}
              canEditStage={canEditStage}
              canCommand={canCommand}
              onBack={closeDetail}
              onModal={setModal}
            />
          )}
          {selectedId && workspace.pending.length > 0 && canCommand && (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="font-semibold">
                {c.pending} · {workspace.pending.length}
              </div>
              <p className="mt-1 text-sm text-amber-900">{c.pendingHint}</p>
            </div>
          )}
          {selectedId && workspace.canSupervise && !workspace.auditError && (
            <Audit
              copy={c}
              language={language}
              audit={workspace.audit?.items ?? []}
              onMore={workspace.nextAudit}
            />
          )}
        </main>
      </div>
      {modal && (
        <CommandModal
          copy={c}
          language={language}
          modal={modal}
          stage={stage}
          setStage={setStage}
          availableStages={availableStages}
          branch={branch}
          setBranch={setBranch}
          startedAt={startedAt}
          setStartedAt={setStartedAt}
          expectedDays={expectedDays}
          setExpectedDays={setExpectedDays}
          reason={reason}
          setReason={setReason}
          note={note}
          setNote={setNote}
          cancelTracking={cancelTracking}
          setCancelTracking={setCancelTracking}
          tracking={detail?.tracking ?? summary?.tracking ?? ""}
          error={formError}
          onClose={clearModal}
          onSubmit={submit}
        />
      )}
    </div>
  );
}

function AuthGate({
  copy: c,
  offlineCandidate,
  openOffline,
  login,
}: {
  copy: ReturnType<typeof languageCopy>;
  offlineCandidate: { userId: string; role: AppRole } | null;
  openOffline: () => void;
  login: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f8f5] p-6">
      <div className="w-full max-w-md rounded-3xl border border-[#dce4e7] bg-white p-8 text-center shadow-sm">
        <img
          src={logo}
          className="mx-auto mb-5 h-14 w-14 rounded-2xl"
          alt="Alrefqaa"
        />
        <h1 className="text-2xl font-bold text-[#092d50]">{c.title}</h1>
        <p className="mt-3 text-sm leading-6 text-[#718088]">
          {c.loginRequired}
        </p>
        <button
          onClick={login}
          className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#092d50] px-4 py-3 font-semibold text-white"
        >
          <LogIn size={17} />
          {c.login}
        </button>
        {offlineCandidate && (
          <button
            onClick={openOffline}
            className="mt-3 w-full rounded-xl border border-[#dce4e7] px-4 py-3 text-sm font-semibold"
          >
            {c.localData}
          </button>
        )}
      </div>
    </div>
  );
}

function ListView({
  copy: c,
  rows,
  search,
  setSearch,
  open,
  loading,
  truncated,
  total,
  language,
  canDetails,
}: {
  copy: ReturnType<typeof languageCopy>;
  rows: TrackingSummary[];
  search: string;
  setSearch: (value: string) => void;
  open: (id: string) => void;
  loading: boolean;
  truncated: boolean;
  total: number;
  language: TrackingLanguage;
  canDetails: boolean;
}) {
  const headings = canDetails
    ? [c.trackingNumber, c.shipmentId, c.status, c.open]
    : [c.trackingNumber, c.status, c.open];
  return (
    <section className="rounded-3xl border border-[#dce4e7] bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-[#dce4e7] p-4 sm:flex-row sm:items-center sm:justify-between">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={c.search}
          className={`${inputClass} w-full sm:max-w-md`}
        />
        <div className="text-xs text-[#718088]">
          {total} · {truncated && c.truncated}
        </div>
      </div>
      <div className="overflow-x-auto">
        {loading && !rows.length ? (
          <div className="p-8 text-sm text-[#718088]">{c.loading}</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center">
            <div className="font-semibold">{c.noData}</div>
            <p className="mt-2 text-sm text-[#718088]">{c.noDataHint}</p>
          </div>
        ) : (
          <table className="w-full min-w-[520px] text-start text-sm">
            <thead className="bg-[#f7f8f5] text-xs text-[#718088]">
              <tr>
                {headings.map((head, i) => (
                  <th key={i} className="px-4 py-3 font-semibold">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr
                  key={row.id}
                  className="border-t border-[#eef2f1] hover:bg-[#fbfcfb]"
                >
                  <td className="px-4 py-3 font-semibold text-[#092d50]">
                    {row.tracking}
                  </td>
                  {canDetails && (
                    <td className="px-4 py-3 text-[#718088]">{row.id}</td>
                  )}
                  <td className="px-4 py-3">{stateLabel(language, row, c)}</td>
                  <td className="px-4 py-3 text-end">
                    <button
                      onClick={() => open(row.id)}
                      className="rounded-lg px-3 py-1.5 font-semibold text-[#092d50] hover:bg-[#e8eff1]"
                    >
                      {c.open}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function DetailView({
  dir,
  copy: c,
  language,
  role,
  summary,
  detail,
  timeline,
  canDetails,
  canSupervise,
  canTransfer,
  canEditStage,
  canCommand,
  onBack,
  onModal,
}: {
  dir: "ltr" | "rtl";
  copy: ReturnType<typeof languageCopy>;
  language: TrackingLanguage;
  role: AppRole | null;
  summary: TrackingSummary | null;
  detail: any;
  timeline: any[];
  canDetails: boolean;
  canSupervise: boolean;
  canTransfer: boolean;
  canEditStage: boolean;
  canCommand: boolean;
  onBack: () => void;
  onModal: (modal: "plan" | "stage" | "note" | "transfer" | "cancel") => void;
}) {
  const shipment = detail ?? summary;
  const deleted = Boolean(shipment?.deleted);
  return (
    <section>
      <button
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-[#092d50]"
      >
        <ArrowLeft className={dir === "rtl" ? "rotate-180" : ""} size={16} />
        {c.back}
      </button>
      {!shipment ? (
        <div className="rounded-2xl bg-white p-6">{c.noData}</div>
      ) : (
        <>
          <div className="rounded-3xl border border-[#dce4e7] bg-white p-5 shadow-sm">
            <div className="flex flex-col justify-between gap-4 lg:flex-row">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#b17b1f]">
                  {c.trackingNumber}
                </div>
                <h3 className="mt-1 text-2xl font-bold text-[#092d50]">
                  {shipment.tracking}
                </h3>
                <div className="mt-2 text-sm text-[#718088]">
                  {c.shipmentId}: {shipment.id}
                </div>
              </div>
              <div className="rounded-2xl bg-[#e8eff1] px-4 py-3 text-sm font-semibold">
                {deleted ? c.canceled : statusLabel(language, shipment.status)}
              </div>
            </div>
            {canDetails && (
              <div className="mt-6 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <Info
                  label={c.stage}
                  value={
                    shipment.journey?.stage
                      ? stageLabel(language, shipment.journey.stage)
                      : summary?.stage
                        ? stageLabel(language, summary.stage)
                        : statusLabel(language, shipment.status)
                  }
                />
                {detail?.route && <Info label={c.route} value={detail.route} />}
                {detail?.service && (
                  <Info label={c.service} value={detail.service} />
                )}
                {detail?.employee && (
                  <Info label={c.employee} value={String(detail.employee)} />
                )}
                {detail?.cargo && (
                  <Info label={c.cargo} value={String(detail.cargo)} />
                )}
              </div>
            )}
          </div>
          {canDetails && !deleted && canCommand && (
            <div className="mt-5 flex flex-wrap gap-2">
              {canSupervise && (
                <button
                  onClick={() => onModal("plan")}
                  className="rounded-xl bg-[#092d50] px-4 py-2 text-sm font-semibold text-white"
                >
                  {c.createPlan}
                </button>
              )}
              {canEditStage && (
                <button
                  onClick={() => onModal("note")}
                  className="rounded-xl border border-[#dce4e7] bg-white px-4 py-2 text-sm font-semibold"
                >
                  {c.addNote}
                </button>
              )}
              {canEditStage && (
                <button
                  onClick={() => onModal("stage")}
                  className="rounded-xl border border-[#dce4e7] bg-white px-4 py-2 text-sm font-semibold"
                >
                  {c.editStage}
                </button>
              )}
              {canSupervise && canTransfer && role !== "office_manager" && (
                <button
                  onClick={() => onModal("transfer")}
                  className="rounded-xl border border-[#dce4e7] bg-white px-4 py-2 text-sm font-semibold"
                >
                  {c.transfer}
                </button>
              )}
              {role === "admin" && (
                <button
                  onClick={() => onModal("cancel")}
                  className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700"
                >
                  {c.cancelShipment}
                </button>
              )}
            </div>
          )}
        </>
      )}
      {canDetails && timeline.length > 0 && (
        <div className="mt-5 rounded-3xl border border-[#dce4e7] bg-white p-5">
          <h3 className="mb-4 text-lg font-bold">{c.timeline}</h3>
          <div className="grid gap-3">
            {timeline.map(item => (
              <div
                key={item.id}
                title={item.days === 0 ? c.finalStep : undefined}
                className={`rounded-2xl border p-4 ${item.state === "current" ? "border-[#d9a441] bg-[#fffaf0]" : "border-[#eef2f1]"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{stageLabel(language, item.id)}</strong>
                  <span className="text-xs text-[#718088]">
                    {item.state === "current"
                      ? c.current
                      : item.state === "completed"
                        ? c.previousInSequence
                        : c.planned}{" "}
                    · {c.allocatedDays}: {item.days} {c.days} · {c.baseDuration}
                    : {item.min}–{item.max}
                  </span>
                </div>
                <div className="mt-2 text-xs text-[#718088]">
                  {new Date(item.startsAt).toLocaleDateString(language)} –{" "}
                  {new Date(item.endsAt).toLocaleDateString(language)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {canDetails && detail?.journey?.notes?.length > 0 && (
        <div className="mt-5 rounded-3xl border border-[#dce4e7] bg-white p-5">
          <h3 className="mb-4 text-lg font-bold">{c.note}</h3>
          <div className="grid gap-3">
            {detail.journey.notes.map(
              (item: {
                id: string;
                actorName: string;
                at: string;
                text: string;
              }) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-[#eef2f1] p-4"
                >
                  <div className="flex flex-wrap justify-between gap-2 text-xs text-[#718088]">
                    <span>{item.actorName}</span>
                    <span>{new Date(item.at).toLocaleString(language)}</span>
                  </div>
                  <p className="mt-2 text-sm">{item.text}</p>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </section>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-[#718088]">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}
function Audit({
  copy: c,
  language,
  audit,
  onMore,
}: {
  copy: ReturnType<typeof languageCopy>;
  language: TrackingLanguage;
  audit: Array<{
    id: number;
    actorName: string;
    actorRole: AppRole;
    at: string;
    action: string;
    version?: number;
  }>;
  onMore: (() => void) | null;
}) {
  return (
    <section className="mt-5 rounded-3xl border border-[#dce4e7] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold">{c.audit}</h3>
          <p className="mt-1 text-xs text-[#718088]">{c.auditAppendOnly}</p>
        </div>
        <ShieldCheck size={20} className="text-[#b17b1f]" />
      </div>
      {audit.length ? (
        <div className="mt-4 grid gap-2">
          {audit.map(row => (
            <div
              key={row.id}
              className="grid gap-1 rounded-xl bg-[#f7f8f5] p-3 text-xs sm:grid-cols-4"
            >
              <span>
                {row.actorName} ·{" "}
                {c.roles[row.actorRole as keyof typeof c.roles]}
              </span>
              <span>{row.action}</span>
              <span>{new Date(row.at).toLocaleString(language)}</span>
              <span>
                {c.version}: {row.version ?? "—"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 text-sm text-[#718088]">{c.noData}</div>
      )}
      {onMore && (
        <button
          onClick={onMore}
          className="mt-4 rounded-xl border border-[#dce4e7] px-3 py-2 text-xs font-semibold"
        >
          {c.nextAudit}
        </button>
      )}
    </section>
  );
}
function CommandModal({
  copy: c,
  language,
  modal,
  stage,
  setStage,
  availableStages,
  branch,
  setBranch,
  startedAt,
  setStartedAt,
  expectedDays,
  setExpectedDays,
  reason,
  setReason,
  note,
  setNote,
  cancelTracking,
  setCancelTracking,
  tracking,
  error,
  onClose,
  onSubmit,
}: any) {
  const title =
    modal === "plan"
      ? c.createPlan
      : modal === "stage"
        ? c.editStage
        : modal === "note"
          ? c.addNote
          : modal === "transfer"
            ? c.transfer
            : c.cancelConfirm;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-[#092d50]">{title}</h2>
          <button onClick={onClose} aria-label={c.close}>
            <X size={19} />
          </button>
        </div>
        <div className="mt-5 grid gap-4">
          {(modal === "plan" || modal === "stage") && (
            <label className="grid gap-1.5 text-sm font-semibold">
              {c.stage}
              <select
                value={stage}
                onChange={e => setStage(e.target.value)}
                className={inputClass}
              >
                {availableStages.map((id: TrackingStage) => (
                  <option key={id} value={id}>
                    {stageLabel(language, id)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {modal === "plan" && (
            <>
              <label className="grid gap-1.5 text-sm font-semibold">
                {c.startedAt}
                <input
                  type="date"
                  value={startedAt}
                  onChange={e => setStartedAt(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold">
                {c.expectedDays}
                <input
                  type="number"
                  min={6}
                  max={365}
                  value={expectedDays}
                  onChange={e => setExpectedDays(Number(e.target.value))}
                  className={inputClass}
                />
                <span className="text-xs font-normal text-[#718088]">
                  {c.minDays}: 6 · {c.maxDays}: 365
                </span>
              </label>
            </>
          )}
          {modal === "transfer" && (
            <label className="grid gap-1.5 text-sm font-semibold">
              {c.branch}
              <select
                value={branch}
                onChange={e => setBranch(e.target.value)}
                className={inputClass}
              >
                {branchIds.map(id => (
                  <option key={id} value={id}>
                    {branchLabel(language, id)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {modal === "cancel" && (
            <>
              <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
                {c.confirmationCancel}
              </p>
              <label className="grid gap-1.5 text-sm font-semibold">
                {c.cancelTrackingInput}
                <input
                  value={cancelTracking}
                  onChange={e => setCancelTracking(e.target.value)}
                  className={inputClass}
                />
              </label>
            </>
          )}
          {modal === "note" && (
            <label className="grid gap-1.5 text-sm font-semibold">
              {c.note}
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                maxLength={2000}
                rows={5}
                className="rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-[#56849a]"
              />
            </label>
          )}
          {modal !== "note" && (
            <label className="grid gap-1.5 text-sm font-semibold">
              {c.reason}
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                maxLength={500}
                rows={4}
                className="rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-[#56849a]"
              />
            </label>
          )}
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-xl border border-[#dce4e7] px-4 py-2 text-sm font-semibold"
            >
              {c.cancel}
            </button>
            <button
              onClick={onSubmit}
              className="rounded-xl bg-[#092d50] px-4 py-2 text-sm font-semibold text-white"
            >
              {c.save}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
