import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  ArrowDownToLine,
  Bell,
  Check,
  CircleDollarSign,
  Cloud,
  CloudOff,
  Download,
  FileSpreadsheet,
  LayoutDashboard,
  Menu,
  Package,
  Plus,
  RefreshCw,
  ShieldCheck,
  Truck,
  Upload,
  Users,
  Wifi,
  X,
} from "lucide-react";
import { startLogin } from "@/const";
import { useLanguage } from "@/contexts/LanguageContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { trpc } from "@/lib/trpc";
import {
  exportAccountsWorkbook,
  exportAccountsTemplate,
  exportImportReport,
  parseAccountsWorkbook,
  type ImportResult,
} from "@/lib/excel";
import {
  applySyncResult,
  downloadLocalArchive,
  loadWorkspace,
  mergeSnapshot,
  saveWorkspace,
  stageChange,
  type Workspace,
} from "@/lib/offlineStore";
import type {
  Account,
  AppRole,
  Entity,
  EntityRecord,
  Invoice,
  LocalState,
  PendingChange,
  Shipment,
  SyncResult,
} from "@shared/operations";
import { canViewFinance, canWrite } from "@shared/operations";
import {
  operationsCopy,
  type OperationsLanguage,
  type OperationsCopy,
} from "@/lib/operationsCopy";
import {
  Field,
  inputClass,
  Modal,
  ScopeBadge,
  SearchBox,
  StatusBadge,
} from "@/components/operations/OperationsPrimitives";

const logo = "/icons/logo.webp";
type Tab = "overview" | "shipments" | "accounts" | "invoices" | "access";
type NoticeTone = "ok" | "error" | "info";
type Notice = { tone: NoticeTone; text: string } | null;
type OfflineProfile = { userId: string; name: string; role: AppRole | null };
const MAX_MONEY = 999999999;
const ROLE_VALUES: AppRole[] = ["admin", "staff", "accountant", "viewer"];
const OFFLINE_PROFILE_KEY = "alrefqaa-operations-last-profile-v1";
function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && ROLE_VALUES.includes(value as AppRole);
}
function readOfflineProfile(): OfflineProfile | null {
  if (
    typeof window === "undefined" ||
    typeof navigator === "undefined" ||
    navigator.onLine
  )
    return null;
  try {
    const value = JSON.parse(
      window.localStorage.getItem(OFFLINE_PROFILE_KEY) ?? "null"
    ) as Partial<OfflineProfile> | null;
    if (
      !value?.userId ||
      !/^\d+$/.test(String(value.userId)) ||
      (value.role !== null &&
        value.role !== undefined &&
        !isAppRole(value.role))
    )
      return null;
    return {
      userId: String(value.userId),
      name: String(value.name ?? ""),
      role: value.role ?? null,
    };
  } catch {
    return null;
  }
}
const emptyState: LocalState = {
  accounts: [],
  shipments: [],
  invoices: [],
  lastSyncedAt: null,
};

function languageCopy(language: string): OperationsCopy {
  return operationsCopy[
    (language as OperationsLanguage) in operationsCopy
      ? (language as OperationsLanguage)
      : "ar"
  ];
}
function roleText(role: AppRole | null, c: OperationsCopy) {
  return role ? c[role] : c.noRole;
}
function formatAmount(value: number, language: string) {
  return new Intl.NumberFormat(language === "ar" ? "ar-MR" : language, {
    maximumFractionDigits: 2,
  }).format(value);
}
function displayState(state: LocalState, showFinance: boolean): LocalState {
  if (showFinance) return state;
  return {
    ...state,
    accounts: state.accounts.map(account => ({ ...account, balance: 0 })),
    shipments: state.shipments.map(shipment => ({ ...shipment, amount: 0 })),
    invoices: [],
  };
}
function sanitizedAccounts(accounts: Account[], showFinance: boolean) {
  return showFinance
    ? accounts
    : accounts.map(account => ({ ...account, balance: 0 }));
}
function dateText(value: string | null, c: OperationsCopy) {
  return value ? new Date(value).toLocaleString() : c.never;
}
function scopeLabels(c: OperationsCopy) {
  return { shared: c.shared, local: c.local, pending: c.pending };
}
function statusLabel(status: string, c: OperationsCopy) {
  if (status === "في الطريق") return c.inTransit;
  if (status === "وصلت للمكتب") return c.arrived;
  if (status === "جاهزة للتسليم") return c.ready;
  if (status === "مدفوعة") return c.paid;
  return c.awaitingPayment;
}
function serviceLabel(service: string, c: OperationsCopy) {
  if (service === "جوي") return c.air;
  if (service === "بحري") return c.sea;
  return c.express;
}

export default function Operations() {
  const { language, dir } = useLanguage();
  const c = languageCopy(language);
  const me = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const userId = me.data?.id == null ? null : String(me.data.id);
  const access = trpc.operations.access.useQuery(undefined, {
    enabled: Boolean(userId),
    retry: false,
  });
  const role = access.data?.role ?? null;
  const snapshot = trpc.operations.snapshot.useQuery(undefined, {
    enabled: Boolean(userId && role),
    retry: false,
  });
  const syncMutation = trpc.operations.sync.useMutation();
  const tabAccess = trpc.operations.members.useQuery(undefined, {
    enabled: role === "admin",
    retry: false,
  });
  const setRoleMutation = trpc.operations.setRole.useMutation();
  const [tab, setTab] = useState<Tab>("overview");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const workspaceRef = useRef<Workspace | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const [notice, setNotice] = useState<Notice>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"account" | "shipment" | "invoice" | null>(
    null
  );
  const [editing, setEditing] = useState<Account | Shipment | Invoice | null>(
    null
  );
  const [importPreview, setImportPreview] = useState<ImportResult | null>(null);
  const [conflicts, setConflicts] = useState<SyncResult["conflicts"]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [offlineUser, setOfflineUser] = useState<OfflineProfile | null>(null);
  const offlineCandidate = readOfflineProfile();
  const offlineMode = !me.data && Boolean(offlineUser);
  const effectiveUserId =
    userId ?? (offlineMode ? (offlineUser?.userId ?? null) : null);
  const effectiveRole = offlineMode ? (offlineUser?.role ?? null) : role;
  const showFinance = canViewFinance(effectiveRole);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  useEffect(() => {
    if (!effectiveUserId) return;
    try {
      const loaded = loadWorkspace(effectiveUserId);
      workspaceRef.current = loaded;
      setWorkspace(loaded);
      setWorkspaceError(null);
    } catch (error) {
      workspaceRef.current = null;
      setWorkspace(null);
      setWorkspaceError(error instanceof Error ? error.message : c.saveError);
    }
  }, [effectiveUserId]);
  useEffect(() => {
    if (!userId || !access.data) return;
    try {
      window.localStorage.setItem(
        OFFLINE_PROFILE_KEY,
        JSON.stringify({
          userId,
          name: me.data?.name ?? me.data?.email ?? "",
          role: access.data.role,
        } satisfies OfflineProfile)
      );
    } catch {
      /* optional profile cache, no credentials */
    }
  }, [access.data, me.data, userId]);
  useEffect(() => {
    let cancelled = false;
    if (!userId || !snapshot.data)
      return () => {
        cancelled = true;
      };
    const latest = workspaceRef.current;
    if (!latest)
      return () => {
        cancelled = true;
      };
    void (async () => {
      try {
        const next = mergeSnapshot(latest, snapshot.data);
        await saveWorkspace(userId, next);
        if (!cancelled) {
          workspaceRef.current = next;
          setWorkspace(next);
        }
      } catch (error) {
        if (!cancelled)
          setNotice({
            tone: "error",
            text: error instanceof Error ? error.message : c.saveError,
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [snapshot.data, userId]);

  const rawState = workspace?.state ?? emptyState;
  const state = displayState(rawState, showFinance);
  const queue = workspace?.queue ?? [];
  const notify = (text: string, tone: NoticeTone = "ok") => {
    setNotice({ text, tone });
    window.setTimeout(() => setNotice(null), 4200);
  };
  const writeLocal = async (
    entity: Entity,
    data: Account | Shipment | Invoice,
    label: string
  ) => {
    const current = workspaceRef.current;
    if (!effectiveUserId || !current || !canWrite(effectiveRole, entity)) {
      notify(c.accessDenied, "error");
      return false;
    }
    try {
      const safeData =
        !showFinance && entity === "account"
          ? { ...(data as Account), balance: 0 }
          : !showFinance && entity === "shipment"
            ? { ...(data as Shipment), amount: 0 }
            : data;
      const next = stageChange(current, entity, safeData, label);
      await saveWorkspace(effectiveUserId, next);
      workspaceRef.current = next;
      setWorkspace(next);
      notify(c.savedDraft);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : c.saveError, "error");
      return false;
    }
  };
  const handleSync = async () => {
    const current = workspaceRef.current;
    if (!current || !userId || offlineMode || !online) {
      if (!online) notify(c.offline, "error");
      return;
    }
    if (!current.queue.length) {
      notify(c.noPending, "info");
      return;
    }
    const batch = current.queue.slice(0, 500);
    const remaining = current.queue.length - batch.length;
    if (
      !window.confirm(
        `${c.confirmSync}\n\n${batch.map(item => `• ${item.label}`).join("\n")}${remaining ? `\n\n${remaining} ${c.remaining}` : ""}`
      )
    )
      return;
    try {
      const result = await syncMutation.mutateAsync({ changes: batch });
      const latest = workspaceRef.current ?? current;
      const next = applySyncResult(latest, result);
      await saveWorkspace(userId, next);
      workspaceRef.current = next;
      setWorkspace(next);
      setConflicts(result.conflicts);
      if (result.conflicts.length)
        notify(
          `${result.applied.length} ${c.applied} · ${result.conflicts.length} ${c.conflicts}`,
          "info"
        );
      else if (result.applied.length)
        notify(
          `${c.syncSuccess}${remaining ? ` (${remaining} ${c.remaining})` : ""}`
        );
      else notify(c.syncNoApplied, "info");
    } catch (error) {
      notify(error instanceof Error ? error.message : c.syncError, "error");
    }
  };
  const resolveConflict = async (
    conflict: SyncResult["conflicts"][number],
    useServer: boolean
  ) => {
    const current = workspaceRef.current;
    if (!current || !userId) return;
    const pending = current.queue.find(item => item.id === conflict.changeId);
    if (!pending) return;
    try {
      if (useServer) {
        if (!conflict.current || !window.confirm(c.useServerConfirm)) return;
        downloadLocalArchive(userId);
      }
      const result: SyncResult = {
        applied:
          useServer && conflict.current
            ? [
                {
                  changeId: conflict.changeId,
                  entity: pending.entity,
                  record: conflict.current,
                },
              ]
            : [],
        conflicts: [],
      };
      const next = applySyncResult(current, result);
      await saveWorkspace(userId, next);
      workspaceRef.current = next;
      setWorkspace(next);
      setConflicts(items =>
        items.filter(item => item.changeId !== conflict.changeId)
      );
      if (!useServer) notify(c.keepLocal);
      else notify(c.useServer);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : c.operationError,
        "error"
      );
    }
  };
  const handleImportFile = async (file?: File) => {
    const current = workspaceRef.current;
    if (
      !file ||
      !current ||
      !effectiveUserId ||
      !canWrite(effectiveRole, "account")
    )
      return notify(c.accessDenied, "error");
    try {
      setImportPreview(
        await parseAccountsWorkbook(
          file,
          current.state.accounts.map(account => account.id)
        )
      );
    } catch (error) {
      notify(
        error instanceof Error ? error.message : c.operationError,
        "error"
      );
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };
  const confirmImport = async () => {
    const current = workspaceRef.current;
    if (
      !importPreview ||
      !current ||
      !effectiveUserId ||
      !canWrite(effectiveRole, "account")
    ) {
      notify(c.accessDenied, "error");
      return;
    }
    const ids = new Set(current.state.accounts.map(account => account.id));
    const available = importPreview.rows.filter(row => !ids.has(row.id));
    if (available.length !== importPreview.rows.length)
      notify(
        `${importPreview.rows.length - available.length} ${c.duplicate}`,
        "error"
      );
    if (!available.length) {
      setImportPreview(null);
      return;
    }
    const safeRows = available.map(row =>
      showFinance ? row : { ...row, balance: 0 }
    );
    try {
      const nextState = {
        ...current.state,
        accounts: [...safeRows, ...current.state.accounts],
      };
      const draft = { ...current, state: nextState };
      const staged = stageChange(
        draft,
        "account",
        safeRows[0],
        `${c.import} ${safeRows.length} ${c.accounts}`
      );
      const final = safeRows
        .slice(1)
        .reduce(
          (currentDraft, account) =>
            stageChange(
              currentDraft,
              "account",
              account,
              `${c.import} ${c.accountEntity} ${account.id}`
            ),
          staged
        );
      await saveWorkspace(effectiveUserId, final);
      workspaceRef.current = final;
      setWorkspace(final);
      notify(c.savedDraft);
    } catch (error) {
      notify(error instanceof Error ? error.message : c.saveError, "error");
    }
    setImportPreview(null);
  };

  if ((me.isLoading && online) || (!offlineMode && access.isLoading))
    return <Gate title={c.loading} c={c} />;
  if (!me.data && !offlineUser)
    return (
      <Gate
        title={c.loginRequired}
        c={c}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <button
              onClick={() => startLogin()}
              className="rounded-xl bg-sky-900 px-4 py-2 font-bold text-white"
            >
              {c.login}
            </button>
            {offlineCandidate && (
              <button
                onClick={() => setOfflineUser(offlineCandidate)}
                className="rounded-xl border border-slate-300 px-4 py-2 font-bold text-slate-700"
              >
                {c.localData}
              </button>
            )}
          </div>
        }
      />
    );
  if (!offlineMode && (me.isError || !me.data))
    return (
      <Gate
        title={c.loginRequired}
        c={c}
        action={
          <button
            onClick={() => startLogin()}
            className="rounded-xl bg-sky-900 px-4 py-2 font-bold text-white"
          >
            {c.login}
          </button>
        }
      />
    );
  if (!offlineMode && (access.isError || !access.data || !role))
    return <Gate title={c.accessDenied} c={c} />;
  if (workspaceError)
    return (
      <Gate
        title={c.recoverStorage}
        c={c}
        archiveUserId={effectiveUserId ?? undefined}
        action={
          <div className="grid gap-3">
            <p className="text-red-700">{workspaceError}</p>
            <p className="text-sm">{c.archiveHint}</p>
            <Link href="/" className="font-bold">
              {c.backHome}
            </Link>
            <button
              onClick={() => downloadLocalArchive(effectiveUserId ?? undefined)}
              className="rounded-xl bg-sky-900 px-4 py-2 font-bold text-white"
            >
              {c.archive}
            </button>
          </div>
        }
      />
    );

  const visibleTabs: { id: Tab; label: string; icon: typeof Package }[] = [
    { id: "overview", label: c.overview, icon: LayoutDashboard },
    { id: "shipments", label: c.shipments, icon: Package },
    { id: "accounts", label: c.accounts, icon: Users },
    ...(showFinance
      ? [{ id: "invoices" as Tab, label: c.invoices, icon: CircleDollarSign }]
      : []),
    ...(effectiveRole === "admin" && !offlineMode
      ? [{ id: "access" as Tab, label: c.access, icon: ShieldCheck }]
      : []),
  ];
  const filteredAccounts = state.accounts.filter(item =>
    `${item.id} ${item.name} ${item.phone} ${item.city}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase())
  );
  const filteredShipments = state.shipments.filter(item =>
    `${item.id} ${item.tracking} ${item.account} ${item.route}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase())
  );
  const filteredInvoices = state.invoices.filter(item =>
    `${item.id} ${item.account}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase())
  );
  const setCurrentTab = (next: Tab) => {
    if (next === "invoices" && !canViewFinance(effectiveRole)) return;
    if (next === "access" && (effectiveRole !== "admin" || offlineMode)) return;
    setTab(next);
    setSearch("");
    setSidebarOpen(false);
  };
  return (
    <div dir={dir} className="min-h-screen bg-slate-50 text-slate-900">
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={event => void handleImportFile(event.target.files?.[0])}
      />
      {notice && (
        <div
          className={`fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg ${notice.tone === "error" ? "bg-red-700" : notice.tone === "info" ? "bg-slate-800" : "bg-emerald-700"}`}
          role="status"
        >
          {notice.text}
        </div>
      )}
      <aside
        className={`fixed inset-y-0 start-0 z-40 w-72 bg-sky-950 p-5 text-white transition-transform lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : dir === "rtl" ? "translate-x-full" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <img
              src={logo}
              alt=""
              className="h-10 w-10 rounded-xl object-cover"
            />
            <div>
              <div className="font-bold">{c.title}</div>
              <div className="text-[10px] text-white/60">
                {roleText(effectiveRole, c)}
              </div>
            </div>
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden">
            <X size={18} />
          </button>
        </div>
        <div className="mt-8 rounded-xl border border-white/10 p-3 text-xs">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${online ? "bg-emerald-300" : "bg-amber-300"}`}
            />
            {online ? c.online : c.offline}
          </div>
          <div className="mt-2 text-white/70">
            {queue.length} {c.pending}
          </div>
        </div>
        <nav className="mt-6 grid gap-1">
          {visibleTabs.map(item => (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`flex items-center gap-3 rounded-xl px-3 py-3 text-start text-sm font-semibold ${tab === item.id ? "bg-white text-sky-950" : "text-white/75 hover:bg-white/10"}`}
            >
              <item.icon size={17} />
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <div className="lg:ms-72">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200 bg-slate-50/95 px-5 py-4 backdrop-blur-lg lg:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-xl border border-slate-200 bg-white p-2 lg:hidden"
            >
              <Menu size={18} />
            </button>
            <div>
              <div className="text-xs text-slate-500">{c.title}</div>
              <h1 className="mt-1 text-xl font-bold">
                {tab === "overview"
                  ? c.greeting
                  : visibleTabs.find(item => item.id === tab)?.label}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <span className="hidden items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold sm:flex">
              {online ? <Wifi size={14} /> : <CloudOff size={14} />}
              {online ? c.online : c.offline}
            </span>
            <div className="hidden rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs sm:block">
              {me.data?.name ?? me.data?.email ?? roleText(effectiveRole, c)}
            </div>
          </div>
        </header>
        <main className="space-y-6 p-5 lg:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Link href="/" className="hover:text-sky-800">
                {c.title}
              </Link>
              <span>/</span>
              <span>{visibleTabs.find(item => item.id === tab)?.label}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() =>
                  downloadLocalArchive(effectiveUserId ?? undefined)
                }
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold"
              >
                <Download size={15} />
                {c.archive}
              </button>
              <button
                onClick={() => {
                  setEditing(null);
                  setModal("account");
                }}
                disabled={!canWrite(effectiveRole, "account")}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold disabled:opacity-40"
              >
                <Plus size={15} />
                {c.newAccount}
              </button>
              <button
                onClick={() => {
                  setEditing(null);
                  setModal("shipment");
                }}
                disabled={!canWrite(effectiveRole, "shipment")}
                className="inline-flex items-center gap-2 rounded-xl bg-sky-950 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                <Plus size={15} />
                {c.newShipment}
              </button>
            </div>
          </div>
          {snapshot.isError && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              <span>
                {c.snapshotError} · {c.localData}
              </span>
              <button
                onClick={() => void snapshot.refetch()}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 font-bold"
              >
                <RefreshCw size={15} />
                {c.retrySnapshot}
              </button>
            </div>
          )}
          {offlineMode && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              {c.localWarning} ({roleText(effectiveRole, c)})
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-white p-2 text-emerald-700">
                {online ? <Cloud size={18} /> : <CloudOff size={18} />}
              </div>
              <div>
                <div className="text-sm font-bold text-emerald-900">
                  {online ? c.online : c.offline}
                </div>
                <div className="text-xs text-emerald-800/70">
                  {c.synced}:{" "}
                  {snapshot.isError
                    ? c.localData
                    : dateText(state.lastSyncedAt, c)}{" "}
                  · {c.reviewHint}
                </div>
              </div>
            </div>
            <button
              onClick={handleSync}
              disabled={
                syncMutation.isPending ||
                !queue.length ||
                !online ||
                !effectiveUserId ||
                offlineMode
              }
              className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-bold text-emerald-800 disabled:opacity-40"
            >
              <RefreshCw
                size={15}
                className={syncMutation.isPending ? "animate-spin" : ""}
              />
              {c.sync} ({queue.length})
            </button>
          </div>
          {conflicts.length > 0 && (
            <ConflictPanel
              conflicts={conflicts}
              queue={queue}
              c={c}
              onKeep={item => resolveConflict(item, false)}
              onServer={item => resolveConflict(item, true)}
            />
          )}
          {tab === "overview" && (
            <Overview
              state={state}
              c={c}
              role={effectiveRole}
              showFinance={showFinance}
              language={language}
              onTab={setCurrentTab}
            />
          )}
          {tab === "shipments" && (
            <Shipments
              items={filteredShipments}
              state={state}
              c={c}
              search={search}
              setSearch={setSearch}
              onEdit={item => {
                setEditing(item);
                setModal("shipment");
              }}
              canEdit={canWrite(effectiveRole, "shipment")}
              showFinance={showFinance}
            />
          )}
          {tab === "accounts" && (
            <Accounts
              items={filteredAccounts}
              all={state.accounts}
              state={state}
              c={c}
              search={search}
              setSearch={setSearch}
              onEdit={item => {
                setEditing(item);
                setModal("account");
              }}
              canEdit={canWrite(effectiveRole, "account")}
              language={language}
              onImport={() => inputRef.current?.click()}
              onExport={() =>
                exportAccountsWorkbook(
                  sanitizedAccounts(rawState.accounts, showFinance)
                )
              }
              onTemplate={exportAccountsTemplate}
              showFinance={showFinance}
            />
          )}
          {tab === "invoices" && (
            <Invoices
              items={filteredInvoices}
              state={state}
              c={c}
              search={search}
              setSearch={setSearch}
              onNew={() => {
                setEditing(null);
                setModal("invoice");
              }}
              onEdit={item => {
                setEditing(item);
                setModal("invoice");
              }}
              canEdit={canWrite(effectiveRole, "invoice")}
              language={language}
            />
          )}
          {tab === "access" && (
            <Access
              c={c}
              members={tabAccess.data ?? []}
              currentUserId={userId}
              pending={setRoleMutation.isPending}
              onSetRole={async (memberId, nextRole) => {
                if (
                  !ROLE_VALUES.includes(nextRole) ||
                  String(memberId) === userId
                )
                  return notify(c.accessDenied, "error");
                try {
                  await setRoleMutation.mutateAsync({
                    userId: Number(memberId),
                    role: nextRole,
                  });
                  await tabAccess.refetch();
                  notify(c.roleSaved);
                } catch (error) {
                  notify(
                    error instanceof Error ? error.message : c.operationError,
                    "error"
                  );
                }
              }}
            />
          )}
        </main>
      </div>
      {modal && (
        <EntityModal
          kind={modal}
          editing={editing}
          state={rawState}
          c={c}
          showFinance={showFinance}
          onClose={() => setModal(null)}
          onSave={async (entity, data, label) => {
            if (await writeLocal(entity, data, label)) setModal(null);
          }}
        />
      )}
      {importPreview && (
        <ImportModal
          result={importPreview}
          c={c}
          language={language}
          onClose={() => setImportPreview(null)}
          onConfirm={confirmImport}
          onReport={() => exportImportReport(importPreview)}
        />
      )}
    </div>
  );
}

function Gate({
  title,
  c,
  action,
  archiveUserId,
}: {
  title: string;
  c: OperationsCopy;
  action?: React.ReactNode;
  archiveUserId?: string;
}) {
  return (
    <div
      dir="auto"
      className="flex min-h-screen items-center justify-center bg-slate-50 p-5"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <Link href="/" className="text-sm font-bold text-sky-800">
            {c.backHome}
          </Link>
          <LanguageSwitcher />
        </div>
        <img src={logo} alt="" className="mx-auto mb-5 h-14 w-14 rounded-2xl" />
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {action && <div className="mt-5">{action}</div>}
        {archiveUserId && (
          <button
            onClick={() => downloadLocalArchive(archiveUserId)}
            className="mt-4 text-sm font-bold text-sky-800"
          >
            {c.archive}
          </button>
        )}
      </div>
    </div>
  );
}

function Overview({
  state,
  c,
  role,
  showFinance,
  language,
  onTab,
}: {
  state: LocalState;
  c: OperationsCopy;
  role: AppRole | null;
  showFinance: boolean;
  language: string;
  onTab: (tab: Tab) => void;
}) {
  const inTransit = state.shipments.filter(
    item => item.status === "في الطريق"
  ).length;
  const receivables = state.accounts.reduce(
    (sum, item) => sum + item.balance,
    0
  );
  return (
    <>
      <div
        className={`grid gap-4 sm:grid-cols-2 ${showFinance ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}
      >
        <Metric
          icon={Package}
          label={c.activeShipments}
          value={String(state.shipments.length)}
        />
        <Metric icon={Truck} label={c.inTransit} value={String(inTransit)} />
        <Metric
          icon={Users}
          label={c.accounts}
          value={String(state.accounts.length)}
        />
        {showFinance && (
          <Metric
            icon={CircleDollarSign}
            label={c.receivables}
            value={formatAmount(receivables, language)}
          />
        )}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.4fr_.6fr]">
        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 p-5">
            <div>
              <h2 className="font-bold">{c.shipments}</h2>
              <p className="mt-1 text-xs text-slate-500">{c.counts}</p>
            </div>
            <button
              onClick={() => onTab("shipments")}
              className="text-sm font-bold text-sky-800"
            >
              {c.all}
            </button>
          </div>
          {state.shipments.slice(0, 5).map(item => (
            <div
              key={item.id}
              className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4 last:border-0"
            >
              <div className="rounded-xl bg-slate-100 p-2 text-sky-800">
                <Package size={16} />
              </div>
              <div className="min-w-[160px] flex-1">
                <div className="font-bold">{item.tracking}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {item.account} · {item.route}
                </div>
              </div>
              <StatusBadge label={statusLabel(item.status, c)} />
              <ScopeBadge scope={item.scope} labels={scopeLabels(c)} />
            </div>
          ))}
          {state.shipments.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">
              {c.noData}
            </div>
          )}
        </section>
        <section className="rounded-2xl bg-sky-950 p-6 text-white">
          <ShieldCheck size={22} className="text-amber-300" />
          <h2 className="mt-4 text-xl font-bold">{roleText(role, c)}</h2>
          <p className="mt-3 text-sm leading-6 text-white/70">{c.reviewHint}</p>
          <div className="mt-6 text-sm text-white/70">{c.localData}</div>
        </section>
      </div>
    </>
  );
}
function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Package;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <Icon size={19} className="text-sky-800" />
      <div className="mt-4 text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

function Shipments({
  items,
  state,
  c,
  search,
  setSearch,
  onEdit,
  canEdit,
  showFinance,
}: {
  items: Shipment[];
  state: LocalState;
  c: OperationsCopy;
  search: string;
  setSearch: (value: string) => void;
  onEdit: (item: Shipment) => void;
  canEdit: boolean;
  showFinance: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
        <div>
          <h2 className="font-bold">{c.shipments}</h2>
          <p className="mt-1 text-xs text-slate-500">
            {state.shipments.length}
          </p>
        </div>
        <SearchBox value={search} onChange={setSearch} placeholder={c.search} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] text-start text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              {[
                c.tracking,
                c.account,
                c.route,
                c.service,
                c.status,
                c.eta,
                "",
              ].map((head, i) => (
                <th key={i} className="px-5 py-3 text-start font-semibold">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id} className="border-t border-slate-100">
                <td className="px-5 py-4 font-bold">{item.tracking}</td>
                <td className="px-5 py-4">{item.account}</td>
                <td className="px-5 py-4">{item.route}</td>
                <td className="px-5 py-4">{serviceLabel(item.service, c)}</td>
                <td className="px-5 py-4">
                  <StatusBadge label={statusLabel(item.status, c)} />
                </td>
                <td className="px-5 py-4">{item.eta}</td>
                <td className="px-5 py-4">
                  <button
                    disabled={!canEdit}
                    onClick={() => onEdit(item)}
                    className="font-bold text-sky-800 disabled:opacity-30"
                  >
                    {c.edit}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {items.length === 0 && (
        <div className="p-10 text-center text-sm text-slate-500">
          {c.noResults}
        </div>
      )}
    </section>
  );
}

function Accounts({
  items,
  all,
  state,
  c,
  search,
  setSearch,
  onEdit,
  canEdit,
  onImport,
  onExport,
  onTemplate,
  showFinance,
  language,
}: {
  items: Account[];
  all: Account[];
  state: LocalState;
  c: OperationsCopy;
  search: string;
  setSearch: (value: string) => void;
  onEdit: (item: Account) => void;
  canEdit: boolean;
  onImport: () => void;
  onExport: () => void;
  onTemplate: () => void;
  showFinance: boolean;
  language: string;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="grid gap-4 border-b border-slate-100 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">{c.accounts}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {all.length} · {c.reviewHint}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={!canEdit}
              onClick={onImport}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold disabled:opacity-40"
            >
              <Upload size={15} />
              {c.import}
            </button>
            <button
              onClick={onTemplate}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
            >
              <FileSpreadsheet size={15} />
              {c.template}
            </button>
            <button
              onClick={onExport}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-950 px-3 py-2 text-sm font-bold text-white"
            >
              <ArrowDownToLine size={15} />
              {c.export}
            </button>
          </div>
        </div>
        <SearchBox value={search} onChange={setSearch} placeholder={c.search} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-start text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              {[
                c.account,
                c.phone,
                c.city,
                c.shipments,
                ...(showFinance ? [c.amount] : []),
                "",
              ].map((head, i) => (
                <th key={i} className="px-5 py-3 text-start font-semibold">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id} className="border-t border-slate-100">
                <td className="px-5 py-4">
                  <div className="font-bold">{item.name}</div>
                  <div className="mt-1 text-xs text-slate-500">{item.id}</div>
                </td>
                <td className="px-5 py-4">{item.phone}</td>
                <td className="px-5 py-4">{item.city}</td>
                <td className="px-5 py-4">{item.shipments}</td>
                <td className="px-5 py-4">
                  {formatAmount(item.balance, language)}
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <ScopeBadge scope={item.scope} labels={scopeLabels(c)} />
                    <button
                      disabled={!canEdit}
                      onClick={() => onEdit(item)}
                      className="font-bold text-sky-800 disabled:opacity-30"
                    >
                      {c.edit}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {items.length === 0 && (
        <div className="p-10 text-center text-sm text-slate-500">
          {c.noResults}
        </div>
      )}
      <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
        {items.length} / {state.accounts.length}
      </div>
    </section>
  );
}

function Invoices({
  items,
  state,
  c,
  search,
  setSearch,
  onNew,
  onEdit,
  canEdit,
  language,
}: {
  items: Invoice[];
  state: LocalState;
  c: OperationsCopy;
  search: string;
  setSearch: (value: string) => void;
  onNew: () => void;
  onEdit: (item: Invoice) => void;
  canEdit: boolean;
  language: string;
}) {
  const total = state.invoices.reduce((sum, item) => sum + item.amount, 0);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
        <div>
          <h2 className="font-bold">{c.invoices}</h2>
          <p className="mt-1 text-xs text-slate-500">{c.financeDenied}</p>
        </div>
        <button
          disabled={!canEdit}
          onClick={onNew}
          className="inline-flex items-center gap-2 rounded-xl bg-sky-950 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          <Plus size={15} />
          {c.newInvoice}
        </button>
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-3">
        <Metric
          icon={CircleDollarSign}
          label={c.total}
          value={formatAmount(total, language)}
        />
        <Metric
          icon={CircleDollarSign}
          label={c.awaitingPayment}
          value={String(
            state.invoices.filter(item => item.status === "بانتظار الدفع")
              .length
          )}
        />
        <Metric
          icon={Check}
          label={c.paid}
          value={String(
            state.invoices.filter(item => item.status === "مدفوعة").length
          )}
        />
      </div>
      <div className="px-5 pb-5">
        <SearchBox value={search} onChange={setSearch} placeholder={c.search} />
      </div>
      <div className="divide-y divide-slate-100">
        {items.map(item => (
          <div
            key={item.id}
            className="flex flex-wrap items-center gap-3 px-5 py-4"
          >
            <CircleDollarSign size={18} className="text-sky-800" />
            <div className="min-w-[150px] flex-1">
              <div className="font-bold">{item.id}</div>
              <div className="text-xs text-slate-500">
                {item.account} · {item.issuedAt}
              </div>
            </div>
            <strong>{formatAmount(item.amount, "ar-MR")}</strong>
            <StatusBadge label={statusLabel(item.status, c)} />
            <button
              disabled={!canEdit}
              onClick={() => onEdit(item)}
              className="font-bold text-sky-800 disabled:opacity-30"
            >
              {c.edit}
            </button>
          </div>
        ))}
        {items.length === 0 && (
          <div className="p-10 text-center text-sm text-slate-500">
            {c.noResults}
          </div>
        )}
      </div>
    </section>
  );
}

function Access({
  c,
  members,
  currentUserId,
  pending,
  onSetRole,
}: {
  c: OperationsCopy;
  members: {
    userId: number | string;
    name: string;
    email: string;
    role: AppRole | null;
  }[];
  currentUserId: string | null;
  pending: boolean;
  onSetRole: (id: number | string, role: AppRole) => Promise<void>;
}) {
  const roles: AppRole[] = ["admin", "staff", "accountant", "viewer"];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 p-5">
        <h2 className="font-bold">{c.members}</h2>
        <p className="mt-1 text-xs text-slate-500">{c.readOnly}</p>
      </div>
      <div className="divide-y divide-slate-100">
        {members.map(member => (
          <div
            key={member.userId}
            className="flex flex-wrap items-center gap-3 p-5"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 font-bold text-sky-900">
              {member.name?.slice(0, 1) || "?"}
            </div>
            <div className="min-w-[180px] flex-1">
              <div className="font-bold">{member.name}</div>
              <div className="text-xs text-slate-500">{member.email}</div>
            </div>
            <select
              value={member.role ?? ""}
              disabled={String(member.userId) === currentUserId || pending}
              onChange={event => {
                if (isAppRole(event.target.value))
                  void onSetRole(member.userId, event.target.value);
              }}
              className={inputClass}
            >
              <option value="">{c.noRole}</option>
              {roles.map(role => (
                <option key={role} value={role}>
                  {roleText(role, c)}
                </option>
              ))}
            </select>
          </div>
        ))}
        {members.length === 0 && (
          <div className="p-10 text-center text-sm text-slate-500">
            {c.noMembers}
          </div>
        )}
      </div>
    </section>
  );
}

function EntityModal({
  kind,
  editing,
  state,
  c,
  showFinance,
  onClose,
  onSave,
}: {
  kind: "account" | "shipment" | "invoice";
  editing: Account | Shipment | Invoice | null;
  state: LocalState;
  c: OperationsCopy;
  showFinance: boolean;
  onClose: () => void;
  onSave: (entity: Entity, data: EntityRecord, label: string) => void;
}) {
  const generatedId = `${kind}-${crypto.randomUUID().slice(0, 8)}`;
  const initial =
    editing ??
    (kind === "account"
      ? {
          id: generatedId,
          name: "",
          phone: "",
          city: "",
          shipments: 0,
          balance: 0,
          updatedAt: new Date().toISOString(),
          scope: "pending" as const,
        }
      : kind === "shipment"
        ? {
            id: generatedId,
            tracking: "",
            account: "",
            route: "",
            service: "سريع" as const,
            status: "بانتظار الدفع" as const,
            eta: "",
            amount: 0,
            scope: "pending" as const,
          }
        : {
            id: generatedId,
            account: "",
            amount: 0,
            status: "بانتظار الدفع" as const,
            issuedAt: new Date().toISOString().slice(0, 10),
            scope: "pending" as const,
          });
  const [form, setForm] = useState<EntityRecord>(initial as EntityRecord);
  const [error, setError] = useState("");
  const set = (key: string, value: string | number) => {
    setError("");
    setForm(previous => ({ ...previous, [key]: value }) as EntityRecord);
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const current = form as Record<string, unknown>;
    const required =
      kind === "account"
        ? ["name", "phone"]
        : kind === "shipment"
          ? ["tracking", "account", "route"]
          : ["account"];
    if (required.some(key => !String(current[key] ?? "").trim())) {
      setError(c.required);
      return;
    }
    if (
      kind === "account" &&
      (!/^\+?[\d\s().-]{6,30}$/.test(String(current.phone)) ||
        String(current.phone).replace(/\D/g, "").length < 6)
    ) {
      setError(c.invalidPhone);
      return;
    }
    const id = String(current.id ?? "").trim() || generatedId;
    if (!/^[\p{L}\p{N}_.-]{1,80}$/u.test(id)) {
      setError(c.required);
      return;
    }
    const list =
      kind === "account"
        ? state.accounts
        : kind === "shipment"
          ? state.shipments
          : state.invoices;
    if (!editing && list.some(item => item.id === id)) {
      setError(c.duplicate);
      return;
    }
    const amount = Number(current.amount ?? 0);
    const balance = Number(current.balance ?? 0);
    if (
      (kind === "account" &&
        showFinance &&
        (!Number.isFinite(balance) || balance < 0 || balance > MAX_MONEY)) ||
      (kind !== "account" &&
        showFinance &&
        (!Number.isFinite(amount) || amount < 0 || amount > MAX_MONEY))
    ) {
      setError(c.invalidAmount);
      return;
    }
    const normalized = {
      ...current,
      id,
      ...(kind === "account"
        ? {
            city: String(current.city ?? "").trim() || "غير محدد",
            balance: showFinance ? balance : 0,
          }
        : {}),
      ...(kind === "shipment"
        ? {
            eta: String(current.eta ?? "").trim() || "غير محدد",
            amount: showFinance ? amount : 0,
          }
        : {}),
      ...(kind === "invoice" ? { amount } : {}),
    } as EntityRecord;
    onSave(
      kind,
      { ...normalized, scope: "pending" } as EntityRecord,
      `${editing ? c.edit : c.create} ${kind === "account" ? c.accountEntity : kind === "shipment" ? c.shipment : c.invoice} ${id}`
    );
  };
  const moneyProps = { min: 0, step: "0.01", max: MAX_MONEY };
  const value = (key: string) =>
    String((form as unknown as Record<string, unknown>)[key] ?? "");
  return (
    <Modal
      title={
        editing
          ? c.edit
          : kind === "account"
            ? c.newAccount
            : kind === "shipment"
              ? c.newShipment
              : c.newInvoice
      }
      onClose={onClose}
    >
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label={c.id}>
          <input
            className={inputClass}
            maxLength={80}
            readOnly={Boolean(editing)}
            pattern={"^[\\p{L}\\p{N}_.\\-]{1,80}$"}
            value={value("id")}
            onChange={e => set("id", e.target.value)}
          />
        </Field>
        <Field
          label={
            kind === "account"
              ? c.name
              : kind === "shipment"
                ? c.tracking
                : c.account
          }
          required
        >
          <input
            required
            readOnly={kind === "shipment" && Boolean(editing)}
            maxLength={kind === "account" ? 200 : kind === "shipment" ? 128 : 240}
            className={inputClass}
            value={value(
              kind === "account"
                ? "name"
                : kind === "shipment"
                  ? "tracking"
                  : "account"
            )}
            onChange={e =>
              set(
                kind === "account"
                  ? "name"
                  : kind === "shipment"
                    ? "tracking"
                    : "account",
                e.target.value
              )
            }
          />
        </Field>
        {kind === "account" && (
          <>
            <Field label={c.phone} required>
              <input
                required
                pattern="^\+?[\d\s().-]{6,30}$"
                maxLength={30}
                className={inputClass}
                value={value("phone")}
                onChange={e => set("phone", e.target.value)}
              />
            </Field>
            <Field label={c.city}>
              <input
                maxLength={160}
                className={inputClass}
                value={value("city")}
                onChange={e => set("city", e.target.value)}
              />
            </Field>
            {showFinance && (
              <Field label={c.amount}>
                <input
                  type="number"
                  {...moneyProps}
                  className={inputClass}
                  value={value("balance")}
                  onChange={e => set("balance", Number(e.target.value))}
                />
              </Field>
            )}
          </>
        )}
        {kind === "shipment" && (
          <>
            <Field label={c.account} required>
              <input
                required
                maxLength={160}
                className={inputClass}
                value={value("account")}
                onChange={e => set("account", e.target.value)}
              />
            </Field>
            <Field label={c.route} required>
              <input
                required
                maxLength={200}
                className={inputClass}
                value={value("route")}
                onChange={e => set("route", e.target.value)}
              />
            </Field>
            <Field label={c.service}>
              <select
                className={inputClass}
                value={value("service")}
                onChange={e => set("service", e.target.value)}
              >
                <option value="سريع">{c.express}</option>
                <option value="جوي">{c.air}</option>
                <option value="بحري">{c.sea}</option>
              </select>
            </Field>
            <Field label={c.status}>
              <select
                className={inputClass}
                value={value("status")}
                onChange={e => set("status", e.target.value)}
              >
                <option value="في الطريق">{c.inTransit}</option>
                <option value="وصلت للمكتب">{c.arrived}</option>
                <option value="جاهزة للتسليم">{c.ready}</option>
                <option value="بانتظار الدفع">{c.awaitingPayment}</option>
              </select>
            </Field>
            <Field label={c.eta}>
              <input
                maxLength={80}
                className={inputClass}
                value={value("eta")}
                onChange={e => set("eta", e.target.value)}
              />
            </Field>
            {showFinance && (
              <Field label={c.amount}>
                <input
                  type="number"
                  {...moneyProps}
                  className={inputClass}
                  value={value("amount")}
                  onChange={e => set("amount", Number(e.target.value))}
                />
              </Field>
            )}
          </>
        )}
        {kind === "invoice" && (
          <>
            <Field label={c.amount}>
              <input
                type="number"
                {...moneyProps}
                className={inputClass}
                value={value("amount")}
                onChange={e => set("amount", Number(e.target.value))}
              />
            </Field>
            <Field label={c.status}>
              <select
                className={inputClass}
                value={value("status")}
                onChange={e => set("status", e.target.value)}
              >
                <option value="بانتظار الدفع">{c.awaitingPayment}</option>
                <option value="مدفوعة">{c.paid}</option>
              </select>
            </Field>
            <Field label={c.issuedAt}>
              <input
                type="date"
                className={inputClass}
                value={value("issuedAt")}
                onChange={e => set("issuedAt", e.target.value)}
              />
            </Field>
          </>
        )}
        {error && (
          <p
            role="alert"
            className="text-sm font-semibold text-red-700 sm:col-span-2"
          >
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold"
          >
            {c.cancel}
          </button>
          <button
            type="submit"
            className="rounded-xl bg-sky-950 px-4 py-2 text-sm font-bold text-white"
          >
            {c.save}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ConflictPanel({
  conflicts,
  queue,
  c,
  onKeep,
  onServer,
}: {
  conflicts: SyncResult["conflicts"];
  queue: PendingChange[];
  c: OperationsCopy;
  onKeep: (item: SyncResult["conflicts"][number]) => void;
  onServer: (item: SyncResult["conflicts"][number]) => void;
}) {
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <h2 className="font-bold text-amber-950">{c.conflicts}</h2>
      {conflicts.map(item => (
        <div
          key={item.changeId}
          className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 text-sm"
        >
          <div className="min-w-[180px] flex-1">
            {queue.find(change => change.id === item.changeId)?.label}
            <div className="text-xs text-slate-500">{item.reason}</div>
          </div>
          <button
            onClick={() => onKeep(item)}
            className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-bold"
          >
            {c.keepLocal}
          </button>
          <button
            disabled={!item.current}
            onClick={() => onServer(item)}
            className="rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
          >
            {c.useServer}
          </button>
        </div>
      ))}
    </section>
  );
}
function ImportModal({
  result,
  c,
  language,
  onClose,
  onConfirm,
  onReport,
}: {
  result: ImportResult;
  c: OperationsCopy;
  language: string;
  onClose: () => void;
  onConfirm: () => void;
  onReport: () => void;
}) {
  const preview = result.rows.slice(0, 50);
  return (
    <Modal title={c.importPreview} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-emerald-50 p-4">
          <div className="text-xs text-emerald-800">{c.accepted}</div>
          <div className="mt-1 text-2xl font-bold text-emerald-900">
            {result.rows.length}
          </div>
        </div>
        <div className="rounded-xl bg-red-50 p-4">
          <div className="text-xs text-red-800">{c.rejected}</div>
          <div className="mt-1 text-2xl font-bold text-red-900">
            {result.rejected.length}
          </div>
        </div>
      </div>
      <div className="mt-4 max-h-64 overflow-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[620px] text-start text-xs">
          <thead className="bg-slate-50">
            <tr>
              {[c.account, c.name, c.phone, c.city, c.amount].map(head => (
                <th key={head} className="px-3 py-2 text-start">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map(row => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{row.id}</td>
                <td className="px-3 py-2">{row.name}</td>
                <td className="px-3 py-2">{row.phone}</td>
                <td className="px-3 py-2">{row.city}</td>
                <td className="px-3 py-2">
                  {formatAmount(row.balance, language)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.rows.length > 50 && (
        <p className="mt-2 text-xs text-slate-500">
          {result.rows.length - 50} {c.moreRows}
        </p>
      )}
      {result.rejected.length > 0 && (
        <div className="mt-4 max-h-40 overflow-y-auto rounded-xl bg-slate-50 p-3 text-xs">
          {result.rejected.map(item => (
            <div key={item.row} className="border-b border-slate-200 py-2">
              {item.row}: {item.reason}
            </div>
          ))}
        </div>
      )}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button
          onClick={onReport}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold"
        >
          {c.export} {c.errors}
        </button>
        <button
          onClick={onClose}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold"
        >
          {c.cancel}
        </button>
        <button
          disabled={!result.rows.length}
          onClick={onConfirm}
          className="rounded-xl bg-sky-950 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          {c.confirmImport}
        </button>
      </div>
    </Modal>
  );
}
