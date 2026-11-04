import { describe, expect, it, vi } from "vitest";
import {
  cashMovements,
  cashRegisters,
  entityLifecycle,
  financeEntries,
  financeReceipts,
  records,
  shipmentCostApprovals,
  shipmentChargeComponents,
  users,
} from "../drizzle/schema";
import type { FinanceCommand } from "../shared/finance";

const h = vi.hoisted(() => ({
  audit: vi.fn(async (tx: any, event: any) => {
    if (event.after?.description === "FAIL-AUDIT")
      throw new Error("simulated_audit_failure");
    tx.events.push(structuredClone(event));
  }),
}));

vi.mock("./audit", () => ({ appendAudit: h.audit }));

import { financeSync } from "./finance";

const now = "2026-10-24T12:00:00.000Z";
const actor = {
  id: 7,
  name: "Source accountant",
  openId: "strict-cost-actor",
  role: "user" as const,
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

const unique = (table: unknown, old: any, value: any) => {
  if (table === records)
    return old.entity === value.entity && old.recordId === value.recordId;
  if (table === financeReceipts)
    return old.actorId === value.actorId && old.commandId === value.commandId;
  if (table === shipmentCostApprovals)
    return (
      old.shipmentId === value.shipmentId &&
      old.officeId === value.officeId &&
      old.referenceKey === value.referenceKey
    );
  if (table === shipmentChargeComponents)
    return (
      old.shipmentId === value.shipmentId &&
      old.goodsId === value.goodsId &&
      old.chargeKey === value.chargeKey
    );
  return old.id === value.id;
};

function database() {
  const rows = new Map<unknown, any[]>([
    [users, [{ id: actor.id, name: actor.name }]],
    [records, []],
    [entityLifecycle, []],
    [financeEntries, []],
    [financeReceipts, []],
    [shipmentCostApprovals, []],
    [shipmentChargeComponents, []],
    [cashRegisters, []],
    [cashMovements, []],
  ]);
  const db: any = { rows, events: [] as any[] };
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
  db.insert = (table: unknown) => ({
    values: async (value: any) => {
      const list = rows.get(table) ?? [];
      if (list.some(old => unique(table, old, value))) throw new Error("duplicate");
      list.push(structuredClone({ id: value.id ?? list.length + 1, ...value }));
      rows.set(table, list);
    },
  });
  db.transaction = async (fn: (tx: any) => Promise<any>) => {
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
  };
  return db;
}

function shipment() {
  return {
    id: "s-source-1",
    tracking: "STRICT-1",
    status: "قيد التجهيز",
    amount: 0,
    officeId: "dubai",
    packing: {
      source: "dubai",
      pricePerKg: 10,
      createdAt: now,
      updatedAt: now,
      cartons: [
        {
          number: 1,
          closed: true,
          goods: [
            {
              id: "g-source-1",
              name: "Carrier goods",
              phone: "",
              unitWeight: 1,
              pieces: 1,
            },
          ],
        },
      ],
    },
  };
}

function sourceDb() {
  const db = database();
  db.rows.get(records).push({
    id: 1,
    entity: "shipment",
    recordId: "s-source-1",
    version: 1,
    data: shipment(),
  });
  return db;
}

function seedSourceCash(db: any, amount = 100) {
  const id = "opening-dubai-AED";
  const data = {
    id,
    kind: "opening_balance",
    officeId: "dubai",
    currency: "AED",
    amount,
    date: "2026-10-24",
    description: "fixture opening cash",
    actorId: actor.id,
    actorName: actor.name,
    recordedAt: now,
    direction: "credit",
  };
  db.rows.get(financeEntries).push({
    id,
    kind: data.kind,
    officeId: data.officeId,
    currency: data.currency,
    actorId: actor.id,
    data,
  });
}

function sourceCommand(
  id: string,
  options: { referenceKey?: string; description?: string } = {}
): FinanceCommand {
  return {
    id,
    kind: "expense",
    createdAt: now,
    payload: {
      expenseId: `expense-${id}`,
      category: "shipment_cost",
      officeId: "dubai",
      currency: "AED",
      amount: 25,
      date: "2026-10-24",
      description: options.description ?? "Carrier invoice",
      shipmentId: "s-source-1",
      ...(options.referenceKey ? { referenceKey: options.referenceKey } : {}),
    },
  };
}

const sourceScope = {
  role: "general_accountant" as const,
  offices: ["dubai" as const],
  homeOffice: "dubai" as const,
};

describe("strict cost transaction coverage", () => {
  it("denies a source accountant before writing cash, ledger, approval, or receipt", async () => {
    const db = sourceDb();
    const result = await financeSync(
      db,
      actor,
      { role: "accountant", offices: ["dubai"], homeOffice: "dubai" },
      [sourceCommand("source-accountant-denied")]
    );
    expect(result.applied).toEqual([]);
    expect(result.conflicts[0]?.code).toBe("shipment_cost_forbidden");
    expect(db.rows.get(financeEntries)).toHaveLength(0);
    expect(db.rows.get(cashMovements)).toHaveLength(0);
    expect(db.rows.get(shipmentCostApprovals)).toHaveLength(0);
    expect(db.rows.get(financeReceipts)).toHaveLength(0);
  });

  it("rejects a second expense id for the same stable source approval", async () => {
    const db = sourceDb();
    seedSourceCash(db);
    const first = await financeSync(
      db,
      actor,
      sourceScope,
      [sourceCommand("source-first", { referenceKey: "carrier-approval-1" })]
    );
    expect(first.conflicts).toEqual([]);
    const second = await financeSync(
      db,
      actor,
      sourceScope,
      [sourceCommand("source-new-expense", { referenceKey: "carrier-approval-1" })]
    );
    expect(second.conflicts[0]?.code).toBe("shipment_cost_duplicate");
    expect(db.rows.get(financeEntries)).toHaveLength(2);
    expect(db.rows.get(cashMovements)).toHaveLength(1);
    expect(db.rows.get(shipmentCostApprovals)).toHaveLength(1);
    expect(db.rows.get(financeReceipts)).toHaveLength(1);
  });

  it("rolls back a source cash expense and approval when the audit append fails", async () => {
    const db = sourceDb();
    seedSourceCash(db);
    const result = await financeSync(
      db,
      actor,
      sourceScope,
      [sourceCommand("source-audit-fails", { description: "FAIL-AUDIT" })]
    );
    expect(result.conflicts[0]?.code).toBe("simulated_audit_failure");
    expect(db.rows.get(financeEntries)).toHaveLength(1);
    expect(db.rows.get(financeEntries)[0].id).toBe("opening-dubai-AED");
    expect(db.rows.get(cashRegisters)).toHaveLength(0);
    expect(db.rows.get(cashMovements)).toHaveLength(0);
    expect(db.rows.get(shipmentCostApprovals)).toHaveLength(0);
    expect(db.rows.get(financeReceipts)).toHaveLength(0);
    expect(db.events).toHaveLength(0);
  });

});
