import { describe, expect, it } from "vitest";
import type { FinanceCommand } from "../../../shared/finance";
import type { PendingChange, SyncResult } from "../../../shared/operations";
import {
  partitionFinanceCommands,
  pendingOperationsForFinance,
} from "./financeSyncDependencies";

const now = "2026-10-25T00:00:00.000Z";

function movement(
  id: string,
  customerId: string,
  officeId: "dubai" | "turkey" | "china"
): FinanceCommand {
  return {
    id,
    createdAt: now,
    kind: "customer_movement",
    payload: {
      movementId: `movement-${id}`,
      customerId,
      officeId,
      direction: "credit",
      amount: 10,
      currency:
        officeId === "dubai" ? "AED" : officeId === "turkey" ? "TRY" : "CNY",
      date: "2026-10-25",
      description: "pending dependency",
      paymentMode: "cash",
    },
  };
}

function invoice(
  id: string,
  customerId: string,
  shipmentId?: string
): FinanceCommand {
  return {
    id,
    createdAt: now,
    kind: "invoice",
    payload: {
      invoiceId: `invoice-${id}`,
      customerId,
      issuingOfficeId: "dubai",
      chargeKind: shipmentId ? "shipping" : "general",
      paymentMode: "cash",
      currency: "AED",
      ...(shipmentId
        ? { shipmentId, goodsIds: ["goods-1"] }
        : { goodsIds: [], manualAmount: 10 }),
      adjustment: { direction: "increase", amount: 0 },
    },
  };
}

function pending(
  id: string,
  entity: PendingChange["entity"],
  recordId: string
): PendingChange {
  return {
    id,
    entity,
    recordId,
    expectedVersion: null,
    data: {} as PendingChange["data"],
    label: id,
    createdAt: now,
  };
}

function accepted(changeId: string): SyncResult {
  return {
    applied: [
      {
        changeId,
        entity: "account",
        record: {} as never,
      },
    ],
    conflicts: [],
  };
}

describe("finance sync dependency partitioning", () => {
  it("defers account-linked movements consistently for Dubai, Turkey, and China", () => {
    for (const [index, office] of (
      ["dubai", "turkey", "china"] as const
    ).entries()) {
      const op = pending(
        `account-op-${office}`,
        "account",
        `customer-${index}`
      );
      const result = partitionFinanceCommands(
        [movement(`movement-${office}`, `customer-${index}`, office)],
        { queue: [op] }
      );
      expect(result.ready).toHaveLength(0);
      expect(result.deferred[0]?.id).toBe(`movement-${office}`);
      expect(result.pendingAccountIds).toContain(`customer-${index}`);
    }
  });

  it("allows an account-dependent invoice in the same pass after account acceptance", () => {
    const op = pending("account-op", "account", "customer-1");
    const command = invoice("invoice-command", "customer-1");
    const result = partitionFinanceCommands(
      [command],
      { queue: [op] },
      accepted(op.id)
    );
    expect([
      ...pendingOperationsForFinance({ queue: [op] }, accepted(op.id)),
    ]).toHaveLength(0);
    expect(result.ready.map(item => item.id)).toEqual([command.id]);
    expect(result.deferred).toHaveLength(0);
  });

  it("defers rather than conflicts when the account is rejected, and retains an in-flight addition", () => {
    const rejected = pending("account-rejected", "account", "customer-1");
    const addition = pending("account-addition", "account", "customer-1");
    const result = partitionFinanceCommands(
      [invoice("invoice-command", "customer-1")],
      { queue: [rejected, addition] },
      {
        applied: [],
        conflicts: [
          { changeId: rejected.id, reason: "FORBIDDEN", current: null },
        ],
      }
    );
    expect(result.deferred.map(item => item.id)).toEqual(["invoice-command"]);
    expect(result.pendingOperationIds).toEqual(
      new Set(["account-rejected", "account-addition"])
    );
  });

  it("lets unrelated customers proceed while retaining the dependent command", () => {
    const accountOp = pending("account-op", "account", "customer-1");
    const dependent = invoice("dependent", "customer-1");
    const unrelated = invoice("unrelated", "customer-2");
    const result = partitionFinanceCommands([dependent, unrelated], {
      queue: [accountOp],
    });
    expect(result.deferred.map(item => item.id)).toEqual(["dependent"]);
    expect(result.ready.map(item => item.id)).toEqual(["unrelated"]);
  });

  it("defers shipment-linked invoices but keeps unrelated financial commands eligible", () => {
    const shipmentOp = pending("shipment-op", "shipment", "shipment-1");
    const dependent = invoice("shipment-invoice", "customer-1", "shipment-1");
    const unrelated = invoice("general-invoice", "customer-2");
    const result = partitionFinanceCommands([dependent, unrelated], {
      queue: [shipmentOp],
    });
    expect(result.deferred.map(item => item.id)).toEqual(["shipment-invoice"]);
    expect(result.ready.map(item => item.id)).toEqual(["general-invoice"]);
  });

  it("defers a settlement behind a legacy invoice operation and resumes after acceptance", () => {
    const operation = pending("legacy-invoice-op", "invoice", "invoice-legacy");
    const settlement: FinanceCommand = {
      id: "settlement-stable",
      kind: "settlement",
      createdAt: now,
      payload: {
        invoiceId: "invoice-legacy",
        expectedVersion: 1,
        amount: 10,
        description: "تسوية بعد قبول الفاتورة",
        payment: { office: "dubai", methodId: "cash", methodLabel: "نقدي" },
      },
    };
    const before = partitionFinanceCommands([settlement], {
      queue: [operation],
    });
    expect(before.deferred.map(item => item.id)).toEqual([settlement.id]);
    expect(before.ready).toEqual([]);
    const after = partitionFinanceCommands(
      [settlement],
      { queue: [operation] },
      {
        applied: [
          { changeId: operation.id, entity: "invoice", record: {} as never },
        ],
        conflicts: [],
      }
    );
    expect(after.ready.map(item => item.id)).toEqual([settlement.id]);
    expect(after.deferred).toEqual([]);
    expect(operation.id).toBe("legacy-invoice-op");
  });
});
