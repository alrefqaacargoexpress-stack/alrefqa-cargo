import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import type { OfficeId } from "@shared/branches";
import {
  financeCurrencies,
  summarizeCustomerDebts,
  summarizeOfficeFinance,
  type FinanceCurrency,
  type FinanceEntry,
} from "@shared/finance";
import PackingLayout from "@/components/packing/PackingLayout";
import FinanceExcelPanel from "@/components/finance/FinanceExcelPanel";
import OfficeExpenseForm from "@/components/finance/OfficeExpenseForm";
import { useLanguage } from "@/contexts/LanguageContext";
import { useFinanceWorkspace } from "@/hooks/useFinanceWorkspace";
import { officeIds } from "@/lib/branchSettingsCopy";
import { officeName } from "@/lib/branchSettingsCopy";
import {
  officeFinanceCopyFor,
  type OfficeFinanceCopy,
} from "@/lib/officeFinanceCopy";
import {
  packingInputClass,
  packingPrimaryClass,
  packingSecondaryClass,
} from "@/components/packing/PackingPrimitives";

const kindLabels = (
  c: OfficeFinanceCopy
): Record<FinanceEntry["kind"], string> => ({
  daily_expense: c.dailyExpense,
  monthly_expense: c.monthlyExpense,
  shipment_cost: c.shipmentCost,
  shipment_revenue: c.shipmentRevenue,
  invoice_revenue: c.invoiceRevenue,
  customer_debt: c.customerDebt,
  debt_payment: c.debtPayment,
  collection: c.collection,
  customer_credit: c.customerCredit,
  customer_debit: c.customerDebit,
});

function formatMoney(
  value: number,
  currency: FinanceCurrency,
  language: string
) {
  const locale =
    language === "ar" ? "ar-MR-u-nu-latn" : `${language}-u-nu-latn`;
  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} ${currency}`;
}

function formatDateTime(value: string, language: string) {
  try {
    return new Intl.DateTimeFormat(language === "ar" ? "ar-MR" : language, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function officeEntries(
  entries: readonly FinanceEntry[],
  selected: OfficeId | "all",
  allowed: readonly OfficeId[]
) {
  return entries.filter(
    entry =>
      allowed.includes(entry.officeId) &&
      (selected === "all" || entry.officeId === selected)
  );
}

export default function OfficeFinance() {
  const { language } = useLanguage();
  const c = officeFinanceCopyFor(language);
  const finance = useFinanceWorkspace();
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const requested = params.get("office");
  const allowedOffices = useMemo<readonly OfficeId[]>(
    () => (finance.offices === null ? officeIds : finance.offices),
    [finance.offices]
  );
  const canChooseAll = finance.offices === null;
  const homeOffice = finance.homeOffice;
  const firstOffice =
    homeOffice && allowedOffices.includes(homeOffice)
      ? homeOffice
      : allowedOffices[0];
  const [selectedOffice, setSelectedOffice] = useState<OfficeId | "all">(
    canChooseAll && requested === "all"
      ? "all"
      : requested && allowedOffices.includes(requested as OfficeId)
        ? (requested as OfficeId)
        : (firstOffice ?? "all")
  );

  useEffect(() => {
    const valid =
      selectedOffice === "all"
        ? canChooseAll
        : allowedOffices.includes(selectedOffice);
    if (valid) return;
    setSelectedOffice(canChooseAll ? "all" : (firstOffice ?? "all"));
  }, [allowedOffices, canChooseAll, firstOffice, selectedOffice]);

  const chooseOffice = (value: OfficeId | "all") => {
    setSelectedOffice(value);
    navigate(`/operations/finance?office=${encodeURIComponent(value)}`);
  };

  const visibleEntries = useMemo(
    () => officeEntries(finance.entries, selectedOffice, allowedOffices),
    [allowedOffices, finance.entries, selectedOffice]
  );
  const summaries = useMemo(
    () => summarizeOfficeFinance(visibleEntries),
    [visibleEntries]
  );
  const debts = useMemo(
    () => summarizeCustomerDebts(visibleEntries),
    [visibleEntries]
  );
  const summaryByCurrency = useMemo(
    () =>
      [...summaries].sort((a, b) =>
        `${a.officeId}:${a.currency}`.localeCompare(
          `${b.officeId}:${b.currency}`
        )
      ),
    [summaries]
  );
  const [syncNotice, setSyncNotice] = useState("");
  const canUseFinance =
    finance.role === "admin" || finance.role === "accountant";
  const shipmentSource = finance.base.state.shipments;

  const sync = async () => {
    setSyncNotice("");
    const result = await finance.sync();
    if (!result) return;
    setSyncNotice(
      result.conflicts.length
        ? c.syncConflicts
        : result.applied.length
          ? `${c.syncDone}: ${result.applied.length}`
          : c.syncNoResult
    );
  };

  return (
    <PackingLayout
      title={c.title}
      description={c.description}
      workspace={finance.base}
    >
      {!canUseFinance ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-900">
          {c.noAccess}
        </section>
      ) : (
        <div className="grid gap-5">
          <section className="rounded-2xl border border-[#dce4e7] bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-[#718088]">
                  {c.chooseOffice}
                </p>
                <h2 className="mt-1 text-2xl font-black text-[#092d50]">
                  {selectedOffice === "all"
                    ? c.allOffices
                    : officeName(language, selectedOffice)}
                </h2>
              </div>
              <label className="grid min-w-64 gap-1.5 text-sm font-semibold text-[#243f52]">
                <span>{c.chooseOffice}</span>
                <select
                  className={packingInputClass}
                  value={selectedOffice}
                  onChange={event =>
                    chooseOffice(event.target.value as OfficeId | "all")
                  }
                >
                  {canChooseAll && <option value="all">{c.allOffices}</option>}
                  {allowedOffices.map(officeId => (
                    <option key={officeId} value={officeId}>
                      {officeName(language, officeId)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-4 grid gap-2 text-sm text-[#52636e] md:grid-cols-2">
              <p className="rounded-xl bg-[#f4f8f7] p-3">
                {c.officialSnapshot}
              </p>
              <p className="rounded-xl bg-[#f4f8f7] p-3">{c.homeOfficeHint}</p>
            </div>
            {finance.error && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-900">
                <span>
                  {c.error} {finance.error}
                </span>
                <button
                  className={packingSecondaryClass}
                  onClick={() => void finance.reload()}
                >
                  {c.retry}
                </button>
              </div>
            )}
          </section>

          <section className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-black text-[#092d50]">
                {c.balances}
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                {finance.commands.length > 0 && (
                  <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900">
                    {c.pending}: {finance.commands.length}
                  </span>
                )}
                <Link
                  href="/operations/billing"
                  className={packingSecondaryClass}
                >
                  {c.billing}
                </Link>
                {finance.commands.length > 0 && (
                  <button
                    className={packingPrimaryClass}
                    disabled={
                      !finance.online ||
                      finance.loading ||
                      finance.busy ||
                      !finance.canEdit
                    }
                    onClick={() => void sync()}
                  >
                    {finance.loading ? c.syncing : c.sync}
                  </button>
                )}
              </div>
            </div>
            {syncNotice && (
              <p
                role="status"
                className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-900"
              >
                {syncNotice}
              </p>
            )}
            <div className="grid gap-4 lg:grid-cols-2">
              {summaryByCurrency.map(summary => (
                <article
                  key={`${summary.officeId}-${summary.currency}`}
                  className="rounded-2xl border border-[#dce4e7] bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-lg font-black text-[#092d50]">
                      {summary.currency}
                    </h3>
                    <span className="text-xs font-semibold text-[#718088]">
                      {selectedOffice === "all"
                        ? officeName(language, summary.officeId)
                        : c.officialSnapshot}
                    </span>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <Metric
                      label={c.revenue}
                      value={formatMoney(
                        summary.revenue,
                        summary.currency,
                        language
                      )}
                      tone="green"
                    />
                    <Metric
                      label={c.expenses}
                      value={formatMoney(
                        summary.expenses,
                        summary.currency,
                        language
                      )}
                      tone="red"
                    />
                    <Metric
                      label={c.shipmentCosts}
                      value={formatMoney(
                        summary.shipmentCosts,
                        summary.currency,
                        language
                      )}
                    />
                    <Metric
                      label={c.net}
                      value={formatMoney(
                        summary.net,
                        summary.currency,
                        language
                      )}
                      tone="blue"
                    />
                    <Metric
                      label={c.debts}
                      value={formatMoney(
                        summary.debts,
                        summary.currency,
                        language
                      )}
                    />
                    <Metric
                      label={c.collections}
                      value={formatMoney(
                        summary.collections,
                        summary.currency,
                        language
                      )}
                    />
                  </dl>
                </article>
              ))}
            </div>
            {!summaryByCurrency.length && (
              <p className="rounded-2xl bg-white p-5 text-sm text-[#718088] shadow-sm">
                {c.noEntries}
              </p>
            )}
            <p className="text-xs text-[#718088]">
              {c.draftsExcluded} {c.legacyBalanceHint}
            </p>
          </section>

          <FinanceExcelPanel
            key={finance.base.userId ?? "local"}
            workspace={finance}
          />

          <OfficeExpenseForm
            key={finance.base.userId ?? "local"}
            allowedOffices={allowedOffices}
            initialOffice={
              selectedOffice === "all" ? firstOffice : selectedOffice
            }
            shipments={shipmentSource}
            canEdit={finance.canEdit}
            online={finance.online}
            saveCommand={finance.saveCommand}
          />

          <section className="rounded-2xl border border-[#dce4e7] bg-white p-5 shadow-sm">
            <div className="border-b border-[#edf1f1] pb-4">
              <h2 className="text-lg font-black text-[#092d50]">{c.ledger}</h2>
              <p className="mt-1 text-sm text-[#718088]">{c.ledgerHint}</p>
            </div>
            {visibleEntries.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0 text-start text-sm">
                  <thead>
                    <tr className="text-xs font-bold text-[#718088]">
                      {[
                        c.date,
                        c.kind,
                        c.descriptionLabel,
                        c.actor,
                        c.recordedAt,
                        c.office,
                        c.currency,
                        c.amount,
                      ].map(label => (
                        <th
                          key={label}
                          className="border-b border-[#edf1f1] px-3 py-3 text-start"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...visibleEntries]
                      .sort((a, b) =>
                        `${b.date}${b.recordedAt}`.localeCompare(
                          `${a.date}${a.recordedAt}`
                        )
                      )
                      .map(entry => (
                        <tr key={entry.id} className="align-top">
                          <td className="border-b border-[#f0f3f3] px-3 py-3 font-mono text-xs">
                            {entry.date}
                          </td>
                          <td className="border-b border-[#f0f3f3] px-3 py-3 font-semibold">
                            {kindLabels(c)[entry.kind]}
                          </td>
                          <td className="max-w-64 border-b border-[#f0f3f3] px-3 py-3">
                            {entry.description}
                          </td>
                          <td className="border-b border-[#f0f3f3] px-3 py-3">
                            {entry.actorName}{" "}
                            <span className="text-xs text-[#718088]">
                              #{entry.actorId}
                            </span>
                          </td>
                          <td className="border-b border-[#f0f3f3] px-3 py-3 text-xs">
                            {formatDateTime(entry.recordedAt, language)}
                          </td>
                          <td className="border-b border-[#f0f3f3] px-3 py-3">
                            {officeName(language, entry.officeId)}
                          </td>
                          <td className="border-b border-[#f0f3f3] px-3 py-3 font-mono">
                            {entry.currency}
                          </td>
                          <td className="border-b border-[#f0f3f3] px-3 py-3 text-end font-bold">
                            {formatMoney(
                              entry.amount,
                              entry.currency,
                              language
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-[#718088]">
                {c.noEntries}
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-[#dce4e7] bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-[#092d50]">{c.debts}</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {debts.map(debt => (
                <article
                  key={`${debt.officeId}-${debt.currency}-${debt.customerId}`}
                  className="rounded-xl bg-[#f7f9f8] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <strong>{debt.customerName}</strong>
                    <span className="font-mono text-xs">{debt.currency}</span>
                  </div>
                  <p className="mt-2 text-sm text-[#52636e]">
                    {c.debts}:{" "}
                    {formatMoney(debt.outstanding, debt.currency, language)} ·{" "}
                    {c.collections}:{" "}
                    {formatMoney(debt.paid, debt.currency, language)}
                  </p>
                </article>
              ))}
            </div>
            {!debts.length && (
              <p className="mt-3 text-sm text-[#718088]">{c.noEntries}</p>
            )}
          </section>
        </div>
      )}
    </PackingLayout>
  );
}

function Metric({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "green" | "red" | "blue" | "slate";
}) {
  const toneClass = {
    green: "bg-emerald-50 text-emerald-900",
    red: "bg-red-50 text-red-900",
    blue: "bg-sky-50 text-sky-900",
    slate: "bg-slate-50 text-slate-900",
  }[tone];
  return (
    <div className={`rounded-xl p-3 ${toneClass}`}>
      <dt className="text-xs font-semibold opacity-75">{label}</dt>
      <dd className="mt-1 font-black" dir="ltr">
        {value}
      </dd>
    </div>
  );
}
