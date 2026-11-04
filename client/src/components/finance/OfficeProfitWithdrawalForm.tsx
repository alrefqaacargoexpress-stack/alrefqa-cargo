import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { OfficeId } from "@shared/branches";
import {
  financeCurrencies,
  financeMoneySchema,
  type FinanceCommand,
  type FinanceCashProjection,
  type FinanceCurrency,
  type FinanceEntry,
} from "@shared/finance";
import type { AppRole } from "@shared/operations";
import { permissionAllowed, type PermissionMap } from "@shared/permissions";
import { useLanguage } from "@/contexts/LanguageContext";
import { officeName } from "@/lib/branchSettingsCopy";
import { financeCashProjectionFor } from "@/lib/financeProjections";
import { officeFinanceCopyFor } from "@/lib/officeFinanceCopy";
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

export function createProfitWithdrawalCommand(input: {
  officeId: OfficeId;
  amount: number;
  currency: FinanceCurrency;
  date: string;
  description: string;
}): FinanceCommand {
  return {
    id: uuid(),
    createdAt: new Date().toISOString(),
    kind: "profit_withdrawal",
    payload: {
      withdrawalId: `withdrawal-${uuid()}`.slice(0, 64),
      officeId: input.officeId,
      amount: input.amount,
      currency: input.currency,
      date: input.date,
      description: input.description.trim(),
    },
  };
}

export function hasPendingProfitWithdrawal(
  commands: readonly FinanceCommand[],
  officeId: OfficeId,
  currency: FinanceCurrency
) {
  return commands.some(
    command =>
      command.kind === "profit_withdrawal" &&
      command.payload.officeId === officeId &&
      command.payload.currency === currency
  );
}

export function hasProfitWithdrawalPermission(input: {
  role: AppRole | null;
  offices: readonly OfficeId[] | null;
  homeOffice?: OfficeId | null;
  permissions?: PermissionMap | null;
}) {
  return (
    input.role !== "cashier" &&
    permissionAllowed(input, "profit_withdrawal", "manage")
  );
}

export function canStageProfitWithdrawal(input: {
  snapshotReady: boolean;
  cashBalances?: readonly FinanceCashProjection[];
  officeId: OfficeId;
  currency: FinanceCurrency;
}) {
  return (
    input.snapshotReady &&
    Boolean(
      financeCashProjectionFor(
        input.cashBalances,
        input.officeId,
        input.currency
      )
    )
  );
}

export type OfficeProfitWithdrawalFormProps = {
  allowedOffices: readonly OfficeId[];
  initialOffice?: OfficeId | "all";
  entries: readonly FinanceEntry[];
  commands: readonly FinanceCommand[];
  cashBalances?: readonly FinanceCashProjection[];
  snapshotReady: boolean;
  online: boolean;
  canEdit: boolean;
  role?: AppRole | null;
  homeOffice?: OfficeId | null;
  permissions?: PermissionMap | null;
  saveCommand: (command: FinanceCommand) => Promise<boolean>;
};

export default function OfficeProfitWithdrawalForm({
  allowedOffices,
  initialOffice,
  entries,
  commands,
  cashBalances,
  snapshotReady,
  online,
  canEdit,
  role,
  homeOffice,
  permissions,
  saveCommand,
}: OfficeProfitWithdrawalFormProps) {
  const { language } = useLanguage();
  const c = officeFinanceCopyFor(language);
  const [officeId, setOfficeId] = useState<OfficeId>(
    initialOffice &&
      initialOffice !== "all" &&
      allowedOffices.includes(initialOffice)
      ? initialOffice
      : (allowedOffices[0] ?? "nouakchott")
  );
  const [currency, setCurrency] = useState<FinanceCurrency>("MRU");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (
      initialOffice &&
      initialOffice !== "all" &&
      allowedOffices.includes(initialOffice)
    )
      setOfficeId(initialOffice);
    else if (!allowedOffices.includes(officeId) && allowedOffices[0])
      setOfficeId(allowedOffices[0]);
  }, [allowedOffices, initialOffice, officeId]);

  const permissionSubject = useMemo(
    () => ({
      role: role ?? null,
      offices: allowedOffices,
      homeOffice,
      permissions,
    }),
    [allowedOffices, homeOffice, permissions, role]
  );
  const canManage = hasProfitWithdrawalPermission(permissionSubject);
  const projection = useMemo(
    () => financeCashProjectionFor(cashBalances, officeId, currency),
    [cashBalances, currency, officeId]
  );
  const projectionReady = canStageProfitWithdrawal({
    snapshotReady,
    cashBalances,
    officeId,
    currency,
  });
  const pending = hasPendingProfitWithdrawal(commands, officeId, currency);
  const writeReady = online && canEdit && canManage;
  const disabled =
    !writeReady ||
    busy ||
    pending ||
    !projectionReady ||
    !allowedOffices.length;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    const parsedAmount = Number(amount);
    const parsedMoney = financeMoneySchema.safeParse(parsedAmount);
    if (!date || !description.trim()) {
      setError(c.withdrawalRequired);
      return;
    }
    if (
      !amount.trim() ||
      !/^(?:\d+)(?:\.\d{1,2})?$/.test(amount.trim()) ||
      !parsedMoney.success ||
      parsedAmount <= 0
    ) {
      setError(c.withdrawalInvalidAmount);
      return;
    }
    if (pending) {
      setError(c.withdrawalAlreadyPending);
      return;
    }
    if (!projectionReady || !projection) {
      setError(c.withdrawalUnavailable);
      return;
    }
    if (parsedAmount > projection.availableProfitWithdrawal) {
      setError(c.withdrawalExceedsAvailable);
      return;
    }
    if (!writeReady || !allowedOffices.includes(officeId)) {
      setError(c.permissionDenied ?? c.withdrawalUnavailable);
      return;
    }
    setBusy(true);
    try {
      const saved = await saveCommand(
        createProfitWithdrawalCommand({
          officeId,
          amount: parsedAmount,
          currency,
          date,
          description,
        })
      );
      if (saved) {
        setAmount("");
        setDescription("");
        setDate(today());
        setNotice(c.withdrawalSaved);
      }
    } catch {
      // The workspace hook owns the draft error; preserve form values here.
    } finally {
      setBusy(false);
    }
  };

  if (!writeReady) return null;

  return (
    <section className="rounded-2xl border border-[#dce4e7] bg-white p-5 shadow-sm">
      <div className="border-b border-[#edf1f1] pb-4">
        <h2 className="text-lg font-black text-[#092d50]">
          {c.profitWithdrawal}
        </h2>
        <p className="mt-1 text-sm text-[#718088]">{c.profitWithdrawalHint}</p>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl bg-sky-50 p-3 text-sm text-sky-950">
          <div className="text-xs font-semibold opacity-75">
            {c.cashBalance}
          </div>
          <div className="mt-1 font-black" dir="ltr">
            {projection
              ? `${projection.cashBalance.toFixed(2)} ${currency}`
              : "—"}
          </div>
        </div>
        <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950">
          <div className="text-xs font-semibold opacity-75">
            {c.availableProfitWithdrawal}
          </div>
          <div className="mt-1 font-black" dir="ltr">
            {projection
              ? `${projection.availableProfitWithdrawal.toFixed(2)} ${currency}`
              : "—"}
          </div>
          <div className="mt-1 text-xs">{c.availableProfitWithdrawalHint}</div>
        </div>
      </div>
      {!projectionReady && (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-900">
          {c.withdrawalUnavailable}
        </p>
      )}
      <form className="mt-5 grid gap-4" onSubmit={submit}>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <PackingField label={c.office} required>
            <select
              className={packingInputClass}
              value={officeId}
              disabled={!writeReady || busy || allowedOffices.length < 2}
              onChange={event => setOfficeId(event.target.value as OfficeId)}
            >
              {allowedOffices.map(id => (
                <option key={id} value={id}>
                  {officeName(language, id)}
                </option>
              ))}
            </select>
          </PackingField>
          <PackingField label={c.currency} required>
            <select
              className={packingInputClass}
              value={currency}
              disabled={!writeReady || busy}
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
          <PackingField label={c.amount} required>
            <input
              className={packingInputClass}
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              disabled={disabled}
              onChange={event => setAmount(event.target.value)}
            />
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
        </div>
        <PackingField label={c.withdrawalReason} required>
          <textarea
            className={`${packingInputClass} min-h-24 py-3`}
            value={description}
            disabled={disabled}
            maxLength={500}
            onChange={event => setDescription(event.target.value)}
          />
        </PackingField>
        {pending && (
          <p className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-900">
            {c.withdrawalAlreadyPending}
          </p>
        )}
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
          <p className="text-xs text-[#718088]">{c.withdrawalNotPosted}</p>
          <button
            className={packingPrimaryClass}
            type="submit"
            disabled={disabled}
          >
            {busy ? c.saving : c.saveWithdrawal}
          </button>
        </div>
      </form>
    </section>
  );
}
