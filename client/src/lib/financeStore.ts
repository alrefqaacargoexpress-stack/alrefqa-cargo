import { z } from "zod";
import {
  financeCommandSchema,
  financeSnapshotSchema,
  emptyFinanceSnapshot,
  type FinanceCommand,
  type FinanceSnapshot,
  type FinanceSyncResult,
} from "@shared/finance";
import type { PriceProjection } from "@shared/shipmentPricing";
import { withWorkspaceLock } from "./offlineStore";
import {
  archiveRetirementConflicts,
  isRememberedRetirement,
  rememberRetirements,
  rememberedRetirements,
  type RetirementArchiveItem,
} from "./retirementStore";
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
  const workspace = raw ? parse(raw) : emptyFinanceWorkspace();
  return filterRetiredFinance(userId, workspace);
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
  command: FinanceCommand,
  userId?: string | number
): FinanceWorkspace {
  const parsed = financeCommandSchema.parse(command);
  const retiredInvoiceId = invoiceIdForCommand(parsed);
  if (
    userId !== undefined &&
    retiredInvoiceId &&
    isRememberedRetirement(userId, {
      entity: "invoice",
      recordId: retiredInvoiceId,
    })
  )
    throw new Error("record_permanently_retired");
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
  snapshot: FinanceSnapshot,
  userId?: string | number
): FinanceWorkspace {
  const valid = financeSnapshotSchema.parse(snapshot) as FinanceSnapshot;
  const retiredIds = valid.retiredInvoiceIds ?? [];
  if (userId !== undefined)
    rememberRetirements(
      userId,
      retiredIds.map(recordId => ({ entity: "invoice" as const, recordId }))
    );
  const knownRetired = new Set([
    ...retiredIds,
    ...(userId === undefined
      ? []
      : rememberedRetirements(userId)
          .filter(item => item.entity === "invoice")
          .map(item => item.recordId)),
  ]);
  const commands = workspace.commands.filter(command => {
    const invoiceId = invoiceIdForCommand(command);
    return !invoiceId || !knownRetired.has(invoiceId);
  });
  if (userId !== undefined) {
    const archived: RetirementArchiveItem[] = workspace.commands
      .filter(command => {
        const invoiceId = invoiceIdForCommand(command);
        return Boolean(invoiceId && knownRetired.has(invoiceId));
      })
      .map(command => ({
        archivedAt: new Date().toISOString(),
        retirement: {
          entity: "invoice" as const,
          recordId: invoiceIdForCommand(command)!,
        },
        financeCommand: command,
      }));
    archiveRetirementConflicts(userId, archived);
  }
  const next = {
    ...workspace,
    commands,
    snapshot: {
      ...valid,
      entries: mergeById(workspace.snapshot.entries, valid.entries),
      invoices: mergeById(workspace.snapshot.invoices, valid.invoices).filter(
        invoice => !knownRetired.has(invoice.id)
      ),
    },
  };
  return userId === undefined ? next : filterRetiredFinance(userId, next);
}
export function applyFinanceSync(
  workspace: FinanceWorkspace,
  result: FinanceSyncResult,
  userId?: string | number
): FinanceWorkspace {
  const acknowledged = new Set(result.applied.map(r => r.commandId));
  const retiredIds = new Set(
    userId === undefined
      ? []
      : rememberedRetirements(userId)
          .filter(item => item.entity === "invoice")
          .map(item => item.recordId)
  );
  const postedInvoices = result.applied
    .flatMap(r => (r.invoice ? [r.invoice] : []))
    .filter(invoice => !retiredIds.has(invoice.id))
    .filter(invoice => {
      const current = workspace.snapshot.invoices.find(
        i => i.id === invoice.id
      );
      return !current || (invoice.version ?? 0) >= (current.version ?? 0);
    });
  const projections = new Map(
    (workspace.snapshot.pricingProjections ?? []).map(item => [
      `${item.shipmentId}:${item.side}`,
      item,
    ])
  );
  for (const receipt of result.applied) {
    const projection = receipt.priceProjection as PriceProjection | undefined;
    if (projection)
      projections.set(`${projection.shipmentId}:${projection.side}`, projection);
  }
  const next = {
    ...workspace,
    commands: workspace.commands.filter(
      c =>
        !acknowledged.has(c.id) &&
        !(
          userId !== undefined &&
          (() => {
            const invoiceId = invoiceIdForCommand(c);
            return Boolean(invoiceId && retiredIds.has(invoiceId));
          })()
        )
    ),
    snapshot: {
      ...workspace.snapshot,
      entries: mergeById(
        workspace.snapshot.entries,
        result.applied.flatMap(r => r.entries)
      ),
      invoices: mergeById(workspace.snapshot.invoices, postedInvoices),
      pricingProjections: [...projections.values()],
      lastReadAt: result.applied.length
        ? new Date().toISOString()
        : workspace.snapshot.lastReadAt,
    },
  };
  return userId === undefined ? next : filterRetiredFinance(userId, next);
}
export function downloadFinanceArchive(userId: string | number): void {
  const raw = store().getItem(`${PREFIX}${userId}`);
  let financeRaw = raw;
  if (raw) {
    try {
      financeRaw = JSON.stringify(loadFinanceWorkspace(userId));
    } catch {
      // Keep an unreadable original available for manual recovery.
      financeRaw = raw;
    }
  }
  const url = URL.createObjectURL(
    new Blob(
      [
        JSON.stringify(
          { exportedAt: new Date().toISOString(), financeRaw },
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

function invoiceIdForCommand(command: FinanceCommand): string | undefined {
  if (command.kind === "invoice" || command.kind === "settlement")
    return command.payload.invoiceId;
  return undefined;
}

function filterRetiredFinance(
  userId: string | number,
  workspace: FinanceWorkspace
): FinanceWorkspace {
  const retired = new Set(
    rememberedRetirements(userId)
      .filter(item => item.entity === "invoice")
      .map(item => item.recordId)
  );
  if (!retired.size) return workspace;
  const archived: RetirementArchiveItem[] = workspace.commands
    .filter(command => {
      const invoiceId = invoiceIdForCommand(command);
      return Boolean(invoiceId && retired.has(invoiceId));
    })
    .map(command => ({
      archivedAt: new Date().toISOString(),
      retirement: {
        entity: "invoice" as const,
        recordId: invoiceIdForCommand(command)!,
      },
      financeCommand: command,
    }));
  archiveRetirementConflicts(userId, archived);
  return {
    ...workspace,
    commands: workspace.commands.filter(command => {
      const invoiceId = invoiceIdForCommand(command);
      return !invoiceId || !retired.has(invoiceId);
    }),
    snapshot: {
      ...workspace.snapshot,
      invoices: workspace.snapshot.invoices.filter(
        invoice => !retired.has(invoice.id)
      ),
    },
  };
}
