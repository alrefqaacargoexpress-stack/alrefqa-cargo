import { useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { ArrowLeft, CloudOff, RefreshCw } from "lucide-react";
import type { FinanceCommand } from "@shared/finance";
import type { Invoice } from "@shared/operations";
import { officeNames, type OfficeId } from "@shared/branches";
import { useLanguage } from "@/contexts/LanguageContext";
import { useFinanceWorkspace } from "@/hooks/useFinanceWorkspace";
import PackingLayout from "@/components/packing/PackingLayout";
import FinanceExcelPanel from "@/components/finance/FinanceExcelPanel";
import InvoiceFinancialForm from "@/components/finance/InvoiceFinancialForm";
import { invoiceCopyFor } from "@/lib/financeInvoiceCopy";
import {
  formatLocalNumber,
  packingPrimaryClass,
  packingSecondaryClass,
} from "@/components/packing/PackingPrimitives";

type FinanceWorkspace = ReturnType<typeof useFinanceWorkspace>;
type SelectiveFinanceWorkspace = FinanceWorkspace & {
  syncCommands?: (commandIds: string[]) => Promise<unknown>;
};
const inputClass =
  "min-h-10 rounded-xl border border-[#dce4e7] bg-white px-3 py-2 text-sm text-[#092d50]";
function officeLabel(language: "ar" | "en" | "zh" | "tr", office?: OfficeId) {
  return office ? officeNames[language][office] : "—";
}

function InvoiceTable({
  workspace,
  language,
  c,
  selectedInvoiceId,
}: {
  workspace: FinanceWorkspace;
  language: "ar" | "en" | "zh" | "tr";
  c: ReturnType<typeof invoiceCopyFor>;
  selectedInvoiceId?: string;
}) {
  const [settling, setSettling] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const invoices = workspace.invoices;
  const recordSettlement = async (invoice: Invoice) => {
    const amount = Number(amounts[invoice.id]);
    if (!Number.isFinite(amount) || amount <= 0 || !invoice.finance) return;
    if (
      amount >
      (Math.round(invoice.amount * 100) -
        Math.round(invoice.finance.paidAmount * 100)) /
        100
    ) {
      setMessage(c.invalidTotal);
      return;
    }
    setSettling(invoice.id);
    setMessage("");
    const command: FinanceCommand = {
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${invoice.id}`,
      createdAt: new Date().toISOString(),
      kind: "settlement",
      payload: {
        invoiceId: invoice.id,
        expectedVersion: invoice.version ?? 1,
        amount,
        payment: {
          office: "nouakchott",
          methodId: "cash",
          methodLabel: c.cash,
        },
        description: "cash",
      },
    };
    try {
      const ok = await workspace.saveCommand(command);
      setMessage(ok ? c.savedOffline : c.saveError);
      if (ok) setAmounts(current => ({ ...current, [invoice.id]: "" }));
    } catch {
      setMessage(c.saveError);
    } finally {
      setSettling(null);
    }
  };
  if (!invoices.length)
    return (
      <div className="rounded-2xl border border-dashed border-[#cbd9dd] p-6 text-center text-sm text-[#718088]">
        {c.noInvoices}
      </div>
    );
  return (
    <div className="overflow-hidden rounded-2xl border border-[#dce4e7] bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-start text-sm">
          <thead className="bg-[#f5f8f7] text-xs font-black text-[#52636e]">
            <tr>
              <th className="p-3">{c.invoiceId}</th>
              <th className="p-3">{c.customer}</th>
              <th className="p-3">{c.status}</th>
              <th className="p-3">{c.office}</th>
              <th className="p-3">{c.currency}</th>
              <th className="p-3">{c.total}</th>
              <th className="p-3">{c.payment}</th>
              <th className="p-3">{c.actor}</th>
              <th className="p-3">{c.partialSettlement}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf1f1]">
            {invoices.map(invoice => {
              const finance = invoice.finance;
              const remaining = finance
                ? Math.max(
                    0,
                    (Math.round(invoice.amount * 100) -
                      Math.round(finance.paidAmount * 100)) /
                      100
                  )
                : 0;
              const readonly = !finance;
              return (
                <tr
                  key={invoice.id}
                  className={
                    `${readonly ? "bg-[#fbfcfb] text-[#718088]" : "text-[#23445d]"} ${selectedInvoiceId === invoice.id ? "ring-2 ring-inset ring-[#d9a441]" : ""}`
                  }
                  aria-current={selectedInvoiceId === invoice.id ? "true" : undefined}
                >
                  <td className="p-3 font-mono text-xs">
                    {invoice.id}
                    <span className="mt-1 block text-[10px]">
                      {readonly
                        ? c.oldInvoice
                        : invoice.scope === "pending"
                          ? c.draft
                          : c.shared}
                    </span>
                  </td>
                  <td className="p-3 font-bold">{invoice.account}</td>
                  <td className="p-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-bold ${invoice.status === "مدفوعة" ? "bg-emerald-50 text-emerald-800" : invoice.status === "دين" ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-blue-800"}`}
                    >
                      {invoice.status === "دين"
                        ? c.debt
                        : invoice.status === "مدفوعة"
                          ? c.paid
                          : c.waiting}
                    </span>
                  </td>
                  <td className="p-3">
                    {officeLabel(
                      language,
                      finance?.financialOfficeId ?? invoice.officeId
                    )}
                    <span className="block text-xs text-[#718088]">
                      {finance
                        ? officeLabel(language, finance.issuingOfficeId)
                        : ""}
                    </span>
                  </td>
                  <td className="p-3">{finance?.currency ?? "—"}</td>
                  <td className="p-3 font-black">
                    {formatLocalNumber(invoice.amount, language, 2)}
                    <span className="block text-xs font-normal text-[#718088]">
                      {finance?.adjustment
                        ? `${finance.adjustment.direction === "increase" ? "+" : "−"}${finance.adjustment.amount}`
                        : ""}
                    </span>
                  </td>
                  <td className="p-3">
                    {finance
                      ? `${formatLocalNumber(finance.paidAmount, language, 2)} / ${formatLocalNumber(remaining, language, 2)}`
                      : (invoice.payment?.methodLabel ?? "—")}
                  </td>
                  <td className="p-3">
                    {finance?.actorName ?? "—"}
                    <span className="block text-xs text-[#718088]">
                      {finance?.recordedAt
                        ? new Date(finance.recordedAt).toLocaleString()
                        : invoice.issuedAt}
                    </span>
                  </td>
                  <td className="p-3">
                    {!readonly &&
                    remaining > 0 &&
                    invoice.status !== "مدفوعة" ? (
                      <div className="flex items-center gap-1">
                        <input
                          className={`${inputClass} w-24`}
                          type="number"
                          min="0.01"
                          max={remaining}
                          step="0.01"
                          value={amounts[invoice.id] ?? ""}
                          onChange={event =>
                            setAmounts(current => ({
                              ...current,
                              [invoice.id]: event.target.value,
                            }))
                          }
                          placeholder={c.amount}
                        />
                        <button
                          className={packingSecondaryClass}
                          disabled={
                            settling === invoice.id ||
                            !workspace.canEdit ||
                            workspace.commands.some(
                              x =>
                                x.kind === "settlement" &&
                                x.payload.invoiceId === invoice.id
                            )
                          }
                          onClick={() => void recordSettlement(invoice)}
                        >
                          {settling === invoice.id ? "…" : c.partialSettlement}
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-[#718088]">
                        {readonly ? c.readonly : c.paid}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {message && (
        <p
          role="status"
          className="border-t border-[#edf1f1] p-3 text-sm font-bold text-[#296049]"
        >
          {message}
        </p>
      )}
    </div>
  );
}

function DraftRows({
  workspace,
  c,
}: {
  workspace: FinanceWorkspace;
  c: ReturnType<typeof invoiceCopyFor>;
}) {
  const drafts = workspace.commands.filter(
    command => command.kind === "invoice"
  );
  if (!drafts.length) return null;
  const syncCommands = (workspace as SelectiveFinanceWorkspace).syncCommands;
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <h3 className="font-black text-amber-950">
        {c.draft} · {c.syncPending}
      </h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {drafts.map(command => (
          <div
            key={command.id}
            className="rounded-xl border border-amber-200 bg-white/70 p-3 text-xs text-amber-950"
          >
            <b>{command.payload.invoiceId}</b>
            <span className="ms-2">{command.payload.paymentMode}</span>
            <span className="mt-1 block text-amber-800">
              {new Date(command.createdAt).toLocaleString()}
            </span>
            {syncCommands && (
              <button
                type="button"
                className={`${packingSecondaryClass} mt-2 min-h-9 px-2 py-1 text-xs`}
                disabled={!workspace.online || workspace.busy || !workspace.canEdit}
                onClick={() => void syncCommands([command.id])}
              >
                <RefreshCw size={13} /> {c.syncPending}
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function FinanceInvoices() {
  const { language, dir } = useLanguage();
  const c = invoiceCopyFor(language);
  const workspace = useFinanceWorkspace();
  const search = useSearch();
  const queryOffice = new URLSearchParams(search).get(
    "office"
  ) as OfficeId | null;
  const queryParams = new URLSearchParams(search);
  const queryCustomer = queryParams.get("customer");
  const queryInvoice = queryParams.get("invoice");
  const initialCustomerId = queryCustomer &&
    workspace.base.state.accounts.some(account => account.id === queryCustomer)
    ? queryCustomer
    : undefined;
  const selectedInvoice = queryInvoice
    ? workspace.invoices.find(invoice => invoice.id === queryInvoice)
    : undefined;
  const selectedCommand = selectedInvoice
    ? workspace.commands.find(
        command =>
          command.kind === "invoice" &&
          command.payload.invoiceId === selectedInvoice.id
      )
    : undefined;
  const selectiveSync = (workspace as SelectiveFinanceWorkspace).syncCommands;
  const issuingOffice =
    queryOffice &&
    (workspace.offices === null || workspace.offices.includes(queryOffice))
      ? queryOffice
      : undefined;
  const canSee =
    workspace.role === "admin" ||
    workspace.role === "accountant" ||
    workspace.role === "office_manager";
  const shell = workspace.base;
  const officeRows = useMemo(
    () =>
      workspace.entries.filter(
        entry =>
          !workspace.homeOffice || entry.officeId === workspace.homeOffice
      ),
    [workspace.entries, workspace.homeOffice]
  );
  if (!canSee)
    return (
      <PackingLayout
        workspace={shell}
        title={c.title}
        description={c.description}
      >
        <div
          dir={dir}
          className="rounded-3xl border border-red-100 bg-white p-8 text-center"
        >
          <h2 className="text-xl font-black text-[#092d50]">
            {c.noPermission}
          </h2>
          <Link className={`${packingSecondaryClass} mt-5`} href="/operations">
            <ArrowLeft size={15} />
            {language === "ar" ? "العمليات" : "Operations"}
          </Link>
        </div>
      </PackingLayout>
    );
  return (
    <PackingLayout
      workspace={shell}
      title={c.title}
      description={c.description}
    >
      <div dir={dir} className="space-y-5">
        <InvoiceFinancialForm
          key={`${workspace.base.userId ?? "local"}:${initialCustomerId ?? ""}`}
          workspace={workspace}
          initialIssuingOffice={issuingOffice}
          initialCustomerId={initialCustomerId}
        />
        <DraftRows workspace={workspace} c={c} />
        <FinanceExcelPanel
          key={workspace.base.userId ?? "local"}
          workspace={workspace}
        />
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-[#092d50]">{c.title}</h2>
              <p className="text-sm text-[#718088]">
                {officeRows.length} {c.office}
              </p>
            </div>
            <button
              className={packingSecondaryClass}
              disabled={
                !selectiveSync ||
                !selectedCommand ||
                !workspace.online ||
                workspace.busy ||
                !workspace.canEdit
              }
              onClick={() =>
                selectedCommand &&
                void selectiveSync?.([selectedCommand.id])
              }
            >
              <RefreshCw size={15} />
              {c.syncPending}
            </button>
          </div>
          {selectedInvoice && (
            <div className="rounded-2xl border border-[#d9a441] bg-[#fffaf0] p-3 text-sm text-[#5d4610]" role="status">
              <b>{c.invoiceId}: </b>{selectedInvoice.id} · {selectedInvoice.account} · {selectedInvoice.amount} {selectedInvoice.finance?.currency ?? ""}
            </div>
          )}
          <InvoiceTable
            key={`${workspace.base.userId ?? "local"}:${selectedInvoice?.id ?? "all"}`}
            workspace={workspace}
            language={language}
            c={c}
            selectedInvoiceId={selectedInvoice?.id}
          />
        </section>
        {!workspace.online && (
          <p className="flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-900">
            <CloudOff size={15} />
            {c.savedOffline}
          </p>
        )}
      </div>
    </PackingLayout>
  );
}
