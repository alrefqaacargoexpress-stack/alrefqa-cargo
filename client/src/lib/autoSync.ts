import type { FinanceCommand, FinanceSyncResult } from "@shared/finance";
import type { Entity, PendingChange, SyncResult } from "@shared/operations";
import type { PendingWarehouseLocation } from "./warehouseStore";

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
    operationResult?: SyncResult | null
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
    operationResult?: SyncResult | null
  ) => Promise<FinanceSyncResult | null>;
};
type WarehouseAdapter = {
  userId: string;
  scopeFingerprint?: string | null;
  authReady: boolean;
  online: boolean;
  pending: () => PendingWarehouseLocation[];
  sync: () => Promise<string[]>;
};
export type TrackingAdapter = {
  userId: string;
  scopeFingerprint?: string | null;
  authReady: boolean;
  online: boolean;
  pending: number | (() => number);
  sync: () => Promise<unknown>;
};

type Lease = { key: string; owner: string; expiresAt: number };
type BlockedItem = { reason: string; fingerprint: string | null };
const fallbackLocks = new Map<string, Promise<void>>();
let leaseDb: Promise<IDBDatabase> | null = null;
const LEASE_TTL = 15_000;
const LEASE_HEARTBEAT = 5_000;

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
        store.put({ ...lease, expiresAt: Date.now() + LEASE_TTL });
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
  work: () => Promise<T>
): Promise<T> {
  const previous = fallbackLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  const chained = previous.then(() => gate);
  fallbackLocks.set(key, chained);
  await previous;
  try {
    return await work();
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
  work: () => Promise<T>
): Promise<T> {
  const key = `alrefqaa-sync:${userId}`;
  if (typeof navigator !== "undefined" && navigator.locks)
    return navigator.locks.request(key, { mode: "exclusive" }, work);

  let db: IDBDatabase;
  try {
    db = await openLeaseDb();
  } catch (error) {
    if (browserRuntime()) throw error;
    return withMemoryTransportLock(key, work);
  }

  const lease: Lease = {
    key,
    owner: randomId("tab"),
    expiresAt: Date.now() + LEASE_TTL,
  };
  while (!(await claimLease(db, lease))) await sleep(25 + Math.random() * 50);
  let lostReject!: (error: Error) => void;
  const leaseLost = new Promise<never>((_, reject) => (lostReject = reject));
  let heartbeat: ReturnType<typeof setInterval> | null = setInterval(() => {
    void renewLease(db, lease)
      .then(renewed => {
        if (!renewed) lostReject(new Error("transport_lock_lost"));
      })
      .catch(() => lostReject(new Error("transport_lock_lost")));
  }, LEASE_HEARTBEAT);
  const workPromise = Promise.resolve().then(work);
  try {
    return await Promise.race([workPromise, leaseLost]);
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    await releaseLease(db, key, lease.owner).catch(() => undefined);
  }
}

function isNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return Boolean(
    (typeof navigator !== "undefined" && !navigator.onLine) ||
      message.includes("network") ||
      message.includes("fetch") ||
      message.includes("timeout") ||
      message.includes("offline")
  );
}
function needsReview(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
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
    this.runPromise = withUserTransportLock(runUser, async () => {
      if (!this.isCurrent(runUser, runSession, runLifecycle))
        return emptyRunResult();
      this.setStatus("syncing", reason);
      const result = emptyRunResult();
      let progressed = false;
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
            result.operations = await operations.sync(
              pending.length ? selection : undefined,
              null
            );
            this.rememberOperationConflicts(result.operations);
            progressed ||= Boolean(result.operations?.applied.length);
          }
        }
        if (!this.isCurrent(runUser, runSession, runLifecycle)) return result;
        const warehouse = this.latest(this.warehouse);
        if (
          warehouse &&
          this.adapterReady(warehouse, runUser) &&
          safePending(warehouse.pending).length
        ) {
          result.warehouseApplied = await warehouse.sync();
          progressed ||= result.warehouseApplied.length > 0;
        }
        if (!this.isCurrent(runUser, runSession, runLifecycle)) return result;
        const tracking = this.latest(this.tracking);
        if (
          tracking &&
          this.adapterReady(tracking, runUser) &&
          this.pendingTracking(tracking) > 0
        ) {
          result.tracking = await tracking.sync();
          this.state = { ...this.state, trackingLastResult: result.tracking };
          progressed = true;
        }
        if (!this.isCurrent(runUser, runSession, runLifecycle)) return result;
        const finance = this.latest(this.finance);
        if (finance && this.adapterReady(finance, runUser)) {
          const pending = safePending(finance.pending);
          const selection = this.eligibleFinance(
            pending,
            input.financeSelection
          );
          if (!pending.length || selection.length) {
            result.finance = await finance.sync(
              pending.length ? selection : undefined,
              result.operations
            );
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
        this.retryCount = 0;
        this.refreshCounts(false);
        const trackingResult = result.tracking as {
          conflicts?: unknown[];
          network?: boolean;
          blocked?: boolean;
        } | null;
        const hasReview =
          this.blocked.size > 0 ||
          Boolean(
            result.operations?.conflicts.length ||
              result.finance?.conflicts.length ||
              trackingResult?.conflicts?.length ||
              trackingResult?.blocked
          );
        this.setStatus(
          hasReview
            ? "review"
            : this.pendingEligibleCount()
              ? "pending"
              : "idle",
          reason
        );
        return result;
      } catch (error) {
        if (!this.isCurrent(runUser, runSession, runLifecycle)) return result;
        this.state = {
          ...this.state,
          status: needsReview(error)
            ? "review"
            : isNetworkError(error)
              ? "offline"
              : "pending",
          lastError: error instanceof Error ? error.message : "sync_failed",
          reason,
        };
        this.emit();
        if (isNetworkError(error) && this.retryCount < 3) {
          const delay =
            Math.min(30_000, 500 * 2 ** this.retryCount) +
            Math.floor(Math.random() * 250);
          this.retryCount += 1;
          this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            void this.request("online").catch(() => undefined);
          }, delay);
        }
        throw error;
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
    };
  }
  private clearExplicitReview(input: RunInput, reason: SyncReason): void {
    if (reason !== "manual") return;
    for (const item of input.operationSelection ?? [])
      this.blocked.delete(`operations:${item.entity}:${item.recordId}`);
    for (const id of input.financeSelection ?? [])
      this.blocked.delete(`finance:${id}`);
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
  private pendingEligibleCount(): number {
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
      ? safePending(warehouseAdapter.pending).length
      : 0;
    const tracking = trackingAdapter
      ? this.pendingTracking(trackingAdapter)
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
