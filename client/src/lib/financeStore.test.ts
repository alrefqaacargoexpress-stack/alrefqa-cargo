import { beforeEach, describe, it, expect, vi } from "vitest";
import {
  emptyFinanceWorkspace,
  loadFinanceWorkspace,
  saveFinanceWorkspace,
  stageFinanceCommand,
  applyFinanceSync,
  mergeFinanceSnapshot,
} from "./financeStore";
import {
  emptyFinanceSnapshot,
  type FinanceCommand,
  type FinanceEntry,
} from "@shared/finance";
const values = new Map<string, string>();
const memory = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, v: string) => values.set(key, v),
  removeItem: (key: string) => values.delete(key),
};
const now = "2026-10-21T12:00:00.000Z";
function command(): FinanceCommand {
  return {
    id: "test-command",
    createdAt: now,
    kind: "expense",
    payload: {
      expenseId: "test-expense",
      officeId: "nouakchott",
      category: "daily_expense",
      currency: "MRU",
      amount: 10,
      date: "2026-10-21",
      description: "Test expense",
    },
  };
}
const entry: FinanceEntry = {
  id: "test-expense",
  officeId: "nouakchott",
  kind: "daily_expense",
  currency: "MRU",
  amount: 10,
  date: "2026-10-21",
  description: "Test expense",
  actorId: 1,
  actorName: "Test actor",
  recordedAt: now,
};
beforeEach(() => {
  values.clear();
  vi.stubGlobal("window", { localStorage: memory });
  vi.stubGlobal("navigator", {
    locks: { request: async (_k: string, f: () => void) => f() },
  });
});
describe("Financial draft persistence", () => {
  it("isolates financial drafts by user and retains them until a matching acknowledgement", async () => {
    const draft = stageFinanceCommand(emptyFinanceWorkspace(), command());
    await saveFinanceWorkspace(1, draft);
    expect(loadFinanceWorkspace(1).commands).toHaveLength(1);
    expect(loadFinanceWorkspace(2).commands).toHaveLength(0);
    const conflict = applyFinanceSync(draft, {
      applied: [],
      conflicts: [{ commandId: "test-command", code: "version_conflict" }],
    });
    expect(conflict.commands).toHaveLength(1);
    const ack = applyFinanceSync(conflict, {
      applied: [{ commandId: "test-command", entries: [entry] }],
      conflicts: [],
    });
    expect(ack.commands).toHaveLength(0);
    expect(ack.snapshot.entries).toHaveLength(1);
    expect(
      applyFinanceSync(ack, {
        applied: [{ commandId: "test-command", entries: [entry] }],
        conflicts: [],
      }).snapshot.entries
    ).toHaveLength(1);
  });
  it("keeps office-restricted cached records and drafts without exposing or deleting their archive", () => {
    const draft = stageFinanceCommand(
      {
        ...emptyFinanceWorkspace(),
        snapshot: { ...emptyFinanceSnapshot(), entries: [entry] },
      },
      command()
    );
    const merged = mergeFinanceSnapshot(draft, {
      ...emptyFinanceSnapshot(),
      offices: ["china"],
    });
    expect(merged.snapshot.entries).toHaveLength(1);
    expect(merged.commands).toHaveLength(1);
    expect(merged.snapshot.offices).toEqual(["china"]);
  });
  it("rejects cross-tab revision changes without overwriting the first saved draft", async () => {
    const first = emptyFinanceWorkspace(),
      stale = emptyFinanceWorkspace();
    await saveFinanceWorkspace(1, stageFinanceCommand(first, command()));
    await expect(saveFinanceWorkspace(1, stale)).rejects.toThrow(
      "finance_store_conflict"
    );
    expect(loadFinanceWorkspace(1).commands).toHaveLength(1);
  });
  it("keeps corrupt original data untouched rather than resetting it", () => {
    values.set("alrefqaa-finance-v1-1", "broken-original");
    expect(() => loadFinanceWorkspace(1)).toThrow("finance_store_corrupt");
    expect(values.get("alrefqaa-finance-v1-1")).toBe("broken-original");
  });
  it("refuses reuse of a command id with a different financial amount", () => {
    const draft = stageFinanceCommand(emptyFinanceWorkspace(), command());
    const changed = command();
    if (changed.kind === "expense") changed.payload.amount = 20;
    expect(() => stageFinanceCommand(draft, changed)).toThrow(
      "finance_command_conflict"
    );
    expect(draft.commands).toHaveLength(1);
  });
  it("retains the previous draft when storage is full", async () => {
    const old = stageFinanceCommand(emptyFinanceWorkspace(), command());
    await saveFinanceWorkspace(1, old);
    vi.stubGlobal("window", {
      localStorage: {
        ...memory,
        setItem: () => {
          throw new Error("quota");
        },
      },
    });
    const next = stageFinanceCommand(old, {
      ...command(),
      id: "second-command",
    });
    await expect(saveFinanceWorkspace(1, next)).rejects.toThrow(
      "finance_store_full"
    );
    expect(loadFinanceWorkspace(1).commands).toHaveLength(1);
  });
});
