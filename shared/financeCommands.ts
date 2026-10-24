import type { FinanceCommand } from "./finance";
import type { Invoice } from "./operations";
import type { OfficeId } from "./branches";
import type { PermissionKey } from "./permissions";

export function financeCommandPermissionKey(
  command: FinanceCommand
): PermissionKey {
  switch (command.kind) {
    case "invoice":
      return "invoices";
    case "expense":
      return command.payload.category === "shipment_cost"
        ? "shipment_cost"
        : "expenses";
    case "opening_balance":
      return "opening_balance";
    case "shipment_price":
      return "shipment_prices";
    case "settlement":
    case "customer_movement":
      return "payments";
  }
}

export function financeCommandOffice(
  command: FinanceCommand,
  invoices: readonly Invoice[],
  homeOffice: OfficeId | null
): OfficeId | undefined {
  switch (command.kind) {
    case "invoice":
      return (
        command.payload.employeeOfficeId ??
        homeOffice ??
        command.payload.issuingOfficeId
      );
    case "expense":
    case "customer_movement":
    case "opening_balance":
      return command.payload.officeId;
    case "shipment_price":
      return command.payload.sourceOfficeId;
    case "settlement":
      return invoices.find(invoice => invoice.id === command.payload.invoiceId)
        ?.officeId;
  }
}

/** Restricts a posting action to the reviewed operation, leaving other drafts untouched. */
export function selectedFinanceCommands(
  commands: readonly FinanceCommand[],
  selectedIds?: readonly string[]
): FinanceCommand[] {
  if (selectedIds === undefined) return [...commands];
  const chosen = new Set(selectedIds);
  return commands.filter(command => chosen.has(command.id));
}
