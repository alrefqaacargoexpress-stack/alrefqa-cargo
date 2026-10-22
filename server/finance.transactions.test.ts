import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
vi.mock("./audit", () => ({
  appendAudit: vi.fn(async (tx: any, event: any) => {
    if (event.after?.description === "FAIL-AUDIT")
      throw new Error("simulated_audit_failure");
    tx.events.push(structuredClone(event));
  }),
}));
import { financeSync, applyFinanceCommand } from "./finance";
import {
  records,
  financeEntries,
  financeGoods,
  financeReceipts,
} from "../drizzle/schema";
import type { FinanceCommand } from "@shared/finance";
const now = "2026-10-21T12:00:00.000Z";
const user = {
  id: 7,
  name: "Test accountant",
  openId: "test-actor",
  role: "user" as const,
};
const scope = {
  role: "accountant" as const,
  offices: ["dubai", "nouakchott"] as const,
  homeOffice: "nouakchott" as const,
};
const copiedScope = () => ({ ...scope, offices: [...scope.offices] });
function comparisons(node: any): [string, unknown][] {
  if (!node?.queryChunks) return [];
  const c = node.queryChunks,
    out: [string, unknown][] = [];
  for (let i = 0; i < c.length; i++) {
    if (c[i]?.queryChunks) out.push(...comparisons(c[i]));
    if (typeof c[i]?.name === "string" && c[i + 2] && "value" in c[i + 2])
      out.push([c[i].name, c[i + 2].value]);
  }
  return out;
}
function database() {
  const rows = new Map<unknown, any[]>([
    [records, []],
    [financeEntries, []],
    [financeGoods, []],
    [financeReceipts, []],
  ]);
  const db: any = { rows, events: [] };
  db.select = () => ({
    from: (table: unknown) => {
      let condition: any,
        cap = Infinity;
      const result = () =>
        (rows.get(table) ?? [])
          .filter(r =>
            comparisons(condition).every(([key, value]) => r[key] === value)
          )
          .slice(0, cap)
          .map(r => structuredClone(r));
      const query: any = {
        where: (c: any) => {
          condition = c;
          return query;
        },
        limit: (n: number) => {
          cap = n;
          return query;
        },
        for: () => Promise.resolve(result()),
        then: (resolve: any, reject: any) =>
          Promise.resolve(result()).then(resolve, reject),
      };
      return query;
    },
  });
  db.insert = (table: unknown) => ({
    values: async (value: any) => {
      const list = rows.get(table) ?? [];
      const duplicate = list.some(old =>
        table === records
          ? old.entity === value.entity && old.recordId === value.recordId
          : table === financeGoods
            ? old.shipmentId === value.shipmentId &&
              old.goodsId === value.goodsId
            : table === financeReceipts
              ? old.actorId === value.actorId &&
                old.commandId === value.commandId
              : old.id === value.id
      );
      if (duplicate) throw new Error("duplicate");
      list.push(structuredClone({ id: value.id ?? list.length + 1, ...value }));
      rows.set(table, list);
    },
  });
  db.update = (table: unknown) => ({
    set: (value: any) => ({
      where: async (condition: any) => {
        const list = rows.get(table) ?? [];
        for (const row of list)
          if (comparisons(condition).every(([key, v]) => row[key] === v))
            Object.assign(row, structuredClone(value));
      },
    }),
  });
  db.transaction = async (fn: any) => {
    const backup = new Map(
      [...rows].map(([table, list]) => [table, structuredClone(list)])
    );
    const events = structuredClone(db.events);
    try {
      return await fn(db);
    } catch (e) {
      rows.clear();
      for (const [table, list] of backup) rows.set(table, list);
      db.events = events;
      throw e;
    }
  };
  return db;
}
function seed(db: any) {
  const account = {
    id: "c1",
    name: "Customer One",
    phone: "",
    city: "Test",
    shipments: 0,
    balance: 0,
    updatedAt: now,
    officeId: "dubai",
  };
  const shipment = {
    id: "s1",
    tracking: "TEST",
    account: "شحنة مجمعة",
    route: "Dubai",
    service: "جوي",
    status: "قيد التجهيز",
    eta: "none",
    amount: 0,
    officeId: "dubai",
    packing: {
      source: "dubai",
      pricePerKg: 10,
      pricePerKgMRU: 20,
      createdAt: now,
      updatedAt: now,
      cartons: [
        {
          number: 1,
          closed: false,
          goods: [
            {
              id: "g1",
              name: "Different brand",
              phone: "",
              unitWeight: 1.1,
              pieces: 2,
            },
          ],
        },
      ],
    },
  };
  db.rows.set(records, [
    { id: 1, entity: "account", recordId: "c1", version: 1, data: account },
    { id: 2, entity: "shipment", recordId: "s1", version: 1, data: shipment },
  ]);
}
function invoice(id = "invoice-command"): FinanceCommand {
  return {
    id,
    kind: "invoice",
    createdAt: now,
    payload: {
      invoiceId: `inv-${id}`,
      customerId: "c1",
      issuingOfficeId: "dubai",
      employeeOfficeId: "nouakchott",
      chargeKind: "shipping",
      paymentMode: "on_account",
      currency: "MRU",
      shipmentId: "s1",
      goodsIds: ["g1"],
      adjustment: { direction: "increase", amount: 0.2 },
    },
  };
}
function expense(id: string, description = "Test expense"): FinanceCommand {
  return {
    id,
    kind: "expense",
    createdAt: now,
    payload: {
      expenseId: `exp-${id}`,
      category: "daily_expense",
      officeId: "nouakchott",
      currency: "MRU",
      amount: 1,
      date: "2026-10-21",
      description,
    },
  };
}
describe("Financial command transactions (isolated memory database)", () => {
  it("creates a debt for a real customer in a consolidated shipment and charges the employee office", async () => {
    const db = database();
    seed(db);
    const result = await financeSync(db, user, copiedScope(), [invoice()]);
    expect(result.conflicts).toEqual([]);
    expect(result.applied).toHaveLength(1);
    const bill = result.applied[0].invoice!;
    expect(bill.officeId).toBe("nouakchott");
    expect(bill.finance?.issuingOfficeId).toBe("dubai");
    expect(bill.finance?.actorId).toBe(user.id);
    expect(bill.finance?.goods[0].name).toBe("Different brand");
    expect(bill.status).toBe("دين");
    expect(db.rows.get(financeGoods)).toHaveLength(1);
    expect(db.rows.get(financeEntries)[0].kind).toBe("customer_debt");
  });
  it("does not duplicate a confirmed request and rejects reuse with different payload", async () => {
    const db = database();
    seed(db);
    const command = invoice();
    await financeSync(db, user, copiedScope(), [command]);
    const replay = await financeSync(db, user, copiedScope(), [command]);
    expect(replay.applied).toHaveLength(1);
    expect(db.rows.get(financeEntries)).toHaveLength(1);
    expect(db.rows.get(financeReceipts)).toHaveLength(1);
    if (command.kind === "invoice") command.payload.adjustment.amount = 2;
    const changed = await financeSync(db, user, copiedScope(), [command]);
    expect(changed.conflicts[0].code).toBe("replay_payload_mismatch");
    expect(db.rows.get(financeEntries)).toHaveLength(1);
  });
  it("rejects the same goods in a second invoice without leaving a partial invoice", async () => {
    const db = database();
    seed(db);
    await financeSync(db, user, copiedScope(), [invoice()]);
    const result = await financeSync(db, user, copiedScope(), [
      invoice("second"),
    ]);
    expect(result.conflicts[0].code).toBe("goods_already_billed");
    expect(
      db.rows.get(records).filter((r: any) => r.entity === "invoice")
    ).toHaveLength(1);
    expect(db.rows.get(financeReceipts)).toHaveLength(1);
  });
  it("rolls back an expense if later audit fails, while keeping a previously accepted command", async () => {
    const db = database();
    seed(db);
    const result = await financeSync(db, user, copiedScope(), [
      expense("good"),
      expense("bad", "FAIL-AUDIT"),
    ]);
    expect(result.applied).toHaveLength(1);
    expect(result.conflicts).toHaveLength(1);
    expect(db.rows.get(financeEntries)).toHaveLength(1);
    expect(db.rows.get(financeReceipts)).toHaveLength(1);
    expect(db.events).toHaveLength(1);
  });
  it("does not replay financial data after its office becomes inaccessible", async () => {
    const db = database();
    seed(db);
    const command = invoice();
    await financeSync(db, user, copiedScope(), [command]);
    const result = await financeSync(
      db,
      user,
      { role: "accountant", offices: ["china"], homeOffice: "china" },
      [command]
    );
    expect(result.applied).toHaveLength(0);
    expect(result.conflicts[0].code).toBe("finance_forbidden");
  });
  it("records partial payments with exact cents and preserves the original issuer metadata", async () => {
    const db = database();
    seed(db);
    const c = invoice();
    if (c.kind === "invoice")
      c.payload = {
        ...c.payload,
        chargeKind: "general",
        shipmentId: undefined,
        goodsIds: [],
        manualAmount: 1.1,
        adjustment: { direction: "increase", amount: 0.2 },
      };
    const first = await financeSync(db, user, copiedScope(), [c]);
    const bill = first.applied[0].invoice!;
    const original = structuredClone(bill.finance);
    const pay = (
      id: string,
      amount: number,
      version: number
    ): FinanceCommand => ({
      id,
      kind: "settlement",
      createdAt: now,
      payload: {
        invoiceId: bill.id,
        expectedVersion: version,
        amount,
        description: "Payment recorded",
      },
    });
    await financeSync(
      db,
      { ...user, id: 8, name: "Second accountant" },
      copiedScope(),
      [pay("p1", 0.1, 1)]
    );
    const second = await financeSync(
      db,
      { ...user, id: 8, name: "Second accountant" },
      copiedScope(),
      [pay("p2", 0.2, 2)]
    );
    const updated = second.applied[0].invoice!;
    expect(updated.finance?.paidAmount).toBe(0.3);
    expect(updated.finance?.actorId).toBe(original?.actorId);
    expect(updated.finance?.recordedAt).toBe(original?.recordedAt);
    const over = await financeSync(db, user, copiedScope(), [
      pay("over", 2, 3),
    ]);
    expect(over.conflicts[0].code).toBe("overpayment");
  });
  it("rejects a customer outside the financial office permissions", async () => {
    const db = database();
    seed(db);
    db.rows.get(records)[0].data.officeId = "china";
    const result = await financeSync(db, user, copiedScope(), [invoice()]);
    expect(result.applied).toHaveLength(0);
    expect(result.conflicts[0].code).toBe("finance_forbidden");
    expect(db.rows.get(financeEntries)).toHaveLength(0);
  });
});

it("bills an incoming shipment in MRU in Nouakchott without access to source AED accounting", async () => {
  const db = database();
  seed(db);
  db.rows.get(records)[0].data.officeId = "nouakchott";
  db.rows.get(records)[1].data.journey = {
    branch: "nouakchott",
    stage: "to_nouakchott",
  };
  const c = invoice();
  if (c.kind === "invoice") c.payload.issuingOfficeId = "nouakchott";
  const only = {
    role: "accountant" as const,
    offices: ["nouakchott" as const],
    homeOffice: "nouakchott" as const,
  };
  const result = await financeSync(db, user, only, [c]);
  expect(result.applied).toHaveLength(1);
  expect(result.applied[0].invoice?.finance?.currency).toBe("MRU");
  const foreign = invoice("foreign");
  if (foreign.kind === "invoice") {
    foreign.payload.currency = "AED";
    foreign.payload.issuingOfficeId = "nouakchott";
  }
  expect((await financeSync(db, user, only, [foreign])).conflicts[0].code).toBe(
    "finance_forbidden"
  );
});
