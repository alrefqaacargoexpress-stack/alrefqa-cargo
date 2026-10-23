import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { FinanceCommand, FinanceCurrency } from "@shared/finance";
import { financeCurrencies } from "@shared/finance";
import type { OfficeId } from "@shared/branches";
import type { AppRole } from "@shared/operations";
import type { PermissionMap } from "@shared/permissions";
import { ownerOffice } from "@shared/branches";
import type { Shipment } from "@shared/operations";
import { useLanguage } from "@/contexts/LanguageContext";
import { officeName } from "@/lib/branchSettingsCopy";
import { officeFinanceCopyFor } from "@/lib/officeFinanceCopy";
import { canWriteFinanceUi } from "@/lib/financeInvoiceCopy";
import {
  PackingField,
  packingInputClass,
  packingPrimaryClass,
} from "@/components/packing/PackingPrimitives";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export type OfficeExpenseFormProps = {
  allowedOffices: readonly OfficeId[];
  initialOffice?: OfficeId;
  shipments: readonly Shipment[];
  canEdit: boolean;
  online: boolean;
  pending?: boolean;
  saveCommand: (command: FinanceCommand) => Promise<boolean>;
  role?: AppRole | null;
  homeOffice?: OfficeId | null;
  permissions?: PermissionMap | null;
};

export function createExpenseCommand(input: {
  officeId: OfficeId;
  category: "daily_expense" | "monthly_expense" | "shipment_cost";
  amount: number;
  currency: FinanceCurrency;
  date: string;
  description: string;
  shipmentId?: string;
}): FinanceCommand {
  const commandId = uuid();
  return {
    id: commandId,
    createdAt: new Date().toISOString(),
    kind: "expense",
    payload: {
      expenseId: `exp-${uuid()}`,
      officeId: input.officeId,
      category: input.category,
      amount: input.amount,
      currency: input.currency,
      date: input.date,
      description: input.description.trim(),
      ...(input.category === "shipment_cost" && input.shipmentId
        ? { shipmentId: input.shipmentId }
        : {}),
    },
  };
}

export default function OfficeExpenseForm({
  allowedOffices,
  initialOffice,
  shipments,
  canEdit,
  online,
  pending = false,
  saveCommand,
  role,
  homeOffice,
  permissions,
}: OfficeExpenseFormProps) {
  const { language } = useLanguage();
  const c = officeFinanceCopyFor(language);
  const officeForWrite =
    homeOffice ?? initialOffice ?? allowedOffices[0] ?? null;
  const singleOfficeScope =
    allowedOffices.length === 1 &&
    Boolean(officeForWrite) &&
    allowedOffices[0] === officeForWrite;
  const canWrite =
    canEdit &&
    singleOfficeScope &&
    canWriteFinanceUi(
      role,
      allowedOffices,
      officeForWrite,
      permissions,
      "expenses"
    );
  const [category, setCategory] = useState<
    "daily_expense" | "monthly_expense" | "shipment_cost"
  >("daily_expense");
  const [officeId, setOfficeId] = useState<OfficeId>(
    initialOffice && allowedOffices.includes(initialOffice)
      ? initialOffice
      : (allowedOffices[0] ?? "nouakchott")
  );
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<FinanceCurrency>("MRU");
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");
  const [shipmentId, setShipmentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (initialOffice && allowedOffices.includes(initialOffice))
      setOfficeId(initialOffice);
    else if (!allowedOffices.includes(officeId) && allowedOffices[0])
      setOfficeId(allowedOffices[0]);
  }, [allowedOffices, initialOffice, officeId]);

  const officeShipments = useMemo(
    () =>
      shipments.filter(
        shipment =>
          !shipment.deleted && ownerOffice("shipment", shipment) === officeId
      ),
    [officeId, shipments]
  );

  useEffect(() => {
    if (category !== "shipment_cost") setShipmentId("");
    else if (!officeShipments.some(shipment => shipment.id === shipmentId))
      setShipmentId(officeShipments[0]?.id ?? "");
  }, [category, officeShipments, shipmentId]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    const parsedAmount = Number(amount);
    if (!description.trim() || !date) {
      setError(c.required);
      return;
    }
    if (!amount.trim() || !Number.isFinite(parsedAmount) || parsedAmount < 0) {
      setError(c.invalidAmount);
      return;
    }
    if (category === "shipment_cost" && !shipmentId) {
      setError(c.shipmentRequired);
      return;
    }
    if (!canWrite || pending || busy) return;
    const command = createExpenseCommand({
      officeId,
      category,
      amount: parsedAmount,
      currency,
      date,
      description,
      ...(category === "shipment_cost" ? { shipmentId } : {}),
    });
    setBusy(true);
    try {
      const saved = await saveCommand(command);
      if (saved) {
        setAmount("");
        setDescription("");
        setShipmentId("");
        setDate(today());
        setNotice(c.saved);
      }
      // A false save deliberately keeps every field so a failed/offline draft is not lost.
    } catch {
      // The finance hook owns its queue/error state; the form retains the draft on failure.
    } finally {
      setBusy(false);
    }
  };

  const disabled = !canWrite || pending || busy || !allowedOffices.length;
  return (
    <section className="rounded-2xl border border-[#dce4e7] bg-white p-5 shadow-sm">
      <div className="border-b border-[#edf1f1] pb-4">
        <h2 className="text-lg font-black text-[#092d50]">{c.addExpense}</h2>
        <p className="mt-1 text-sm text-[#718088]">{c.pendingHint}</p>
      </div>
      <form className="mt-5 grid gap-4" onSubmit={submit}>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <PackingField label={c.expenseCategory} required>
            <select
              className={packingInputClass}
              value={category}
              disabled={disabled}
              onChange={event =>
                setCategory(
                  event.target.value as
                    | "daily_expense"
                    | "monthly_expense"
                    | "shipment_cost"
                )
              }
            >
              <option value="daily_expense">{c.dailyExpense}</option>
              <option value="monthly_expense">{c.monthlyExpenses}</option>
              <option value="shipment_cost">{c.shipmentCost}</option>
            </select>
          </PackingField>
          <PackingField label={c.office} required>
            <select
              className={packingInputClass}
              value={officeId}
              disabled={disabled || allowedOffices.length < 2}
              onChange={event => setOfficeId(event.target.value as OfficeId)}
            >
              {allowedOffices.map(id => (
                <option key={id} value={id}>
                  {officeName(language, id)}
                </option>
              ))}
            </select>
          </PackingField>
          <PackingField label={c.amount} required hint={c.invalidAmount}>
            <input
              className={packingInputClass}
              type="number"
              min="0"
              step="0.01"
              value={amount}
              disabled={disabled}
              onChange={event => setAmount(event.target.value)}
            />
          </PackingField>
          <PackingField label={c.currency} required>
            <select
              className={packingInputClass}
              value={currency}
              disabled={disabled}
              onChange={event =>
                setCurrency(event.target.value as FinanceCurrency)
              }
            >
              {financeCurrencies.map(value => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </PackingField>
          <PackingField label={c.date} required>
            <input
              className={packingInputClass}
              type="date"
              value={date}
              disabled={disabled}
              onChange={event => setDate(event.target.value)}
            />
          </PackingField>
          {category === "shipment_cost" && (
            <PackingField label={c.shipment} required hint={c.sameOfficeHint}>
              <select
                className={packingInputClass}
                value={shipmentId}
                disabled={disabled || !officeShipments.length}
                onChange={event => setShipmentId(event.target.value)}
              >
                <option value="">{c.selectShipment}</option>
                {officeShipments.map(shipment => (
                  <option key={shipment.id} value={shipment.id}>
                    {shipment.tracking} — {shipment.account}
                  </option>
                ))}
              </select>
              {!officeShipments.length && (
                <span className="text-xs font-normal text-amber-800">
                  {c.noShipment}
                </span>
              )}
            </PackingField>
          )}
        </div>
        <PackingField label={c.descriptionLabel} required>
          <textarea
            className={`${packingInputClass} min-h-24 py-3`}
            value={description}
            disabled={disabled}
            maxLength={500}
            onChange={event => setDescription(event.target.value)}
          />
        </PackingField>
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800"
          >
            {error}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800"
          >
            {notice}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[#718088]">{c.pendingHint}</p>
          <button
            className={packingPrimaryClass}
            type="submit"
            disabled={disabled}
          >
            {busy ? c.saving : c.saveExpense}
          </button>
        </div>
      </form>
    </section>
  );
}
