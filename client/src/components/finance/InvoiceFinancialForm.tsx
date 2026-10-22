import { canBillShipmentCurrency } from "@shared/officeFinanceVisibility";
import { useMemo, useState } from "react";
import { Check, CircleAlert, Plus, Search } from "lucide-react";
import {
  calculateFinanceInvoice,
  type FinanceCommand,
  type FinanceInvoiceInput,
} from "@shared/finance";
import { financeCurrencies, type FinanceCurrency } from "@shared/finance";
import { officeIds, officeNames, type OfficeId } from "@shared/branches";
import type { Account, Invoice, Shipment } from "@shared/operations";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  invoiceCopyFor,
  invoicePaymentOptions,
  searchableInvoiceGoods,
  adjustmentTotal,
} from "@/lib/financeInvoiceCopy";
import {
  PackingField,
  packingPrimaryClass,
  packingSecondaryClass,
  formatLocalNumber,
} from "@/components/packing/PackingPrimitives";

type Workspace = {
  base: {
    state: { accounts: Account[]; shipments: Shipment[] };
    userId: string | null;
    name?: string;
  };
  invoices: Invoice[];
  homeOffice: OfficeId | null;
  offices: OfficeId[] | null;
  canEdit: boolean;
  role?: import("@shared/operations").AppRole | null;
  online: boolean;
  saveCommand: (command: FinanceCommand) => Promise<boolean>;
};

type Props = {
  workspace: Workspace;
  initialIssuingOffice?: OfficeId;
  onSaved?: () => void;
};
const inputClass =
  "w-full min-h-11 rounded-xl border border-[#dce4e7] bg-white px-3 py-2 text-sm text-[#092d50] outline-none focus:border-[#2d6380] focus:ring-4 focus:ring-[#2d6380]/10";
const officeLabel = (language: "ar" | "en" | "zh" | "tr", office: OfficeId) =>
  officeNames[language][office];

function uuid() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export default function InvoiceFinancialForm({
  workspace,
  initialIssuingOffice,
  onSaved,
}: Props) {
  const { language, dir } = useLanguage();
  const c = invoiceCopyFor(language);
  const accounts = workspace.base.state.accounts;
  const shipments = workspace.base.state.shipments;
  const [accountQuery, setAccountQuery] = useState("");
  const [accountId, setAccountId] = useState("");
  const [paymentMode, setPaymentMode] =
    useState<FinanceInvoiceInput["paymentMode"]>("on_account");
  const [chargeKind, setChargeKind] =
    useState<FinanceInvoiceInput["chargeKind"]>("shipping");
  const [shipmentId, setShipmentId] = useState("");
  const [goodsQuery, setGoodsQuery] = useState("");
  const [selectedGoods, setSelectedGoods] = useState<string[]>([]);
  const [goodsConfirmed, setGoodsConfirmed] = useState(false);
  const [currency, setCurrency] = useState<FinanceCurrency>("MRU");
  const [manualAmount, setManualAmount] = useState("");
  const [adjustDirection, setAdjustDirection] = useState<
    "increase" | "decrease"
  >("increase");
  const [adjustment, setAdjustment] = useState("");
  const [issuingOffice, setIssuingOffice] = useState<OfficeId | "">(
    initialIssuingOffice ?? ""
  );
  const [employeeOffice, setEmployeeOffice] = useState<OfficeId | "">(
    workspace.homeOffice ?? ""
  );
  const [walletMethod, setWalletMethod] = useState("");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const wallet = trpc.office.public.useQuery(undefined, {
    enabled: paymentMode === "wallet",
    retry: false,
    refetchOnWindowFocus: false,
  });
  const filteredAccounts = useMemo(() => {
    const needle = accountQuery.trim().toLocaleLowerCase();
    return accounts
      .filter(
        account =>
          !needle ||
          `${account.name} ${account.phone}`
            .toLocaleLowerCase()
            .includes(needle)
      )
      .slice(0, 12);
  }, [accounts, accountQuery]);
  const choices = useMemo(
    () =>
      searchableInvoiceGoods(shipments, goodsQuery, workspace.invoices).filter(
        item => !shipmentId || item.shipmentId === shipmentId
      ),
    [shipments, goodsQuery, workspace.invoices, shipmentId]
  );
  const selectedChoices = useMemo(
    () =>
      searchableInvoiceGoods(shipments, "", workspace.invoices).filter(
        item =>
          selectedGoods.includes(item.goodsId) && item.shipmentId === shipmentId
      ),
    [shipments, workspace.invoices, selectedGoods]
  );
  const parsedManual = Number(manualAmount);
  const parsedAdjustment = Number(adjustment);
  const selectedShipment = shipments.find(
    shipment => shipment.id === shipmentId
  );
  const calculation = useMemo(() => {
    if (
      !accountId ||
      (chargeKind === "shipping" && (!shipmentId || !selectedGoods.length))
    )
      return null;
    const input: FinanceInvoiceInput = {
      invoiceId: "preview",
      customerId: accountId,
      issuingOfficeId:
        issuingOffice || (workspace.offices?.[0] ?? "nouakchott"),
      ...(workspace.homeOffice || employeeOffice
        ? {
            employeeOfficeId: (workspace.homeOffice ||
              employeeOffice) as OfficeId,
          }
        : {}),
      chargeKind,
      paymentMode,
      currency,
      ...(shipmentId ? { shipmentId } : {}),
      goodsIds: chargeKind === "shipping" ? selectedGoods : [],
      ...(chargeKind === "general"
        ? { manualAmount: Number.isFinite(parsedManual) ? parsedManual : 0 }
        : {}),
      adjustment: {
        direction: adjustDirection,
        amount:
          Number.isFinite(parsedAdjustment) && parsedAdjustment >= 0
            ? parsedAdjustment
            : 0,
      },
      ...(paymentMode === "wallet" && walletMethod
        ? {
            payment: {
              office: "nouakchott",
              methodId: walletMethod,
              methodLabel:
                wallet.data?.methods.find(method => method.id === walletMethod)
                  ?.label ?? walletMethod,
              ...(reference.trim() ? { reference: reference.trim() } : {}),
            },
          }
        : {}),
    };
    try {
      return calculateFinanceInvoice(
        input,
        chargeKind === "shipping" ? selectedShipment : undefined
      );
    } catch {
      return null;
    }
  }, [
    accountId,
    chargeKind,
    shipmentId,
    selectedGoods,
    issuingOffice,
    employeeOffice,
    workspace.homeOffice,
    workspace.offices,
    paymentMode,
    currency,
    parsedManual,
    parsedAdjustment,
    adjustDirection,
    walletMethod,
    wallet.data,
    reference,
    selectedShipment,
  ]);
  const total = calculation
    ? calculation.totalAmount
    : chargeKind === "general" && Number.isFinite(parsedManual)
      ? adjustmentTotal(
          Math.max(0, parsedManual),
          adjustDirection,
          Math.max(0, Number.isFinite(parsedAdjustment) ? parsedAdjustment : 0)
        )
      : 0;
  const permittedOffices = workspace.offices ?? officeIds;

  const toggleGoods = (goodsId: string) => {
    setSelectedGoods(current =>
      current.includes(goodsId)
        ? current.filter(id => id !== goodsId)
        : [...current, goodsId]
    );
    setGoodsConfirmed(false);
  };
  const save = async () => {
    if (saving) return;
    setError("");
    setNotice("");
    if (!workspace.canEdit) return setError(c.noPermission);
    if (!accountId || (paymentMode === "on_account" && !accountId))
      return setError(c.accountRequired);
    if (!issuingOffice) return setError(c.officeRequired);
    if (!workspace.homeOffice && !employeeOffice)
      return setError(c.officeRequired);
    if (
      chargeKind === "shipping" &&
      (!shipmentId || !selectedGoods.length || !goodsConfirmed)
    )
      return setError(c.selectedGoodsRequired);
    if (paymentMode === "wallet" && !walletMethod)
      return setError(c.walletMethod);
    if (chargeKind === "general" && !manualAmount.trim())
      return setError(c.invalidTotal);
    if (!calculation || total < 0) return setError(c.invalidTotal);
    const id = uuid();
    const input: FinanceInvoiceInput = {
      invoiceId: `inv-${id}`.slice(0, 64),
      customerId: accountId,
      issuingOfficeId: issuingOffice,
      ...(workspace.homeOffice || employeeOffice
        ? {
            employeeOfficeId: (workspace.homeOffice ||
              employeeOffice) as OfficeId,
          }
        : {}),
      chargeKind,
      paymentMode,
      currency,
      ...(shipmentId ? { shipmentId } : {}),
      goodsIds: chargeKind === "shipping" ? selectedGoods : [],
      ...(chargeKind === "general"
        ? {
            manualAmount: Math.max(
              0,
              Number.isFinite(parsedManual) ? parsedManual : 0
            ),
          }
        : {}),
      adjustment: {
        direction: adjustDirection,
        amount: Math.max(
          0,
          Number.isFinite(parsedAdjustment) ? parsedAdjustment : 0
        ),
      },
      ...(paymentMode === "wallet"
        ? {
            payment: {
              office: "nouakchott",
              methodId: walletMethod,
              methodLabel:
                wallet.data?.methods.find(method => method.id === walletMethod)
                  ?.label ?? walletMethod,
              ...(reference.trim() ? { reference: reference.trim() } : {}),
            },
          }
        : {}),
    };
    const command: FinanceCommand = {
      id,
      createdAt: new Date().toISOString(),
      kind: "invoice",
      payload: input,
    };
    setSaving(true);
    try {
      const ok = await workspace.saveCommand(command);
      if (!ok) {
        setError(c.saveError);
        return;
      }
      setNotice(c.savedOffline);
      setSelectedGoods([]);
      setGoodsConfirmed(false);
      setManualAmount("");
      setAdjustment("");
      setReference("");
      onSaved?.();
    } catch {
      setError(c.saveError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      dir={dir}
      className="rounded-3xl border border-[#dce4e7] bg-white p-4 shadow-sm sm:p-6"
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-[#edf1f1] pb-4">
        <div>
          <h2 className="text-xl font-black text-[#092d50]">{c.newInvoice}</h2>
          <p className="mt-1 text-sm text-[#718088]">{c.currencyHelp}</p>
        </div>
        <span className="rounded-full bg-[#eef5f2] px-3 py-1 text-xs font-bold text-[#296049]">
          {c.draft}
        </span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <PackingField label={c.customer} required hint={c.searchCustomer}>
          <div className="relative">
            <Search
              className="absolute start-3 top-3.5 text-[#718088]"
              size={16}
            />
            <input
              className={`${inputClass} ps-9`}
              value={accountQuery}
              onChange={event => setAccountQuery(event.target.value)}
              placeholder={c.searchCustomer}
            />
          </div>
          <select
            className={inputClass}
            value={accountId}
            onChange={event => setAccountId(event.target.value)}
          >
            <option value="">{c.chooseAccount}</option>
            {filteredAccounts.map(account => (
              <option key={account.id} value={account.id}>
                {account.name} · {account.phone}
              </option>
            ))}
          </select>
          {accountQuery && !filteredAccounts.length && (
            <span className="text-xs text-red-700">{c.noCustomers}</span>
          )}
        </PackingField>
        <PackingField label={c.paymentMode} required>
          <select
            className={inputClass}
            value={paymentMode}
            onChange={event => {
              const mode = event.target
                .value as FinanceInvoiceInput["paymentMode"];
              setPaymentMode(mode);
              if (mode === "shipping_fee") setChargeKind("shipping");
            }}
          >
            {invoicePaymentOptions(c).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </PackingField>
        <PackingField label={c.chargeKind} required>
          <select
            className={inputClass}
            value={chargeKind}
            disabled={paymentMode === "shipping_fee"}
            onChange={event => {
              const kind = event.target
                .value as FinanceInvoiceInput["chargeKind"];
              setChargeKind(kind);
              if (kind === "general") {
                setShipmentId("");
                setSelectedGoods([]);
                setGoodsConfirmed(false);
              }
            }}
          >
            {
              <>
                <option value="shipping">{c.shipping}</option>
                <option value="general">{c.general}</option>
              </>
            }
          </select>
        </PackingField>
        <PackingField label={c.currency} required>
          <select
            className={inputClass}
            value={currency}
            onChange={event =>
              setCurrency(event.target.value as FinanceCurrency)
            }
          >
            {financeCurrencies.map(item => (
              <option
                key={item}
                value={item}
                disabled={
                  chargeKind === "shipping" &&
                  Boolean(selectedShipment) &&
                  !canBillShipmentCurrency(
                    workspace.role ?? "accountant",
                    workspace.offices,
                    selectedShipment!,
                    item
                  )
                }
              >
                {item}
              </option>
            ))}
          </select>
        </PackingField>
        {chargeKind === "shipping" ? (
          <>
            <PackingField label={c.shipment} required>
              <select
                className={inputClass}
                value={shipmentId}
                onChange={event => {
                  setShipmentId(event.target.value);
                  setSelectedGoods([]);
                  setGoodsConfirmed(false);
                }}
              >
                <option value="">{c.shipment}</option>
                {shipments
                  .filter(shipment => shipment.packing && !shipment.deleted)
                  .map(shipment => (
                    <option key={shipment.id} value={shipment.id}>
                      {shipment.tracking} · {shipment.account}
                    </option>
                  ))}
              </select>
            </PackingField>
            <PackingField label={c.searchGoods} hint={c.deletedOrBilled}>
              <div className="relative">
                <Search
                  className="absolute start-3 top-3.5 text-[#718088]"
                  size={16}
                />
                <input
                  className={`${inputClass} ps-9`}
                  value={goodsQuery}
                  onChange={event => setGoodsQuery(event.target.value)}
                  placeholder={c.searchGoods}
                />
              </div>
              <div className="mt-2 max-h-48 space-y-2 overflow-auto rounded-xl border border-[#edf1f1] p-2">
                {choices.length ? (
                  choices.map(goods => (
                    <label
                      key={goods.goodsId}
                      className="flex cursor-pointer items-start gap-2 rounded-lg p-2 hover:bg-[#f7f8f5]"
                    >
                      <input
                        type="checkbox"
                        className="mt-1 size-4 accent-[#2d6380]"
                        checked={selectedGoods.includes(goods.goodsId)}
                        onChange={() => toggleGoods(goods.goodsId)}
                      />
                      <span className="min-w-0 text-xs">
                        <b className="block text-[#092d50]">{goods.name}</b>
                        <span className="text-[#718088]">
                          {goods.weight} {c.weight} · {goods.pieces} {c.pieces}{" "}
                          · {goods.tracking}
                        </span>
                      </span>
                    </label>
                  ))
                ) : (
                  <span className="block p-3 text-xs text-[#718088]">
                    {c.noGoods}
                  </span>
                )}
              </div>
            </PackingField>
            <div className="lg:col-span-2 rounded-2xl bg-[#f7faf8] p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <b className="text-sm text-[#092d50]">{c.selectedGoods}</b>
                <span className="text-xs text-[#718088]">
                  {selectedChoices.length} {c.pieces}
                </span>
              </div>
              {selectedChoices.map(goods => (
                <div
                  key={goods.goodsId}
                  className="flex justify-between gap-3 border-t border-[#e3ece8] py-2 text-xs"
                >
                  <span>
                    {goods.name} · {goods.weight} {c.weight}
                  </span>
                  <span>
                    {goods.pieces} {c.pieces}
                  </span>
                </div>
              ))}
              <label className="mt-2 flex items-center gap-2 text-sm font-bold text-[#296049]">
                <input
                  type="checkbox"
                  checked={goodsConfirmed}
                  onChange={event => setGoodsConfirmed(event.target.checked)}
                  disabled={!selectedGoods.length}
                />
                <Check size={15} />
                {c.confirmGoods}
              </label>
            </div>
          </>
        ) : (
          <PackingField label={c.manualAmount} required hint={c.currencyHelp}>
            <input
              className={inputClass}
              type="number"
              min="0"
              step="0.01"
              value={manualAmount}
              onChange={event => setManualAmount(event.target.value)}
              placeholder="0.00"
            />
          </PackingField>
        )}
        <PackingField label={c.adjustment}>
          <div className="flex gap-2">
            <select
              className="min-h-11 rounded-xl border border-[#dce4e7] bg-white px-2 text-sm"
              value={adjustDirection}
              onChange={event =>
                setAdjustDirection(
                  event.target.value as "increase" | "decrease"
                )
              }
            >
              <option value="increase">{c.increase}</option>
              <option value="decrease">{c.decrease}</option>
            </select>
            <input
              className={inputClass}
              type="number"
              min="0"
              step="0.01"
              value={adjustment}
              onChange={event => setAdjustment(event.target.value)}
              placeholder="0.00"
            />
          </div>
        </PackingField>
        <div className="rounded-2xl border border-[#dce4e7] bg-[#fbfcfb] p-4">
          <span className="text-sm font-bold text-[#718088]">{c.total}</span>
          <strong className="mt-1 block text-2xl text-[#092d50]">
            {formatLocalNumber(total, language, 2)} {currency}
          </strong>
          {chargeKind === "shipping" && !calculation && selectedShipment && (
            <p className="mt-2 flex gap-1 text-xs font-bold text-amber-800">
              <CircleAlert size={14} />
              {c.rateMissing}
            </p>
          )}
        </div>
        <PackingField
          label={c.issuingOffice}
          required
          hint={initialIssuingOffice ? undefined : c.officeRequired}
        >
          <select
            className={inputClass}
            value={issuingOffice}
            onChange={event => setIssuingOffice(event.target.value as OfficeId)}
          >
            <option value="">{c.officeRequired}</option>
            {permittedOffices.map(office => (
              <option key={office} value={office}>
                {officeLabel(language, office)}
              </option>
            ))}
          </select>
        </PackingField>
        <PackingField
          label={workspace.homeOffice ? c.knownHomeOffice : c.employeeOffice}
          required={!workspace.homeOffice}
          hint={!workspace.homeOffice ? c.employeeOfficeHelp : undefined}
        >
          <select
            className={inputClass}
            value={workspace.homeOffice ?? employeeOffice}
            onChange={event =>
              setEmployeeOffice(event.target.value as OfficeId)
            }
            disabled={Boolean(workspace.homeOffice)}
          >
            <option value="">{c.officeRequired}</option>
            {permittedOffices.map(office => (
              <option key={office} value={office}>
                {officeLabel(language, office)}
              </option>
            ))}
          </select>
        </PackingField>
        {paymentMode === "wallet" && (
          <>
            <PackingField label={c.walletMethod} required>
              <select
                className={inputClass}
                value={walletMethod}
                onChange={event => setWalletMethod(event.target.value)}
              >
                <option value="">{c.walletMethod}</option>
                {(wallet.data?.methods ?? []).map(method => (
                  <option key={method.id} value={method.id}>
                    {method.label}
                  </option>
                ))}
              </select>
            </PackingField>
            <PackingField label={c.reference}>
              <input
                className={inputClass}
                value={reference}
                onChange={event => setReference(event.target.value)}
                placeholder={c.reference}
              />
            </PackingField>
          </>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800"
        >
          {notice}
        </p>
      )}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className={packingPrimaryClass}
          onClick={() => void save()}
          disabled={saving || !workspace.canEdit}
        >
          <Plus size={16} />
          {saving ? c.saving : c.saveDraft}
        </button>
      </div>
    </section>
  );
}
