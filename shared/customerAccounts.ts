import type { Account, Invoice } from "./operations";
import type { FinanceCurrency, FinanceEntry } from "./finance";
import type { OfficeId } from "./branches";
import { normalizeName } from "./packing";

export function searchableCustomerAccounts(
  accounts: readonly Account[],
  query = ""
): Account[] {
  const needle = normalizeName(query);
  return accounts.filter(
    account =>
      !needle ||
      normalizeName(`${account.name} ${account.phone} ${account.id}`).includes(
        needle
      )
  );
}

export type CustomerInvoiceSummary = {
  id: string;
  amount: number;
  paidAmount: number;
  outstanding: number;
  status: Invoice["status"];
  issuedAt: string;
  currency: FinanceCurrency;
  officeId: OfficeId;
  issuingOfficeId: OfficeId;
  paymentMode: "cash" | "wallet" | "on_account" | "shipping_fee";
  actorName: string;
};
export type CustomerStatementRow = {
  id: string;
  kind:
    | "invoice"
    | "collection"
    | "debt_payment"
    | "customer_credit"
    | "customer_debit";
  date: string;
  recordedAt: string;
  description: string;
  officeId: OfficeId;
  currency: FinanceCurrency;
  debit: number;
  credit: number;
  actorName: string;
  invoiceId?: string;
  paymentLabel?: string;
};
export type CustomerAccountBalance = {
  officeId: OfficeId;
  currency: FinanceCurrency;
  invoiced: number;
  received: number;
  paidOut: number;
  invoiceOutstanding: number;
  balance: number;
  owed: number;
  inFavor: number;
};
function cents(amount: number): number {
  const value = Math.round(amount * 100);
  if (!Number.isSafeInteger(value)) throw new Error("totals_too_large");
  return value;
}
function add(a: number, b: number): number {
  const value = cents(a) + cents(b);
  if (!Number.isSafeInteger(value)) throw new Error("totals_too_large");
  return value / 100;
}

/** Goods are intentionally absent from this account-facing projection. */
export function customerAccountStatement(
  customerId: string,
  invoices: readonly Invoice[],
  entries: readonly FinanceEntry[]
) {
  const invoicesForCustomer: CustomerInvoiceSummary[] = invoices
    .filter(invoice => invoice.finance?.customerId === customerId)
    .map(invoice => {
      const finance = invoice.finance!;
      const outstanding =
        Math.max(0, cents(invoice.amount) - cents(finance.paidAmount)) / 100;
      return {
        id: invoice.id,
        amount: invoice.amount,
        paidAmount: finance.paidAmount,
        outstanding,
        status: invoice.status,
        issuedAt: invoice.issuedAt,
        currency: finance.currency,
        officeId: finance.financialOfficeId,
        issuingOfficeId: finance.issuingOfficeId,
        paymentMode: finance.paymentMode,
        actorName: finance.actorName,
      };
    });
  const rows: CustomerStatementRow[] = invoicesForCustomer.map(invoice => ({
    id: `invoice:${invoice.id}`,
    kind: "invoice",
    date: invoice.issuedAt.slice(0, 10),
    recordedAt: invoice.issuedAt,
    description: invoice.id,
    officeId: invoice.officeId,
    currency: invoice.currency,
    debit: invoice.amount,
    credit: 0,
    actorName: invoice.actorName,
    invoiceId: invoice.id,
  }));
  // customer_debt and invoice_revenue are accounting mirrors, not a second bill.
  for (const entry of entries) {
    if (
      entry.customerId !== customerId ||
      ![
        "collection",
        "debt_payment",
        "customer_credit",
        "customer_debit",
      ].includes(entry.kind)
    )
      continue;
    const debit = entry.kind === "customer_debit";
    rows.push({
      id: entry.id,
      kind: entry.kind as CustomerStatementRow["kind"],
      date: entry.date,
      recordedAt: entry.recordedAt,
      description: entry.description,
      officeId: entry.officeId,
      currency: entry.currency,
      debit: debit ? entry.amount : 0,
      credit: debit ? 0 : entry.amount,
      actorName: entry.actorName,
      ...(entry.invoiceId ? { invoiceId: entry.invoiceId } : {}),
      ...(entry.payment ? { paymentLabel: entry.payment.methodLabel } : {}),
    });
  }
  rows.sort(
    (a, b) =>
      a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id)
  );
  const grouped = new Map<string, CustomerAccountBalance>();
  const balanceFor = (officeId: OfficeId, currency: FinanceCurrency) => {
    const key = `${officeId}:${currency}`;
    let value = grouped.get(key);
    if (!value) {
      value = {
        officeId,
        currency,
        invoiced: 0,
        received: 0,
        paidOut: 0,
        invoiceOutstanding: 0,
        balance: 0,
        owed: 0,
        inFavor: 0,
      };
      grouped.set(key, value);
    }
    return value;
  };
  for (const invoice of invoicesForCustomer) {
    const balance = balanceFor(invoice.officeId, invoice.currency);
    balance.invoiced = add(balance.invoiced, invoice.amount);
    balance.invoiceOutstanding = add(
      balance.invoiceOutstanding,
      invoice.outstanding
    );
  }
  for (const row of rows) {
    const balance = balanceFor(row.officeId, row.currency);
    balance.balance = add(balance.balance, add(row.debit, -row.credit));
    if (row.kind !== "invoice") {
      balance.received = add(balance.received, row.credit);
      balance.paidOut = add(balance.paidOut, row.debit);
    }
  }
  for (const balance of grouped.values()) {
    balance.owed = Math.max(0, balance.balance);
    balance.inFavor = Math.max(0, -balance.balance);
  }
  return {
    invoices: invoicesForCustomer,
    rows,
    balances: [...grouped.values()],
  };
}
