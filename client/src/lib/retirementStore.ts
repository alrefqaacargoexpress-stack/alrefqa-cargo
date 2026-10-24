import type { Entity, EntityRecord, PendingChange } from "@shared/operations";
import type { FinanceCommand } from "@shared/finance";

export type RetiredRecord = { entity: Entity; recordId: string };
export type RetirementArchiveItem = {
  archivedAt: string;
  retirement: RetiredRecord;
  record?: EntityRecord;
  pending?: PendingChange;
  financeCommand?: FinanceCommand;
};
export type RetirementStore = {
  version: 1;
  retired: RetiredRecord[];
  conflicts: RetirementArchiveItem[];
};

const PREFIX = "alrefqaa-retirements-v1-";
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function storage(): Storage {
  if (typeof window === "undefined" || !window.localStorage)
    throw new Error("retirement_store_unavailable");
  return window.localStorage;
}

function key(userId: string | number) {
  return `${PREFIX}${userId}`;
}

function empty(): RetirementStore {
  return { version: 1, retired: [], conflicts: [] };
}

function parse(raw: string | null): RetirementStore {
  if (!raw) return empty();
  try {
    const value = JSON.parse(raw) as Partial<RetirementStore>;
    if (
      value.version !== 1 ||
      !Array.isArray(value.retired) ||
      !Array.isArray(value.conflicts)
    )
      throw new Error("invalid_retirement_store");
    const retired = value.retired.filter(
      item =>
        item &&
        (item.entity === "account" ||
          item.entity === "shipment" ||
          item.entity === "invoice") &&
        typeof item.recordId === "string" &&
        item.recordId.length > 0
    ) as RetiredRecord[];
    return { version: 1, retired, conflicts: value.conflicts };
  } catch {
    // Never reset a corrupt archive. A caller can still download the raw local
    // key through the regular archive action for manual recovery.
    return empty();
  }
}

export function loadRetirementStore(userId: string | number): RetirementStore {
  return parse(storage().getItem(key(userId)));
}

function saveRetirementStore(userId: string | number, value: RetirementStore) {
  storage().setItem(key(userId), JSON.stringify(value));
}

export function retirementKey(item: RetiredRecord): string {
  return `${item.entity}:${item.recordId}`;
}

export function rememberedRetirements(
  userId: string | number
): RetiredRecord[] {
  return clone(loadRetirementStore(userId).retired);
}

export function isRememberedRetirement(
  userId: string | number,
  item: RetiredRecord
): boolean {
  return loadRetirementStore(userId).retired.some(
    current => retirementKey(current) === retirementKey(item)
  );
}

export function rememberRetirements(
  userId: string | number,
  incoming: readonly RetiredRecord[]
): RetiredRecord[] {
  const current = loadRetirementStore(userId);
  const merged = new Map(
    current.retired.map(item => [retirementKey(item), item] as const)
  );
  for (const item of incoming) {
    if (
      (item.entity === "account" ||
        item.entity === "shipment" ||
        item.entity === "invoice") &&
      typeof item.recordId === "string" &&
      item.recordId.length > 0
    )
      merged.set(retirementKey(item), {
        entity: item.entity,
        recordId: item.recordId,
      });
  }
  const retired = [...merged.values()];
  if (retired.length !== current.retired.length)
    saveRetirementStore(userId, { ...current, retired });
  return retired;
}

function archiveKey(item: RetirementArchiveItem): string {
  return [
    retirementKey(item.retirement),
    item.pending?.id ?? "",
    item.financeCommand?.id ?? "",
    item.record?.id ?? "",
  ].join("|");
}

export function archiveRetirementConflicts(
  userId: string | number,
  items: readonly RetirementArchiveItem[]
): void {
  if (!items.length) return;
  const current = loadRetirementStore(userId);
  const merged = new Map(
    current.conflicts.map(item => [archiveKey(item), item] as const)
  );
  for (const item of items) merged.set(archiveKey(item), clone(item));
  saveRetirementStore(userId, {
    ...current,
    conflicts: [...merged.values()],
  });
}

export function downloadRetirementArchive(userId: string | number): void {
  const raw = storage().getItem(key(userId));
  const archive = {
    exportedAt: new Date().toISOString(),
    userId: String(userId),
    retirementStore: raw,
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(archive, null, 2)], {
      type: "application/json",
    })
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "alrefqaa-retirement-conflicts.json";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
