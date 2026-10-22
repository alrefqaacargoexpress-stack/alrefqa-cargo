import { useEffect, useRef, useState } from "react";
import { useOperationsWorkspace } from "./useOperationsWorkspace";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import {
  canUseFinance,
  calculateFinanceInvoice,
  emptyFinanceSnapshot,
  type FinanceCommand,
  type FinanceSyncResult,
} from "@shared/finance";
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
  const permission = canUseFinance(base.role);
  const query = trpc.finance.snapshot.useQuery(
    { clientUserId: base.userId ?? "not-logged-in" },
    {
      enabled: Boolean(
        base.userId && permission && base.online && !base.localOnly
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
    if (!base.userId) return;
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
  }, [base.userId]);
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
  const canEdit =
    permission &&
    Boolean(base.userId) &&
    !base.error &&
    !error &&
    !denied &&
    !mutation.isPending;
  const saveCommand = async (command: FinanceCommand): Promise<boolean> => {
    if (
      !canEdit ||
      !base.userId ||
      workspaceOwner.current !== base.userId ||
      !ref.current
    ) {
      setNotice(w.forbidden);
      return false;
    }
    const office =
      command.kind === "invoice"
        ? (command.payload.employeeOfficeId ??
          workspace?.snapshot.homeOffice ??
          command.payload.issuingOfficeId)
        : command.kind === "expense"
          ? command.payload.officeId
          : workspace?.snapshot.invoices.find(
              i => i.id === command.payload.invoiceId
            )?.officeId;
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
  const sync = async (): Promise<FinanceSyncResult | null> => {
    if (
      mutation.isPending ||
      !base.online ||
      base.localOnly ||
      !base.userId ||
      !canEdit ||
      !ref.current
    ) {
      setNotice(w.offline);
      return null;
    }
    const available = ref.current.commands.filter(command => {
      const office =
        command.kind === "expense"
          ? command.payload.officeId
          : command.kind === "invoice"
            ? (command.payload.employeeOfficeId ??
              workspace?.snapshot.homeOffice ??
              command.payload.issuingOfficeId)
            : workspace?.snapshot.invoices.find(
                i => i.id === command.payload.invoiceId
              )?.officeId;
      return office ? officeAllowed(office) : false;
    });
    const batch = available.slice(0, 100);
    if (!batch.length) return null;
    const review = batch
      .map(command => {
        if (command.kind === "expense")
          return `${command.payload.category}: ${command.payload.amount} ${command.payload.currency} · ${command.payload.officeId} · ${command.payload.description}`;
        if (command.kind === "settlement")
          return `${command.payload.invoiceId}: ${command.payload.amount} · ${command.payload.description}`;
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
        return result;
      const next = applyFinanceSync(ref.current, result);
      await saveFinanceWorkspace(userId, next);
      if (currentUser.current !== userId) return result;
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
    }
  };
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
    workspaceOwner.current === base.userId &&
    !denied &&
    !base.error;
  return {
    base,
    loading: base.loading || (query.isLoading && base.online),
    role: base.role,
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
    commands: visible
      ? (workspace?.commands ?? []).filter(c =>
          c.kind === "expense"
            ? officeAllowed(c.payload.officeId)
            : c.kind === "invoice"
              ? officeAllowed(
                  c.payload.employeeOfficeId ??
                    snapshot.homeOffice ??
                    c.payload.issuingOfficeId
                )
              : (() => {
                  const office = snapshot.invoices.find(
                    i => i.id === c.payload.invoiceId
                  )?.officeId;
                  return Boolean(office && officeAllowed(office));
                })()
        )
      : [],
    error: error ?? (denied ? w.forbidden : null),
    notice,
    conflicts,
    canEdit,
    saveCommand,
    sync,
    reload,
    busy: mutation.isPending,
    store: workspace,
    snapshotError: query.error && !denied ? w.fetchFailed : null,
  };
}
