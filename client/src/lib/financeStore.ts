import { z } from "zod";
import {
  financeCommandSchema,
  financeSnapshotSchema,
  emptyFinanceSnapshot,
  type FinanceCommand,
  type FinanceSnapshot,
  type FinanceSyncResult,
} from "@shared/finance";
import { withWorkspaceLock } from "./offlineStore";
const PREFIX = "alrefqaa-finance-v1-";
export type FinanceWorkspace = {
  snapshot: FinanceSnapshot;
  commands: FinanceCommand[];
  revision: number;
};
const schema = z
  .object({
    snapshot: financeSnapshotSchema,
    commands: z.array(financeCommandSchema).max(50000),
    revision: z.number().int().nonnegative(),
  })
  .strict()
  .refine(
    v => new Set(v.commands.map(c => c.id)).size === v.commands.length,
    "duplicate_command"
  );
export function emptyFinanceWorkspace(): FinanceWorkspace {
  return { snapshot: emptyFinanceSnapshot(), commands: [], revision: 0 };
}
function parse(raw: string): FinanceWorkspace {
  try {
    return schema.parse(JSON.parse(raw)) as FinanceWorkspace;
  } catch {
    throw new Error("finance_store_corrupt");
  }
}
function store(): Storage {
  try {
    return window.localStorage;
  } catch {
    throw new Error("finance_store_unavailable");
  }
}
export function loadFinanceWorkspace(
  userId: string | number
): FinanceWorkspace {
  const raw = store().getItem(`${PREFIX}${userId}`);
  return raw ? parse(raw) : emptyFinanceWorkspace();
}
export async function saveFinanceWorkspace(
  userId: string | number,
  value: FinanceWorkspace
): Promise<void> {
  schema.parse(value);
  const key = `${PREFIX}${userId}`;
  await withWorkspaceLock(key, () => {
    const raw = store().getItem(key),
      current = raw ? parse(raw) : emptyFinanceWorkspace();
    if (current.revision !== value.revision)
      throw new Error("finance_store_conflict");
    const revision = current.revision + 1;
    try {
      store().setItem(key, JSON.stringify({ ...value, revision }));
      value.revision = revision;
    } catch {
      throw new Error("finance_store_full");
    }
  });
}
export function stageFinanceCommand(
  workspace: FinanceWorkspace,
  command: FinanceCommand
): FinanceWorkspace {
  const parsed = financeCommandSchema.parse(command);
  const old = workspace.commands.find(c => c.id === parsed.id);
  if (old) {
    if (JSON.stringify(old) !== JSON.stringify(parsed))
      throw new Error("finance_command_conflict");
    return workspace;
  }
  return { ...workspace, commands: [...workspace.commands, parsed] };
}
function mergeById<T extends { id: string }>(old: T[], incoming: T[]): T[] {
  const map = new Map(old.map(row => [row.id, row]));
  for (const row of incoming) map.set(row.id, row);
  return [...map.values()];
}
export function mergeFinanceSnapshot(
  workspace: FinanceWorkspace,
  snapshot: FinanceSnapshot
): FinanceWorkspace {
  const valid = financeSnapshotSchema.parse(snapshot) as FinanceSnapshot;
  return {
    ...workspace,
    snapshot: {
      ...valid,
      entries: mergeById(workspace.snapshot.entries, valid.entries),
      invoices: mergeById(workspace.snapshot.invoices, valid.invoices),
    },
  };
}
export function applyFinanceSync(
  workspace: FinanceWorkspace,
  result: FinanceSyncResult
): FinanceWorkspace {
  const acknowledged = new Set(result.applied.map(r => r.commandId));
  const postedInvoices = result.applied
    .flatMap(r => (r.invoice ? [r.invoice] : []))
    .filter(invoice => {
      const current = workspace.snapshot.invoices.find(
        i => i.id === invoice.id
      );
      return !current || (invoice.version ?? 0) >= (current.version ?? 0);
    });
  return {
    ...workspace,
    commands: workspace.commands.filter(c => !acknowledged.has(c.id)),
    snapshot: {
      ...workspace.snapshot,
      entries: mergeById(
        workspace.snapshot.entries,
        result.applied.flatMap(r => r.entries)
      ),
      invoices: mergeById(workspace.snapshot.invoices, postedInvoices),
      lastReadAt: result.applied.length
        ? new Date().toISOString()
        : workspace.snapshot.lastReadAt,
    },
  };
}
export function downloadFinanceArchive(userId: string | number): void {
  const raw = store().getItem(`${PREFIX}${userId}`);
  const url = URL.createObjectURL(
    new Blob(
      [
        JSON.stringify(
          { exportedAt: new Date().toISOString(), financeRaw: raw },
          null,
          2
        ),
      ],
      { type: "application/json" }
    )
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "alrefqaa-finance-archive.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
