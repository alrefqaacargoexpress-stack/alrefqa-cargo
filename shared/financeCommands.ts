import type { FinanceCommand } from "./finance";
import type { Invoice } from "./operations";
import type { OfficeId } from "./branches";

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
