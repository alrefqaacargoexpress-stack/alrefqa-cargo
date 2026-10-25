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
  cashMovements,
  walletMovements,
  officePaymentSettings,
  shipmentPriceOverrides,
} from "../drizzle/schema";
import type { FinanceCommand } from "../shared/finance";
import { blankPermissions } from "../shared/permissions";
import { defaultOfficeSettings } from "../shared/office";
const now = "2026-10-21T12:00:00.000Z";
const user = {
  id: 7,
  name: "Test accountant",
  openId: "test-actor",
  role: "user" as const,
};
const scope = {
  role: "accountant" as const,
  offices: ["nouakchott"] as const,
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
    [shipmentPriceOverrides, []],
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
              : table === shipmentPriceOverrides
                ? old.id === value.id ||
                  (old.shipmentId === value.shipmentId &&
                    old.side === value.side &&
                    old.revision === value.revision)
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
    officeId: "nouakchott",
  };
  const shipment = {
    id: "s1",
    tracking: "TEST",
    account: "شحنة مجمعة",
    route: "Dubai",
    service: "جوي",
    status: "وصلت للمكتب",
    journey: {
      stage: "arrived_office",
      branch: "nouakchott",
      startedAt: now,
      updatedAt: now,
      expectedDays: 9,
      notes: [],
    },
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
      issuingOfficeId: "nouakchott",
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
    expect(bill.finance?.issuingOfficeId).toBe("nouakchott");
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

function movement(
  id: string,
  overrides: Partial<
    Extract<FinanceCommand, { kind: "customer_movement" }>["payload"]
  > = {}
): FinanceCommand {
  return {
    id: `command-${id}`,
    kind: "customer_movement",
    createdAt: now,
    payload: {
      movementId: id,
      customerId: "c1",
      officeId: "nouakchott",
      direction: "credit",
      amount: 12.5,
      currency: "MRU",
      date: "2026-10-20",
      description: "Customer cash movement",
      paymentMode: "cash",
      ...overrides,
    },
  };
}

describe("independent customer movements (isolated memory database)", () => {
  it("writes the customer ledger and one actual cash movement, without a fictional invoice", async () => {
    const db = database();
    seed(db);
    const result = await financeSync(db, user, copiedScope(), [
      movement("move-1"),
    ]);
    expect(result.conflicts).toEqual([]);
    const row = db.rows.get(financeEntries)[0].data;
    expect(row).toMatchObject({
      id: "move-1",
      kind: "customer_credit",
      officeId: "nouakchott",
      customerId: "c1",
      amount: 12.5,
      date: "2026-10-20",
      actorId: user.id,
    });
    expect(row.recordedAt).not.toBe("2026-10-20T00:00:00.000Z");
    expect(
      db.rows.get(records).filter((r: any) => r.entity === "invoice")
    ).toHaveLength(0);
    expect(db.events).toHaveLength(1);
    expect(db.rows.get(cashMovements)).toHaveLength(1);
    expect(db.rows.get(cashMovements)[0]).toMatchObject({
      officeId: "nouakchott",
      kind: "receipt",
      amount: "12.50",
    });
    expect(db.rows.get(walletMovements) ?? []).toHaveLength(0);
  });

  it("maps a customer payout to customer_debit, keeps wallet metadata canonical, and replays safely", async () => {
    const db = database();
    seed(db);
    const command = movement("move-wallet", {
      direction: "debit",
      paymentMode: "wallet",
      payment: {
        office: "nouakchott",
        methodId: "bankily",
        methodLabel: "forged label",
        reference: "ref-1",
      },
    });
    const first = await financeSync(db, user, copiedScope(), [command]);
    expect(first.conflicts).toEqual([]);
    expect(db.rows.get(financeEntries)[0].data).toMatchObject({
      id: "move-wallet",
      kind: "customer_debit",
      payment: { methodId: "bankily", methodLabel: "Bankily" },
      cashEffect: "none",
    });
    expect(db.rows.get(walletMovements)).toHaveLength(1);
    expect(db.rows.get(walletMovements)[0]).toMatchObject({
      officeId: "nouakchott",
      kind: "refund",
      invoiceId: null,
    });
    expect(db.rows.get(cashMovements) ?? []).toHaveLength(0);
    expect(
      (await financeSync(db, user, copiedScope(), [command])).applied
    ).toHaveLength(1);
    expect(db.rows.get(financeEntries)).toHaveLength(1);
    expect(db.events).toHaveLength(1);
    const otherCommand = movement("move-wallet-2");
    if (otherCommand.kind === "customer_movement")
      otherCommand.payload.movementId = "move-wallet";
    const duplicate = await financeSync(db, user, copiedScope(), [
      otherCommand,
    ]);
    expect(duplicate.conflicts[0].code).toBe("movement_exists");
    expect(db.rows.get(financeEntries)).toHaveLength(1);
    expect(db.rows.get(financeReceipts)).toHaveLength(1);
    expect(db.events).toHaveLength(1);
    expect(db.rows.get(walletMovements)).toHaveLength(1);
  });

  it("rejects an inaccessible office, customer, or wallet atomically without an entry, receipt, or audit", async () => {
    const cases = [
      {
        command: movement("bad-office", { officeId: "dubai" }),
        code: "financial_office_mismatch",
      },
      {
        command: movement("bad-customer", { customerId: "missing" }),
        code: "customer_not_found",
      },
      {
        command: movement("bad-wallet", {
          paymentMode: "wallet",
          payment: {
            office: "nouakchott",
            methodId: "not-configured",
            methodLabel: "not trusted",
          },
        }),
        code: "payment_method_unknown",
      },
    ];
    for (const { command, code } of cases) {
      const db = database();
      seed(db);
      const result = await financeSync(db, user, copiedScope(), [command]);
      expect(result.conflicts[0].code).toBe(code);
      expect(db.rows.get(financeEntries)).toHaveLength(0);
      expect(db.rows.get(financeReceipts)).toHaveLength(0);
      expect(db.events).toHaveLength(0);
    }
    const outside = database();
    seed(outside);
    outside.rows.get(records)[0].data.officeId = "china";
    const denied = await financeSync(outside, user, copiedScope(), [
      movement("outside-customer"),
    ]);
    expect(denied.conflicts[0].code).toBe("finance_forbidden");
    expect(outside.rows.get(financeEntries)).toHaveLength(0);
    expect(outside.rows.get(financeReceipts)).toHaveLength(0);
    expect(outside.events).toHaveLength(0);
  });
});

it("rejects shipping_fee for a new invoice before writing financial facts", async () => {
  const db = database();
  const command = invoice("legacy-method");
  if (command.kind === "invoice") command.payload.paymentMode = "shipping_fee";
  const result = await financeSync(db, user, copiedScope(), [command]);
  expect(result.applied).toHaveLength(0);
  expect(result.conflicts).toHaveLength(1);
  expect(db.rows.get(financeEntries)).toHaveLength(0);
  expect(db.rows.get(financeReceipts)).toHaveLength(0);
  expect(db.events).toHaveLength(0);
});

it("posts an opening balance once, replays the receipt, and rolls back audit failure", async () => {
  const db = database();
  seed(db);
  const command: FinanceCommand = {
    id: "opening-command",
    kind: "opening_balance",
    createdAt: now,
    payload: {
      openingId: "opening-one",
      officeId: "nouakchott",
      currency: "MRU",
      direction: "credit",
      date: "2026-10-22",
      amount: 100,
      note: "Opening cash",
    },
  };
  const first = await financeSync(
    db,
    user,
    { role: "accountant", offices: ["nouakchott"], homeOffice: "nouakchott" },
    [command]
  );
  expect(first.conflicts).toEqual([]);
  expect(db.rows.get(financeEntries)).toHaveLength(1);
  expect(db.rows.get(financeReceipts)).toHaveLength(1);
  expect(
    (
      await financeSync(
        db,
        user,
        {
          role: "accountant",
          offices: ["nouakchott"],
          homeOffice: "nouakchott",
        },
        [command]
      )
    ).applied
  ).toHaveLength(1);
  expect(db.rows.get(financeEntries)).toHaveLength(1);

  const failureDb = database();
  seed(failureDb);
  const failed = { ...structuredClone(command), id: "opening-fails" };
  if (failed.kind === "opening_balance") failed.payload.note = "FAIL-AUDIT";
  const rollback = await financeSync(
    failureDb,
    user,
    { role: "accountant", offices: ["nouakchott"], homeOffice: "nouakchott" },
    [failed]
  );
  expect(rollback.conflicts[0].code).toBe("simulated_audit_failure");
  expect(failureDb.rows.get(financeEntries)).toHaveLength(0);
  expect(failureDb.rows.get(financeReceipts)).toHaveLength(0);
  expect(db.rows.get(financeEntries)).toHaveLength(1);
  expect(db.rows.get(financeReceipts)).toHaveLength(1);
});

it("blocks legacy zero shipment prices, then requires an explicit positive override", async () => {
  const db = database();
  seed(db);
  db.rows.get(records)[1].data.status = "قيد التجهيز";
  db.rows.get(records)[1].data.journey.stage = "preparing";
  const legacy: FinanceCommand = {
    id: "price-command",
    kind: "shipment_price",
    createdAt: now,
    payload: {
      shipmentId: "s1",
      sourceOfficeId: "dubai",
      pricePerKg: 0,
      expectedVersion: 1,
    },
  };
  const original = structuredClone(db.rows.get(records)[1].data.packing);
  const blockedLegacy = await financeSync(
    db,
    user,
    { role: "accountant", offices: ["dubai"], homeOffice: "dubai" },
    [legacy]
  );
  expect(blockedLegacy.conflicts[0].code).toBe(
    "shipment_price_override_fields_required"
  );
  expect(db.rows.get(records)[1].data.packing).toEqual(original);

  const zeroOverride: FinanceCommand = {
    ...legacy,
    id: "price-zero-explicit",
    payload: {
      shipmentId: "s1",
      side: "source",
      pricePerKg: 0,
      reason: "reviewed zero is invalid",
      expectedPricingRevision: 0,
      expectedVersion: 1,
    },
  };
  const blockedZero = await financeSync(
    db,
    user,
    { role: "accountant", offices: ["dubai"], homeOffice: "dubai" },
    [zeroOverride]
  );
  expect(blockedZero.conflicts[0].code).toBe("invalid_rate");
  expect(db.rows.get(records)[1].data.packing).toEqual(original);

  const foreignCommand = {
    ...legacy,
    id: "price-foreign",
    payload: {
      shipmentId: "s1",
      side: "source" as const,
      pricePerKg: 11,
      reason: "reviewed source correction",
      expectedPricingRevision: 0,
      expectedVersion: 1,
    },
  } satisfies FinanceCommand;
  const foreignResult = await financeSync(
    db,
    user,
    { role: "accountant", offices: ["nouakchott"], homeOffice: "nouakchott" },
    [foreignCommand]
  );
  expect(foreignResult.conflicts[0].code).toBe(
    "shipment_price_office_forbidden"
  );
});

it("applies an explicit shipment price through financeSync and replays its receipt safely", async () => {
  const db = database();
  seed(db);
  db.rows.get(records)[1].data.status = "قيد التجهيز";
  db.rows.get(records)[1].data.journey.stage = "preparing";
  const command: FinanceCommand = {
    id: "price-sync-source",
    kind: "shipment_price",
    createdAt: now,
    payload: {
      shipmentId: "s1",
      side: "source",
      pricePerKg: 40,
      reason: "approved source correction",
      expectedPricingRevision: 0,
      expectedVersion: 1,
    },
  };
  const originalPacking = structuredClone(db.rows.get(records)[1].data.packing);
  const sourceScope = {
    role: "accountant" as const,
    offices: ["dubai" as const],
    homeOffice: "dubai" as const,
  };
  const first = await financeSync(db, user, sourceScope, [command]);
  expect(first.conflicts).toEqual([]);
  expect(first.applied[0]?.priceProjection).toMatchObject({
    side: "source",
    officeId: "dubai",
    pricePerKg: 40,
    expectedPricingRevision: 1,
  });
  expect(db.rows.get(records)[1].data.packing).toEqual(originalPacking);
  expect(db.rows.get(records)[1].version).toBe(1);
  expect(db.rows.get(shipmentPriceOverrides)).toHaveLength(1);
  expect(db.rows.get(financeReceipts)).toHaveLength(1);

  const replay = await financeSync(db, user, sourceScope, [command]);
  expect(replay.conflicts).toEqual([]);
  expect(replay.applied[0]?.priceProjection).toMatchObject({
    side: "source",
    pricePerKg: 40,
  });
  expect(db.rows.get(shipmentPriceOverrides)).toHaveLength(1);
  expect(db.rows.get(financeReceipts)).toHaveLength(1);
});

it("rejects all financial commands and replay for managers or accountants without one office", async () => {
  for (const invalid of [
    {
      role: "office_manager",
      offices: ["nouakchott"],
      homeOffice: "nouakchott",
    },
    {
      role: "accountant",
      offices: ["nouakchott", "dubai"],
      homeOffice: "nouakchott",
    },
    { role: "accountant", offices: null, homeOffice: null },
  ]) {
    const db = database();
    seed(db);
    const result = await financeSync(db, user, invalid as any, [
      invoice(),
      expense("denied"),
      movement("denied"),
    ]);
    expect(result.applied).toEqual([]);
    expect(
      result.conflicts.every(conflict => conflict.code === "finance_forbidden")
    ).toBe(true);
    expect(db.rows.get(financeEntries)).toEqual([]);
    expect(db.rows.get(financeReceipts)).toEqual([]);
    expect(db.events).toEqual([]);
  }
});

it("allows a delegated manager to invoice only when invoices are manage and keeps the real role in audit", async () => {
  const permissions = blankPermissions();
  permissions.customers = "view";
  permissions.invoices = "manage";
  const managerScope = {
    role: "office_manager" as const,
    offices: ["nouakchott" as const],
    homeOffice: "nouakchott" as const,
    permissions,
  };
  const db = database();
  seed(db);
  const command = invoice("delegated-manager-invoice");
  if (command.kind !== "invoice") throw new Error("invalid fixture");
  command.payload.chargeKind = "general";
  command.payload.manualAmount = 10;
  delete command.payload.shipmentId;
  command.payload.goodsIds = [];
  const applied = await financeSync(db, user, managerScope, [command]);
  expect(applied.conflicts).toEqual([]);
  expect(applied.applied[0]?.invoice?.finance?.actorId).toBe(user.id);
  expect(db.events[0]?.actor.role).toBe("office_manager");

  const viewOnly = blankPermissions();
  viewOnly.customers = "view";
  viewOnly.invoices = "view";
  const blockedDb = database();
  seed(blockedDb);
  const blocked = await financeSync(
    blockedDb,
    user,
    { ...managerScope, permissions: viewOnly },
    [{ ...command, id: "delegated-manager-view-only" }]
  );
  expect(blocked.applied).toEqual([]);
  expect(blocked.conflicts[0]?.code).toBe("finance_forbidden");
});

it("rejects a delegated manager command that escapes its office scope", async () => {
  const permissions = blankPermissions();
  permissions.customers = "view";
  permissions.invoices = "manage";
  const db = database();
  seed(db);
  const command = invoice("delegated-manager-office-escape");
  if (command.kind !== "invoice") throw new Error("invalid fixture");
  command.payload.employeeOfficeId = "dubai";
  command.payload.issuingOfficeId = "dubai";
  const result = await financeSync(
    db,
    user,
    {
      role: "office_manager",
      offices: ["nouakchott"],
      homeOffice: "nouakchott",
      permissions,
    },
    [command]
  );
  expect(result.applied).toEqual([]);
  expect(result.conflicts[0]?.code).toBe("financial_office_mismatch");
  expect(db.rows.get(financeReceipts)).toEqual([]);
});

it("rejects shipment price overrides after a shipment leaves preparing without mutation", async () => {
  const db = database();
  seed(db);
  const stored = db.rows.get(records)[1].data;
  stored.packing.pricePerKg = 0;
  stored.packing.pricePerKgMRU = 0;
  stored.amount = 0;
  stored.packing.cartons[0].closed = true;
  stored.status = "جاهزة للتسليم";
  const command: FinanceCommand = {
    id: "price-initial-sent",
    kind: "shipment_price",
    createdAt: now,
    payload: {
      shipmentId: "s1",
      pricePerKg: 10,
      side: "source",
      reason: "approved source correction",
      expectedPricingRevision: 0,
      expectedVersion: 1,
    },
  };
  const sourceScope = {
    role: "accountant" as const,
    offices: ["dubai" as const],
    homeOffice: "dubai" as const,
  };
  const originalPacking = structuredClone(stored.packing);
  const blocked = await financeSync(db, user, sourceScope, [command]);
  expect(blocked.conflicts[0].code).toBe("shipment_price_not_preparing");
  expect(stored.packing).toEqual(originalPacking);
  expect(db.rows.get(records)[1].version).toBe(1);
  expect(db.rows.get(shipmentPriceOverrides)).toHaveLength(0);
  expect(db.rows.get(financeReceipts)).toHaveLength(0);
});

it("posts a source customer wallet receipt to the source office without cash or a fictional invoice", async () => {
  const db = database();
  seed(db);
  db.rows.get(records)[0].data.officeId = "dubai";
  db.rows.set(officePaymentSettings, [
    { officeId: "dubai", version: 1, methods: defaultOfficeSettings().methods },
  ]);
  const cmd = movement("dubai-wallet", {
    officeId: "dubai",
    currency: "AED",
    paymentMode: "wallet",
    payment: {
      office: "dubai",
      methodId: "bankily",
      methodLabel: "Untrusted",
      reference: "receipt-source",
    },
  });
  const actorScope = {
    role: "accountant" as const,
    offices: ["dubai" as const],
    homeOffice: "dubai" as const,
  };
  const result = await financeSync(db, user, actorScope, [cmd]);
  expect(result.conflicts).toEqual([]);
  expect(db.rows.get(financeEntries)[0].data).toMatchObject({
    officeId: "dubai",
    currency: "AED",
    cashEffect: "none",
    payment: { office: "dubai", methodLabel: "Bankily" },
  });
  expect(db.rows.get(walletMovements)[0]).toMatchObject({
    officeId: "dubai",
    currency: "AED",
    kind: "receipt",
    invoiceId: null,
  });
  expect(db.rows.get(cashMovements) ?? []).toHaveLength(0);
  expect(
    db.rows.get(records).filter((row: any) => row.entity === "invoice")
  ).toHaveLength(0);
  await financeSync(db, user, actorScope, [cmd]);
  expect(db.rows.get(walletMovements)).toHaveLength(1);
});

it("rolls back a customer cash receipt together with ledger and audit failure", async () => {
  const db = database();
  seed(db);
  const result = await financeSync(db, user, copiedScope(), [
    movement("customer-audit-fails", { description: "FAIL-AUDIT" }),
  ]);
  expect(result.applied).toEqual([]);
  expect(db.rows.get(financeEntries)).toHaveLength(0);
  expect(db.rows.get(cashMovements) ?? []).toHaveLength(0);
  expect(db.rows.get(financeReceipts)).toHaveLength(0);
});
