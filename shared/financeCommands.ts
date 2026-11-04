import type { FinanceCommand } from "./finance";
import type { Invoice } from "./operations";
import type { Shipment } from "./operations";
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
    case "profit_withdrawal":
      return "profit_withdrawal";
    case "settlement":
    case "customer_movement":
      return "payments";
  }
}

export function financeCommandOffice(
  command: FinanceCommand,
  invoices: readonly Invoice[],
  homeOffice: OfficeId | null,
  shipments: readonly Shipment[] = []
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
    case "profit_withdrawal":
      return command.payload.officeId;
    case "shipment_price": {
      const shipment = shipments.find(
        candidate => candidate.id === command.payload.shipmentId
      );
      const source = shipment?.packing?.source as OfficeId | undefined;
      if (!source) return undefined;

      // sourceOfficeId is retained only for reading old drafts. It is never
      // an authority: a legacy value is usable only when it agrees with the
      // source recorded on the selected shipment.
      if (
        command.payload.sourceOfficeId !== undefined &&
        command.payload.sourceOfficeId !== source
      )
        return undefined;

      return command.payload.side === "destination" ? "nouakchott" : source;
    }
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
