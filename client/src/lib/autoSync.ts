import type { FinanceCommand, FinanceSyncResult } from "@shared/finance";
import type { Entity, PendingChange, SyncResult } from "@shared/operations";
import type { PendingWarehouseLocation } from "./warehouseStore";
import { normalizeSyncError } from "./syncErrors";

export type SyncReason =
  | "local-save"
  | "online"
  | "focus"
  | "auth-ready"
  | "manual"
  | "storage"
  | "broadcast";
export type AutoSyncStatus =
  | "idle"
  | "pending"
  | "syncing"
  | "offline"
  | "review";

export type AutoSyncState = {
  status: AutoSyncStatus;
  operationsCount: number;
  financeCount: number;
  warehouseCount: number;
  trackingCount: number;
  trackingLastResult: unknown | null;
  lastError: string | null;
  reason: SyncReason | null;
};

type RunInput = {
  operationSelection?: Array<{ entity: Entity; recordId: string }>;
  financeSelection?: string[];
  trackingSelection?: string[];
  recovery?: boolean;
};
export type AutoSyncRunResult = {
  operations: SyncResult | null;
  finance: FinanceSyncResult | null;
  warehouseApplied: string[];
  tracking: unknown | null;
};

type OperationsAdapter = {
  userId: string;
  scopeFingerprint?: string | null;
  authReady: boolean;
  online: boolean;
  pending: () => PendingChange[];
  sync: (
    selection?: Array<{ entity: Entity; recordId: string }>,
    operationResult?: SyncResult | null,
    signal?: AbortSignal
  ) => Promise<SyncResult | null>;
};
type FinanceAdapter = {
  userId: string;
  scopeFingerprint?: string | null;
  authReady: boolean;
  online: boolean;
  pending: () => FinanceCommand[];
  sync: (
    selection?: string[],
    operationResult?: SyncResult | null,
    signal?: AbortSignal
  ) => Promise<FinanceSyncResult | null>;
};
type WarehouseAdapter = {
  userId: string;
  scopeFingerprint?: string | null;
  authReady: boolean;
  online: boolean;
  pending: () => PendingWarehouseLocation[];
  sync: (signal?: AbortSignal) => Promise<string[]>;
};
export type TrackingPendingItem = {
  requestId: string;
  shipmentId?: string;
  expectedVersion?: number;
  command?: unknown;
  commandFingerprint?: string;
};
export type TrackingAdapter = {
  userId: string;
  scopeFingerprint?: string | null;
  authReady: boolean;
  online: boolean;
  pending: number | (() => number);
  pendingItems?: TrackingPendingItem[] | (() => TrackingPendingItem[]);
  sync: (selection?: string[], signal?: AbortSignal) => Promise<unknown>;
};

type Lease = { key: string; owner: string; expiresAt: number };
type BlockedItem = {
  reason: string;
  fingerprint: string | null;
  commandFingerprint?: string | null;
  version?: number;
};
const fallbackLocks = new Map<string, Promise<void>>();
let leaseDb: Promise<IDBDatabase> | null = null;
const LEASE_TTL = 15_000;
const LEASE_HEARTBEAT = 5_000;
type TransportLockTestHooks = {
  openDb?: () => Promise<IDBDatabase>;
  leaseTtlMs?: number;
  heartbeatMs?: number;
};
let transportLockTestHooks: TransportLockTestHooks = {};

/** Test-only seam: production always uses the browser IndexedDB clock/database. */
export function setTransportLockTestHooks(
  hooks: TransportLockTestHooks | null
): void {
  transportLockTestHooks = hooks ?? {};
  leaseDb = null;
}

function emptyRunResult(): AutoSyncRunResult {
  return {
    operations: null,
    finance: null,
    warehouseApplied: [],
    tracking: null,
  };
}
function randomId(prefix: string): string {
  try {
    return `${prefix}-${crypto.randomUUID()}`;
  } catch {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function browserRuntime(): boolean {
  return typeof window !== "undefined";
}
function openLeaseDb(): Promise<IDBDatabase> {
  if (transportLockTestHooks.openDb) return transportLockTestHooks.openDb();
  if (!leaseDb)
    leaseDb = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("transport_lock_unavailable"));
        return;
      }
      const request = indexedDB.open("alrefqaa-auto-sync-leases", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("leases"))
          request.result.createObjectStore("leases", { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error("transport_lock_unavailable"));
    });
  return leaseDb;
}

/** Each lease transaction is short; the network work never runs inside IDB. */
async function claimLease(db: IDBDatabase, lease: Lease): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("leases", "readwrite");
    const store = tx.objectStore("leases");
    const get = store.get(lease.key);
    let claimed = false;
    get.onsuccess = () => {
      const current = get.result as Lease | undefined;
      if (
        !current ||
        current.expiresAt <= Date.now() ||
        current.owner === lease.owner
      ) {
        store.put(lease);
        claimed = true;
      }
    };
    tx.oncomplete = () => resolve(claimed);
    tx.onerror = () =>
      reject(tx.error ?? new Error("transport_lock_unavailable"));
    tx.onabort = () =>
      reject(tx.error ?? new Error("transport_lock_unavailable"));
  });
}
async function renewLease(db: IDBDatabase, lease: Lease): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("leases", "readwrite");
    const store = tx.objectStore("leases");
    const get = store.get(lease.key);
    let renewed = false;
    get.onsuccess = () => {
      const current = get.result as Lease | undefined;
      if (current?.owner === lease.owner && current.expiresAt > Date.now()) {
        store.put({
          ...lease,
          expiresAt:
            Date.now() + (transportLockTestHooks.leaseTtlMs ?? LEASE_TTL),
        });
        renewed = true;
      }
    };
    tx.oncomplete = () => resolve(renewed);
    tx.onerror = () =>
      reject(tx.error ?? new Error("transport_lock_unavailable"));
    tx.onabort = () =>
      reject(tx.error ?? new Error("transport_lock_unavailable"));
  });
}
async function releaseLease(
  db: IDBDatabase,
  key: string,
  owner: string
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("leases", "readwrite");
    const store = tx.objectStore("leases");
    const get = store.get(key);
    get.onsuccess = () => {
      const current = get.result as Lease | undefined;
      if (current?.owner === owner) store.delete(key);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error("transport_lock_unavailable"));
    tx.onabort = () =>
      reject(tx.error ?? new Error("transport_lock_unavailable"));
  });
}

async function withMemoryTransportLock<T>(
  key: string,
  work: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal
): Promise<T> {
  const previous = fallbackLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  const chained = previous.then(() => gate);
  fallbackLocks.set(key, chained);
  await previous;
  try {
    return await work(signal);
  } finally {
    release();
    if (fallbackLocks.get(key) === chained) fallbackLocks.delete(key);
  }
}

/**
 * Serializes network sends per account. Browser runtimes fail closed when neither
 * Web Locks nor IndexedDB is available; the in-memory queue is test/SSR-only.
 */
export async function withUserTransportLock<T>(
  userId: string,
  work: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const key = `alrefqaa-sync:${userId}`;
  const controller = new AbortController();
  if (typeof navigator !== "undefined" && navigator.locks)
    return navigator.locks.request(key, { mode: "exclusive" }, () =>
      work(controller.signal)
    );

  let db: IDBDatabase;
  try {
    db = await openLeaseDb();
  } catch (error) {
    if (browserRuntime()) throw error;
    return withMemoryTransportLock(key, work, controller.signal);
  }

  const lease: Lease = {
    key,
    owner: randomId("tab"),
    expiresAt: Date.now() + (transportLockTestHooks.leaseTtlMs ?? LEASE_TTL),
  };
  while (!(await claimLease(db, lease))) await sleep(25 + Math.random() * 50);
  let lostReject!: (error: Error) => void;
  let leaseLost = false;
  lostReject = () => {
    leaseLost = true;
    controller.abort();
  };
  let heartbeat: ReturnType<typeof setInterval> | null = setInterval(() => {
    void renewLease(db, lease)
      .then(renewed => {
        if (!renewed) lostReject(new Error("transport_lock_lost"));
      })
      .catch(() => lostReject(new Error("transport_lock_lost")));
  }, transportLockTestHooks.heartbeatMs ?? LEASE_HEARTBEAT);
  const workPromise = Promise.resolve().then(() => work(controller.signal));
  try {
    const value = await workPromise;
    // A heartbeat can lose the lease immediately after the last request. Do
    // not report a successful round after that point.
    if (leaseLost) throw new Error("transport_lock_lost");
    return value;
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    // workPromise is deliberately awaited before releasing the lease. An HTTP
    // request already accepted by the server cannot be cancelled safely; its
    // stable receipt/request ID must remain the only retry identity.
    await workPromise.catch(() => undefined);
    await releaseLease(db, key, lease.owner).catch(() => undefined);
  }
}

function isNetworkError(error: unknown): boolean {
  const normalized = normalizeSyncError(error);
  if (normalized.code === "NETWORK") return true;
  const message = normalized.message.toLowerCase();
  return Boolean(
    (typeof navigator !== "undefined" && !navigator.onLine) ||
      message.includes("network") ||
      message.includes("fetch") ||
      message.includes("timeout") ||
      message.includes("offline")
  );
}
function needsReview(error: unknown): boolean {
  const normalized = normalizeSyncError(error);
  if (
    normalized.code === "FORBIDDEN" ||
    normalized.code === "UNAUTHORIZED" ||
    normalized.code === "CONFLICT"
  )
    return true;
  const message = normalized.message.toLowerCase();
  return [
    "forbidden",
    "unauthorized",
    "permission",
    "conflict",
    "version",
    "owner",
    "session",
    "auth",
  ].some(token => message.includes(token));
}
function safePending<T>(read: () => T[]): T[] {
  try {
    return read();
  } catch {
    return [];
  }
}
function safeCount(read: () => number): number {
  try {
    return Math.max(0, read());
  } catch {
    return 0;
  }
}

export class AutoSyncCoordinator {
  private operations = new Set<OperationsAdapter>();
  private finance = new Set<FinanceAdapter>();
  private warehouse = new Set<WarehouseAdapter>();
  private tracking = new Set<TrackingAdapter>();
  private userId: string | null = null;
  private authReady = false;
  private scopeFingerprint: string | null = null;
  private sessionEpoch = 0;
  private lifecycleEpoch = 0;
  private listeners = new Set<(state: AutoSyncState) => void>();
  private channel: BroadcastChannel | null = null;
  private state: AutoSyncState = {
    status: "idle",
    operationsCount: 0,
    financeCount: 0,
    warehouseCount: 0,
    trackingCount: 0,
    trackingLastResult: null,
    lastError: null,
    reason: null,
  };
  private runPromise: Promise<AutoSyncRunResult> | null = null;
  private runUserId: string | null = null;
  private scheduled = false;
  private rerunNeeded = false;
  private rerunReason: SyncReason = "local-save";
  private rerunInput: RunInput = {};
  private retryCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private blocked = new Map<string, BlockedItem>();
  private onOnline = () => {
    void this.request("online").catch(() => undefined);
  };
  private onFocus = () => {
    void this.request("focus").catch(() => undefined);
  };
  private onVisibility = () => {
    if (document.visibilityState === "visible")
      void this.request("focus").catch(() => undefined);
  };
  private onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith("alrefqa") || event.key?.startsWith("alrefqaa"))
      void this.request("storage").catch(() => undefined);
  };

  start(): () => void {
    if (this.started) return () => undefined;
    this.started = true;
    if (typeof window !== "undefined") {
      addEventListener("online", this.onOnline);
      addEventListener("focus", this.onFocus);
      addEventListener("visibilitychange", this.onVisibility);
      addEventListener("storage", this.onStorage);
      try {
        this.channel =
          typeof BroadcastChannel === "undefined"
            ? null
            : new BroadcastChannel("alrefqaa-auto-sync");
        this.channel?.addEventListener("message", event => {
          if (event.data?.type === "auto-sync-request")
            void this.request("broadcast").catch(() => undefined);
        });
      } catch {
        this.channel = null;
      }
    }
    return () => this.stop();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.lifecycleEpoch += 1;
    if (typeof window !== "undefined") {
      removeEventListener("online", this.onOnline);
      removeEventListener("focus", this.onFocus);
      removeEventListener("visibilitychange", this.onVisibility);
      removeEventListener("storage", this.onStorage);
    }
    this.channel?.close();
    this.channel = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.scheduled = false;
    // In-flight adapters are allowed to finish; their durable queues remain intact.
  }

  setSession(
    userId: string | null,
    authReady: boolean,
    scopeFingerprint: string | null = null
  ): void {
    const identityChanged =
      this.userId !== userId || this.scopeFingerprint !== scopeFingerprint;
    const authRevoked = this.authReady && !authReady;
    const authEdge = !this.authReady && authReady && this.userId === userId;
    this.userId = userId;
    this.authReady = authReady;
    this.scopeFingerprint = scopeFingerprint;
    if (identityChanged || authRevoked) {
      this.sessionEpoch += 1;
      this.retryCount = 0;
      this.blocked.clear();
      this.state = {
        ...this.state,
        status: "idle",
        operationsCount: 0,
        financeCount: 0,
        warehouseCount: 0,
        trackingCount: 0,
        trackingLastResult: null,
        lastError: null,
        reason: null,
      };
      this.emit();
    }
    if ((identityChanged || authEdge) && userId && authReady)
      void this.request("auth-ready").catch(() => undefined);
  }

  registerOperations(adapter: OperationsAdapter): () => void {
    this.operations.add(adapter);
    this.refreshCounts();
    return () => {
      this.operations.delete(adapter);
      this.refreshCounts();
    };
  }
  registerFinance(adapter: FinanceAdapter): () => void {
    this.finance.add(adapter);
    this.refreshCounts();
    return () => {
      this.finance.delete(adapter);
      this.refreshCounts();
    };
  }
  registerWarehouse(adapter: WarehouseAdapter): () => void {
    this.warehouse.add(adapter);
    this.refreshCounts();
    return () => {
      this.warehouse.delete(adapter);
      this.refreshCounts();
    };
  }
  registerTracking(adapter: TrackingAdapter): () => void {
    this.tracking.add(adapter);
    this.refreshCounts();
    return () => {
      this.tracking.delete(adapter);
      this.refreshCounts();
    };
  }

  getState(): AutoSyncState {
    return this.state;
  }
  subscribe(listener: (state: AutoSyncState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  async request(
    reason: SyncReason = "manual",
    input: RunInput = {}
  ): Promise<AutoSyncRunResult> {
    if (this.runPromise) {
      this.rerunNeeded = true;
      this.rerunReason = reason;
      this.rerunInput = this.mergeInput(this.rerunInput, input);
      return this.runPromise;
    }
    if (!this.userId || !this.authReady) return emptyRunResult();
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      this.setStatus("offline", reason);
      return emptyRunResult();
    }
    this.clearExplicitReview(input, reason);
    if (this.authorizationBlocked()) {
      this.setStatus("review", reason);
      return emptyRunResult();
    }
    try {
      if (reason !== "broadcast")
        this.channel?.postMessage({ type: "auto-sync-request" });
    } catch {
      /* BroadcastChannel is only an optimization. */
    }
    this.refreshCounts(false);
    this.setStatus("pending", reason);
    const runUser = this.userId;
    const runSession = this.sessionEpoch;
    const runLifecycle = this.lifecycleEpoch;
    this.runUserId = runUser;
    this.runPromise = withUserTransportLock(runUser, async signal => {
      if (!this.isCurrent(runUser, runSession, runLifecycle))
        return emptyRunResult();
      this.throwIfAborted(signal);
      this.setStatus("syncing", reason);
      const result = emptyRunResult();
      let progressed = false;
      let activeStage:
        | "operations"
        | "warehouse"
        | "tracking"
        | "finance"
        | null = null;
      let attemptedOperationKeys: string[] = [];
      let attemptedFinanceKeys: string[] = [];
      try {
        const operations = this.latest(this.operations);
        if (operations && this.adapterReady(operations, runUser)) {
          const pending = safePending(operations.pending);
          const selection = this.eligibleOperations(
            pending,
            input.operationSelection
          );
          // An empty pending snapshot is still passed through: the adapter may
          // load its latest durable snapshot, and this preserves the public
          // adapter contract used by focused tests. A non-empty, fully blocked
          // queue is the only case skipped here.
          if (!pending.length || selection.length) {
            activeStage = "operations";
            attemptedOperationKeys = pending.length
              ? selection.map(
                  item => `operations:${item.entity}:${item.recordId}`
                )
              : [];
            result.operations = await operations.sync(
              pending.length ? selection : undefined,
              null,
              signal
            );
            activeStage = null;
            this.throwIfAborted(signal);
            this.rememberOperationConflicts(result.operations);
            progressed ||= Boolean(result.operations?.applied.length);
          }
        }
        if (!this.isCurrent(runUser, runSession, runLifecycle)) return result;
        const warehouse = this.latest(this.warehouse);
        if (
          warehouse &&
          this.adapterReady(warehouse, runUser) &&
          !this.blockedFor("warehouse:stage") &&
          safePending(warehouse.pending).length
        ) {
          this.throwIfAborted(signal);
          activeStage = "warehouse";
          result.warehouseApplied = await warehouse.sync(signal);
          activeStage = null;
          this.throwIfAborted(signal);
          progressed ||= result.warehouseApplied.length > 0;
        }
        if (!this.isCurrent(runUser, runSession, runLifecycle)) return result;
        this.throwIfAborted(signal);
        const tracking = this.latest(this.tracking);
        const trackingItems = tracking ? this.trackingItems(tracking) : [];
        const trackingSelection = tracking
          ? this.eligibleTracking(
              tracking,
              input.trackingSelection,
              reason === "manual"
            )
          : [];
        const hasTrackingPending = tracking
          ? trackingItems.length
            ? trackingSelection.length > 0
            : Boolean(
                input.trackingSelection?.length ||
                  this.pendingTracking(tracking) > 0
              )
          : false;
        if (
          tracking &&
          this.adapterReady(tracking, runUser) &&
          hasTrackingPending
        ) {
          activeStage = "tracking";
          result.tracking =
            trackingItems.length || input.trackingSelection
              ? await tracking.sync(trackingSelection, signal)
              : await tracking.sync(undefined, signal);
          activeStage = null;
          this.throwIfAborted(signal);
          this.state = { ...this.state, trackingLastResult: result.tracking };
          this.rememberTrackingConflicts(result.tracking);
          progressed ||= Boolean(
            (result.tracking as { applied?: unknown[] } | null)?.applied?.length
          );
        }
        if (!this.isCurrent(runUser, runSession, runLifecycle)) return result;
        this.throwIfAborted(signal);
        const finance = this.latest(this.finance);
        if (finance && this.adapterReady(finance, runUser)) {
          const pending = safePending(finance.pending);
          const selection = this.eligibleFinance(
            pending,
            input.financeSelection
          );
          if (!pending.length || selection.length) {
            activeStage = "finance";
            attemptedFinanceKeys = pending.length
              ? selection.map(id => `finance:${id}`)
              : [];
            result.finance = await finance.sync(
              pending.length ? selection : undefined,
              result.operations,
              signal
            );
            activeStage = null;
            this.throwIfAborted(signal);
            this.rememberFinanceConflicts(result.finance);
            progressed ||= Boolean(result.finance?.applied.length);
            if (
              result.finance?.applied.some(receipt =>
                Boolean(receipt.priceProjection)
              )
            )
              this.rerunNeeded = true;
          }
        }
        const trackingResult = result.tracking as {
          conflicts?: Array<{ requestId?: string; kind?: string }>;
          network?: boolean;
          blocked?: boolean;
        } | null;
        const hasTrackingNetwork = Boolean(trackingResult?.network);
        if (hasTrackingNetwork) this.scheduleNetworkRetry();
        else this.retryCount = 0;
        this.refreshCounts(false);
        const hasReview =
          this.blocked.size > 0 ||
          Boolean(
            result.operations?.conflicts.length ||
              result.finance?.conflicts.length ||
              trackingResult?.blocked
          );
        this.setStatus(
          hasReview
            ? "review"
            : hasTrackingNetwork
              ? "offline"
              : this.pendingEligibleCount()
                ? "pending"
                : "idle",
          reason
        );
        return result;
      } catch (error) {
        if (!this.isCurrent(runUser, runSession, runLifecycle)) return result;
        const normalized = normalizeSyncError(error);
        this.rememberThrownReview(
          activeStage,
          attemptedOperationKeys,
          attemptedFinanceKeys,
          normalized,
          runUser
        );
        this.state = {
          ...this.state,
          status: normalized.message
            .toLowerCase()
            .includes("transport_lock_lost")
            ? "pending"
            : needsReview(normalized)
              ? "review"
              : isNetworkError(normalized)
                ? "offline"
                : "pending",
          lastError: normalized.message,
          reason,
        };
        this.emit();
        if (isNetworkError(normalized)) this.scheduleNetworkRetry();
        throw normalized;
      } finally {
        if (this.runUserId === runUser) this.runUserId = null;
      }
    });
    const currentPromise = this.runPromise;
    void currentPromise
      .finally(() => {
        if (this.runPromise === currentPromise) this.runPromise = null;
        const rerun = this.rerunNeeded;
        this.rerunNeeded = false;
        const nextReason = this.rerunReason;
        const nextInput = this.rerunInput;
        this.rerunReason = "local-save";
        this.rerunInput = {};
        if (
          rerun &&
          this.userId &&
          this.authReady &&
          this.lifecycleEpoch === runLifecycle &&
          this.pendingEligibleCount() > 0 &&
          !this.scheduled
        ) {
          this.scheduled = true;
          queueMicrotask(() => {
            this.scheduled = false;
            void this.request(nextReason, nextInput).catch(() => undefined);
          });
        }
      })
      .catch(() => undefined);
    return currentPromise;
  }

  private isCurrent(
    userId: string | null,
    session: number,
    lifecycle: number
  ): boolean {
    return (
      this.userId === userId &&
      this.authReady &&
      this.sessionEpoch === session &&
      this.lifecycleEpoch === lifecycle
    );
  }
  private adapterReady(
    adapter: { userId: string; authReady: boolean; online: boolean },
    userId: string
  ): boolean {
    return adapter.userId === userId && adapter.authReady && adapter.online;
  }
  private adapterMatchesSession(adapter: {
    userId: string;
    scopeFingerprint?: string | null;
  }): boolean {
    return (
      adapter.userId === this.userId &&
      (adapter.scopeFingerprint === undefined ||
        adapter.scopeFingerprint === this.scopeFingerprint)
    );
  }
  private latest<
    T extends { userId: string; scopeFingerprint?: string | null },
  >(adapters: Set<T>): T | null {
    const list = [...adapters];
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const adapter = list[index];
      if (adapter && this.adapterMatchesSession(adapter)) return adapter;
    }
    return null;
  }
  private pendingTracking(adapter: TrackingAdapter): number {
    return typeof adapter.pending === "function"
      ? safeCount(adapter.pending)
      : Math.max(0, adapter.pending);
  }
  private trackingItems(adapter: TrackingAdapter): TrackingPendingItem[] {
    if (!adapter.pendingItems) return [];
    try {
      const items =
        typeof adapter.pendingItems === "function"
          ? adapter.pendingItems()
          : adapter.pendingItems;
      return Array.isArray(items) ? items : [];
    } catch {
      return [];
    }
  }
  private trackingItemFingerprint(item: TrackingPendingItem): string {
    if (item.commandFingerprint) return item.commandFingerprint;
    try {
      return JSON.stringify({
        command: item.command ?? null,
        expectedVersion: item.expectedVersion ?? null,
      });
    } catch {
      return `${item.expectedVersion ?? ""}`;
    }
  }
  private blockedTrackingFor(item: TrackingPendingItem): boolean {
    const key = `tracking:${item.requestId}`;
    const blocked = this.blocked.get(key);
    if (!blocked) return false;
    const changed =
      blocked.fingerprint !== this.scopeFingerprint ||
      (blocked.version !== undefined &&
        blocked.version !== item.expectedVersion) ||
      (blocked.commandFingerprint !== null &&
        blocked.commandFingerprint !== undefined &&
        blocked.commandFingerprint !== this.trackingItemFingerprint(item));
    if (changed) {
      this.blocked.delete(key);
      return false;
    }
    return true;
  }
  private eligibleTracking(
    adapter: TrackingAdapter,
    selected?: string[],
    allowBlockedSelection = false
  ): string[] {
    const selectedSet = selected ? new Set(selected) : null;
    const items = this.trackingItems(adapter);
    if (!items.length) return selected ? [...new Set(selected)] : [];
    return items
      .filter(item => !selectedSet || selectedSet.has(item.requestId))
      .filter(
        item =>
          Boolean(allowBlockedSelection && selectedSet?.has(item.requestId)) ||
          !this.blockedTrackingFor(item)
      )
      .map(item => item.requestId);
  }
  private throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) throw new Error("transport_lock_lost");
  }
  private scheduleNetworkRetry(): void {
    if (
      this.retryTimer ||
      this.retryCount >= 3 ||
      !this.userId ||
      !this.authReady
    )
      return;
    const delay =
      Math.min(30_000, 500 * 2 ** this.retryCount) +
      Math.floor(Math.random() * 250);
    this.retryCount += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.request("online").catch(() => undefined);
    }, delay);
  }
  private mergeInput(a: RunInput, b: RunInput): RunInput {
    const operations = [
      ...(a.operationSelection ?? []),
      ...(b.operationSelection ?? []),
    ];
    const finance = [
      ...(a.financeSelection ?? []),
      ...(b.financeSelection ?? []),
    ];
    return {
      operationSelection: operations.length
        ? [
            ...new Map(
              operations.map(item => [`${item.entity}:${item.recordId}`, item])
            ).values(),
          ]
        : undefined,
      financeSelection: finance.length ? [...new Set(finance)] : undefined,
      trackingSelection: b.trackingSelection?.length
        ? [...new Set(b.trackingSelection)]
        : a.trackingSelection?.length
          ? [...new Set(a.trackingSelection)]
          : undefined,
      recovery: a.recovery || b.recovery,
    };
  }
  private clearExplicitReview(input: RunInput, reason: SyncReason): void {
    if (reason !== "manual") return;
    for (const item of input.operationSelection ?? []) {
      this.blocked.delete(`operations:${item.entity}:${item.recordId}`);
      this.blocked.delete("operations:stage");
    }
    for (const id of input.financeSelection ?? []) {
      this.blocked.delete(`finance:${id}`);
      this.blocked.delete("finance:stage");
    }
    for (const id of input.trackingSelection ?? [])
      this.blocked.delete(`tracking:${id}`);
  }
  private authorizationKey(userId = this.userId): string {
    return `authorization:${userId ?? ""}`;
  }
  private authorizationBlocked(): boolean {
    return this.blockedFor(this.authorizationKey());
  }
  private rememberThrownReview(
    stage: "operations" | "warehouse" | "tracking" | "finance" | null,
    operationKeys: string[],
    financeKeys: string[],
    error: ReturnType<typeof normalizeSyncError>,
    userId: string
  ): void {
    if (!stage || isNetworkError(error) || !needsReview(error)) return;
    const blockedItem: BlockedItem = {
      reason: error.message,
      fingerprint: this.scopeFingerprint,
    };
    if (error.code === "UNAUTHORIZED") {
      this.blocked.set(this.authorizationKey(userId), blockedItem);
      return;
    }
    const keys =
      stage === "operations"
        ? operationKeys
        : stage === "finance"
          ? financeKeys
          : [];
    if (keys.length) {
      for (const key of keys) this.blocked.set(key, blockedItem);
      return;
    }
    this.blocked.set(`${stage}:stage`, blockedItem);
  }
  private blockedFor(key: string): boolean {
    const item = this.blocked.get(key);
    if (!item) return false;
    if (item.fingerprint !== this.scopeFingerprint) {
      this.blocked.delete(key);
      return false;
    }
    return true;
  }
  private eligibleOperations(
    pending: PendingChange[],
    selected?: Array<{ entity: Entity; recordId: string }>
  ): Array<{ entity: Entity; recordId: string }> {
    const selectedSet = selected
      ? new Set(selected.map(item => `${item.entity}:${item.recordId}`))
      : null;
    return pending
      .filter(
        change =>
          !selectedSet || selectedSet.has(`${change.entity}:${change.recordId}`)
      )
      .filter(
        change =>
          !this.blockedFor(`operations:${change.entity}:${change.recordId}`)
      )
      .map(change => ({ entity: change.entity, recordId: change.recordId }));
  }
  private eligibleFinance(
    pending: FinanceCommand[],
    selected?: string[]
  ): string[] {
    const selectedSet = selected ? new Set(selected) : null;
    return pending
      .filter(command => !selectedSet || selectedSet.has(command.id))
      .filter(command => !this.blockedFor(`finance:${command.id}`))
      .map(command => command.id);
  }
  private rememberOperationConflicts(result: SyncResult | null): void {
    for (const conflict of result?.conflicts ?? []) {
      const operations = this.latest(this.operations);
      const pending = operations
        ? safePending(operations.pending).find(
            item => item.id === conflict.changeId
          )
        : undefined;
      if (pending)
        this.blocked.set(`operations:${pending.entity}:${pending.recordId}`, {
          reason: conflict.reason,
          fingerprint: this.scopeFingerprint,
        });
    }
  }
  private rememberFinanceConflicts(result: FinanceSyncResult | null): void {
    for (const conflict of result?.conflicts ?? [])
      this.blocked.set(`finance:${conflict.commandId}`, {
        reason: conflict.code,
        fingerprint: this.scopeFingerprint,
      });
  }
  private rememberTrackingConflicts(result: unknown): void {
    const conflicts = (
      result as {
        conflicts?: Array<{
          requestId?: string;
          kind?: string;
          message?: string;
        }>;
      } | null
    )?.conflicts;
    if (!conflicts?.length) return;
    const adapter = this.latest(this.tracking);
    const items = adapter ? this.trackingItems(adapter) : [];
    for (const conflict of conflicts) {
      if (!conflict.requestId || conflict.kind === "network") continue;
      const item = items.find(
        candidate => candidate.requestId === conflict.requestId
      );
      this.blocked.set(`tracking:${conflict.requestId}`, {
        reason: conflict.message ?? conflict.kind ?? "tracking_review",
        fingerprint: this.scopeFingerprint,
        commandFingerprint: item ? this.trackingItemFingerprint(item) : null,
        version: item?.expectedVersion,
      });
    }
  }
  private pendingEligibleCount(): number {
    if (this.authorizationBlocked()) return 0;
    const operationsAdapter = this.latest(this.operations);
    const financeAdapter = this.latest(this.finance);
    const warehouseAdapter = this.latest(this.warehouse);
    const trackingAdapter = this.latest(this.tracking);
    const operations = operationsAdapter
      ? this.eligibleOperations(safePending(operationsAdapter.pending)).length
      : 0;
    const finance = financeAdapter
      ? this.eligibleFinance(safePending(financeAdapter.pending)).length
      : 0;
    const warehouse = warehouseAdapter
      ? this.blockedFor("warehouse:stage")
        ? 0
        : safePending(warehouseAdapter.pending).length
      : 0;
    const tracking = trackingAdapter
      ? this.trackingItems(trackingAdapter).length
        ? this.eligibleTracking(trackingAdapter).length
        : this.pendingTracking(trackingAdapter)
      : 0;
    return operations + finance + warehouse + tracking;
  }
  private refreshCounts(emit = true): void {
    const operations = this.latest(this.operations);
    const finance = this.latest(this.finance);
    const warehouse = this.latest(this.warehouse);
    const tracking = this.latest(this.tracking);
    const next = {
      operationsCount: operations ? safePending(operations.pending).length : 0,
      financeCount: finance ? safePending(finance.pending).length : 0,
      warehouseCount: warehouse ? safePending(warehouse.pending).length : 0,
      trackingCount: tracking ? this.pendingTracking(tracking) : 0,
    };
    const changed = Object.keys(next).some(
      key =>
        this.state[key as keyof typeof next] !== next[key as keyof typeof next]
    );
    if (!changed) return;
    this.state = { ...this.state, ...next };
    if (emit) this.emit();
  }
  private setStatus(status: AutoSyncStatus, reason: SyncReason): void {
    this.refreshCounts(false);
    this.state = { ...this.state, status, reason };
    this.emit();
  }
  private emit(): void {
    const state = this.state;
    for (const listener of [...this.listeners]) {
      try {
        listener(state);
      } catch {
        /* A status subscriber cannot fail a sync. */
      }
    }
    if (typeof window !== "undefined") {
      try {
        window.dispatchEvent(
          new CustomEvent("alrefqaa:auto-sync", { detail: state })
        );
      } catch {
        /* DOM events are optional in tests and restricted documents. */
      }
    }
  }
}

export const autoSyncCoordinator = new AutoSyncCoordinator();
export type { OperationsAdapter, FinanceAdapter, WarehouseAdapter, RunInput };
