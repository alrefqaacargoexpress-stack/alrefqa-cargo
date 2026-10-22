import { Link } from "wouter";
import type {
  CustomerAccountBalance,
  CustomerInvoiceSummary,
  CustomerStatementRow,
} from "@shared/customerAccounts";
import { officeNames, type OfficeId } from "@shared/branches";
import type { FinanceCurrency } from "@shared/finance";
import { useLanguage } from "@/contexts/LanguageContext";
import { customerAccountCopyFor } from "@/lib/customerAccountCopy";

type Props = {
  invoices: CustomerInvoiceSummary[];
  rows: CustomerStatementRow[];
  balances: CustomerAccountBalance[];
  previousBalance: number;
};
const money = (value: number, currency: FinanceCurrency) =>
  `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)} ${currency}`;
export default function CustomerStatement({
  invoices,
  rows,
  balances,
  previousBalance,
}: Props) {
  const { language, dir } = useLanguage();
  const c = customerAccountCopyFor(language);
  const office = (id: OfficeId) => officeNames[language][id];
  return (
    <div dir={dir} className="space-y-5">
      {previousBalance !== 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="font-black text-amber-950">
            {c.previousBalance}:{" "}
            {new Intl.NumberFormat(undefined, {
              maximumFractionDigits: 2,
            }).format(previousBalance)}
          </p>
          <p className="mt-1 text-xs text-amber-900">{c.previousBalanceHint}</p>
        </section>
      )}
      <section className="rounded-2xl border border-[#dce4e7] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-[#092d50]">{c.statement}</h2>
        {balances.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {balances.map(balance => (
              <article
                key={`${balance.officeId}-${balance.currency}`}
                className="rounded-xl bg-[#f5f9fa] p-4"
              >
                <p className="text-xs text-[#718088]">
                  {office(balance.officeId)} · {balance.currency}
                </p>
                <p className="mt-2 text-xl font-black text-[#092d50]">
                  {money(balance.balance, balance.currency)}
                </p>
                <p className="mt-1 text-xs text-[#718088]">
                  {balance.inFavor
                    ? `${c.inFavor}: ${money(balance.inFavor, balance.currency)}`
                    : `${c.owed}: ${money(balance.owed, balance.currency)}`}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-[#718088]">{c.noMovements}</p>
        )}
      </section>
      <section className="rounded-2xl border border-[#dce4e7] bg-white shadow-sm">
        <div className="border-b border-[#edf1f1] p-5">
          <h2 className="text-lg font-black text-[#092d50]">{c.invoices}</h2>
        </div>
        {invoices.length ? (
          <div className="divide-y divide-[#edf1f1]">
            {invoices.map(invoice => (
              <Link
                key={invoice.id}
                href={`/operations/billing?invoice=${encodeURIComponent(invoice.id)}`}
                className="flex flex-wrap items-center gap-3 px-5 py-4 hover:bg-[#f5f9fa]"
              >
                <span className="min-w-0 flex-1">
                  <strong className="block text-[#092d50]">{invoice.id}</strong>
                  <span className="text-xs text-[#718088]">
                    {invoice.issuedAt} · {invoice.status}
                  </span>
                </span>
                <span className="text-end font-bold text-[#092d50]">
                  {money(invoice.amount, invoice.currency)}
                  <small className="mt-1 block text-xs font-normal text-[#718088]">
                    {invoice.outstanding
                      ? `${c.owed}: ${money(invoice.outstanding, invoice.currency)}`
                      : invoice.paymentMode}
                  </small>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="p-8 text-sm text-[#718088]">{c.noInvoices}</p>
        )}
      </section>
      <section className="overflow-hidden rounded-2xl border border-[#dce4e7] bg-white shadow-sm">
        <div className="border-b border-[#edf1f1] p-5">
          <h2 className="text-lg font-black text-[#092d50]">{c.movements}</h2>
        </div>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[#f5f9fa] text-start text-xs text-[#718088]">
                <tr>
                  <th className="px-4 py-3 text-start">{c.date}</th>
                  <th className="px-4 py-3 text-start">
                    {c.descriptionColumn}
                  </th>
                  <th className="px-4 py-3 text-start">{c.officeColumn}</th>
                  <th className="px-4 py-3 text-end">{c.debit}</th>
                  <th className="px-4 py-3 text-end">{c.credit}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className="border-t border-[#edf1f1]">
                    <td className="whitespace-nowrap px-4 py-3">{row.date}</td>
                    <td className="px-4 py-3">
                      <span className="block">{row.description}</span>
                      {row.invoiceId && (
                        <Link
                          className="text-xs font-bold text-[#2d6380]"
                          href={`/operations/billing?invoice=${encodeURIComponent(row.invoiceId)}`}
                        >
                          {c.invoice}: {row.invoiceId}
                        </Link>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs">
                      {office(row.officeId)} · {row.currency}
                    </td>
                    <td className="px-4 py-3 text-end font-bold">
                      {row.debit ? money(row.debit, row.currency) : "—"}
                    </td>
                    <td className="px-4 py-3 text-end font-bold">
                      {row.credit ? money(row.credit, row.currency) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-8 text-sm text-[#718088]">{c.noMovements}</p>
        )}
      </section>
    </div>
  );
}
