import {
  financeCommandOffice,
  selectedFinanceCommands,
} from "@shared/financeCommands";
import { useEffect, useRef, useState } from "react";
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
import {
  loadFinanceWorkspace,
  saveFinanceWorkspace,
  stageFinanceCommand,
  mergeFinanceSnapshot,
  applyFinanceSync,
  type FinanceWorkspace,
} from "@/lib/financeStore";
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
  const query = trpc.finance.snapshot.useQuery(
    { clientUserId: base.userId ?? "not-logged-in" },
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
  const workspaceOwner = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<FinanceSyncResult["conflicts"]>(
    []
  );
  const denied =
    query.error?.data?.code === "FORBIDDEN" ||
    query.error?.data?.code === "UNAUTHORIZED";
  const officeAllowed = (office: string) =>
    base.offices === null || base.offices.includes(office as never);
  const commandOffice = (command: FinanceCommand) => {
    const office = financeCommandOffice(
      command,
      workspace?.snapshot.invoices ?? [],
      workspace?.snapshot.homeOffice ?? null
    );
    if (office) return office;
    if (command.kind === "shipment_price")
      return command.payload.sourceOfficeId;
    if (command.kind === "opening_balance") return command.payload.officeId;
    return undefined;
  };
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
    if (!base.userId || !base.accessReady) {
      workspaceOwner.current = null;
      ref.current = null;
      setWorkspace(null);
      return;
    }
    workspaceOwner.current = base.userId;
    try {
      const next = loadFinanceWorkspace(base.userId);
      ref.current = next;
      setWorkspace(next);
      setError(null);
    } catch (e) {
      ref.current = null;
      setWorkspace(null);
      setError(explain(e));
    }
  }, [base.userId, base.accessReady]);
  useEffect(() => {
    if (!base.userId || !query.data || !ref.current || denied) return;
    let cancelled = false;
    const userId = base.userId;
    void (async () => {
      try {
        const next = mergeFinanceSnapshot(ref.current!, query.data);
        await saveFinanceWorkspace(userId, next);
        if (!cancelled) {
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
  }, [base.userId, query.data, denied]);
  const writePermission = canWriteFinance({
    role: base.role,
    offices: base.offices,
    homeOffice:
      query.data?.homeOffice ?? workspace?.snapshot.homeOffice ?? null,
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
  const saveCommand = async (command: FinanceCommand): Promise<boolean> => {
    if (
      !canEdit ||
      !permissionAllowed(
        subject,
        financePermissionForCommand(command.kind),
        "manage"
      ) ||
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
      workspace?.snapshot.homeOffice ?? null
    );
    if (office && !officeAllowed(office)) {
      setNotice(w.forbidden);
      return false;
    }
    try {
      const next = stageFinanceCommand(ref.current, command);
      await saveFinanceWorkspace(base.userId, next);
      if (currentUser.current !== base.userId) return false;
      ref.current = next;
      setWorkspace(next);
      setNotice(w.saved);
      return true;
    } catch (e) {
      setNotice(explain(e));
      return false;
    }
  };
  const posting = useRef(false);
  const runSync = async (
    selectedIds?: string[]
  ): Promise<FinanceSyncResult | null> => {
    if (
      mutation.isPending ||
      posting.current ||
      workspaceOwner.current !== base.userId ||
      !base.online ||
      base.localOnly ||
      !base.userId ||
      !canEdit ||
      !ref.current
    ) {
      setNotice(w.offline);
      return null;
    }
    const available = selectedFinanceCommands(
      ref.current.commands,
      selectedIds
    ).filter(command => {
      const office = commandOffice(command);
      return (
        Boolean(office && officeAllowed(office)) &&
        permissionAllowed(
          subject,
          financePermissionForCommand(command.kind),
          "manage"
        )
      );
    });
    const batch = available.slice(0, 100);
    if (!batch.length) return null;
    const review = batch
      .map(command => {
        if (command.kind === "opening_balance")
          return `${command.payload.openingId}: ${command.payload.amount} ${command.payload.currency} · ${command.payload.officeId} · ${command.payload.note}`;
        if (command.kind === "shipment_price")
          return `${command.payload.shipmentId}: ${command.payload.pricePerKg} · ${command.payload.sourceOfficeId}`;
        if (command.kind === "expense")
          return `${command.payload.category}: ${command.payload.amount} ${command.payload.currency} · ${command.payload.officeId} · ${command.payload.description}`;
        if (command.kind === "settlement")
          return `${command.payload.invoiceId}: ${command.payload.amount} · ${command.payload.description}`;
        if (command.kind === "customer_movement") {
          const p = command.payload;
          const names = {
            ar: { credit: "قبض من العميل", debit: "صرف للعميل" },
            en: { credit: "Customer receipt", debit: "Customer payout" },
            zh: { credit: "客户收款", debit: "向客户付款" },
            tr: { credit: "Müşteriden tahsilat", debit: "Müşteriye ödeme" },
          };
          const customer =
            base.state.accounts.find(a => a.id === p.customerId)?.name ??
            p.customerId;
          return `${names[language][p.direction]} · ${customer}: ${p.amount} ${p.currency} · ${p.officeId} · ${p.paymentMode} · ${p.description}`;
        }
        const p = command.payload;
        let total = "—";
        try {
          total = String(
            calculateFinanceInvoice(
              p,
              base.state.shipments.find(s => s.id === p.shipmentId)
            ).totalAmount
          );
        } catch {}
        const customer =
          base.state.accounts.find(a => a.id === p.customerId)?.name ??
          p.customerId;
        return `${p.invoiceId} · ${customer}: ${total} ${p.currency} · ${p.paymentMode} · ${p.employeeOfficeId ?? workspace?.snapshot.homeOffice ?? "—"} ← ${p.issuingOfficeId} · ${p.adjustment.direction === "increase" ? "+" : "−"}${p.adjustment.amount}`;
      })
      .join("\n");
    if (!window.confirm(`${w.review}\n\n${review}`)) return null;
    posting.current = true;
    try {
      const userId = base.userId;
      const result = await mutation.mutateAsync({
        commands: batch,
        clientUserId: userId,
      });
      if (
        currentUser.current !== userId ||
        workspaceOwner.current !== userId ||
        !ref.current
      )
        return null;
      const next = applyFinanceSync(ref.current, result);
      await saveFinanceWorkspace(userId, next);
      if (currentUser.current !== userId) return null;
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
      void query.refetch();
      return result;
    } catch (e) {
      setNotice(w.failed);
      return null;
    } finally {
      posting.current = false;
    }
  };
  const sync = () => runSync();
  const syncCommands = (ids: string[]) => runSync(ids);
  const reload = async () => {
    if (!base.userId) return;
    try {
      const next = loadFinanceWorkspace(base.userId);
      ref.current = next;
      setWorkspace(next);
      setError(null);
      if (base.online && !base.localOnly) await query.refetch();
    } catch (e) {
      setError(explain(e));
    }
  };
  const snapshot = workspace?.snapshot ?? emptyFinanceSnapshot();
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
  };
}
