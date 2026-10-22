import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  emptyFinanceWorkspace,
  stageFinanceCommand,
  saveFinanceWorkspace,
  loadFinanceWorkspace,
  applyFinanceSync,
} from "./financeStore";
import type { FinanceCommand, FinanceEntry } from "@shared/finance";
const values = new Map<string, string>();
const command: FinanceCommand = {
  id: "credit-command",
  kind: "customer_movement",
  createdAt: "2026-10-22T01:00:00Z",
  payload: {
    movementId: "credit-entry",
    customerId: "customer-a",
    officeId: "nouakchott",
    direction: "credit",
    amount: 50.25,
    currency: "MRU",
    date: "2026-10-22",
    description: "دفعة لصالح العميل",
    paymentMode: "cash",
  },
};
const entry: FinanceEntry = {
  id: "credit-entry",
  kind: "customer_credit",
  customerId: "customer-a",
  customerName: "عميل",
  officeId: "nouakchott",
  amount: 50.25,
  currency: "MRU",
  date: "2026-10-22",
  description: "دفعة لصالح العميل",
  actorId: 1,
  actorName: "محاسب",
  recordedAt: "2026-10-22T01:01:00Z",
};
beforeEach(() => {
  values.clear();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  vi.stubGlobal("navigator", {
    locks: { request: async (_key: string, fn: () => unknown) => fn() },
  });
});
describe("customer movement drafts", () => {
  it("survives offline reload and a rejected receipt without becoming a shared credit", async () => {
    const draft = stageFinanceCommand(emptyFinanceWorkspace(), command);
    await saveFinanceWorkspace(1, draft);
    const loaded = loadFinanceWorkspace(1);
    expect(loaded.commands[0]).toEqual(command);
    expect(loaded.snapshot.entries).toHaveLength(0);
    expect(loadFinanceWorkspace(2).commands).toHaveLength(0);
    const rejected = applyFinanceSync(loaded, {
      applied: [],
      conflicts: [{ commandId: command.id, code: "finance_forbidden" }],
    });
    expect(rejected.commands).toHaveLength(1);
    expect(rejected.snapshot.entries).toHaveLength(0);
  });
  it("acknowledges exactly once and leaves other drafts intact", () => {
    const second = {
      ...command,
      id: "other",
      payload: { ...command.payload, movementId: "other-entry" },
    };
    const draft = stageFinanceCommand(
      stageFinanceCommand(emptyFinanceWorkspace(), command),
      second
    );
    const receipt = {
      applied: [{ commandId: command.id, entries: [entry] }],
      conflicts: [],
    };
    const next = applyFinanceSync(draft, receipt);
    expect(next.commands.map(c => c.id)).toEqual(["other"]);
    expect(applyFinanceSync(next, receipt).snapshot.entries).toHaveLength(1);
  });
});
