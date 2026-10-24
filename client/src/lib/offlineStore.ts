import {
  EMPTY_STATE,
  type Entity,
  type EntityRecord,
  type LocalState,
  type PendingChange,
  type SyncResult,
} from "@shared/operations";
import { workspaceSchema } from "@shared/localValidation";
import {
  archiveRetirementConflicts,
  downloadRetirementArchive,
  isRememberedRetirement,
  rememberRetirements,
  rememberedRetirements,
  retirementKey,
  type RetiredRecord,
  type RetirementArchiveItem,
} from "./retirementStore";
export type {
  Account,
  Shipment,
  Invoice,
  DataScope,
  LocalState,
  PendingChange,
} from "@shared/operations";
export type Workspace = {
  state: LocalState;
  queue: PendingChange[];
  revision?: number;
};
export type { RetiredRecord } from "./retirementStore";
const PREFIX = "alrefqa-copy-workspace-v2-";
const collections = {
  account: "accounts",
  shipment: "shipments",
  invoice: "invoices",
} as const;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export const emptyWorkspace = (): Workspace => ({
  state: clone(EMPTY_STATE),
  queue: [],
  revision: 0,
});
function storage(): Storage {
  try {
    if (typeof window === "undefined") throw new Error("unavailable");
    return window.localStorage;
  } catch {
    throw new Error(
      "تعذر الوصول إلى التخزين المحلي. لم يتم حذف بياناتك. اسمح بالتخزين أو استخدم متصفحًا آخر."
    );
  }
}
function parseStored(raw: string): Workspace {
  try {
    return workspaceSchema.parse(JSON.parse(raw)) as Workspace;
  } catch {
    throw new Error(
      "تعذر قراءة البيانات المحلية. حُفظت النسخة الأصلية دون تغيير؛ صدّرها للمراجعة قبل المتابعة."
    );
  }
}
export function loadWorkspace(userId: number | string): Workspace {
  const raw = storage().getItem(`${PREFIX}${userId}`);
  return applyRetirements(
    userId,
    raw ? parseStored(raw) : emptyWorkspace(),
    []
  );
}
let lockDatabase: Promise<IDBDatabase> | null = null;
function openLockDatabase(): Promise<IDBDatabase> {
  if (!lockDatabase)
    lockDatabase = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("تعذر تأمين الحفظ المحلي في هذا المتصفح."));
        return;
      }
      const request = indexedDB.open("alrefqaa-workspace-locks", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("locks"))
          request.result.createObjectStore("locks");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  return lockDatabase;
}
export async function withWorkspaceLock(
  key: string,
  write: () => void
): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    await navigator.locks.request(key, () => write());
    return;
  }
  // IndexedDB read/write transactions serialize across tabs when Web Locks is unavailable.
  const db = await openLockDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("locks", "readwrite");
    const request = tx.objectStore("locks").get(key);
    request.onsuccess = () => {
      try {
        write();
        tx.objectStore("locks").put(Date.now(), key);
      } catch (error) {
        tx.abort();
        reject(error);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(tx.error ?? new Error("تعذر تأمين الحفظ المحلي."));
  });
}
export async function saveWorkspace(
  userId: number | string,
  value: Workspace
): Promise<void> {
  const key = `${PREFIX}${userId}`;
  workspaceSchema.parse(value);
  await withWorkspaceLock(key, () => {
    const store = storage();
    const raw = store.getItem(key);
    const current = raw ? parseStored(raw) : emptyWorkspace();
    if ((current.revision ?? 0) !== (value.revision ?? 0))
      throw new Error(
        "تغيرت هذه المساحة في تبويب آخر. لم نكتب فوقها. صدّر المسودة الحالية ثم أعد تحميل البيانات قبل الحفظ."
      );
    const revision = (current.revision ?? 0) + 1;
    try {
      store.setItem(key, JSON.stringify({ ...value, revision }));
      value.revision = revision;
    } catch {
      throw new Error(
        "لم تُحفظ التغييرات: التخزين المحلي محظور أو ممتلئ. لا تغلق النافذة قبل نسخ بياناتك."
      );
    }
  });
}
function putRecord(
  state: LocalState,
  entity: Entity,
  record: EntityRecord
): LocalState {
  const key = collections[entity];
  const list = state[key] as EntityRecord[];
  return {
    ...state,
    [key]: list.some(item => item.id === record.id)
      ? list.map(item => (item.id === record.id ? record : item))
      : [...list, record],
  };
}
export function stageChange(
  workspace: Workspace,
  entity: Entity,
  data: EntityRecord,
  label: string,
  action?: PendingChange["action"],
  userId?: number | string
): Workspace {
  if (
    userId !== undefined &&
    isRememberedRetirement(userId, { entity, recordId: data.id })
  )
    throw new Error("record_permanently_retired");
  const key = collections[entity];
  const pending = workspace.queue.filter(
    change => change.entity === entity && change.recordId === data.id
  );
  const previous = pending.at(-1);
  const saved = (workspace.state[key] as EntityRecord[]).find(
    item => item.id === data.id
  );
  const change: PendingChange = {
    id: crypto.randomUUID(),
    recordId: data.id,
    entity,
    label,
    createdAt: new Date().toISOString(),
    expectedVersion: previous
      ? previous.expectedVersion
      : (saved?.version ?? null),
    data: { ...data, scope: "pending" },
    ...((action ?? previous?.action)
      ? { action: action ?? previous?.action }
      : {}),
  };
  const base = pending.find(item => !item.action);
  // Preserve a pending upsert before an explicit archive action on a shared row.
  // The server must receive the cargo edit first, then an identical archive payload at its next version.
  const prefix =
    entity === "shipment" &&
    change.action &&
    base &&
    base.expectedVersion !== null
      ? [base]
      : [];
  if (prefix.length) change.expectedVersion = base!.expectedVersion! + 1;
  return {
    ...workspace,
    state: putRecord(workspace.state, entity, change.data),
    queue: [
      ...workspace.queue.filter(
        item => !(item.entity === entity && item.recordId === data.id)
      ),
      ...prefix,
      change,
    ],
  };
}
export function mergeSnapshot(
  workspace: Workspace,
  snapshot: LocalState,
  userId?: number | string
): Workspace {
  const { retiredRecords: _retiredRecords, ...snapshotState } =
    snapshot as LocalState & {
      retiredRecords?: RetiredRecord[];
    };
  void _retiredRecords;
  let state = clone(snapshotState);
  for (const entity of ["account", "shipment", "invoice"] as const)
    for (const record of workspace.state[collections[entity]])
      if (record.scope === "local") state = putRecord(state, entity, record);
  for (const change of workspace.queue)
    state = putRecord(state, change.entity, {
      ...change.data,
      scope: "pending",
    });
  const merged = { ...workspace, state, queue: workspace.queue };
  return userId === undefined
    ? merged
    : applyRetirements(
        userId,
        merged,
        (snapshot as LocalState & { retiredRecords?: RetiredRecord[] })
          .retiredRecords ?? []
      );
}
export function applySyncResult(
  workspace: Workspace,
  result: SyncResult,
  userId?: number | string
): Workspace {
  const appliedIds = new Set(result.applied.map(change => change.changeId));
  const queue = workspace.queue.filter(change => !appliedIds.has(change.id));
  let state = workspace.state;
  for (const acknowledged of result.applied)
    if (
      !queue.some(
        change =>
          change.entity === acknowledged.entity &&
          change.recordId === acknowledged.record.id
      )
    )
      state = putRecord(state, acknowledged.entity, {
        ...acknowledged.record,
        scope: "shared",
      });
  const next = {
    ...workspace,
    state: {
      ...state,
      lastSyncedAt: result.applied.length
        ? new Date().toISOString()
        : state.lastSyncedAt,
    },
    queue,
  };
  if (userId === undefined) return next;
  const retired = result.applied
    .filter(
      change =>
        change.entity === "shipment" &&
        "deleted" in change.record &&
        Boolean(change.record.deleted)
    )
    .map(change => ({ entity: change.entity, recordId: change.record.id }));
  return applyRetirements(userId, next, retired);
}
/** Explicit retry creates a new request, never a new record or an automatic rebase. */
export function retryPendingChange(
  workspace: Workspace,
  changeId: string,
  userId?: number | string
): Workspace {
  const change = workspace.queue.find(item => item.id === changeId);
  if (!change) throw new Error("pending_change_not_found");
  if (
    userId !== undefined &&
    isRememberedRetirement(userId, {
      entity: change.entity,
      recordId: change.recordId,
    })
  )
    throw new Error("record_permanently_retired");
  return {
    ...workspace,
    queue: workspace.queue.map(change =>
      change.id === changeId
        ? {
            ...change,
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
          }
        : change
    ),
  };
}
export function downloadLocalArchive(userId?: number | string): void {
  const store = storage();
  const rawWorkspace =
    userId === undefined ? null : store.getItem(`${PREFIX}${userId}`);
  let workspace = rawWorkspace;
  if (userId !== undefined && rawWorkspace) {
    try {
      workspace = JSON.stringify(loadWorkspace(userId));
    } catch {
      // Keep an unreadable original available for manual recovery.
      workspace = rawWorkspace;
    }
  }
  const archive = {
    exportedAt: new Date().toISOString(),
    legacyState: store.getItem("alrefqa-copy-state-v1"),
    legacyQueue: store.getItem("alrefqa-copy-queue-v1"),
    workspace,
    retirementStore:
      userId === undefined
        ? null
        : store.getItem(`alrefqaa-retirements-v1-${userId}`),
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(archive, null, 2)], { type: "application/json" })
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "alrefqaa-local-archive.json";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export { downloadRetirementArchive } from "./retirementStore";

function applyRetirements(
  userId: number | string,
  workspace: Workspace,
  incoming: readonly RetiredRecord[]
): Workspace {
  const retired = rememberRetirements(userId, incoming);
  const retiredKeys = new Set(retired.map(retirementKey));
  if (!retiredKeys.size) return workspace;
  const conflicts: RetirementArchiveItem[] = [];
  for (const item of retired) {
    const records =
      item.entity === "account"
        ? workspace.state.accounts
        : item.entity === "shipment"
          ? workspace.state.shipments
          : workspace.state.invoices;
    const record = records.find(candidate => candidate.id === item.recordId);
    const pending = workspace.queue.find(
      change =>
        change.entity === item.entity && change.recordId === item.recordId
    );
    if (record || pending)
      conflicts.push({
        archivedAt: new Date().toISOString(),
        retirement: item,
        ...(record ? { record } : {}),
        ...(pending ? { pending } : {}),
      });
  }
  archiveRetirementConflicts(userId, conflicts);
  return {
    ...workspace,
    state: {
      ...workspace.state,
      accounts: workspace.state.accounts.filter(
        record => !retiredKeys.has(`account:${record.id}`)
      ),
      shipments: workspace.state.shipments.filter(
        record => !retiredKeys.has(`shipment:${record.id}`) && !record.deleted
      ),
      invoices: workspace.state.invoices.filter(
        record => !retiredKeys.has(`invoice:${record.id}`)
      ),
    },
    queue: workspace.queue.filter(
      change => !retiredKeys.has(`${change.entity}:${change.recordId}`)
    ),
  };
}
export function formatMRU(value: number, locale = "ar-MR"): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
    value
  );
}
