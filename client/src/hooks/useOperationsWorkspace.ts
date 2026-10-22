import { protectOfficeShipmentFinance } from "@shared/officeFinanceVisibility";
import { prepareCustomerAccount } from "@shared/customerAccountCreation";
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
  APP_ROLES,
  canViewFinance,
  canWrite,
  type AppRole,
  type Account,
  type Entity,
  type EntityRecord,
  type LocalState,
  type Shipment,
  type SyncResult,
  type PendingChange,
} from "@shared/operations";
import { canonicalPackingShipment, normalizeTracking } from "@shared/packing";
import { assertShipmentAction } from "@shared/shipmentDeletion";
import {
  canReadOfficeRecord,
  canWriteOfficeRecord,
  type OfficeId,
  ownerOffice,
  officeIds,
} from "@shared/branches";
const PROFILE = "alrefqaa-operations-last-profile-v1";
type Profile = {
  userId: string;
  role: AppRole;
  name?: string;
  offices?: OfficeId[] | null;
};
type AccessResponse = { role: AppRole | null; offices?: OfficeId[] | null };
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
    blocked:
      "بعض التغييرات المعلقة ليست ضمن صلاحية المكتب الحالية، وقد تم الاحتفاظ بها للمراجعة.",
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
    blocked:
      "Some pending changes are outside your current office access and were kept for review.",
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
    blocked: "部分待同步更改不在当前办公室权限内，已保留待审核。",
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
    blocked:
      "Bazı bekleyen değişiklikler mevcut ofis yetkinizde değil; inceleme için korundu.",
  },
};
function readProfile(): Profile | null {
  try {
    const value = JSON.parse(localStorage.getItem(PROFILE) ?? "null");
    return value &&
      /^\d+$/.test(String(value.userId)) &&
      (APP_ROLES as readonly string[]).includes(value.role)
      ? {
          ...value,
          // Older cached profiles had no office scope; retain compatibility as unrestricted.
          offices: Array.isArray(value.offices)
            ? value.offices.filter((office: unknown): office is OfficeId =>
                officeIds.includes(office as OfficeId)
              )
            : null,
        }
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
      ...(s.packing
        ? {
            packing: {
              ...s.packing,
              pricePerKg: 0,
              ...(s.packing.pricePerKgMRU === undefined
                ? {}
                : { pricePerKgMRU: 0 }),
            },
          }
        : {}),
    })),
    invoices: [],
  };
}
function stateCollection(state: LocalState, entity: Entity): EntityRecord[] {
  return state[
    `${entity}s` as "accounts" | "shipments" | "invoices"
  ] as EntityRecord[];
}

function accessAllowsRecord(
  role: AppRole | null,
  offices: OfficeId[] | null,
  entity: Entity,
  record: EntityRecord
) {
  return canReadOfficeRecord(role, offices, entity, record);
}

export function filterStateByAccess(
  state: LocalState,
  role: AppRole | null,
  offices: OfficeId[] | null
): LocalState {
  return {
    ...state,
    accounts: state.accounts.filter(record =>
      accessAllowsRecord(role, offices, "account", record)
    ),
    shipments: state.shipments
      .filter(record => accessAllowsRecord(role, offices, "shipment", record))
      .map(record => protectOfficeShipmentFinance(record, role, offices)),
    invoices: state.invoices.filter(record =>
      accessAllowsRecord(role, offices, "invoice", record)
    ),
  };
}

function changeAllowed(
  workspace: Workspace,
  change: PendingChange,
  role: AppRole | null,
  offices: OfficeId[] | null
) {
  const current = stateCollection(workspace.state, change.entity).find(
    record => record.id === change.recordId
  );
  // A pending upsert must remain in the queue unless both its prior/current
  // scope and its submitted scope are writable. Never disclose blocked labels.
  return Boolean(
    canWriteOfficeRecord(
      role,
      offices,
      change.entity,
      current ?? change.data
    ) && canWriteOfficeRecord(role, offices, change.entity, change.data)
  );
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
  const accessData = access.data as AccessResponse | undefined;
  const role = activeId ? (accessData?.role ?? null) : (profile?.role ?? null);
  const accessReady = !activeId || Boolean(accessData);
  const offices: OfficeId[] | null = activeId
    ? (accessData?.offices ?? null)
    : (profile?.offices ?? null);
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
        JSON.stringify({
          userId: activeId,
          role,
          name: me.data?.name ?? "",
          offices: accessData?.offices ?? null,
        })
      );
    } catch {
      /* no credentials are cached */
    }
  }, [activeId, role, me.data?.name, accessData?.offices]);
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
  const saveRecord = async (
    entity: "account",
    account: Account,
    label?: string
  ): Promise<boolean> => {
    const id = userId,
      current = ref.current;
    if (entity !== "account" || !id || !current || !accessReady || busy) {
      setNotice(w.access);
      return false;
    }
    try {
      const existing =
        current.state.accounts.find(item => item.id === account.id) ?? null;
      const candidate = prepareCustomerAccount(
        account,
        existing,
        role,
        offices
      );
      const next = stageChange(
        current,
        "account",
        candidate,
        label ?? candidate.name
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
  const saveShipment = async (
    shipment: Shipment,
    label?: string,
    action?: PendingChange["action"]
  ): Promise<boolean> => {
    const id = userId,
      current = ref.current;
    if (!id || !current || !canWrite(role, "shipment") || !accessReady) {
      setNotice(w.access);
      return false;
    }
    const existing =
      current.state.shipments.find(s => s.id === shipment.id) ?? null;
    // Preserve an existing operational owner when a legacy editor omits it;
    // never silently reassign an old row to the selected office.
    const candidate =
      existing?.officeId && !shipment.officeId
        ? { ...shipment, officeId: existing.officeId }
        : shipment;
    if (
      !canWriteOfficeRecord(role, offices, "shipment", existing ?? candidate) ||
      !canWriteOfficeRecord(role, offices, "shipment", candidate)
    ) {
      setNotice(w.access);
      return false;
    }
    if (
      current.state.shipments.some(
        s =>
          s.id !== candidate.id &&
          normalizeTracking(s.tracking) ===
            normalizeTracking(candidate.tracking)
      )
    ) {
      setNotice(w.duplicate);
      return false;
    }
    try {
      assertShipmentAction(role, candidate, existing, action);
      const safe = canonicalPackingShipment(
        canViewFinance(role)
          ? candidate
          : {
              ...candidate,
              amount: 0,
              ...(shipment.packing
                ? {
                    packing: {
                      ...shipment.packing,
                      pricePerKg: 0,
                      ...(shipment.packing.pricePerKgMRU === undefined
                        ? {}
                        : { pricePerKgMRU: 0 }),
                    },
                  }
                : {}),
            }
      );
      const next = stageChange(
        current,
        "shipment",
        safe,
        label ?? candidate.tracking,
        action
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
  const runSync = async (
    selected?: Array<{ entity: Entity; recordId: string }>
  ): Promise<SyncResult | null> => {
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
    const batch = current.queue
      .filter(
        change =>
          !selected ||
          selected.some(
            item =>
              item.entity === change.entity && item.recordId === change.recordId
          )
      )
      .filter(change => changeAllowed(current, change, role, offices))
      .slice(0, 500);
    if (!batch.length) {
      setNotice(w.blocked);
      return null;
    }
    if (!confirm(`${w.review}\n\n${batch.map(c => c.label).join("\n")}`))
      return null;
    setBusy(true);
    try {
      const result = await mutation.mutateAsync({ changes: batch });
      if (owner.current !== id) return null;
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
  const sync = () => runSync();
  const syncRecords = (records: Array<{ entity: Entity; recordId: string }>) =>
    runSync(records);
  const resolveConflict = async (
    conflict: SyncResult["conflicts"][number],
    useServer: boolean
  ) => {
    const id = userId,
      current = ref.current;
    if (!id || !current) return;
    const change = current.queue.find(c => c.id === conflict.changeId);
    if (!change) return;
    if (
      useServer &&
      conflict.current &&
      !canReadOfficeRecord(role, offices, change.entity, conflict.current)
    ) {
      setNotice(w.blocked);
      return;
    }
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
  const hidden =
    role === "viewer" || role === "tracking_staff"
      ? EMPTY_STATE
      : hiddenState(
          role === "supervisor"
            ? {
                ...(workspace?.state ?? EMPTY_STATE),
                accounts: [],
                invoices: [],
              }
            : (workspace?.state ?? EMPTY_STATE),
          canViewFinance(role)
        );
  const scopedState = accessReady
    ? filterStateByAccess(hidden, role, offices)
    : EMPTY_STATE;
  const visibleQueue =
    accessReady && workspace
      ? workspace.queue.filter(change =>
          canReadOfficeRecord(role, offices, change.entity, change.data)
        )
      : [];
  return {
    state: scopedState,
    workspace,
    userId,
    role,
    offices,
    canEditShipments: accessReady && canWrite(role, "shipment"),
    canEditAccounts:
      accessReady &&
      canWrite(role, "account") &&
      (offices === null || offices.length > 0),
    showFinance: canViewFinance(role),
    online,
    localOnly,
    loading: (online && me.isLoading) || Boolean(activeId && access.isLoading),
    error,
    notice,
    queue: visibleQueue,
    snapshotError: snapshot.error?.message ?? null,
    saveRecord,
    saveShipment,
    sync,
    syncRecords,
    reload,
    openLocal,
    offlineAvailable: !online && Boolean(readProfile()),
    conflicts,
    resolveConflict,
    busy,
  };
}
