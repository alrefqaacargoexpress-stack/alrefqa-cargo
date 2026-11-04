import {
  financeCommandOffice,
  selectedFinanceCommands,
} from "@shared/financeCommands";
import { useEffect, useRef, useState } from "react";
import { useWorkspaceSyncCoordinator } from "@/components/providers/WorkspaceSyncContext";
import type { SyncResult } from "@shared/operations";
import { useOperationsWorkspace } from "./useOperationsWorkspace";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import {
  canUseFinance,
  canWriteFinance,
  calculateFinanceInvoice,
  financePermissionForCommand,
  emptyFinanceSnapshot,
  type FinanceCommand,
  type FinanceSyncResult,
} from "@shared/finance";
import {
  canReadAnyFinance,
  permissionAllowed,
  type PermissionMap,
} from "@shared/permissions";
import { officeIds, type OfficeId } from "@shared/branches";
import type { OfficeSettings } from "@shared/office";
import {
  loadFinanceWorkspace,
  saveFinanceWorkspace,
  stageFinanceCommand,
  mergeFinanceSnapshot,
  applyFinanceSync,
  type FinanceWorkspace,
} from "@/lib/financeStore";
import { loadWorkspace } from "@/lib/offlineStore";
import { partitionFinanceCommands } from "@/lib/financeSyncDependencies";
import { isNonFailureSyncOutcome, normalizeSyncError } from "@/lib/syncErrors";
const words = {
  ar: {
    saved: "حُفظت المسودة المالية محليًا، وليست قيدًا مشتركًا بعد.",
    failed: "تعذر الحفظ؛ احتفظ بإدخالك. لم نكتب فوق المسودة السابقة.",
    review:
      "تسجيل هذه العمليات المالية مع الموظفين الآن؟ راجع الفواتير والمبالغ والمكاتب قبل التأكيد.",
    offline: "يلزم اتصال وجلسة صالحة لتسجيل القيود المشتركة.",
    forbidden: "لا تملك صلاحية مالية لهذه البيانات.",
    conflict:
      "بقيت العمليات المرفوضة محليًا للمراجعة؛ لم تتكرر القيود المقبولة.",
    synced: "أقر الخادم العمليات المالية المقبولة.",
    fetchFailed: "تعذرت قراءة البيانات المالية؛ النسخة المحلية محفوظة.",
    storeCorrupt:
      "تعذر قراءة المخزن المالي؛ لم تُحذف النسخة الأصلية. صدّر الأرشيف قبل المراجعة.",
    storeConflict:
      "تغيرت المسودة في تبويب آخر؛ لم نكتب فوقها. احتفظ بالإدخال وأعد تحميل المخزن.",
    storeFull: "المخزن المحلي ممتلئ أو محظور. احتفظ بالإدخال وحاول مجددًا.",
  },
  en: {
    saved: "Financial draft saved locally; it is not a shared entry yet.",
    failed: "Save failed. Keep your input; the previous draft was preserved.",
    review:
      "Post these financial operations for the team now? Review invoices, amounts and offices before confirming.",
    offline:
      "A connection and valid session are required to post shared entries.",
    forbidden: "You do not have financial access to this data.",
    conflict:
      "Rejected operations remain local for review; accepted entries were not duplicated.",
    synced: "The server acknowledged accepted financial operations.",
    fetchFailed:
      "Financial data could not be read; the local copy was preserved.",
    storeCorrupt:
      "The financial store could not be read. The original is preserved; export an archive before reviewing.",
    storeConflict:
      "Another tab changed this draft. Keep your input and reload the store.",
    storeFull: "Local storage is full or blocked. Keep your input and retry.",
  },
  zh: {
    saved: "财务草稿已保存在本地，尚未成为共享记录。",
    failed: "保存失败，请保留输入，原草稿未被覆盖。",
    review: "现在将这些财务操作记录给团队吗？请先核对发票、金额和办公室。",
    offline: "记录共享账目需要联网和有效登录。",
    forbidden: "您无权访问这些财务数据。",
    conflict: "被拒操作仍保留在本地待审核，已接受记录没有重复。",
    synced: "服务器已确认接受的财务操作。",
    fetchFailed: "无法读取财务数据，本地副本已保留。",
    storeCorrupt: "无法读取财务存储，原数据未删除，请先导出存档。",
    storeConflict: "另一标签页修改了草稿，请保留输入并重新加载。",
    storeFull: "本地存储已满或被阻止，请保留输入后重试。",
  },
  tr: {
    saved: "Mali taslak yerelde kaydedildi; henüz ortak kayıt değil.",
    failed: "Kaydetme başarısız. Girdinizi koruyun; önceki taslak saklandı.",
    review:
      "Bu mali işlemler ekip için kaydedilsin mi? Onaydan önce faturaları, tutarları ve ofisleri inceleyin.",
    offline: "Ortak kayıt için bağlantı ve geçerli oturum gerekir.",
    forbidden: "Bu verilere mali erişiminiz yok.",
    conflict:
      "Reddedilen işlemler inceleme için yerelde kaldı; kabul edilenler yinelenmedi.",
    synced: "Sunucu kabul edilen mali işlemleri onayladı.",
    fetchFailed: "Mali veriler okunamadı; yerel kopya korundu.",
    storeCorrupt:
      "Mali depo okunamadı; asıl veri korundu. Önce arşivi dışa aktarın.",
    storeConflict:
      "Başka sekme taslağı değiştirdi. Girdinizi koruyup depoyu yenileyin.",
    storeFull:
      "Yerel depo dolu veya engelli. Girdinizi koruyup tekrar deneyin.",
  },
};
export function useFinanceWorkspace() {
  const coordinator = useWorkspaceSyncCoordinator();
  const base = useOperationsWorkspace();
  const { language } = useLanguage();
  const w = words[language];
  const subject = {
    role: base.role,
    offices: base.offices,
    homeOffice:
      (base as { homeOffice?: import("@shared/branches").OfficeId | null })
        .homeOffice ?? (base.offices?.length === 1 ? base.offices[0] : null),
    permissions: base.permissions,
  };
  const permission = canReadAnyFinance(subject);
  const financeCacheUser = base.userId
    ? `${base.userId}:${base.permissionFingerprint ?? "no-permission-fingerprint"}`
    : null;
  const scopeFingerprint = base.permissionFingerprint ?? null;
  const officeSettingsReadable = permissionAllowed(
    subject,
    "office_wallets",
    "view"
  );
  // A root user has the full four-office scope; an employee is limited to
  // the offices explicitly returned by the access snapshot.
  const settingsOffices: OfficeId[] =
    base.offices === null ? [...officeIds] : (base.offices ?? []).slice(0, 4);
  const settingsQueries = [
    trpc.office.get.useQuery(
      settingsOffices[0] ? { officeId: settingsOffices[0] } : undefined,
      {
        enabled: Boolean(
          base.userId &&
            base.accessReady &&
            officeSettingsReadable &&
            base.online &&
            !base.localOnly &&
            settingsOffices[0]
        ),
        retry: false,
        refetchOnWindowFocus: false,
      }
    ),
    trpc.office.get.useQuery(
      settingsOffices[1] ? { officeId: settingsOffices[1] } : undefined,
      {
        enabled: Boolean(
          base.userId &&
            base.accessReady &&
            officeSettingsReadable &&
            base.online &&
            !base.localOnly &&
            settingsOffices[1]
        ),
        retry: false,
        refetchOnWindowFocus: false,
      }
    ),
    trpc.office.get.useQuery(
      settingsOffices[2] ? { officeId: settingsOffices[2] } : undefined,
      {
        enabled: Boolean(
          base.userId &&
            base.accessReady &&
            officeSettingsReadable &&
            base.online &&
            !base.localOnly &&
            settingsOffices[2]
        ),
        retry: false,
        refetchOnWindowFocus: false,
      }
    ),
    trpc.office.get.useQuery(
      settingsOffices[3] ? { officeId: settingsOffices[3] } : undefined,
      {
        enabled: Boolean(
          base.userId &&
            base.accessReady &&
            officeSettingsReadable &&
            base.online &&
            !base.localOnly &&
            settingsOffices[3]
        ),
        retry: false,
        refetchOnWindowFocus: false,
      }
    ),
  ];
  const settingsByOffice = new Map<OfficeId, OfficeSettings>();
  for (const result of settingsQueries)
    if (result.data) settingsByOffice.set(result.data.office, result.data);
  const query = trpc.finance.snapshot.useQuery(
    {
      clientUserId: base.userId ?? "not-logged-in",
      ...(scopeFingerprint ? { cacheScope: scopeFingerprint } : {}),
    },
    {
      enabled: Boolean(
        base.userId &&
          base.accessReady &&
          permission &&
          base.online &&
          !base.localOnly
      ),
      retry: false,
      refetchOnWindowFocus: false,
    }
  );
  const mutation = trpc.finance.sync.useMutation();
  const [workspace, setWorkspace] = useState<FinanceWorkspace | null>(null);
  const ref = useRef<FinanceWorkspace | null>(null);
  const currentUser = useRef(base.userId);
  currentUser.current = base.userId;
  const currentScope = useRef(scopeFingerprint);
  currentScope.current = scopeFingerprint;
  const workspaceOwner = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<FinanceSyncResult["conflicts"]>(
    []
  );
  const [snapshotRefreshPending, setSnapshotRefreshPending] = useState(false);
  const networkSnapshotIdentity = useRef<string | null>(null);
  const currentSnapshotIdentity = `${base.userId ?? ""}:${scopeFingerprint ?? ""}`;
  const denied =
    query.error?.data?.code === "FORBIDDEN" ||
    query.error?.data?.code === "UNAUTHORIZED";
  const officeAllowed = (office: string) =>
    base.offices === null || base.offices.includes(office as never);
  const commandOffice = (command: FinanceCommand) => {
    const office = financeCommandOffice(
      command,
      workspace?.snapshot.invoices ?? [],
      workspace?.snapshot.homeOffice ?? null,
      base.state.shipments
    );
    if (office) return office;
    if (
      command.kind === "opening_balance" ||
      command.kind === "profit_withdrawal"
    )
      return command.payload.officeId;
    return undefined;
  };
  const commandPermission = (command: FinanceCommand) =>
    command.kind === "expense" && command.payload.category === "shipment_cost"
      ? ("shipment_cost" as const)
      : financePermissionForCommand(
          command.kind,
          command.kind === "expense" ? command.payload.category : undefined
        );
  const explain = (e: unknown) =>
    e instanceof Error
      ? e.message === "finance_store_corrupt"
        ? w.storeCorrupt
        : e.message === "finance_store_conflict"
          ? w.storeConflict
          : e.message === "finance_store_full"
            ? w.storeFull
            : w.failed
      : w.failed;
  useEffect(() => {
    if (!base.userId || !base.accessReady || !permission) {
      workspaceOwner.current = null;
      ref.current = null;
      setWorkspace(null);
      return;
    }
    workspaceOwner.current = base.userId;
    try {
      const next = loadFinanceWorkspace(financeCacheUser ?? base.userId);
      ref.current = next;
      setWorkspace(next);
      setError(null);
    } catch (e) {
      ref.current = null;
      setWorkspace(null);
      setError(explain(e));
    }
  }, [base.userId, base.accessReady, permission, financeCacheUser]);
  useEffect(() => {
    if (!base.userId || !query.data || !ref.current || denied) return;
    let cancelled = false;
    const userId = base.userId;
    const responseScope = scopeFingerprint;
    void (async () => {
      try {
        const next = mergeFinanceSnapshot(ref.current!, query.data, userId);
        if (
          cancelled ||
          currentUser.current !== userId ||
          currentScope.current !== responseScope
        )
          return;
        await saveFinanceWorkspace(financeCacheUser ?? userId, next);
        if (
          !cancelled &&
          currentUser.current === userId &&
          currentScope.current === responseScope
        ) {
          ref.current = next;
          setWorkspace(next);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(explain(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [base.userId, query.data, denied, financeCacheUser, scopeFingerprint]);
  useEffect(() => {
    if (!base.userId || !query.data || query.error || query.isFetching) return;
    networkSnapshotIdentity.current = currentSnapshotIdentity;
  }, [
    base.userId,
    currentSnapshotIdentity,
    query.data,
    query.error,
    query.isFetching,
  ]);
  const writePermission = canWriteFinance({
    role: base.role,
    offices: base.offices,
    homeOffice:
      query.data?.homeOffice ?? workspace?.snapshot.homeOffice ?? null,
    permissions: base.permissions,
  });
  const canEdit =
    writePermission &&
    permission &&
    base.accessReady &&
    Boolean(base.userId) &&
    !base.error &&
    !error &&
    !denied &&
    !mutation.isPending;
  const saveCommand = async (
    command: FinanceCommand,
    options?: { confirmed?: boolean }
  ): Promise<boolean> => {
    if (
      !canEdit ||
      !permissionAllowed(subject, commandPermission(command), "manage") ||
      !base.userId ||
      workspaceOwner.current !== base.userId ||
      !ref.current
    ) {
      setNotice(w.forbidden);
      return false;
    }
    const office = financeCommandOffice(
      command,
      workspace?.snapshot.invoices ?? [],
      workspace?.snapshot.homeOffice ?? null,
      base.state.shipments
    );
    if (
      (command.kind === "shipment_price" && !office) ||
      (office && !officeAllowed(office))
    ) {
      setNotice(w.forbidden);
      return false;
    }
    if (!options?.confirmed && typeof window !== "undefined") {
      const labels = {
        ar: {
          invoice: "فاتورة",
          expense: "مصروف",
          settlement: "تحصيل فاتورة",
          customer_movement: "حركة حساب عميل",
          opening_balance: "رصيد افتتاحي",
          profit_withdrawal: "سحب ربح",
          shipment_price: "تحديد سعر شحنة",
        },
        en: {
          invoice: "invoice",
          expense: "expense",
          settlement: "invoice settlement",
          customer_movement: "customer movement",
          opening_balance: "opening balance",
          profit_withdrawal: "profit withdrawal",
          shipment_price: "shipment price",
        },
        zh: {
          invoice: "发票",
          expense: "支出",
          settlement: "发票收款",
          customer_movement: "客户账户变动",
          opening_balance: "期初余额",
          profit_withdrawal: "利润提取",
          shipment_price: "货运定价",
        },
        tr: {
          invoice: "fatura",
          expense: "gider",
          settlement: "fatura tahsilatı",
          customer_movement: "müşteri hareketi",
          opening_balance: "açılış bakiyesi",
          profit_withdrawal: "kâr çekimi",
          shipment_price: "gönderi fiyatı",
        },
      }[language];
      const payload = command.payload as {
        amount?: number;
        manualAmount?: number;
        pricePerKg?: number;
        currency?: string;
        officeId?: string;
        issuingOfficeId?: string;
        sourceOfficeId?: string;
        description?: string;
      };
      const amount =
        payload.amount ?? payload.manualAmount ?? payload.pricePerKg;
      const officeName =
        payload.officeId ??
        payload.issuingOfficeId ??
        payload.sourceOfficeId ??
        workspace?.snapshot.homeOffice ??
        "—";
      const detail = [
        labels[command.kind],
        amount === undefined
          ? null
          : `${amount} ${payload.currency ?? ""}`.trim(),
        officeName,
        payload.description ?? null,
      ]
        .filter(Boolean)
        .join(" · ");
      if (!window.confirm(`${w.review}\n\n${detail}`)) return false;
    }
    try {
      const next = stageFinanceCommand(ref.current, command, base.userId);
      await saveFinanceWorkspace(financeCacheUser ?? base.userId, next);
      if (currentUser.current !== base.userId) return false;
      ref.current = next;
      setWorkspace(next);
      setNotice(w.saved);
      void coordinator.request("local-save").catch(() => undefined);
      return true;
    } catch (e) {
      setNotice(explain(e));
      return false;
    }
  };
  const posting = useRef(false);
  const runSyncInternal = async (
    selectedIds?: string[],
    operationResult?: SyncResult | null,
    signal?: AbortSignal
  ): Promise<FinanceSyncResult | null> => {
    if (
      mutation.isPending ||
      posting.current ||
      workspaceOwner.current !== base.userId ||
      !base.online ||
      base.localOnly ||
      !base.userId ||
      !canEdit ||
      !ref.current ||
      signal?.aborted
    ) {
      setNotice(w.offline);
      return null;
    }
    let latest: FinanceWorkspace;
    let operationsWorkspace: ReturnType<typeof loadWorkspace>;
    try {
      latest = loadFinanceWorkspace(financeCacheUser ?? base.userId);
      // The operations hook may not have committed its React state update yet;
      // the durable store is the authority for this cross-workspace boundary.
      operationsWorkspace = loadWorkspace(base.userId);
    } catch (error) {
      const normalized = normalizeSyncError(error);
      if (isNonFailureSyncOutcome(normalized)) return null;
      setNotice(w.failed);
      throw normalized;
    }
    if (
      signal?.aborted ||
      currentUser.current !== base.userId ||
      currentScope.current !== scopeFingerprint ||
      workspaceOwner.current !== base.userId
    )
      return null;
    ref.current = latest;
    setWorkspace(latest);
    const candidates = selectedFinanceCommands(latest.commands, selectedIds);
    const dependencies = partitionFinanceCommands(
      latest.commands,
      operationsWorkspace,
      operationResult
    );
    const pendingPriceShipments = new Set(
      latest.commands
        .filter(command => command.kind === "shipment_price")
        .map(command => command.payload.shipmentId)
    );
    const selectedSet = selectedIds ? new Set(selectedIds) : null;
    const available = dependencies.ready
      .filter(command => !selectedSet || selectedSet.has(command.id))
      .filter(command => {
        const office = financeCommandOffice(
          command,
          latest.snapshot.invoices,
          latest.snapshot.homeOffice ?? null,
          operationsWorkspace.state.shipments
        );
        if (!Boolean(office && officeAllowed(office))) return false;
        if (!permissionAllowed(subject, commandPermission(command), "manage"))
          return false;
        const payload = command.payload as {
          shipmentId?: string;
          invoiceId?: string;
        };
        if (
          command.kind === "invoice" &&
          payload.shipmentId &&
          pendingPriceShipments.has(payload.shipmentId)
        )
          return false;
        if (
          command.kind === "settlement" &&
          payload.invoiceId &&
          latest.commands.some(
            other =>
              other.kind === "invoice" &&
              other.payload.invoiceId === payload.invoiceId
          )
        )
          return false;
        return true;
      });
    const batch = available
      .sort((a, b) =>
        a.kind === "shipment_price" ? -1 : b.kind === "shipment_price" ? 1 : 0
      )
      .slice(0, 100);
    if (!batch.length) return null;
    posting.current = true;
    try {
      const userId = base.userId;
      if (
        signal?.aborted ||
        currentUser.current !== userId ||
        currentScope.current !== scopeFingerprint ||
        workspaceOwner.current !== userId
      )
        return null;
      const result = await mutation.mutateAsync({
        commands: batch,
        clientUserId: userId,
      });
      if (
        signal?.aborted ||
        currentUser.current !== userId ||
        workspaceOwner.current !== userId ||
        currentScope.current !== scopeFingerprint ||
        !ref.current
      )
        return null;
      const next = applyFinanceSync(ref.current, result, userId);
      if (
        signal?.aborted ||
        currentUser.current !== userId ||
        currentScope.current !== scopeFingerprint ||
        workspaceOwner.current !== userId
      )
        return null;
      await saveFinanceWorkspace(financeCacheUser ?? userId, next);
      if (
        signal?.aborted ||
        currentUser.current !== userId ||
        currentScope.current !== scopeFingerprint ||
        workspaceOwner.current !== userId
      )
        return null;
      ref.current = next;
      setWorkspace(next);
      setConflicts(result.conflicts);
      setNotice(
        result.conflicts.length
          ? w.conflict
          : result.applied.length
            ? w.synced
            : w.conflict
      );
      setSnapshotRefreshPending(true);
      void query.refetch().then(
        () => setSnapshotRefreshPending(false),
        () => setSnapshotRefreshPending(false)
      );
      if (result.applied.some(item => item.priceProjection))
        await base.reload();
      return result;
    } catch (e) {
      const normalized = normalizeSyncError(e);
      if (isNonFailureSyncOutcome(normalized)) return null;
      setNotice(w.failed);
      throw normalized;
    } finally {
      posting.current = false;
    }
  };
  const internalSyncRef = useRef(runSyncInternal);
  internalSyncRef.current = runSyncInternal;
  useEffect(() => {
    if (!base.userId) return;
    coordinator.setSession(
      String(base.userId),
      base.accessReady,
      base.permissionFingerprint ?? null
    );
    return coordinator.registerFinance({
      userId: String(base.userId),
      scopeFingerprint,
      authReady: base.accessReady && permission,
      online: base.online && !base.localOnly,
      pending: () => ref.current?.commands ?? [],
      sync: (ids, operationResult, signal) =>
        internalSyncRef.current(ids, operationResult, signal),
    });
  }, [
    base.accessReady,
    base.localOnly,
    base.online,
    base.permissionFingerprint,
    base.userId,
    coordinator,
    permission,
  ]);
  const requestSync = async (
    financeSelection?: string[]
  ): Promise<FinanceSyncResult | null> => {
    try {
      return (await coordinator.request("manual", { financeSelection }))
        .finance;
    } catch {
      return null;
    }
  };
  const sync = () => requestSync();
  const syncCommands = (ids: string[]) => requestSync(ids);
  const reload = async () => {
    if (!base.userId) return;
    try {
      const next = loadFinanceWorkspace(financeCacheUser ?? base.userId);
      ref.current = next;
      setWorkspace(next);
      setError(null);
      if (base.online && !base.localOnly) await query.refetch();
    } catch (e) {
      setError(explain(e));
    }
  };
  const snapshot = workspace?.snapshot ?? emptyFinanceSnapshot();
  // A local workspace may contain an older projection, but it cannot establish
  // posting authority. This flag is intentionally derived from the authenticated
  // network query and the current permission scope only.
  const snapshotReady = Boolean(
    base.online &&
      !base.localOnly &&
      base.accessReady &&
      Boolean(base.userId) &&
      permission &&
      networkSnapshotIdentity.current === currentSnapshotIdentity &&
      query.data &&
      !query.error &&
      !query.isFetching &&
      !snapshotRefreshPending
  );
  const visible =
    permission &&
    base.accessReady &&
    workspaceOwner.current === base.userId &&
    Boolean(workspace) &&
    (!base.online || (!query.isLoading && !query.error)) &&
    !denied &&
    !base.error;
  return {
    base,
    loading: base.loading || (query.isLoading && base.online),
    role: base.role,
    permissions: base.permissions as PermissionMap | null,
    online: base.online,
    homeOffice: snapshot.homeOffice,
    offices: base.offices,
    entries: visible
      ? snapshot.entries.filter(e => officeAllowed(e.officeId))
      : [],
    invoices: visible
      ? snapshot.invoices.filter(i =>
          i.officeId ? officeAllowed(i.officeId) : base.offices === null
        )
      : [],
    commands:
      visible && canEdit
        ? (workspace?.commands ?? []).filter(command => {
            const office = commandOffice(command);
            return Boolean(office && officeAllowed(office));
          })
        : [],
    error: error ?? (denied ? w.forbidden : null),
    readOnlySnapshot: visible && !canEdit,
    notice,
    conflicts,
    canEdit,
    saveCommand,
    sync,
    syncCommands,
    reload,
    busy: mutation.isPending,
    store: workspace,
    snapshotError: query.error && !denied ? w.fetchFailed : null,
    snapshotReady,
    autoSyncStatus: base.autoSyncStatus,
    autoSyncQueue: base.autoSyncQueue,
    paymentSettings: settingsByOffice,
    settingsForOffice: (officeId: OfficeId) => settingsByOffice.get(officeId),
  };
}
