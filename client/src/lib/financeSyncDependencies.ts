import type { FinanceCommand } from "@shared/finance";
import type { PendingChange, SyncResult } from "@shared/operations";
import type { Workspace } from "./offlineStore";

export type FinanceDependencyPartition = {
  ready: FinanceCommand[];
  deferred: FinanceCommand[];
  pendingOperationIds: Set<string>;
  pendingAccountIds: Set<string>;
  pendingShipmentIds: Set<string>;
  pendingInvoiceIds: Set<string>;
};

type OperationQueue =
  | Pick<Workspace, "queue">
  | readonly Pick<PendingChange, "id" | "entity" | "recordId">[]
  | null
  | undefined;

function queueOf(operations: OperationQueue): readonly PendingChange[] {
  if (!operations) return [];
  return Array.isArray(operations)
    ? (operations as readonly PendingChange[])
    : (operations as Pick<Workspace, "queue">).queue;
}

/**
 * Returns the operation queue that finance must wait for. An accepted operation
 * ID is removed for this pass; conflicts and any newer in-flight operation stay
 * pending, so a dependent command is deferred rather than converted to a fake
 * finance conflict.
 */
export function pendingOperationsForFinance(
  operations: OperationQueue,
  operationResult?: SyncResult | null
): readonly PendingChange[] {
  const accepted = new Set(
    (operationResult?.applied ?? []).map(change => change.changeId)
  );
  return queueOf(operations).filter(change => !accepted.has(change.id));
}

function commandDependencies(command: FinanceCommand) {
  const payload = command.payload as {
    customerId?: string;
    shipmentId?: string;
    invoiceId?: string;
  };
  const shipment =
    command.kind === "invoice" ||
    command.kind === "expense" ||
    command.kind === "shipment_price"
      ? payload.shipmentId
      : undefined;
  const account =
    command.kind === "invoice" || command.kind === "customer_movement"
      ? payload.customerId
      : undefined;
  const invoice = command.kind === "settlement" ? payload.invoiceId : undefined;
  return { account, shipment, invoice };
}

/**
 * Partition a reviewed finance batch without changing command IDs or order.
 * Account/customer and shipment/invoice relationships are dependency edges;
 * they are not finance conflicts when the operation side is still pending.
 */
export function partitionFinanceCommands(
  commands: readonly FinanceCommand[],
  operations: OperationQueue,
  operationResult?: SyncResult | null
): FinanceDependencyPartition {
  const pendingOperations = pendingOperationsForFinance(
    operations,
    operationResult
  );
  const pendingOperationIds = new Set(
    pendingOperations.map(change => change.id)
  );
  const pendingAccountIds = new Set(
    pendingOperations
      .filter(change => change.entity === "account")
      .map(change => change.recordId)
  );
  const pendingShipmentIds = new Set(
    pendingOperations
      .filter(change => change.entity === "shipment")
      .map(change => change.recordId)
  );
  const pendingInvoiceIds = new Set([
    ...pendingOperations
      .filter(change => change.entity === "invoice")
      .map(change => change.recordId),
    ...commands
      .filter(command => command.kind === "invoice")
      .map(command => command.payload.invoiceId),
  ]);
  const ready: FinanceCommand[] = [];
  const deferred: FinanceCommand[] = [];
  for (const command of commands) {
    const dependency = commandDependencies(command);
    const blocked = Boolean(
      (dependency.account && pendingAccountIds.has(dependency.account)) ||
        (dependency.shipment && pendingShipmentIds.has(dependency.shipment)) ||
        (dependency.invoice && pendingInvoiceIds.has(dependency.invoice))
    );
    (blocked ? deferred : ready).push(command);
  }
  return {
    ready,
    deferred,
    pendingOperationIds,
    pendingAccountIds,
    pendingShipmentIds,
    pendingInvoiceIds,
  };
}

export const partitionFinanceCommandsByDependencies = partitionFinanceCommands;
