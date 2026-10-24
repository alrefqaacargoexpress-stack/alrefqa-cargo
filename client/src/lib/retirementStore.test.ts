import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyFinanceSync,
  downloadFinanceArchive,
  emptyFinanceWorkspace,
  loadFinanceWorkspace,
  mergeFinanceSnapshot,
  stageFinanceCommand,
} from "./financeStore";
import {
  applySyncResult,
  downloadLocalArchive,
  emptyWorkspace,
  loadWorkspace,
  mergeSnapshot,
  retryPendingChange,
  saveWorkspace,
  stageChange,
} from "./offlineStore";
import {
  archiveRetirementConflicts,
  downloadRetirementArchive,
  isRememberedRetirement,
  loadRetirementStore,
  rememberRetirements,
} from "./retirementStore";
import {
  emptyFinanceSnapshot,
  type FinanceCommand,
  type FinanceSnapshot,
} from "@shared/finance";
import { EMPTY_STATE, type Account, type Shipment } from "@shared/operations";

const values = new Map<string, string>();
const localStorage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => void values.set(key, value),
  removeItem: (key: string) => void values.delete(key),
};

let uuid = 0;
const now = "2026-10-24T18:00:00.000Z";

const account: Account = {
  id: "account-1",
  name: "Customer",
  phone: "+222123456",
  city: "Nouakchott",
  shipments: 1,
  balance: 0,
  updatedAt: now,
};

const shipment: Shipment = {
  id: "shipment-1",
  tracking: "TRK-1",
  account: account.id,
  route: "Nouakchott - Istanbul",
  service: "جوي",
  status: "في الطريق",
  eta: "2026-11-01",
  amount: 10,
};

const invoice = {
  id: "invoice-1",
  account: account.id,
  amount: 10,
  status: "دين" as const,
  issuedAt: now,
  version: 1,
};

function retiredShipment(id = shipment.id) {
  return { entity: "shipment" as const, recordId: id };
}

function retiredInvoice(id = invoice.id) {
  return { entity: "invoice" as const, recordId: id };
}

function settlementCommand(
  id = "settlement-1",
  invoiceId = invoice.id
): FinanceCommand {
  return {
    id,
    createdAt: now,
    kind: "settlement",
    payload: {
      invoiceId,
      expectedVersion: 1,
      amount: 10,
      description: "Settlement draft",
    },
  };
}

function financeSnapshot(
  patch: Partial<FinanceSnapshot> = {}
): FinanceSnapshot {
  return { ...emptyFinanceSnapshot(), ...patch };
}

beforeEach(() => {
  values.clear();
  uuid = 0;
  vi.stubGlobal("window", { localStorage });
  vi.stubGlobal("navigator", {
    locks: {
      request: async (_key: string, callback: () => void) => callback(),
    },
  });
  vi.stubGlobal("crypto", {
    randomUUID: () => `change-${++uuid}`,
  });
});

describe("retirement archive isolation", () => {
  it("remembers only valid records, deduplicates them, and isolates users", () => {
    rememberRetirements(1, [
      retiredShipment(),
      retiredShipment(),
      { entity: "not-an-entity" as never, recordId: "bad" },
      { entity: "invoice", recordId: "" },
    ]);

    expect(loadRetirementStore(1).retired).toEqual([retiredShipment()]);
    expect(isRememberedRetirement(1, retiredShipment())).toBe(true);
    expect(isRememberedRetirement(2, retiredShipment())).toBe(false);
    expect(loadRetirementStore(2)).toEqual({
      version: 1,
      retired: [],
      conflicts: [],
    });
  });

  it("clones conflict values and preserves the original pending expectedVersion", () => {
    const pending = {
      id: "pending-1",
      label: "edit shipment",
      createdAt: now,
      entity: "shipment" as const,
      recordId: shipment.id,
      expectedVersion: 7,
      data: { ...shipment, amount: 99, scope: "pending" as const },
    };
    const record = { ...pending.data, amount: 99, scope: "pending" as const };

    archiveRetirementConflicts(1, [
      {
        archivedAt: now,
        retirement: retiredShipment(),
        record,
        pending,
      },
    ]);

    pending.expectedVersion = 100;
    pending.data.amount = 1;
    const stored = loadRetirementStore(1).conflicts[0];
    expect(stored.pending?.expectedVersion).toBe(7);
    expect(stored.pending?.data.amount).toBe(99);
    expect(stored.record?.amount).toBe(99);
  });

  it("does not expose one user's private archive to another user", () => {
    rememberRetirements(11, [retiredShipment()]);
    archiveRetirementConflicts(11, [
      {
        archivedAt: now,
        retirement: retiredShipment(),
        record: shipment,
      },
    ]);

    expect(loadRetirementStore(12)).toEqual({
      version: 1,
      retired: [],
      conflicts: [],
    });
  });
});

describe("offline retirement lifecycle", () => {
  it("remembers a delete ACK before an old offline snapshot can return the shipment", () => {
    const pendingWorkspace = stageChange(
      emptyWorkspace(),
      "shipment",
      shipment,
      "delete shipment",
      "delete-shipment"
    );
    const acknowledged = applySyncResult(
      pendingWorkspace,
      {
        applied: [
          {
            changeId: pendingWorkspace.queue[0].id,
            entity: "shipment",
            record: {
              ...shipment,
              deleted: { at: now, reason: "customer request" },
            },
          },
        ],
        conflicts: [],
      },
      1
    );

    expect(acknowledged.state.shipments).toEqual([]);
    expect(acknowledged.queue).toEqual([]);
    expect(loadRetirementStore(1).retired).toEqual([retiredShipment()]);

    const oldSnapshot = {
      ...EMPTY_STATE,
      shipments: [shipment],
    };
    const imported = mergeSnapshot(emptyWorkspace(), oldSnapshot, 1);
    expect(imported.state.shipments).toEqual([]);
    expect(imported.queue).toEqual([]);
  });

  it("persists ACK retirement for the next load without uploading or changing unrelated pending work", async () => {
    const untouched = stageChange(
      emptyWorkspace(),
      "account",
      account,
      "local account edit"
    );
    const pendingDelete = stageChange(
      untouched,
      "shipment",
      shipment,
      "delete shipment",
      "delete-shipment"
    );
    await saveWorkspace(1, pendingDelete);

    const acknowledged = applySyncResult(
      pendingDelete,
      {
        applied: [
          {
            changeId: pendingDelete.queue[1].id,
            entity: "shipment",
            record: {
              ...shipment,
              deleted: { at: now, reason: "customer request" },
            },
          },
        ],
        conflicts: [],
      },
      1
    );
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await saveWorkspace(1, acknowledged);

    const reloaded = loadWorkspace(1);
    expect(reloaded.state.shipments).toEqual([]);
    expect(reloaded.state.accounts).toEqual([{ ...account, scope: "pending" }]);
    expect(reloaded.queue).toHaveLength(1);
    expect(reloaded.queue[0].recordId).toBe(account.id);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("imports retiredRecords from an old snapshot into the private archive but removes the field from active state", () => {
    const oldSnapshot = {
      ...EMPTY_STATE,
      accounts: [account],
      retiredRecords: [{ entity: "account" as const, recordId: account.id }],
    };

    const imported = mergeSnapshot(emptyWorkspace(), oldSnapshot, 1);
    expect(imported.state).toEqual({ ...EMPTY_STATE });
    expect("retiredRecords" in imported.state).toBe(false);
    expect(loadRetirementStore(1).retired).toEqual([
      { entity: "account", recordId: account.id },
    ]);
  });

  it("archives both the original record and pending payload when an old snapshot retires it", () => {
    const workspace = stageChange(
      emptyWorkspace(),
      "shipment",
      shipment,
      "edit shipment"
    );
    const imported = mergeSnapshot(
      workspace,
      {
        ...EMPTY_STATE,
        retiredRecords: [retiredShipment()],
      },
      1
    );
    const conflict = loadRetirementStore(1).conflicts[0];

    expect(imported.state.shipments).toEqual([]);
    expect(imported.queue).toEqual([]);
    expect(conflict.record?.id).toBe(shipment.id);
    expect(conflict.pending?.id).toBe(workspace.queue[0].id);
    expect(conflict.pending?.expectedVersion).toBeNull();
    expect(conflict.pending?.data.scope).toBe("pending");
  });

  it("refuses staging and retrying a remembered record without mutating the workspace", () => {
    rememberRetirements(1, [retiredShipment()]);
    const workspace = stageChange(
      emptyWorkspace(),
      "shipment",
      shipment,
      "edit shipment"
    );
    const before = JSON.stringify(workspace);

    expect(() =>
      stageChange(workspace, "shipment", shipment, "new edit", undefined, 1)
    ).toThrow("record_permanently_retired");
    expect(() =>
      retryPendingChange(workspace, workspace.queue[0].id, 1)
    ).toThrow("record_permanently_retired");
    expect(JSON.stringify(workspace)).toBe(before);
  });
});

describe("financial retirement lifecycle", () => {
  it("supports legacy retiredInvoiceIds and keeps retired invoices and commands out of active finance state", () => {
    const retiredCommand = settlementCommand("settled-retired");
    const activeCommand = settlementCommand("settled-active", "invoice-2");
    const workspace = {
      ...emptyFinanceWorkspace(),
      commands: [retiredCommand, activeCommand],
    };
    const merged = mergeFinanceSnapshot(
      workspace,
      financeSnapshot({
        retiredInvoiceIds: [invoice.id],
        invoices: [invoice, { ...invoice, id: "invoice-2" }],
      }),
      1
    );

    expect(merged.snapshot.invoices.map(row => row.id)).toEqual(["invoice-2"]);
    expect(merged.commands.map(command => command.id)).toEqual([
      "settled-active",
    ]);
    expect(loadRetirementStore(1).retired).toEqual([retiredInvoice()]);
  });

  it("does not resurrect a retired invoice from a later snapshot or sync result", () => {
    const retiredCommand = settlementCommand("settled-retired");
    const first = mergeFinanceSnapshot(
      {
        ...emptyFinanceWorkspace(),
        commands: [retiredCommand],
      },
      financeSnapshot({ retiredInvoiceIds: [invoice.id], invoices: [invoice] }),
      1
    );

    const oldSnapshot = mergeFinanceSnapshot(
      first,
      financeSnapshot({ invoices: [invoice] }),
      1
    );
    const synced = applyFinanceSync(
      oldSnapshot,
      {
        applied: [
          {
            commandId: retiredCommand.id,
            invoice,
            entries: [],
          },
        ],
        conflicts: [],
      },
      1
    );

    expect(oldSnapshot.snapshot.invoices).toEqual([]);
    expect(oldSnapshot.commands).toEqual([]);
    expect(synced.snapshot.invoices).toEqual([]);
    expect(synced.commands).toEqual([]);
  });

  it("refuses staging a finance command for a remembered invoice", () => {
    rememberRetirements(1, [retiredInvoice()]);
    expect(() =>
      stageFinanceCommand(emptyFinanceWorkspace(), settlementCommand(), 1)
    ).toThrow("record_permanently_retired");
  });

  it("keeps an unrelated finance command and invoice while filtering only retired data on load", () => {
    const retiredCommand = settlementCommand("settled-retired");
    const activeCommand = settlementCommand("settled-active", "invoice-2");
    const raw = {
      ...emptyFinanceWorkspace(),
      commands: [retiredCommand, activeCommand],
      snapshot: financeSnapshot({
        invoices: [invoice, { ...invoice, id: "invoice-2" }],
      }),
    };
    values.set("alrefqaa-finance-v1-1", JSON.stringify(raw));
    rememberRetirements(1, [retiredInvoice()]);

    const loaded = loadFinanceWorkspace(1);
    expect(loaded.snapshot.invoices.map(row => row.id)).toEqual(["invoice-2"]);
    expect(loaded.commands.map(command => command.id)).toEqual([
      "settled-active",
    ]);
    expect(values.has("alrefqaa-finance-v1-2")).toBe(false);
  });
});

describe("retirement archive downloads", () => {
  it("exports a user-scoped retirement JSON without reading another user's key", async () => {
    rememberRetirements(1, [retiredShipment()]);
    rememberRetirements(2, [{ entity: "account", recordId: account.id }]);
    const blobs: Blob[] = [];
    const click = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: (blob: Blob) => {
        blobs.push(blob);
        return "blob:retirement";
      },
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal("document", {
      createElement: () => ({ href: "", download: "", click }),
    });

    downloadRetirementArchive(1);
    const exported = JSON.parse(await blobs[0].text());
    expect(exported.userId).toBe("1");
    expect(exported.retirementStore).toContain("shipment-1");
    expect(exported.retirementStore).not.toContain("account-1");
    expect(click).toHaveBeenCalledOnce();
  });

  it("does not export a retired finance invoice or command as active finance data", async () => {
    const retiredCommand = settlementCommand("settled-retired");
    const activeCommand = settlementCommand("settled-active", "invoice-2");
    values.set(
      "alrefqaa-finance-v1-1",
      JSON.stringify({
        ...emptyFinanceWorkspace(),
        commands: [retiredCommand, activeCommand],
        snapshot: financeSnapshot({
          invoices: [invoice, { ...invoice, id: "invoice-2" }],
        }),
      })
    );
    values.set(
      "alrefqa-copy-workspace-v2-1",
      JSON.stringify({
        ...emptyWorkspace(),
        state: { ...EMPTY_STATE, invoices: [invoice] },
      })
    );
    rememberRetirements(1, [retiredInvoice()]);

    const blobs: Blob[] = [];
    vi.stubGlobal("URL", {
      createObjectURL: (blob: Blob) => {
        blobs.push(blob);
        return `blob:archive-${blobs.length}`;
      },
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal("document", {
      createElement: () => ({ href: "", download: "", click: vi.fn() }),
    });

    downloadFinanceArchive(1);
    downloadLocalArchive(1);
    const financeExport = JSON.parse(await blobs[0].text());
    const localExport = JSON.parse(await blobs[1].text());
    const exportedFinance = JSON.parse(financeExport.financeRaw);
    const exportedWorkspace = JSON.parse(localExport.workspace);

    expect(
      exportedFinance.snapshot.invoices.map((row: { id: string }) => row.id)
    ).toEqual(["invoice-2"]);
    expect(
      exportedFinance.commands.map((command: { id: string }) => command.id)
    ).toEqual(["settled-active"]);
    expect(exportedWorkspace.state.invoices).toEqual([]);
  });
});
