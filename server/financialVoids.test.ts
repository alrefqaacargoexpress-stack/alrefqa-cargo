import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  entityLifecycle,
  financeEntries,
  financeReversals,
  records,
  cashMovements,
  shipmentChargeAllocations,
  users,
} from "../drizzle/schema";
import { blankPermissions } from "../shared/permissions";

const f = vi.hoisted(() => ({
  db: null as any,
  scope: null as any,
  audit: vi.fn(async () => 1),
}));

vi.mock("./db", () => ({ getDb: async () => f.db }));
vi.mock("./branches", () => ({
  readOfficeScope: vi.fn(async () => f.scope),
  officeIsAssigned: (scope: any, office: string) =>
    scope.role === "admin" || Boolean(scope.offices?.includes(office)),
}));
vi.mock("./audit", () => ({ appendAudit: f.audit }));

import { voidEntry, voidInvoice } from "./financialVoids";

const actor = {
  id: 7,
  name: "Test accountant",
  openId: "actor-open-id",
  role: "user" as const,
};
const now = "2026-10-24T12:00:00.000Z";

function comparisons(node: any): [string, unknown][] {
  if (!node?.queryChunks) return [];
  const out: [string, unknown][] = [];
  const chunks = node.queryChunks;
  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i]?.queryChunks) out.push(...comparisons(chunks[i]));
    if (
      typeof chunks[i]?.name === "string" &&
      chunks[i + 2] &&
      "value" in chunks[i + 2]
    )
      out.push([chunks[i].name, chunks[i + 2].value]);
  }
  return out;
}

function database() {
  const rows = new Map<unknown, any[]>([
    [users, [{ id: actor.id, name: actor.name }]],
    [records, []],
    [financeEntries, []],
    [financeReversals, []],
    [entityLifecycle, []],
    [cashMovements, []],
    [shipmentChargeAllocations, []],
  ]);
  const db: any = { rows };
  const clone = (value: any) => structuredClone(value);
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
          .map(clone);
      const query: any = {
        where: (value: any) => {
          condition = value;
          return query;
        },
        limit: (value: number) => {
          cap = value;
          return query;
        },
        for: async () => result(),
        then: (resolve: any, reject: any) =>
          Promise.resolve(result()).then(resolve, reject),
      };
      return query;
    },
  });
  db.insert = (table: unknown) => ({
    values: async (value: any) => {
      const list = rows.get(table) ?? [];
      const duplicate = list.some(old => {
        if (table === entityLifecycle)
          return old.entity === value.entity && old.recordId === value.recordId;
        if (table === financeReversals)
          return old.originalEntryId === value.originalEntryId;
        if (table === shipmentChargeAllocations)
          return (
            old.componentId === value.componentId &&
            old.kind === value.kind &&
            old.requestKey === value.requestKey
          );
        return old.id === value.id;
      });
      if (duplicate) throw new Error("duplicate");
      list.push(clone(value));
      rows.set(table, list);
    },
  });
  db.transaction = async (fn: (tx: any) => Promise<any>) => {
    const backup = new Map(
      [...rows].map(([table, list]) => [table, clone(list)])
    );
    try {
      return await fn(db);
    } catch (error) {
      rows.clear();
      for (const [table, list] of backup) rows.set(table, list);
      throw error;
    }
  };
  return db;
}

function finance(overrides: Record<string, unknown> = {}) {
  return {
    customerId: "customer-1",
    chargeKind: "general",
    paymentMode: "cash",
    issuingOfficeId: "nouakchott",
    financialOfficeId: "nouakchott",
    actorId: actor.id,
    actorName: actor.name,
    recordedAt: now,
    currency: "MRU",
    goods: [],
    baseAmount: 100,
    adjustment: { direction: "increase", amount: 0 },
    paidAmount: 100,
    ...overrides,
  };
}

function invoice(id = "invoice-1", overrides: Record<string, unknown> = {}) {
  return {
    id,
    account: "Customer One",
    amount: 100,
    status: "مدفوعة",
    issuedAt: now,
    officeId: "nouakchott",
    finance: finance(),
    ...overrides,
  };
}

function entry(
  id: string,
  kind: "invoice_revenue" | "collection" | "daily_expense" = "invoice_revenue",
  overrides: Record<string, unknown> = {}
) {
  return {
    id,
    kind,
    officeId: "nouakchott",
    currency: "MRU",
    amount: 100,
    date: "2026-10-24",
    description: kind,
    actorId: actor.id,
    actorName: actor.name,
    recordedAt: now,
    ...(kind === "invoice_revenue" ? { invoiceId: "invoice-1" } : {}),
    ...overrides,
  };
}

function setup() {
  const db = database();
  f.db = db;
  const permissions = blankPermissions();
  permissions.invoice_void = "manage";
  permissions.entry_void = "manage";
  f.scope = {
    role: "accountant",
    offices: ["nouakchott"],
    homeOffice: "nouakchott",
    permissions,
  };
  f.audit.mockResolvedValue(1);
  db.rows.get(records)!.push({
    id: 1,
    entity: "invoice",
    recordId: "invoice-1",
    version: 2,
    data: invoice(),
  });
  db.rows.get(financeEntries)!.push(
    {
      id: "invoice-revenue-1",
      kind: "invoice_revenue",
      officeId: "nouakchott",
      currency: "MRU",
      invoiceId: "invoice-1",
      actorId: actor.id,
      data: entry("invoice-revenue-1"),
    },
    {
      id: "collection-1",
      kind: "collection",
      officeId: "nouakchott",
      currency: "MRU",
      invoiceId: "invoice-1",
      actorId: actor.id,
      data: entry("collection-1", "collection"),
    }
  );
  return db;
}

const invoiceRequest = {
  requestKey: "void-request-1",
  invoiceId: "invoice-1",
  expectedVersion: 2,
  confirmation: "invoice-1",
  reason: "duplicate invoice",
};

describe("financial void service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies a caller without the explicit invoice_void capability", async () => {
    const db = setup();
    f.scope.permissions.invoice_void = "view";
    await expect(voidInvoice(db, actor, invoiceRequest)).rejects.toThrow(
      "invoice_void_forbidden"
    );
    expect(db.rows.get(entityLifecycle)).toHaveLength(0);
    expect(db.rows.get(financeReversals)).toHaveLength(0);
  });

  it("re-reads office scope and rejects a cross-office invoice without changing the record", async () => {
    const db = setup();
    f.scope.offices = ["dubai"];
    f.scope.homeOffice = "dubai";
    const before = structuredClone(db.rows.get(records));
    await expect(voidInvoice(db, actor, invoiceRequest)).rejects.toThrow(
      "office_forbidden"
    );
    expect(db.rows.get(records)).toEqual(before);
    expect(db.rows.get(entityLifecycle)).toHaveLength(0);
  });

  it("reverses recognition, keeps collection and adds customer credit without cash refund", async () => {
    const db = setup();
    const beforeInvoice = structuredClone(db.rows.get(records));
    const result = await voidInvoice(db, actor, invoiceRequest);
    expect(result.customerCreditAmount).toBe(100);
    expect(result.customerCreditEntryId).toBeTruthy();
    expect(db.rows.get(records)).toEqual(beforeInvoice);
    expect(db.rows.get(financeReversals)).toHaveLength(1);
    expect(db.rows.get(financeReversals)![0].amount).toBe("-100.00");
    expect(
      db.rows.get(financeEntries)!.some((row: any) => row.kind === "collection")
    ).toBe(true);
    expect(
      db.rows
        .get(financeEntries)!
        .some((row: any) => row.kind === "customer_credit")
    ).toBe(true);
    expect(
      db.rows
        .get(financeEntries)!
        .find((row: any) => row.kind === "customer_credit")?.data.cashEffect
    ).toBe("none");
    expect(db.rows.get(cashMovements)).toHaveLength(0);
  });

  it("replays the same request harmlessly and rejects an altered payload", async () => {
    const db = setup();
    const first = await voidInvoice(db, actor, invoiceRequest);
    const replay = await voidInvoice(db, actor, invoiceRequest);
    expect(replay.replayed).toBe(true);
    expect(replay.reversalIds).toEqual(first.reversalIds);
    expect(db.rows.get(entityLifecycle)).toHaveLength(1);
    expect(db.rows.get(financeReversals)).toHaveLength(1);
    await expect(
      voidInvoice(db, actor, { ...invoiceRequest, reason: "altered" })
    ).rejects.toThrow("replay_payload_mismatch");
  });

  it("rolls back every append when audit fails", async () => {
    const db = setup();
    f.audit.mockRejectedValueOnce(new Error("simulated_audit_failure"));
    await expect(voidInvoice(db, actor, invoiceRequest)).rejects.toThrow(
      "simulated_audit_failure"
    );
    expect(db.rows.get(records)).toHaveLength(1);
    expect(db.rows.get(entityLifecycle)).toHaveLength(0);
    expect(db.rows.get(financeReversals)).toHaveLength(0);
    expect(db.rows.get(financeEntries)).toHaveLength(2);
  });

  it("rejects an expense backed by real cash instead of silently refunding it", async () => {
    const db = setup();
    const expense = entry("expense-1", "daily_expense", {
      invoiceId: undefined,
    });
    db.rows.get(financeEntries)!.push({
      id: expense.id,
      kind: expense.kind,
      officeId: expense.officeId,
      currency: expense.currency,
      actorId: expense.actorId,
      data: expense,
    });
    db.rows.get(cashMovements)!.push({
      id: "cash-expense-1",
      officeId: "nouakchott",
      kind: "expense",
      amount: "100.00",
      currency: "MRU",
      actorId: actor.id,
      data: { source: "expense" },
    });
    await expect(
      voidEntry(db, actor, {
        requestKey: "void-expense-1",
        entryId: "expense-1",
        confirmation: "expense-1",
        reason: "book error",
      })
    ).rejects.toThrow("entry_refund_required");
    expect(db.rows.get(entityLifecycle)).toHaveLength(0);
    expect(db.rows.get(financeReversals)).toHaveLength(0);
  });

  it("voids an unlinked erroneous book entry with an append-only reversal", async () => {
    const db = setup();
    const expense = entry("expense-2", "daily_expense", {
      invoiceId: undefined,
    });
    db.rows.get(financeEntries)!.push({
      id: expense.id,
      kind: expense.kind,
      officeId: expense.officeId,
      currency: expense.currency,
      actorId: expense.actorId,
      data: expense,
    });
    const result = await voidEntry(db, actor, {
      requestKey: "void-expense-2",
      entryId: "expense-2",
      confirmation: "expense-2",
      reason: "erroneous book entry",
    });
    expect(result.operation).toBe("entry_void");
    expect(db.rows.get(financeReversals)).toHaveLength(1);
    expect(db.rows.get(financeReversals)![0].originalEntryId).toBe("expense-2");
    expect(
      db.rows.get(financeEntries)!.find(row => row.id === "expense-2")?.data
    ).toEqual(expense);
  });
  it("does not replay a void after losing access to its office", async () => {
    const db = setup();
    await voidInvoice(db, actor, invoiceRequest);
    f.scope.offices = ["turkey"];
    f.scope.homeOffice = "turkey";
    await expect(voidInvoice(db, actor, invoiceRequest)).rejects.toThrow();
    expect(db.rows.get(financeReversals)).toHaveLength(1);
  });
});
