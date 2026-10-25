import { protectOfficeShipmentFinance } from "@shared/officeFinanceVisibility";
import {
  permissionAllowed,
  permissionMapSchema,
  canReadAnyFinance,
  type PermissionMap,
} from "@shared/permissions";
import { prepareCustomerAccount } from "@shared/customerAccountCreation";
import { useEffect, useRef, useState } from "react";
import { useWorkspaceSyncCoordinator } from "@/components/providers/WorkspaceSyncContext";
import type { SyncReason } from "@/lib/autoSync";
import {
  loadWarehousePending,
  removeWarehouseLocation,
} from "@/lib/warehouseStore";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import {
  applySyncResult,
  downloadLocalArchive,
  loadWorkspace,
  mergeSnapshot,
  retryPendingChange,
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
import { canNoteTracking } from "@shared/tracking";
import {
  asPermissionSubject,
  canCreateSourceShipment,
  canDeleteShipments,
  canEditCustomerAccount,
  canEditShipments,
  canOpenLocalWorkspace,
  canSendShipments,
  canStaffSendShipment,
  compatibilityRoleForAction,
  isNouakchottStaff,
  profileMatchesUser,
} from "@/lib/offlineAccess";
import {
  isAuthorizationSyncError,
  isNetworkSyncError,
  isNonFailureSyncOutcome,
  normalizeSyncError,
} from "@/lib/syncErrors";
import { assertShipmentAction } from "@shared/shipmentDeletion";
import { reasonFromError, syncReasonMessage } from "@/lib/syncReasonCopy";
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
  homeOffice?: OfficeId | null;
  permissions?: PermissionMap | null;
  delegatedBy?: number | null;
  permissionFingerprint?: string | null;
};
type AccessResponse = {
  userId?: number;
  role: AppRole | null;
  offices?: OfficeId[] | null;
  homeOffice?: OfficeId | null;
  permissions: PermissionMap;
  delegatedBy?: number | null;
  permissionFingerprint?: string | null;
  canUpdateTracking?: boolean;
};
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
          homeOffice: officeIds.includes(value.homeOffice as OfficeId)
            ? (value.homeOffice as OfficeId)
            : null,
          permissions: permissionMapSchema.safeParse(value.permissions).success
            ? (value.permissions as PermissionMap)
            : null,
          delegatedBy:
            typeof value.delegatedBy === "number" ? value.delegatedBy : null,
          permissionFingerprint:
            typeof value.permissionFingerprint === "string"
              ? value.permissionFingerprint
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
      .filter(
        record =>
          !record.deleted &&
          accessAllowsRecord(role, offices, "shipment", record)
      )
      .map(record => protectOfficeShipmentFinance(record, role, offices)),
    invoices: state.invoices.filter(record =>
      accessAllowsRecord(role, offices, "invoice", record)
    ),
  };
}

function changeAllowed(
  workspace: Workspace,
  change: PendingChange,
  subject: ReturnType<typeof asPermissionSubject>
) {
  const role = subject.role;
  const offices = subject.offices ?? null;
  const current = stateCollection(workspace.state, change.entity).find(
    record => record.id === change.recordId
  );
  // A pending upsert must remain in the queue unless both its prior/current
  // scope and its submitted scope are writable. Never disclose blocked labels.
  const key =
    change.entity === "account"
      ? ("customers" as const)
      : change.entity === "shipment"
        ? change.action === "delete-shipment" ||
          change.action === "restore-shipment"
          ? ("shipment_delete" as const)
          : ("shipments" as const)
        : ("invoices" as const);
  return Boolean(
    permissionAllowed(subject, key, "manage") &&
      change.entity !== "invoice" &&
      canWriteOfficeRecord(
        compatibilityRoleForAction(subject, key, "manage") ?? role,
        offices,
        change.entity,
        current ?? change.data
      ) &&
      canWriteOfficeRecord(
        compatibilityRoleForAction(subject, key, "manage") ?? role,
        offices,
        change.entity,
        change.data
      )
  );
}

export function useOperationsWorkspace() {
  const coordinator = useWorkspaceSyncCoordinator();
  const { language } = useLanguage();
  const w = words[language];
  const [online, setOnline] = useState(navigator.onLine);
  const [profile, setProfile] = useState<Profile | null>(null);
  const me = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const activeId = me.data?.id == null ? null : String(me.data.id);
  const access = trpc.operations.access.useQuery(
    activeId ? { clientUserId: activeId } : undefined,
    {
      enabled: Boolean(activeId),
      retry: false,
      refetchOnWindowFocus: false,
    }
  );
  const rawAccessData = access.data as AccessResponse | undefined;
  // The server always returns userId for production responses. Do not let a
  // late response from another account become the current access snapshot.
  const accessData =
    activeId &&
    rawAccessData?.userId != null &&
    String(rawAccessData.userId) === activeId
      ? rawAccessData
      : undefined;
  const cachedProfile = profile ?? readProfile();
  const offlineIdentity = Boolean(
    activeId && !online && profileMatchesUser(cachedProfile, activeId)
  );
  const role = activeId
    ? (accessData?.role ??
      (offlineIdentity ? (cachedProfile?.role ?? null) : null))
    : null;
  const accessReady = Boolean(activeId && (accessData || offlineIdentity));
  const offices: OfficeId[] | null = activeId
    ? (accessData?.offices ??
      (offlineIdentity ? (cachedProfile?.offices ?? null) : null))
    : null;
  const homeOffice = activeId
    ? (accessData?.homeOffice ??
      (offlineIdentity ? (cachedProfile?.homeOffice ?? null) : null))
    : null;
  const permissions = activeId
    ? (accessData?.permissions ??
      (offlineIdentity ? (cachedProfile?.permissions ?? null) : null))
    : null;
  const delegatedBy =
    accessData?.delegatedBy ??
    (offlineIdentity ? (cachedProfile?.delegatedBy ?? null) : null);
  const permissionFingerprint =
    accessData?.permissionFingerprint ??
    (offlineIdentity ? (cachedProfile?.permissionFingerprint ?? null) : null);
  const scopeOwner = useRef<string | null>(permissionFingerprint ?? null);
  scopeOwner.current = permissionFingerprint ?? null;
  const subject = asPermissionSubject(
    role,
    offices,
    permissions,
    homeOffice,
    accessData?.canUpdateTracking
  );
  const userId = activeId;
  const localOnly = offlineIdentity;
  const snapshot = trpc.operations.snapshot.useQuery(
    activeId
      ? {
          clientUserId: activeId,
          ...(permissionFingerprint
            ? { cacheScope: permissionFingerprint }
            : {}),
        }
      : undefined,
    {
      enabled: Boolean(activeId && role),
      retry: false,
      refetchOnWindowFocus: false,
    }
  );
  const mutation = trpc.operations.sync.useMutation();
  const warehouseMutation = trpc.warehouse.commit.useMutation();
  const utils = trpc.useUtils();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const ref = useRef<Workspace | null>(null);
  const owner = useRef<string | null>(userId);
  owner.current = userId;
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<SyncResult["conflicts"]>([]);
  const [busy, setBusy] = useState(false);
  const [autoSyncState, setAutoSyncState] = useState(coordinator.getState());
  useEffect(() => coordinator.subscribe(setAutoSyncState), [coordinator]);
  // Synchronous mirror of the latest save failure so forms can show the exact
  // reason immediately after an awaited save returns false.
  const lastSaveErrorRef = useRef<string | null>(null);
  const failSave = (reason: string) => {
    const message = syncReasonMessage(reason, language);
    lastSaveErrorRef.current = message;
    setNotice(message);
    return false as const;
  };
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
    if (!userId || !accessReady) {
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
  }, [userId, accessReady]);
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
          homeOffice: accessData?.homeOffice ?? null,
          permissions: accessData?.permissions ?? null,
          delegatedBy: accessData?.delegatedBy ?? null,
          permissionFingerprint: accessData?.permissionFingerprint ?? null,
        })
      );
    } catch {
      /* no credentials are cached */
    }
  }, [
    activeId,
    role,
    me.data?.name,
    accessData?.offices,
    accessData?.homeOffice,
    accessData?.permissions,
    accessData?.delegatedBy,
    accessData?.permissionFingerprint,
  ]);
  useEffect(() => {
    if (!snapshot.data || !activeId || !ref.current) return;
    let stopped = false;
    const responseUserId = activeId;
    const responseScope = permissionFingerprint ?? null;
    const before = ref.current;
    void (async () => {
      try {
        const next = mergeSnapshot(before, snapshot.data, responseUserId);
        if (
          stopped ||
          owner.current !== responseUserId ||
          scopeOwner.current !== responseScope
        )
          return;
        await saveWorkspace(responseUserId, next);
        if (
          !stopped &&
          owner.current === responseUserId &&
          scopeOwner.current === responseScope
        ) {
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
  }, [snapshot.data, activeId, permissionFingerprint]);
  const saveRecord = async (
    entity: "account",
    account: Account,
    label?: string
  ): Promise<boolean> => {
    const id = userId,
      current = ref.current;
    if (
      entity !== "account" ||
      !id ||
      !current ||
      !accessReady ||
      busy ||
      !canEditCustomerAccount(subject)
    ) {
      return failSave(
        role && role !== "accountant"
          ? "finance_command_required"
          : "employee_single_office_required"
      );
    }
    lastSaveErrorRef.current = null;
    try {
      const existing =
        current.state.accounts.find(item => item.id === account.id) ?? null;
      const candidate = prepareCustomerAccount(
        account,
        existing,
        compatibilityRoleForAction(subject, "customers", "manage") ?? role,
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
      void coordinator.request("local-save").catch(() => undefined);
      return true;
    } catch (error) {
      return failSave(reasonFromError(error));
    }
  };
  const saveShipment = async (
    shipment: Shipment,
    label?: string,
    action?: PendingChange["action"]
  ): Promise<boolean> => {
    const id = userId,
      current = ref.current;
    if (
      !id ||
      !current ||
      !canEditShipments(subject) ||
      !canCreateSourceShipment(subject) ||
      !accessReady
    ) {
      return failSave(
        isNouakchottStaff(role, offices)
          ? "warehouse_scope_forbidden"
          : "forbidden"
      );
    }
    lastSaveErrorRef.current = null;
    const existing =
      current.state.shipments.find(s => s.id === shipment.id) ?? null;
    if (existing?.deleted && action !== "delete-shipment")
      return failSave("record_permanently_retired");
    // Preserve an existing operational owner when a legacy editor omits it;
    // never silently reassign an old row to the selected office.
    const candidate =
      existing?.officeId && !shipment.officeId
        ? { ...shipment, officeId: existing.officeId }
        : shipment;
    const actionKey =
      action === "delete-shipment" || action === "restore-shipment"
        ? ("shipment_delete" as const)
        : existing && existing.status !== candidate.status
          ? candidate.status === "في الطريق"
            ? ("shipment_send" as const)
            : ("tracking" as const)
          : ("shipments" as const);
    if (!permissionAllowed(subject, actionKey, "manage")) {
      return failSave("forbidden");
    }
    const actionRole =
      compatibilityRoleForAction(subject, actionKey, "manage") ?? role;
    if (
      !canWriteOfficeRecord(
        actionRole,
        offices,
        "shipment",
        existing ?? candidate
      ) ||
      !canWriteOfficeRecord(actionRole, offices, "shipment", candidate)
    ) {
      return failSave(
        (role === "staff" ||
          role === "accountant" ||
          role === "office_manager") &&
          (!offices || offices.length !== 1)
          ? "employee_single_office_required"
          : "shipment_source_office_mismatch"
      );
    }
    if (
      current.state.shipments.some(
        s =>
          s.id !== candidate.id &&
          normalizeTracking(s.tracking) ===
            normalizeTracking(candidate.tracking)
      )
    ) {
      return failSave("duplicate_tracking");
    }
    try {
      if (!canStaffSendShipment(subject, existing?.status, candidate.status))
        throw new Error("staff_final_status_forbidden");
      assertShipmentAction(actionRole, candidate, existing, action);
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
        action,
        id
      );
      await saveWorkspace(id, next);
      if (owner.current !== id) return false;
      ref.current = next;
      setWorkspace(next);
      setNotice(w.saved);
      void coordinator.request("local-save").catch(() => undefined);
      return true;
    } catch (error) {
      return failSave(reasonFromError(error));
    }
  };
  const runSyncInternal = async (
    selected?: Array<{ entity: Entity; recordId: string }>,
    _operationResult?: SyncResult | null,
    signal?: AbortSignal
  ): Promise<SyncResult | null> => {
    const id = activeId;
    const runScope = permissionFingerprint ?? null;
    let current: Workspace | null;
    try {
      current = id ? loadWorkspace(id) : ref.current;
    } catch (error) {
      const normalized = normalizeSyncError(error);
      if (isNonFailureSyncOutcome(normalized)) return null;
      setNotice(w.syncError);
      throw normalized;
    }
    if (
      !id ||
      localOnly ||
      !online ||
      signal?.aborted ||
      owner.current !== id ||
      scopeOwner.current !== runScope
    ) {
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
      .filter(change => changeAllowed(current, change, subject))
      .slice(0, 500);
    if (!batch.length) {
      setNotice(w.blocked);
      return null;
    }
    setBusy(true);
    try {
      if (
        signal?.aborted ||
        owner.current !== id ||
        scopeOwner.current !== runScope
      )
        return null;
      const result = await mutation.mutateAsync({
        changes: batch,
        clientUserId: id,
      });
      // The request may already have reached the server. Do not erase an
      // uncertain queue entry when the account, scope, or run was superseded.
      if (
        signal?.aborted ||
        owner.current !== id ||
        scopeOwner.current !== runScope
      )
        return null;
      const latest = ref.current ?? current;
      const next = applySyncResult(latest, result, id);
      if (
        signal?.aborted ||
        owner.current !== id ||
        scopeOwner.current !== runScope
      )
        return null;
      await saveWorkspace(id, next);
      if (
        signal?.aborted ||
        owner.current !== id ||
        scopeOwner.current !== runScope
      )
        return null;
      ref.current = next;
      setWorkspace(next);
      setConflicts(result.conflicts);
      utils.operations.snapshot.setData(undefined, previous =>
        previous
          ? applySyncResult({ state: previous, queue: [] }, result, activeId)
              .state
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
    } catch (error) {
      const normalized = normalizeSyncError(error);
      if (isNonFailureSyncOutcome(normalized)) return null;
      setNotice(w.syncError);
      throw normalized;
    } finally {
      setBusy(false);
    }
  };
  const internalSyncRef = useRef(runSyncInternal);
  internalSyncRef.current = runSyncInternal;
  const syncWarehouse = async (signal?: AbortSignal): Promise<string[]> => {
    if (!userId || !accessReady || localOnly || !online) return [];
    const runScope = permissionFingerprint ?? null;
    const accepted: string[] = [];
    const advanced = new Map<string, { from: number; to: number }>();
    let pending: ReturnType<typeof loadWarehousePending>["pending"];
    try {
      pending = loadWarehousePending(userId).pending;
    } catch (error) {
      const normalized = normalizeSyncError(error);
      if (isNonFailureSyncOutcome(normalized)) return accepted;
      throw normalized;
    }
    for (const draft of pending) {
      if (
        signal?.aborted ||
        owner.current !== String(userId) ||
        scopeOwner.current !== runScope
      )
        return accepted;
      const step = advanced.get(draft.shipmentId);
      // Rebase only before this request's first send; never mint a new request id.
      const expectedVersion =
        step && draft.expectedVersion === step.from
          ? step.to
          : draft.expectedVersion;
      try {
        const result = (await warehouseMutation.mutateAsync({
          requestId: draft.requestId,
          shipmentId: draft.shipmentId,
          goodsId: draft.goodsId,
          warehouse: draft.warehouse,
          shelf: draft.shelf,
          expectedVersion,
          clientUserId: String(userId),
        })) as { version: number };
        if (
          signal?.aborted ||
          owner.current !== String(userId) ||
          scopeOwner.current !== runScope
        )
          return accepted;
        advanced.set(draft.shipmentId, {
          from: expectedVersion,
          to: result.version,
        });
        removeWarehouseLocation(userId, draft.requestId);
        accepted.push(draft.requestId);
      } catch (error) {
        const normalized = normalizeSyncError(error);
        if (isNonFailureSyncOutcome(normalized)) return accepted;
        if (
          isNetworkSyncError(normalized) ||
          isAuthorizationSyncError(normalized)
        )
          throw normalized;
        // A conditional conflict blocks later edits for this shipment, but does not
        // freeze unrelated goods. The request remains durable for review/retry.
        if (
          normalized.code.includes("CONFLICT") ||
          normalized.code.includes("VERSION")
        )
          advanced.delete(draft.shipmentId);
        else throw normalized;
      }
    }
    return accepted;
  };
  useEffect(() => {
    if (!userId) return;
    coordinator.setSession(
      String(userId),
      accessReady && !localOnly,
      permissionFingerprint ?? null
    );
    return coordinator.registerOperations({
      userId: String(userId),
      authReady: accessReady && !localOnly,
      online: online && !localOnly,
      pending: () => ref.current?.queue ?? [],
      scopeFingerprint: permissionFingerprint ?? null,
      sync: (selection, operationResult, signal) =>
        internalSyncRef.current(selection, operationResult, signal),
    });
  }, [accessReady, coordinator, online, permissionFingerprint, userId]);
  useEffect(() => {
    if (!userId) return;
    return coordinator.registerWarehouse({
      userId: String(userId),
      scopeFingerprint: permissionFingerprint ?? null,
      authReady: accessReady && !localOnly,
      online: online && !localOnly,
      pending: () => {
        try {
          return loadWarehousePending(userId).pending;
        } catch {
          return [];
        }
      },
      sync: syncWarehouse,
    });
  }, [
    accessReady,
    coordinator,
    localOnly,
    online,
    permissionFingerprint,
    userId,
  ]);
  const requestSync = async (
    reason: SyncReason,
    operationSelection?: Array<{ entity: Entity; recordId: string }>
  ): Promise<SyncResult | null> => {
    try {
      return (await coordinator.request(reason, { operationSelection }))
        .operations;
    } catch {
      return null;
    }
  };
  const sync = () => requestSync("manual");
  const syncRecords = (records: Array<{ entity: Entity; recordId: string }>) =>
    requestSync("manual", records);
  const retryConflict = async (conflict: SyncResult["conflicts"][number]) => {
    const id = userId;
    const current = ref.current;
    if (!id || !current || busy || !accessReady) return;
    const change = current.queue.find(item => item.id === conflict.changeId);
    if (!change || !changeAllowed(current, change, subject)) {
      setNotice(w.blocked);
      return;
    }
    // Only a reviewed, rejected attempt gets a fresh request id. The content,
    // action, expected version and other queued changes stay exactly as saved.
    try {
      const next = retryPendingChange(current, change.id, id);
      await saveWorkspace(id, next);
      if (owner.current !== id) return;
      ref.current = next;
      setWorkspace(next);
      setConflicts(all => all.filter(item => item.changeId !== change.id));
      setNotice(syncReasonMessage("retry_prepared", language));
    } catch (error) {
      setNotice(syncReasonMessage(reasonFromError(error), language));
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
      const next = applySyncResult(current, result, id);
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
    if (navigator.onLine || !activeId) return;
    const saved = readProfile();
    if (canOpenLocalWorkspace(saved, activeId, false)) setProfile(saved);
  };
  const canViewShipments = permissionAllowed(subject, "shipments", "view");
  const canViewCustomers = permissionAllowed(subject, "customers", "view");
  const hidden = hiddenState(
    canViewShipments || canViewCustomers
      ? {
          ...(workspace?.state ?? EMPTY_STATE),
          accounts: canViewCustomers ? (workspace?.state.accounts ?? []) : [],
          shipments: canViewShipments ? (workspace?.state.shipments ?? []) : [],
          invoices: canReadAnyFinance(subject)
            ? (workspace?.state.invoices ?? [])
            : [],
        }
      : EMPTY_STATE,
    canReadAnyFinance(subject)
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
    homeOffice,
    offices,
    canEditShipments: accessReady && canEditShipments(subject),
    canSendShipments: accessReady && canSendShipments(subject),
    canDeleteShipments: accessReady && canDeleteShipments(subject),
    canEditAccounts: accessReady && canEditCustomerAccount(subject),
    canCreateShipments: accessReady && canCreateSourceShipment(subject),
    permissions,
    delegatedBy,
    permissionFingerprint,
    warehouseOnly: isNouakchottStaff(role, offices),
    // Warehouse staff need the explicit per-employee grant; tracking roles
    // (admin, office manager, supervisor, tracking staff) use their role.
    canUpdateTracking:
      accessReady &&
      permissionAllowed(subject, "tracking", "manage") &&
      (role === "staff" ? accessData?.canUpdateTracking === true : true),
    authenticated: Boolean(activeId),
    accessReady,
    showFinance: accessReady && canReadAnyFinance(subject),
    online,
    localOnly,
    loading: (online && me.isLoading) || Boolean(activeId && access.isLoading),
    error,
    notice,
    queue: visibleQueue,
    snapshotError: snapshot.error?.message ?? null,
    saveRecord,
    saveShipment,
    lastSaveError: () => lastSaveErrorRef.current,
    sync,
    syncRecords,
    reload,
    openLocal,
    offlineAvailable: canOpenLocalWorkspace(
      readProfile(),
      activeId,
      online,
      permissionFingerprint
    ),
    conflicts,
    retryConflict,
    resolveConflict,
    busy,
    autoSyncStatus: autoSyncState.status,
    autoSyncQueue: {
      operations: autoSyncState.operationsCount,
      finance: autoSyncState.financeCount,
      warehouse: autoSyncState.warehouseCount,
    },
  };
}
