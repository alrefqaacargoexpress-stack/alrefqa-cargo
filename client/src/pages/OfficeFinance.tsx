import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import type { OfficeId } from "@shared/branches";
import {
  financeCurrencies,
  type FinanceCommand,
  summarizeCustomerDebts,
  summarizeOfficeFinance,
  type FinanceCurrency,
  type FinanceEntry,
  type FinanceReceivable,
  type FinanceSnapshot,
  canWriteFinance,
} from "@shared/finance";
import { canReadAnyFinance } from "@shared/permissions";
import { sourceCurrency } from "@shared/packing";
import type { Shipment } from "@shared/operations";
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
import { hasSyncReasonCopy, syncReasonMessage } from "@/lib/syncReasonCopy";
import {
  PackingField,
  packingInputClass,
  packingPrimaryClass,
  packingSecondaryClass,
} from "@/components/packing/PackingPrimitives";

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createOpeningBalanceCommand(input: {
  officeId: OfficeId;
  currency: FinanceCurrency;
  direction: "debit" | "credit";
  date: string;
  amount: number;
  note: string;
}): FinanceCommand {
  const commandId = uuid();
  return {
    id: commandId,
    createdAt: new Date().toISOString(),
    kind: "opening_balance",
    payload: {
      openingId: `opening-${uuid()}`,
      officeId: input.officeId,
      currency: input.currency,
      direction: input.direction,
      date: input.date,
      amount: input.amount,
      note: input.note.trim(),
    },
  };
}

export function createShipmentPriceCommand(input: {
  shipmentId: string;
  sourceOfficeId: OfficeId;
  pricePerKg: number;
  pricePerKgMRU?: number;
  expectedVersion: number;
}): FinanceCommand {
  const commandId = uuid();
  return {
    id: commandId,
    createdAt: new Date().toISOString(),
    kind: "shipment_price",
    payload: {
      shipmentId: input.shipmentId,
      sourceOfficeId: input.sourceOfficeId,
      pricePerKg: input.pricePerKg,
      ...(input.pricePerKgMRU === undefined
        ? {}
        : { pricePerKgMRU: input.pricePerKgMRU }),
      expectedVersion: input.expectedVersion,
    },
  };
}

function moneyRound(value: number) {
  return Math.round(value * 100) / 100;
}

export function financeCashBalance(
  entries: readonly FinanceEntry[],
  officeId: OfficeId,
  currency: FinanceCurrency
) {
  let cents = 0;
  for (const entry of entries) {
    if (entry.officeId !== officeId || entry.currency !== currency) continue;
    const signed =
      entry.kind === "opening_balance"
        ? entry.direction === "debit"
          ? -entry.amount
          : entry.amount
        : entry.kind === "collection" ||
            entry.kind === "debt_payment" ||
            entry.kind === "customer_credit"
          ? entry.amount
          : entry.kind === "customer_debit" ||
              entry.kind === "daily_expense" ||
              entry.kind === "monthly_expense" ||
              entry.kind === "shipment_cost"
            ? -entry.amount
            : 0;
    cents += Math.round(signed * 100);
  }
  return cents / 100;
}

/** Prefer the explicit API field, but keep older cached snapshots readable. */
export function receivablesForSnapshot(
  snapshot: Pick<FinanceSnapshot, "receivables" | "shipmentReceivables">
): FinanceReceivable[] {
  const rows = snapshot.shipmentReceivables?.length
    ? snapshot.shipmentReceivables
    : (snapshot.receivables ?? []);
  return rows.map(row => {
    const hasSoldAmounts = row.shipments.some(
      shipment => shipment.soldAmount !== undefined
    );
    const hasRemainingAmounts = row.shipments.some(
      shipment => shipment.remainingAmount !== undefined
    );
    const soldTotal =
      row.soldTotal ??
      (hasSoldAmounts
        ? moneyRound(
            row.shipments.reduce(
              (sum, shipment) => sum + (shipment.soldAmount ?? 0),
              0
            )
          )
        : 0);
    const remainingTotal =
      row.remainingTotal ??
      (hasRemainingAmounts
        ? moneyRound(
            row.shipments.reduce(
              (sum, shipment) => sum + (shipment.remainingAmount ?? 0),
              0
            )
          )
        : moneyRound(row.total - soldTotal));
    return {
      ...row,
      soldTotal,
      remainingTotal,
      unpricedShipments:
        row.unpricedShipments ??
        row.shipments.filter(shipment => shipment.pricingStatus === "unpriced")
          .length,
      shipments: row.shipments.map(shipment => ({
        ...shipment,
        soldAmount: shipment.soldAmount ?? (hasSoldAmounts ? 0 : undefined),
        remainingAmount:
          shipment.remainingAmount ??
          (hasRemainingAmounts ? 0 : shipment.amount),
      })),
    };
  });
}

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
  opening_balance: c.openingBalance,
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
  const canUseFinance = canReadAnyFinance({
    role: finance.role,
    offices: finance.offices,
    homeOffice: finance.homeOffice,
    permissions: finance.permissions,
  });
  const canWrite = canWriteFinance({
    role: finance.role,
    offices: finance.offices,
    homeOffice: finance.homeOffice,
  });
  const shipmentSource = finance.base.state.shipments;
  const snapshot = finance.store?.snapshot;
  const shipmentReceivables = receivablesForSnapshot(
    snapshot ?? { receivables: [], shipmentReceivables: [] }
  );
  const accountantHomeOnly =
    canWrite && finance.role === "accountant" && allowedOffices.length === 1;
  const [openingCurrency, setOpeningCurrency] =
    useState<FinanceCurrency>("MRU");
  const [openingDirection, setOpeningDirection] = useState<"debit" | "credit">(
    "debit"
  );
  const [openingDate, setOpeningDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [openingAmount, setOpeningAmount] = useState("");
  const [openingNote, setOpeningNote] = useState("");
  const [openingNotice, setOpeningNotice] = useState("");
  const [openingError, setOpeningError] = useState("");
  const [openingBusy, setOpeningBusy] = useState(false);
  const openingOffice = accountantHomeOnly ? allowedOffices[0] : undefined;
  const openingExists = Boolean(
    openingOffice &&
      (finance.entries.some(
        entry =>
          entry.kind === "opening_balance" &&
          entry.officeId === openingOffice &&
          entry.currency === openingCurrency
      ) ||
        finance.commands.some(
          command =>
            command.kind === "opening_balance" &&
            command.payload.officeId === openingOffice &&
            command.payload.currency === openingCurrency
        ))
  );
  const priceableShipments = useMemo(
    () =>
      shipmentSource.filter(
        shipment =>
          !shipment.deleted &&
          Boolean(shipment.packing) &&
          accountantHomeOnly &&
          shipment.packing?.source === openingOffice
      ),
    [accountantHomeOnly, openingOffice, shipmentSource]
  );
  const [priceShipmentId, setPriceShipmentId] = useState("");
  const [pricePerKg, setPricePerKg] = useState("");
  const [pricePerKgMRU, setPricePerKgMRU] = useState("");
  const [priceNotice, setPriceNotice] = useState("");
  const [priceError, setPriceError] = useState("");
  const [priceBusy, setPriceBusy] = useState(false);
  const priceShipment = priceableShipments.find(s => s.id === priceShipmentId);
  const priceAlreadyPending = Boolean(
    priceShipment &&
      finance.commands.some(
        command =>
          command.kind === "shipment_price" &&
          command.payload.shipmentId === priceShipment.id
      )
  );

  useEffect(() => {
    if (!priceableShipments.some(shipment => shipment.id === priceShipmentId))
      setPriceShipmentId(priceableShipments[0]?.id ?? "");
  }, [priceShipmentId, priceableShipments]);

  const saveOpening = async () => {
    setOpeningError("");
    setOpeningNotice("");
    const amount = Number(openingAmount);
    if (!openingOffice || !accountantHomeOnly) return;
    if (
      openingExists ||
      !openingDate ||
      !openingNote.trim() ||
      !openingAmount.trim() ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      setOpeningError(
        openingExists ? c.openingAlreadyExists : c.openingRequired
      );
      return;
    }
    setOpeningBusy(true);
    try {
      if (
        await finance.saveCommand(
          createOpeningBalanceCommand({
            officeId: openingOffice,
            currency: openingCurrency,
            direction: openingDirection,
            date: openingDate,
            amount,
            note: openingNote,
          })
        )
      ) {
        setOpeningAmount("");
        setOpeningNote("");
        setOpeningNotice(c.openingSaved);
      }
    } finally {
      setOpeningBusy(false);
    }
  };

  const saveShipmentPrice = async () => {
    setPriceError("");
    setPriceNotice("");
    const sourceOffice = priceShipment?.packing?.source as OfficeId | undefined;
    const amount = Number(pricePerKg);
    const mruAmount = pricePerKgMRU.trim() ? Number(pricePerKgMRU) : undefined;
    if (
      !priceShipment ||
      !sourceOffice ||
      !accountantHomeOnly ||
      priceAlreadyPending ||
      !pricePerKg.trim() ||
      !Number.isFinite(amount) ||
      amount < 0 ||
      (mruAmount !== undefined &&
        (!Number.isFinite(mruAmount) || mruAmount < 0))
    ) {
      setPriceError(
        priceAlreadyPending ? c.priceAlreadyPending : c.priceRequired
      );
      return;
    }
    setPriceBusy(true);
    try {
      if (
        await finance.saveCommand(
          createShipmentPriceCommand({
            shipmentId: priceShipment.id,
            sourceOfficeId: sourceOffice,
            pricePerKg: amount,
            ...(mruAmount === undefined ? {} : { pricePerKgMRU: mruAmount }),
            expectedVersion: priceShipment.version ?? 1,
          })
        )
      ) {
        setPricePerKg("");
        setPricePerKgMRU("");
        setPriceNotice(c.priceSaved);
      }
    } finally {
      setPriceBusy(false);
    }
  };

  const sync = async () => {
    setSyncNotice("");
    const result = await finance.sync();
    if (!result) return;
    setSyncNotice(
      result.conflicts.length
        ? hasSyncReasonCopy(result.conflicts[0].code)
          ? syncReasonMessage(result.conflicts[0].code, language)
          : c.syncConflicts
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
                {finance.commands.length > 0 && canWrite && (
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
                    <Metric
                      label={c.openingBalance}
                      value={formatMoney(
                        summary.openingBalance,
                        summary.currency,
                        language
                      )}
                    />
                    <Metric
                      label={c.cashBalance}
                      value={formatMoney(
                        financeCashBalance(
                          visibleEntries,
                          summary.officeId,
                          summary.currency
                        ),
                        summary.currency,
                        language
                      )}
                      tone="blue"
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

          <section className="rounded-2xl border border-[#dce4e7] bg-white p-5 shadow-sm">
            <div className="border-b border-[#edf1f1] pb-4">
              <h2 className="text-lg font-black text-[#092d50]">
                {c.sourceReceivables}
              </h2>
              <p className="mt-1 text-sm text-[#718088]">
                {c.sourceReceivablesHint}
              </p>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {shipmentReceivables
                .filter(
                  row =>
                    selectedOffice === "all" || row.officeId === selectedOffice
                )
                .map(row => (
                  <article
                    key={`${row.officeId}-${row.currency}`}
                    className="rounded-xl bg-[#f7f9f8] p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <strong>{officeName(language, row.officeId)}</strong>
                      {row.unpricedShipments ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">
                          {c.unpriced}: {row.unpricedShipments}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <Metric
                        label={c.totalGross}
                        value={formatMoney(row.total, row.currency, language)}
                      />
                      <Metric
                        label={c.sold}
                        value={formatMoney(
                          row.soldTotal ?? 0,
                          row.currency,
                          language
                        )}
                        tone="green"
                      />
                      <Metric
                        label={c.remaining}
                        value={formatMoney(
                          row.remainingTotal ?? row.total,
                          row.currency,
                          language
                        )}
                        tone="blue"
                      />
                    </div>
                    <div className="mt-3 space-y-2 text-sm">
                      {row.shipments.map(shipment => (
                        <div
                          key={shipment.shipmentId}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white px-3 py-2"
                        >
                          <span className="flex flex-wrap items-center gap-2">
                            <b>{shipment.tracking}</b>
                            <span className="ms-2 text-xs text-[#718088]">
                              {shipment.shipmentId}
                            </span>
                            {shipment.pricingStatus === "unpriced" && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                                {c.unpriced}
                              </span>
                            )}
                          </span>
                          <span
                            className="text-end font-mono text-xs"
                            dir="ltr"
                          >
                            {c.totalGross}:{" "}
                            {formatMoney(
                              shipment.amount,
                              row.currency,
                              language
                            )}
                            <br />
                            {c.sold}:{" "}
                            {formatMoney(
                              shipment.soldAmount ?? 0,
                              row.currency,
                              language
                            )}{" "}
                            · {c.remaining}:{" "}
                            {formatMoney(
                              shipment.remainingAmount ?? shipment.amount,
                              row.currency,
                              language
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
            </div>
            {!shipmentReceivables.some(
              row => selectedOffice === "all" || row.officeId === selectedOffice
            ) && (
              <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-[#718088]">
                {c.noSourceReceivables}
              </p>
            )}
          </section>

          {canWrite ? (
            <>
              {accountantHomeOnly && (
                <>
                  <section className="rounded-2xl border border-[#dce4e7] bg-white p-5 shadow-sm">
                    <div className="border-b border-[#edf1f1] pb-4">
                      <h2 className="text-lg font-black text-[#092d50]">
                        {c.addOpeningBalance}
                      </h2>
                      <p className="mt-1 text-sm text-[#718088]">
                        {c.openingOnceHint}
                      </p>
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      <PackingField label={c.office} required>
                        <select
                          className={packingInputClass}
                          value={openingOffice ?? ""}
                          disabled
                        >
                          {openingOffice && (
                            <option value={openingOffice}>
                              {officeName(language, openingOffice)}
                            </option>
                          )}
                        </select>
                      </PackingField>
                      <PackingField label={c.currency} required>
                        <select
                          className={packingInputClass}
                          value={openingCurrency}
                          disabled={openingBusy}
                          onChange={event =>
                            setOpeningCurrency(
                              event.target.value as FinanceCurrency
                            )
                          }
                        >
                          {financeCurrencies.map(currency => (
                            <option key={currency} value={currency}>
                              {currency}
                            </option>
                          ))}
                        </select>
                      </PackingField>
                      <PackingField label={c.openingDirection} required>
                        <select
                          className={packingInputClass}
                          value={openingDirection}
                          disabled={openingBusy || openingExists}
                          onChange={event =>
                            setOpeningDirection(
                              event.target.value as "debit" | "credit"
                            )
                          }
                        >
                          <option value="debit">{c.debit}</option>
                          <option value="credit">{c.credit}</option>
                        </select>
                      </PackingField>
                      <PackingField label={c.date} required>
                        <input
                          className={packingInputClass}
                          type="date"
                          value={openingDate}
                          disabled={openingBusy || openingExists}
                          onChange={event => setOpeningDate(event.target.value)}
                        />
                      </PackingField>
                      <PackingField label={c.amount} required>
                        <input
                          className={packingInputClass}
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={openingAmount}
                          disabled={openingBusy || openingExists}
                          onChange={event =>
                            setOpeningAmount(event.target.value)
                          }
                        />
                      </PackingField>
                      <PackingField label={c.note} required>
                        <input
                          className={packingInputClass}
                          maxLength={500}
                          value={openingNote}
                          disabled={openingBusy || openingExists}
                          onChange={event => setOpeningNote(event.target.value)}
                        />
                      </PackingField>
                    </div>
                    {openingExists && (
                      <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-900">
                        {c.openingAlreadyExists}
                      </p>
                    )}
                    {openingError && (
                      <p
                        role="alert"
                        className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-900"
                      >
                        {openingError}
                      </p>
                    )}
                    {openingNotice && (
                      <p
                        role="status"
                        className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-900"
                      >
                        {openingNotice}
                      </p>
                    )}
                    <button
                      className={`${packingPrimaryClass} mt-4`}
                      type="button"
                      disabled={openingBusy || openingExists}
                      onClick={() => void saveOpening()}
                    >
                      {openingBusy ? c.saving : c.saveOpening}
                    </button>
                  </section>

                  <section className="rounded-2xl border border-[#dce4e7] bg-white p-5 shadow-sm">
                    <div className="border-b border-[#edf1f1] pb-4">
                      <h2 className="text-lg font-black text-[#092d50]">
                        {c.setShipmentPrice}
                      </h2>
                      <p className="mt-1 text-sm text-[#718088]">
                        {c.shipmentPriceHint}
                      </p>
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                      <PackingField label={c.shipment} required>
                        <select
                          className={packingInputClass}
                          value={priceShipmentId}
                          disabled={priceBusy || !priceableShipments.length}
                          onChange={event =>
                            setPriceShipmentId(event.target.value)
                          }
                        >
                          {!priceableShipments.length && (
                            <option value="">{c.noPriceableShipments}</option>
                          )}
                          {priceableShipments.map(shipment => (
                            <option key={shipment.id} value={shipment.id}>
                              {shipment.tracking} · {shipment.id}
                            </option>
                          ))}
                        </select>
                      </PackingField>
                      <PackingField
                        label={
                          priceShipment?.packing?.source
                            ? `${c.pricePerKg} (${sourceCurrency[priceShipment.packing.source]})`
                            : c.pricePerKg
                        }
                        required
                      >
                        <input
                          className={packingInputClass}
                          type="number"
                          min="0"
                          step="0.01"
                          value={pricePerKg}
                          disabled={
                            priceBusy || priceAlreadyPending || !priceShipment
                          }
                          onChange={event => setPricePerKg(event.target.value)}
                        />
                      </PackingField>
                      <PackingField label={c.pricePerKgMRU}>
                        <input
                          className={packingInputClass}
                          type="number"
                          min="0"
                          step="0.01"
                          value={pricePerKgMRU}
                          disabled={
                            priceBusy || priceAlreadyPending || !priceShipment
                          }
                          onChange={event =>
                            setPricePerKgMRU(event.target.value)
                          }
                        />
                      </PackingField>
                      <PackingField label={c.expectedVersion}>
                        <input
                          className={`${packingInputClass} bg-slate-50`}
                          value={priceShipment?.version ?? 1}
                          readOnly
                        />
                      </PackingField>
                    </div>
                    {priceAlreadyPending && (
                      <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-900">
                        {c.priceAlreadyPending}
                      </p>
                    )}
                    {priceError && (
                      <p
                        role="alert"
                        className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-900"
                      >
                        {priceError}
                      </p>
                    )}
                    {priceNotice && (
                      <p
                        role="status"
                        className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-900"
                      >
                        {priceNotice}
                      </p>
                    )}
                    <button
                      className={`${packingPrimaryClass} mt-4`}
                      type="button"
                      disabled={
                        priceBusy || priceAlreadyPending || !priceShipment
                      }
                      onClick={() => void saveShipmentPrice()}
                    >
                      {priceBusy ? c.saving : c.saveShipmentPrice}
                    </button>
                  </section>
                </>
              )}
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
                canEdit={canWrite && finance.canEdit}
                online={finance.online}
                saveCommand={finance.saveCommand}
                {...({
                  role: finance.role,
                  homeOffice: finance.homeOffice,
                  permissions: finance.permissions,
                  newReadonlyPolicy: !accountantHomeOnly,
                } as Record<string, unknown>)}
              />
            </>
          ) : (
            <p className="rounded-2xl border border-[#dce4e7] bg-white p-4 text-sm text-[#52636e] shadow-sm">
              {c.readOnlyFinance}
            </p>
          )}

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
