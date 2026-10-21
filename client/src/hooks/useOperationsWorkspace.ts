import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import {
  applySyncResult,
  downloadLocalArchive,
  loadWorkspace,
  mergeSnapshot,
  saveWorkspace,
  stageChange,
  type Workspace,
} from "@/lib/offlineStore";
import {
  EMPTY_STATE,
  canViewFinance,
  canWrite,
  type AppRole,
  type LocalState,
  type Shipment,
  type SyncResult,
} from "@shared/operations";
import { canonicalPackingShipment, normalizeTracking } from "@shared/packing";
const PROFILE = "alrefqaa-operations-last-profile-v1";
type Profile = { userId: string; role: AppRole; name?: string };
const words = {
  ar: {
    saved: "حُفظت التغييرات محليًا.",
    saveError:
      "تعذر حفظ التغييرات؛ لم نكتب فوق البيانات السابقة. احتفظ بالإدخال وحاول مجددًا.",
    access: "لا تملك صلاحية تعديل الشحنات.",
    review: "مشاركة هذه التغييرات مع الموظفين الآن؟ راجع القائمة قبل التأكيد.",
    none: "لا توجد تغييرات معلقة.",
    offline: "يلزم اتصال وجلسة صالحة لمشاركة البيانات.",
    synced: "أقر الخادم حفظ التغييرات المقبولة.",
    conflicts: "توجد تعارضات تحتاج مراجعة؛ لم تُحذف المسودات.",
    syncError: "تعذرت المزامنة؛ بقيت المسودات محفوظة محليًا.",
    useServer: "استبدال المسودة بنسخة الخادم؟ سننزل أرشيفًا قبل الاستبدال.",
    emptyReceipt: "لم يُقر الخادم أي تغيير. بقي الطابور محفوظًا.",
    duplicate: "رقم الشحنة مستخدم بالفعل.",
  },
  en: {
    saved: "Changes saved locally.",
    saveError:
      "Changes could not be saved; existing data was not overwritten. Keep your input and retry.",
    access: "You cannot edit shipments.",
    review:
      "Share these changes with employees now? Review the list before confirming.",
    none: "No pending changes.",
    offline: "A connection and valid session are required to share data.",
    synced: "The server acknowledged accepted changes.",
    conflicts: "Conflicts need review; drafts were preserved.",
    syncError: "Sync failed; drafts remain saved locally.",
    useServer:
      "Replace the draft with the server version? An archive will be downloaded first.",
    emptyReceipt:
      "The server acknowledged no changes. The queue was preserved.",
    duplicate: "This shipment number is already used.",
  },
  zh: {
    saved: "更改已保存在本地。",
    saveError: "无法保存更改，原有数据未被覆盖。请保留输入并重试。",
    access: "您无权编辑货运。",
    review: "现在与员工共享这些更改吗？请先审核列表。",
    none: "没有待同步更改。",
    offline: "共享数据需要联网和有效登录。",
    synced: "服务器已确认保存可接受的更改。",
    conflicts: "冲突需要审核，草稿未删除。",
    syncError: "同步失败，草稿仍保存在本地。",
    useServer: "用服务器版本替换草稿吗？将先下载存档。",
    emptyReceipt: "服务器未确认任何更改，队列已保留。",
    duplicate: "此货运编号已被使用。",
  },
  tr: {
    saved: "Değişiklikler yerel olarak kaydedildi.",
    saveError:
      "Değişiklikler kaydedilemedi; mevcut veriler korunuyor. Girdinizi koruyup tekrar deneyin.",
    access: "Gönderileri düzenleme yetkiniz yok.",
    review:
      "Bu değişiklikler çalışanlarla paylaşılsın mı? Onaylamadan önce listeyi inceleyin.",
    none: "Bekleyen değişiklik yok.",
    offline: "Paylaşım için bağlantı ve geçerli oturum gerekir.",
    synced: "Sunucu kabul edilen değişiklikleri onayladı.",
    conflicts: "Çakışmalar incelenmeli; taslaklar korunuyor.",
    syncError: "Senkronizasyon başarısız; taslaklar yerelde korunuyor.",
    useServer:
      "Taslak sunucu sürümüyle değiştirilsin mi? Önce arşiv indirilecek.",
    emptyReceipt: "Sunucu değişiklik onaylamadı; kuyruk korundu.",
    duplicate: "Bu gönderi numarası zaten kullanılıyor.",
  },
};
function readProfile(): Profile | null {
  try {
    const value = JSON.parse(localStorage.getItem(PROFILE) ?? "null");
    return value &&
      /^\d+$/.test(String(value.userId)) &&
      ["admin", "staff", "accountant", "viewer"].includes(value.role)
      ? value
      : null;
  } catch {
    return null;
  }
}
function hiddenState(state: LocalState, financial: boolean): LocalState {
  if (financial) return state;
  return {
    ...state,
    accounts: state.accounts.map(a => ({ ...a, balance: 0 })),
    shipments: state.shipments.map(s => ({
      ...s,
      amount: 0,
      ...(s.packing ? { packing: { ...s.packing, pricePerKg: 0 } } : {}),
    })),
    invoices: [],
  };
}
export function useOperationsWorkspace() {
  const { language } = useLanguage();
  const w = words[language];
  const [online, setOnline] = useState(navigator.onLine);
  const [profile, setProfile] = useState<Profile | null>(null);
  const me = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const activeId = me.data?.id == null ? null : String(me.data.id);
  const access = trpc.operations.access.useQuery(undefined, {
    enabled: Boolean(activeId),
    retry: false,
  });
  const role = activeId ? (access.data?.role ?? null) : (profile?.role ?? null);
  const userId = activeId ?? profile?.userId ?? null;
  const localOnly = !activeId && Boolean(profile);
  const snapshot = trpc.operations.snapshot.useQuery(undefined, {
    enabled: Boolean(activeId && role),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const mutation = trpc.operations.sync.useMutation();
  const utils = trpc.useUtils();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const ref = useRef<Workspace | null>(null);
  const owner = useRef<string | null>(userId);
  owner.current = userId;
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<SyncResult["conflicts"]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const on = () => setOnline(true),
      off = () => setOnline(false);
    addEventListener("online", on);
    addEventListener("offline", off);
    return () => {
      removeEventListener("online", on);
      removeEventListener("offline", off);
    };
  }, []);
  useEffect(() => {
    if (!userId) {
      ref.current = null;
      setWorkspace(null);
      return;
    }
    try {
      const current = loadWorkspace(userId);
      ref.current = current;
      setWorkspace(current);
      setError(null);
    } catch {
      ref.current = null;
      setWorkspace(null);
      setError(w.saveError);
    }
  }, [userId]);
  useEffect(() => {
    if (!activeId || !role) return;
    try {
      localStorage.setItem(
        PROFILE,
        JSON.stringify({ userId: activeId, role, name: me.data?.name ?? "" })
      );
    } catch {
      /* no credentials are cached */
    }
  }, [activeId, role, me.data?.name]);
  useEffect(() => {
    if (!snapshot.data || !activeId || !ref.current) return;
    let stopped = false;
    const before = ref.current;
    void (async () => {
      try {
        const next = mergeSnapshot(before, snapshot.data);
        await saveWorkspace(activeId, next);
        if (!stopped && owner.current === activeId) {
          ref.current = next;
          setWorkspace(next);
        }
      } catch {
        if (!stopped) setNotice(w.saveError);
      }
    })();
    return () => {
      stopped = true;
    };
  }, [snapshot.data, activeId]);
  const saveShipment = async (
    shipment: Shipment,
    label?: string
  ): Promise<boolean> => {
    const id = userId,
      current = ref.current;
    if (!id || !current || !canWrite(role, "shipment")) {
      setNotice(w.access);
      return false;
    }
    if (
      current.state.shipments.some(
        s =>
          s.id !== shipment.id &&
          normalizeTracking(s.tracking) === normalizeTracking(shipment.tracking)
      )
    ) {
      setNotice(w.duplicate);
      return false;
    }
    try {
      const safe = canonicalPackingShipment(
        canViewFinance(role)
          ? shipment
          : {
              ...shipment,
              amount: 0,
              ...(shipment.packing
                ? { packing: { ...shipment.packing, pricePerKg: 0 } }
                : {}),
            }
      );
      const next = stageChange(
        current,
        "shipment",
        safe,
        label ?? shipment.tracking
      );
      await saveWorkspace(id, next);
      if (owner.current !== id) return false;
      ref.current = next;
      setWorkspace(next);
      setNotice(w.saved);
      return true;
    } catch {
      setNotice(w.saveError);
      return false;
    }
  };
  const sync = async (): Promise<SyncResult | null> => {
    const id = activeId,
      current = ref.current;
    if (!id || localOnly || !online) {
      setNotice(w.offline);
      return null;
    }
    if (!current || busy) return null;
    if (!current.queue.length) {
      setNotice(w.none);
      return null;
    }
    const batch = current.queue.slice(0, 500);
    if (!confirm(`${w.review}\n\n${batch.map(c => c.label).join("\n")}`))
      return null;
    setBusy(true);
    try {
      const result = await mutation.mutateAsync({ changes: batch });
      const latest = ref.current ?? current;
      const next = applySyncResult(latest, result);
      await saveWorkspace(id, next);
      if (owner.current !== id) return null;
      ref.current = next;
      setWorkspace(next);
      setConflicts(result.conflicts);
      utils.operations.snapshot.setData(undefined, previous =>
        previous
          ? applySyncResult({ state: previous, queue: [] }, result).state
          : undefined
      );
      setNotice(
        result.conflicts.length
          ? w.conflicts
          : result.applied.length
            ? w.synced
            : w.emptyReceipt
      );
      return result;
    } catch {
      setNotice(w.syncError);
      return null;
    } finally {
      setBusy(false);
    }
  };
  const resolveConflict = async (
    conflict: SyncResult["conflicts"][number],
    useServer: boolean
  ) => {
    const id = userId,
      current = ref.current;
    if (!id || !current) return;
    const change = current.queue.find(c => c.id === conflict.changeId);
    if (!change) return;
    if (useServer && (!conflict.current || !confirm(w.useServer))) return;
    try {
      if (useServer) downloadLocalArchive(id);
      const result: SyncResult = {
        applied:
          useServer && conflict.current
            ? [
                {
                  changeId: change.id,
                  entity: change.entity,
                  record: conflict.current,
                },
              ]
            : [],
        conflicts: [],
      };
      const next = applySyncResult(current, result);
      await saveWorkspace(id, next);
      ref.current = next;
      setWorkspace(next);
      setConflicts(all => all.filter(c => c.changeId !== change.id));
    } catch {
      setNotice(w.saveError);
    }
  };
  const reload = async () => {
    if (!userId) return;
    try {
      const current = loadWorkspace(userId);
      ref.current = current;
      setWorkspace(current);
      setError(null);
      if (activeId && online) await snapshot.refetch();
    } catch {
      setError(w.saveError);
    }
  };
  const openLocal = () => {
    if (navigator.onLine) return;
    const saved = readProfile();
    if (saved) setProfile(saved);
  };
  return {
    state: hiddenState(workspace?.state ?? EMPTY_STATE, canViewFinance(role)),
    workspace,
    userId,
    role,
    canEditShipments: canWrite(role, "shipment"),
    showFinance: canViewFinance(role),
    online,
    localOnly,
    loading: (online && me.isLoading) || Boolean(activeId && access.isLoading),
    error,
    notice,
    queue: workspace?.queue ?? [],
    snapshotError: snapshot.error?.message ?? null,
    saveShipment,
    sync,
    reload,
    openLocal,
    offlineAvailable: !online && Boolean(readProfile()),
    conflicts,
    resolveConflict,
    busy,
  };
}
