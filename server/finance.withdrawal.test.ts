import { describe, expect, it, vi } from "vitest";
import {
  cashMovements,
  cashRegisterLocks,
  cashRegisters,
  entityLifecycle,
  financeEntries,
  financeReceipts,
  financeReversals,
  records,
  users,
} from "../drizzle/schema";
import type { FinanceCommand, FinanceEntry } from "../shared/finance";
import { blankPermissions } from "../shared/permissions";

const h = vi.hoisted(() => ({
  audit: vi.fn(async (tx: any, event: any) => {
    if (event.after?.description === "FAIL-AUDIT")
      throw new Error("simulated_audit_failure");
    tx.events.push(structuredClone(event));
  }),
  voidScope: null as any,
}));
vi.mock("./audit", () => ({ appendAudit: h.audit }));
vi.mock("./branches", () => ({
  readOfficeScope: vi.fn(async () => h.voidScope),
  officeIsAssigned: (scope: any, office: string) =>
    scope.role === "admin" || Boolean(scope.offices?.includes(office)),
}));

import { financeSync } from "./finance";
import { voidEntry } from "./financialVoids";

const now = "2026-11-04T18:00:00.000Z";
const user = (id: number, name = `Actor ${id}`) => ({
  id,
  name,
  openId: `withdrawal-${id}`,
  role: "user" as const,
});
const accountantScope = {
  role: "accountant" as const,
  offices: ["dubai" as const],
  homeOffice: "dubai" as const,
};

function comparisons(node: any): [string, unknown][] {
  if (!node?.queryChunks) return [];
  const chunks = node.queryChunks;
  const result: [string, unknown][] = [];
  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i]?.queryChunks) result.push(...comparisons(chunks[i]));
    if (
      typeof chunks[i]?.name === "string" &&
      chunks[i + 2] &&
      "value" in chunks[i + 2]
    )
      result.push([chunks[i].name, chunks[i + 2].value]);
  }
  return result;
}

function database() {
  const rows = new Map<unknown, any[]>([
    [users, [user(7), user(8)]],
    [records, []],
    [financeEntries, []],
    [financeReceipts, []],
    [cashRegisters, []],
    [cashRegisterLocks, []],
    [cashMovements, []],
    [financeReversals, []],
    [entityLifecycle, []],
  ]);
  const db: any = { rows, events: [] as any[] };
  const unique = (table: unknown, old: any, value: any) => {
    if (table === financeReceipts)
      return old.actorId === value.actorId && old.commandId === value.commandId;
    if (table === cashRegisterLocks)
      return (
        old.id === value.id ||
        (old.officeId === value.officeId && old.currency === value.currency)
      );
    if (table === entityLifecycle)
      return old.entity === value.entity && old.recordId === value.recordId;
    if (table === financeReversals)
      return old.originalEntryId === value.originalEntryId;
    return old.id === value.id;
  };
  db.select = () => ({
    from: (table: unknown) => {
      let condition: any;
      let cap = Infinity;
      const result = () =>
        (rows.get(table) ?? [])
          .filter(row =>
            comparisons(condition).every(([key, value]) => row[key] === value)
          )
          .slice(0, cap)
          .map(row => structuredClone(row));
      const query: any = {
        where(value: any) {
          condition = value;
          return query;
        },
        limit(value: number) {
          cap = value;
          return query;
        },
        for() {
          return Promise.resolve(result());
        },
        then(resolve: any, reject: any) {
          return Promise.resolve(result()).then(resolve, reject);
        },
      };
      return query;
    },
  });
  db.insert = (table: unknown) => {
    const builder: any = {
      values: async (value: any) => {
        const list = rows.get(table) ?? [];
        if (list.some(old => unique(table, old, value)))
          throw new Error("duplicate");
        list.push(structuredClone({ id: value.id ?? list.length + 1, ...value }));
        rows.set(table, list);
      },
    };
    builder.ignore = () => builder;
    return builder;
  };
  let transactionTail = Promise.resolve();
  db.transaction = (fn: (tx: any) => Promise<any>) => {
    const run = transactionTail.then(async () => {
      const backup = new Map(
        [...rows].map(([table, list]) => [table, structuredClone(list)])
      );
      const events = structuredClone(db.events);
      try {
        return await fn(db);
      } catch (error) {
        rows.clear();
        for (const [table, list] of backup) rows.set(table, list);
        db.events = events;
        throw error;
      }
    });
    transactionTail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };
  return db;
}

function fact(
  id: string,
  kind: FinanceEntry["kind"],
  amount: number,
  extra: Partial<FinanceEntry> = {}
): FinanceEntry {
  return {
    id,
    kind,
    officeId: "dubai",
    currency: "AED",
    amount,
    date: "2026-11-04",
    description: id,
    actorId: 7,
    actorName: "Actor 7",
    recordedAt: now,
    ...extra,
  };
}

function seedLedger(
  db: any,
  options: { opening?: number; revenue?: number; collection?: number } = {}
) {
  const entries = [
    fact("opening-dubai-AED", "opening_balance", options.opening ?? 100, {
      direction: "credit",
    }),
    ...(options.revenue === undefined
      ? [fact("revenue-dubai-AED", "invoice_revenue", 100)]
      : options.revenue > 0
        ? [fact("revenue-dubai-AED", "invoice_revenue", options.revenue)]
        : []),
    ...(options.collection === undefined
      ? [fact("collection-dubai-AED", "collection", 100)]
      : options.collection > 0
        ? [fact("collection-dubai-AED", "collection", options.collection)]
        : []),
  ];
  db.rows.get(financeEntries).push(
    ...entries.map((data: FinanceEntry) => ({
      id: data.id,
      kind: data.kind,
      officeId: data.officeId,
      currency: data.currency,
      actorId: data.actorId,
      data,
    }))
  );
}

function withdrawal(
  id: string,
  options: { withdrawalId?: string; amount?: number; description?: string } = {}
): FinanceCommand {
  return {
    id,
    kind: "profit_withdrawal",
    createdAt: now,
    payload: {
      withdrawalId: options.withdrawalId ?? `withdrawal-${id}`,
      officeId: "dubai",
      currency: "AED",
      amount: options.amount ?? 25,
      date: "2026-11-04",
      description: options.description ?? "Owner distribution",
    },
  };
}

describe("profit withdrawal transactions (isolated memory database)", () => {
  it("records one ledger withdrawal, actual cash expense, receipt, register, and audit", async () => {
    const db = database();
    seedLedger(db);
    const result = await financeSync(db, user(7), accountantScope, [
      withdrawal("withdraw-success"),
    ]);
    expect(result.conflicts).toEqual([]);
    expect(result.applied).toHaveLength(1);
    expect(db.rows.get(financeEntries)).toHaveLength(4);
    expect(db.rows.get(financeEntries).find((row: any) => row.kind === "profit_withdrawal")?.data).toMatchObject({
      id: "withdrawal-withdraw-success",
      officeId: "dubai",
      currency: "AED",
      amount: 25,
    });
    expect(db.rows.get(cashMovements)).toHaveLength(1);
    expect(db.rows.get(cashMovements)[0]).toMatchObject({
      officeId: "dubai",
      kind: "expense",
      amount: "25.00",
      currency: "AED",
    });
    expect(db.rows.get(cashMovements)[0].data).toMatchObject({
      source: "profit_withdrawal",
      entryId: "withdrawal-withdraw-success",
    });
    expect(db.rows.get(cashRegisters)).toHaveLength(1);
    expect(db.rows.get(cashRegisterLocks)).toHaveLength(1);
    expect(db.rows.get(financeReceipts)).toHaveLength(1);
    expect(db.events).toHaveLength(1);
  });

  it("rejects cash-insufficient and profit-insufficient withdrawals without writes", async () => {
    const cashDb = database();
    seedLedger(cashDb, { opening: 10, revenue: 100, collection: 0 });
    const cashResult = await financeSync(cashDb, user(7), accountantScope, [
      withdrawal("withdraw-cash-short", { amount: 20 }),
    ]);
    expect(cashResult.conflicts[0]?.code).toBe("insufficient_cash_balance");
    expect(cashDb.rows.get(financeEntries)).toHaveLength(2);
    expect(cashDb.rows.get(cashMovements)).toHaveLength(0);
    expect(cashDb.rows.get(financeReceipts)).toHaveLength(0);
    expect(cashDb.rows.get(cashRegisters)).toHaveLength(0);
    expect(cashDb.rows.get(cashRegisterLocks)).toHaveLength(0);

    const profitDb = database();
    seedLedger(profitDb, { opening: 200, revenue: 10, collection: 10 });
    const profitResult = await financeSync(
      profitDb,
      user(7),
      accountantScope,
      [withdrawal("withdraw-profit-short", { amount: 20 })]
    );
    expect(profitResult.conflicts[0]?.code).toBe("insufficient_profit_balance");
    expect(profitDb.rows.get(financeEntries)).toHaveLength(3);
    expect(profitDb.rows.get(cashMovements)).toHaveLength(0);
    expect(profitDb.rows.get(financeReceipts)).toHaveLength(0);
    expect(profitDb.rows.get(cashRegisters)).toHaveLength(0);
    expect(profitDb.rows.get(cashRegisterLocks)).toHaveLength(0);
  });

  it("replays a withdrawal without double effect and rejects changed payloads", async () => {
    const db = database();
    seedLedger(db);
    const command = withdrawal("withdraw-replay");
    const first = await financeSync(db, user(7), accountantScope, [command]);
    const replay = await financeSync(db, user(7), accountantScope, [command]);
    expect(first.conflicts).toEqual([]);
    expect(replay.conflicts).toEqual([]);
    expect(replay.applied).toHaveLength(1);
    expect(db.rows.get(financeEntries)).toHaveLength(4);
    expect(db.rows.get(cashMovements)).toHaveLength(1);
    expect(db.rows.get(financeReceipts)).toHaveLength(1);

    const changed = withdrawal("withdraw-replay", { amount: 26 });
    const changedResult = await financeSync(
      db,
      user(7),
      accountantScope,
      [changed]
    );
    expect(changedResult.applied).toEqual([]);
    expect(changedResult.conflicts[0]?.code).toBe("replay_payload_mismatch");
    expect(db.rows.get(financeEntries)).toHaveLength(4);
    expect(db.rows.get(cashMovements)).toHaveLength(1);
    expect(db.rows.get(financeReceipts)).toHaveLength(1);
  });

  it("rejects a different command reusing an existing withdrawal ID", async () => {
    const db = database();
    seedLedger(db);
    await financeSync(db, user(7), accountantScope, [
      withdrawal("withdraw-id-first", { withdrawalId: "stable-withdrawal" }),
    ]);
    const duplicate = await financeSync(db, user(7), accountantScope, [
      withdrawal("withdraw-id-second", {
        withdrawalId: "stable-withdrawal",
        amount: 10,
      }),
    ]);
    expect(duplicate.conflicts[0]?.code).toBe("withdrawal_exists");
    expect(db.rows.get(financeEntries)).toHaveLength(4);
    expect(db.rows.get(cashMovements)).toHaveLength(1);
    expect(db.rows.get(financeReceipts)).toHaveLength(1);
  });

  it("rolls back withdrawal ledger, cash, register, receipt, lock, and audit together", async () => {
    const db = database();
    seedLedger(db);
    const result = await financeSync(db, user(7), accountantScope, [
      withdrawal("withdraw-audit-fails", { description: "FAIL-AUDIT" }),
    ]);
    expect(result.applied).toEqual([]);
    expect(result.conflicts[0]?.code).toBe("simulated_audit_failure");
    expect(db.rows.get(financeEntries)).toHaveLength(3);
    expect(db.rows.get(cashMovements)).toHaveLength(0);
    expect(db.rows.get(cashRegisters)).toHaveLength(0);
    expect(db.rows.get(cashRegisterLocks)).toHaveLength(0);
    expect(db.rows.get(financeReceipts)).toHaveLength(0);
    expect(db.events).toHaveLength(0);
  });

  it("serializes different actors withdrawing from one office and currency", async () => {
    const db = database();
    seedLedger(db);
    const [first, second] = await Promise.all([
      financeSync(db, user(7), accountantScope, [withdrawal("withdraw-actor-1")]),
      financeSync(db, user(8), accountantScope, [withdrawal("withdraw-actor-2")]),
    ]);
    expect(first.conflicts).toEqual([]);
    expect(second.conflicts).toEqual([]);
    expect(db.rows.get(financeEntries)).toHaveLength(5);
    expect(db.rows.get(cashMovements)).toHaveLength(2);
    expect(db.rows.get(financeReceipts)).toHaveLength(2);
    expect(db.rows.get(cashRegisters)).toHaveLength(1);
    expect(db.rows.get(cashRegisterLocks)).toHaveLength(1);
  });

  it("denies cashier and revoked profit-withdrawal permission before any write", async () => {
    const cashierDb = database();
    seedLedger(cashierDb);
    const cashier = await financeSync(
      cashierDb,
      user(7),
      {
        role: "cashier",
        offices: ["dubai"],
        homeOffice: "dubai",
        permissions: {
          ...blankPermissions(),
          profit_withdrawal: "manage",
        },
      },
      [withdrawal("withdraw-cashier")]
    );
    expect(cashier.conflicts[0]?.code).toBe("finance_forbidden");
    expect(cashierDb.rows.get(financeEntries)).toHaveLength(3);
    expect(cashierDb.rows.get(cashMovements)).toHaveLength(0);
    expect(cashierDb.rows.get(financeReceipts)).toHaveLength(0);

    const revokedDb = database();
    seedLedger(revokedDb);
    const revoked = await financeSync(
      revokedDb,
      user(7),
      {
        ...accountantScope,
        permissions: blankPermissions(),
      },
      [withdrawal("withdraw-revoked")]
    );
    expect(revoked.conflicts[0]?.code).toBe("finance_forbidden");
    expect(revokedDb.rows.get(financeEntries)).toHaveLength(3);
    expect(revokedDb.rows.get(cashMovements)).toHaveLength(0);
    expect(revokedDb.rows.get(financeReceipts)).toHaveLength(0);
  });

  it("requires a refund workflow before a posted withdrawal can be voided", async () => {
    const db = database();
    seedLedger(db);
    const result = await financeSync(db, user(7), accountantScope, [
      withdrawal("withdraw-void-refund"),
    ]);
    expect(result.conflicts).toEqual([]);
    h.voidScope = {
      role: "accountant",
      offices: ["dubai"],
      homeOffice: "dubai",
      permissions: {
        ...blankPermissions(),
        entry_void: "manage",
      },
    };
    await expect(
      voidEntry(db, user(7), {
        requestKey: "void-withdrawal-refund",
        entryId: "withdrawal-withdraw-void-refund",
        confirmation: "withdrawal-withdraw-void-refund",
        reason: "withdrawal correction",
      })
    ).rejects.toThrow("entry_refund_required");
    expect(db.rows.get(entityLifecycle)).toHaveLength(0);
    expect(db.rows.get(financeReversals)).toHaveLength(0);
    expect(db.rows.get(financeEntries)).toHaveLength(4);
    expect(db.rows.get(cashMovements)).toHaveLength(1);
  });
});
