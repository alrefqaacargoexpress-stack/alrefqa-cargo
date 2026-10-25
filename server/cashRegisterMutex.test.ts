import { describe, expect, it, vi } from "vitest";
import {
  cashMovements,
  cashRegisterLocks,
  cashRegisters,
  financeEntries,
  financeReceipts,
  records,
  users,
} from "../drizzle/schema";
import type { FinanceCommand } from "../shared/finance";

const audit = vi.hoisted(() =>
  vi.fn(async (tx: any, event: any) => {
    if (event.after?.description === "FAIL-AUDIT")
      throw new Error("simulated_audit_failure");
    tx.events.push(structuredClone(event));
  })
);
vi.mock("./audit", () => ({ appendAudit: audit }));

import { financeSync } from "./finance";

const now = "2026-10-25T12:00:00.000Z";
const scope = (office: "nouakchott" | "dubai") => ({
  role: "accountant" as const,
  offices: [office],
  homeOffice: office,
});
const actor = (id: number, name: string) => ({
  id,
  name,
  openId: `cash-mutex-${id}`,
  role: "user" as const,
});

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

function database(existingRegisters: any[] = [], existingLocks: any[] = []) {
  const rows = new Map<unknown, any[]>([
    [users, [actor(7, "First actor"), actor(8, "Second actor")]],
    [records, []],
    [financeEntries, []],
    [financeReceipts, []],
    [cashRegisters, structuredClone(existingRegisters)],
    [cashMovements, []],
    [cashRegisterLocks, structuredClone(existingLocks)],
  ]);
  const db: any = {
    rows,
    events: [] as any[],
    lockOrder: [] as string[],
    beforeMutexLock: undefined as (() => void) | undefined,
  };
  const unique = (table: unknown, old: any, value: any) => {
    if (table === financeReceipts)
      return old.actorId === value.actorId && old.commandId === value.commandId;
    if (table === cashRegisterLocks)
      return (
        old.id === value.id ||
        (old.officeId === value.officeId && old.currency === value.currency)
      );
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
          if (table === cashRegisterLocks) {
            db.beforeMutexLock?.();
            db.beforeMutexLock = undefined;
            db.lockOrder.push("mutex-lock");
          } else if (
            table === records &&
            comparisons(condition).some(
              ([key, value]) => key === "entity" && value === "invoice"
            )
          ) {
            db.lockOrder.push("invoice-lock");
          }
          return Promise.resolve(result());
        },
        then(resolve: any, reject: any) {
          if (
            table === records &&
            comparisons(condition).some(
              ([key, value]) => key === "entity" && value === "invoice"
            )
          )
            db.lockOrder.push("invoice-read");
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
        list.push(
          structuredClone({ id: value.id ?? list.length + 1, ...value })
        );
        rows.set(table, list);
      },
    };
    builder.ignore = () => builder;
    return builder;
  };
  db.update = (table: unknown) => ({
    set: (value: any) => ({
      where: async (condition: any) => {
        for (const row of rows.get(table) ?? [])
          if (
            comparisons(condition).every(([key, value]) => row[key] === value)
          )
            Object.assign(row, structuredClone(value));
      },
    }),
  });
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

function expense(
  id: string,
  office: "nouakchott" | "dubai",
  currency: "MRU" | "AED",
  description = "cash expense"
): FinanceCommand {
  return {
    id,
    kind: "expense",
    createdAt: now,
    payload: {
      expenseId: `expense-${id}`,
      category: "daily_expense",
      officeId: office,
      currency,
      amount: 2,
      date: "2026-10-25",
      description,
    },
  };
}

function cashSettlement(id = "settlement-cash"): FinanceCommand {
  return {
    id,
    kind: "settlement",
    createdAt: now,
    payload: {
      invoiceId: "invoice-cash",
      expectedVersion: 1,
      amount: 2,
      payment: {
        office: "nouakchott",
        methodId: "cash",
        methodLabel: "Cash",
      },
      description: "cash settlement",
    },
  };
}

function seedCashInvoice(db: any, currency: "MRU" | "AED" = "MRU") {
  db.rows.set(records, [
    {
      id: 101,
      entity: "account",
      recordId: "customer-cash",
      version: 1,
      data: {
        id: "customer-cash",
        name: "Cash Customer",
        officeId: "nouakchott",
      },
    },
    {
      id: 102,
      entity: "invoice",
      recordId: "invoice-cash",
      version: 1,
      data: {
        id: "invoice-cash",
        account: "Cash Customer",
        amount: 10,
        status: "دين",
        issuedAt: now,
        officeId: "nouakchott",
        finance: {
          customerId: "customer-cash",
          chargeKind: "general",
          paymentMode: "on_account",
          issuingOfficeId: "nouakchott",
          financialOfficeId: "nouakchott",
          actorId: 7,
          actorName: "First actor",
          recordedAt: now,
          currency,
          goods: [],
          baseAmount: 10,
          adjustment: { direction: "increase", amount: 0 },
          paidAmount: 0,
        },
      },
    },
  ]);
}

describe("cash register mutex (isolated fake transactions)", () => {
  it("serializes different actors into one open register for one office/currency", async () => {
    const db = database();
    const first = financeSync(
      db,
      actor(7, "First actor"),
      scope("nouakchott"),
      [expense("same-office-1", "nouakchott", "MRU")]
    );
    const second = financeSync(
      db,
      actor(8, "Second actor"),
      scope("nouakchott"),
      [expense("same-office-2", "nouakchott", "MRU")]
    );
    const [left, right] = await Promise.all([first, second]);
    expect(left.conflicts).toEqual([]);
    expect(right.conflicts).toEqual([]);
    expect(db.rows.get(cashRegisters)).toHaveLength(1);
    expect(db.rows.get(cashMovements)).toHaveLength(2);
    expect(db.rows.get(cashRegisterLocks)).toHaveLength(1);
  });

  it("keeps different office/currency mutexes isolated", async () => {
    const db = database();
    const [nouakchott, dubai] = await Promise.all([
      financeSync(db, actor(7, "First actor"), scope("nouakchott"), [
        expense("isolated-mru", "nouakchott", "MRU"),
      ]),
      financeSync(db, actor(8, "Second actor"), scope("dubai"), [
        expense("isolated-aed", "dubai", "AED"),
      ]),
    ]);
    expect(nouakchott.conflicts).toEqual([]);
    expect(dubai.conflicts).toEqual([]);
    expect(db.rows.get(cashRegisters)).toHaveLength(2);
    expect(db.rows.get(cashRegisterLocks)).toHaveLength(2);
  });

  it("rolls back mutex, register, movement, ledger, receipt, and audit atomically", async () => {
    const db = database();
    const result = await financeSync(
      db,
      actor(7, "First actor"),
      scope("nouakchott"),
      [expense("audit-fails", "nouakchott", "MRU", "FAIL-AUDIT")]
    );
    expect(result.applied).toEqual([]);
    expect(result.conflicts[0]?.code).toBe("simulated_audit_failure");
    expect(db.rows.get(cashRegisterLocks)).toHaveLength(0);
    expect(db.rows.get(cashRegisters)).toHaveLength(0);
    expect(db.rows.get(cashMovements)).toHaveLength(0);
    expect(db.rows.get(financeEntries)).toHaveLength(0);
    expect(db.rows.get(financeReceipts)).toHaveLength(0);
    expect(db.events).toHaveLength(0);
  });

  it("denies legacy duplicate open registers without financial writes", async () => {
    const db = database([
      {
        id: "legacy-open-1",
        officeId: "nouakchott",
        currency: "MRU",
        status: "open",
      },
      {
        id: "legacy-open-2",
        officeId: "nouakchott",
        currency: "MRU",
        status: "open",
      },
    ]);
    const result = await financeSync(
      db,
      actor(7, "First actor"),
      scope("nouakchott"),
      [expense("legacy-duplicate", "nouakchott", "MRU")]
    );
    expect(result.applied).toEqual([]);
    expect(result.conflicts[0]?.code).toBe("cash_register_review_required");
    expect(db.rows.get(cashRegisterLocks)).toHaveLength(0);
    expect(db.rows.get(cashRegisters)).toHaveLength(2);
    expect(db.rows.get(cashMovements)).toHaveLength(0);
    expect(db.rows.get(financeEntries)).toHaveLength(0);
    expect(db.rows.get(financeReceipts)).toHaveLength(0);
    expect(db.events).toHaveLength(0);
  });

  it("locks settlement cash as invoice-read, mutex, invoice-lock before overlapping cash expense", async () => {
    const db = database();
    seedCashInvoice(db);
    const [settlement, expenseResult] = await Promise.all([
      financeSync(db, actor(7, "First actor"), scope("nouakchott"), [
        cashSettlement(),
      ]),
      financeSync(db, actor(8, "Second actor"), scope("nouakchott"), [
        expense("overlap-expense", "nouakchott", "MRU"),
      ]),
    ]);
    expect(settlement.conflicts).toEqual([]);
    expect(expenseResult.conflicts).toEqual([]);
    expect(db.lockOrder.slice(0, 3)).toEqual([
      "invoice-read",
      "mutex-lock",
      "invoice-lock",
    ]);
    expect(
      db.lockOrder.filter((step: string) => step === "mutex-lock")
    ).toHaveLength(2);
    expect(db.rows.get(cashMovements)).toHaveLength(2);
  });

  it("rejects invoice office/currency metadata changed while waiting for mutex without writes", async () => {
    const db = database();
    seedCashInvoice(db);
    const original = structuredClone(db.rows.get(records));
    db.beforeMutexLock = () => {
      const invoice = db.rows
        .get(records)
        .find((row: any) => row.entity === "invoice");
      invoice.data.finance.currency = "AED";
    };
    const result = await financeSync(
      db,
      actor(7, "First actor"),
      scope("nouakchott"),
      [cashSettlement("changed-metadata")]
    );
    expect(result.applied).toEqual([]);
    expect(result.conflicts[0]?.code).toBe("cash_register_metadata_changed");
    expect(db.rows.get(records)).toEqual(original);
    expect(db.rows.get(cashRegisterLocks)).toHaveLength(0);
    expect(db.rows.get(cashRegisters)).toHaveLength(0);
    expect(db.rows.get(cashMovements)).toHaveLength(0);
    expect(db.rows.get(financeEntries)).toHaveLength(0);
    expect(db.rows.get(financeReceipts)).toHaveLength(0);
    expect(db.events).toHaveLength(0);
  });
});
