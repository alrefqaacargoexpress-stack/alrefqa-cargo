import { useState } from "react";
import {
  customerMovementInputSchema,
  financeCurrencies,
  type FinanceCommand,
  type FinanceCurrency,
} from "@shared/finance";
import { officeNames, type OfficeId } from "@shared/branches";
import { sourceCurrency } from "@shared/packing";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { customerAccountCopyFor } from "@/lib/customerAccountCopy";
import {
  packingPrimaryClass,
  packingSecondaryClass,
} from "@/components/packing/PackingPrimitives";

type Workspace = {
  canEdit: boolean;
  saveCommand: (command: FinanceCommand) => Promise<boolean>;
  syncCommands?: (ids: string[]) => Promise<unknown | null>;
};
type Props = {
  workspace: Workspace;
  customerId: string;
  officeId: OfficeId;
  onNotice?: (notice: string) => void;
};
function idForMovement() {
  return `movement-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

export default function CustomerMovementForm({
  workspace,
  customerId,
  officeId,
  onNotice,
}: Props) {
  const { language, dir } = useLanguage();
  const c = customerAccountCopyFor(language);
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<FinanceCurrency>(
    officeId === "nouakchott"
      ? "MRU"
      : (sourceCurrency[officeId] as FinanceCurrency)
  );
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [paymentMode, setPaymentMode] = useState<"cash" | "wallet">("cash");
  const [methodId, setMethodId] = useState("");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<FinanceCommand | null>(null);
  const wallet = trpc.office.get.useQuery(
    { officeId },
    {
      enabled: paymentMode === "wallet",
      retry: false,
      refetchOnWindowFocus: false,
    }
  );
  const methods = (wallet.data?.methods ?? []).filter(
    method => method.id !== "cash" && method.enabled
  );
  const reset = () => {
    setPending(null);
    setAmount("");
    setDescription("");
    setReference("");
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !workspace.canEdit) return;
    let command = pending;
    if (!command) {
      const commandId = idForMovement();
      const selected = methods.find(method => method.id === methodId);
      const payload = customerMovementInputSchema.safeParse({
        movementId: commandId,
        customerId,
        officeId,
        direction,
        amount: Number(amount),
        currency,
        date,
        description: description.trim(),
        paymentMode,
        ...(paymentMode === "wallet" && selected
          ? {
              payment: {
                office: officeId,
                methodId: selected.id,
                methodLabel: selected.label,
                ...(reference.trim() ? { reference: reference.trim() } : {}),
              },
            }
          : {}),
      });
      if (!payload.success || !amount.trim()) return onNotice?.(c.validation);
      command = {
        id: commandId,
        createdAt: new Date().toISOString(),
        kind: "customer_movement",
        payload: payload.data,
      };
    }
    setSaving(true);
    try {
      if (!pending) {
        const saved = await workspace.saveCommand(command);
        if (!saved) return onNotice?.(c.movementSaveFailed);
        setPending(command);
      }
      onNotice?.(c.savedLocally);
      if (!workspace.syncCommands) return;
      const result = await workspace.syncCommands([command.id]);
      if (!result) return;
      const applied =
        typeof result === "object" &&
        "applied" in result &&
        Array.isArray((result as { applied?: unknown }).applied) &&
        (result as { applied: Array<{ commandId?: string }> }).applied.some(
          item => item.commandId === command.id
        );
      if (applied) {
        reset();
        onNotice?.(c.sharedSuccess);
      } else onNotice?.(c.syncFailed);
    } catch {
      onNotice?.(c.syncFailed);
    } finally {
      setSaving(false);
    }
  };
  if (!workspace.canEdit) return null;
  const fieldClass =
    "mt-1 w-full min-h-11 rounded-xl border border-[#dce4e7] bg-white px-3 font-normal";
  return (
    <form
      dir={dir}
      onSubmit={submit}
      className="rounded-2xl border border-[#dce4e7] bg-white p-5 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-black text-[#092d50]">{c.addMovement}</h2>
        <span className="text-xs font-bold text-[#718088]">
          {officeNames[language][officeId]}
        </span>
      </div>
      <fieldset
        disabled={saving || Boolean(pending)}
        className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        <label className="text-sm font-bold text-[#23445d]">
          {c.direction}
          <select
            value={direction}
            onChange={e => setDirection(e.target.value as "credit" | "debit")}
            className={fieldClass}
          >
            <option value="credit">{c.customerCredit}</option>
            <option value="debit">{c.customerDebit}</option>
          </select>
        </label>
        <label className="text-sm font-bold text-[#23445d]">
          {c.amount}
          <input
            required
            inputMode="decimal"
            min="0.01"
            max="999999999"
            step="0.01"
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-bold text-[#23445d]">
          {c.currency}
          <select
            value={currency}
            onChange={e => setCurrency(e.target.value as FinanceCurrency)}
            className={fieldClass}
          >
            {financeCurrencies.map(item => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold text-[#23445d]">
          {c.date}
          <input
            required
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-bold text-[#23445d]">
          {c.paymentMode}
          <select
            value={paymentMode}
            onChange={e => setPaymentMode(e.target.value as "cash" | "wallet")}
            className={fieldClass}
          >
            <option value="cash">{c.cash}</option>
            <option value="wallet">{c.wallet}</option>
          </select>
        </label>
        {paymentMode === "wallet" && (
          <label className="text-sm font-bold text-[#23445d]">
            {c.walletMethod}
            <select
              required
              value={methodId}
              onChange={e => setMethodId(e.target.value)}
              className={fieldClass}
            >
              <option value="">{c.walletMethod}</option>
              {methods.map(method => (
                <option key={method.id} value={method.id}>
                  {method.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {paymentMode === "wallet" && (
          <label className="text-sm font-bold text-[#23445d]">
            {c.reference}
            <input
              value={reference}
              maxLength={180}
              onChange={e => setReference(e.target.value)}
              className={fieldClass}
            />
          </label>
        )}
        <label className="text-sm font-bold text-[#23445d] sm:col-span-2 lg:col-span-3">
          {c.addDescription}
          <input
            required
            value={description}
            maxLength={1000}
            onChange={e => setDescription(e.target.value)}
            className={fieldClass}
          />
        </label>
      </fieldset>
      {pending && (
        <p className="mt-3 break-all rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
          {c.savedLocally} · {pending.id}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button disabled={saving} className={packingPrimaryClass}>
          {saving ? c.saving : pending ? c.syncNow : c.saveMovement}
        </button>
        {pending && (
          <button
            type="button"
            disabled={saving}
            className={packingSecondaryClass}
            onClick={reset}
          >
            {c.newMovement}
          </button>
        )}
      </div>
    </form>
  );
}
