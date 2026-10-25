import { isSharedCustomerAccount } from "@shared/customerAccountCreation";
import { canBillShipmentCurrency } from "@shared/officeFinanceVisibility";
import { useEffect, useMemo, useState } from "react";
import { Check, CircleAlert, Plus, Search } from "lucide-react";
import { Link } from "wouter";
import {
  calculateFinanceInvoice,
  type FinanceCommand,
  type FinanceInvoiceInput,
} from "@shared/finance";
import { financeCurrencies, type FinanceCurrency } from "@shared/finance";
import { officeNames, officeIds, type OfficeId } from "@shared/branches";
import { sourceCurrency } from "@shared/packing";
import {
  shipmentPricingTarget,
  type PriceProjection,
} from "@shared/shipmentPricing";
import type { Account, Invoice, Shipment } from "@shared/operations";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  invoiceCopyFor,
  invoicePaymentOptions,
  searchableInvoiceGoods,
  adjustmentTotal,
  canWriteFinanceUi,
  invoiceGoodsTotals,
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
  commands?: FinanceCommand[];
  pricingProjections?: readonly PriceProjection[];
  homeOffice: OfficeId | null;
  offices: OfficeId[] | null;
  canEdit: boolean;
  role?: import("@shared/operations").AppRole | null;
  permissions?: import("@shared/permissions").PermissionMap | null;
  online: boolean;
  saveCommand: (command: FinanceCommand) => Promise<boolean>;
  syncCommands?: (commandIds: string[]) => Promise<unknown>;
  settingsForOffice?: (
    officeId: OfficeId
  ) => import("@shared/office").OfficeSettings | undefined;
};

type Props = {
  workspace: Workspace;
  initialIssuingOffice?: OfficeId;
  initialCustomerId?: string;
  onSaved?: () => void;
};
const inputClass =
  "w-full min-h-11 rounded-xl border border-[#dce4e7] bg-white px-3 py-2 text-sm text-[#092d50] outline-none focus:border-[#2d6380] focus:ring-4 focus:ring-[#2d6380]/10";
const officeLabel = (language: "ar" | "en" | "zh" | "tr", office: OfficeId) =>
  officeNames[language][office];

export const invoiceOfficeCurrency = (office: OfficeId): FinanceCurrency =>
  office === "nouakchott" ? "MRU" : (sourceCurrency[office] as FinanceCurrency);

export function invoiceProjectionForCurrency(
  shipment: Pick<Shipment, "id" | "packing"> | undefined,
  currency: string,
  projections: readonly PriceProjection[]
): PriceProjection | null {
  if (!shipment?.packing) return null;
  const side = currency === "MRU" ? "destination" : "source";
  const target = shipmentPricingTarget(shipment, side);
  return (
    projections.find(
      projection =>
        projection.shipmentId === shipment.id &&
        projection.side === side &&
        projection.officeId === target.officeId &&
        projection.currency === target.currency
    ) ?? null
  );
}

function uuid() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export default function InvoiceFinancialForm({
  workspace,
  initialIssuingOffice,
  initialCustomerId,
  onSaved,
}: Props) {
  const { language, dir } = useLanguage();
  const c = invoiceCopyFor(language);
  const accounts = workspace.base.state.accounts;
  const shipments = workspace.base.state.shipments;
  const homeOffice = workspace.homeOffice;
  const canChooseOffice =
    workspace.role === "admin" && workspace.offices === null;
  const [rootOffice, setRootOffice] = useState<OfficeId>(
    initialIssuingOffice ?? homeOffice ?? officeIds[0]
  );
  const issuingOffice = canChooseOffice
    ? rootOffice
    : (homeOffice ??
      (workspace.offices?.length === 1 ? workspace.offices[0] : undefined));
  const canWrite =
    canWriteFinanceUi(
      workspace.role,
      workspace.offices,
      issuingOffice,
      workspace.permissions
    ) && workspace.canEdit;
  const [accountQuery, setAccountQuery] = useState("");
  const [accountId, setAccountId] = useState("");
  const [paymentMode, setPaymentMode] =
    useState<FinanceInvoiceInput["paymentMode"]>("cash");
  const [chargeKind, setChargeKind] =
    useState<FinanceInvoiceInput["chargeKind"]>("shipping");
  const [shipmentId, setShipmentId] = useState("");
  const [goodsQuery, setGoodsQuery] = useState("");
  const [selectedGoods, setSelectedGoods] = useState<string[]>([]);
  const [goodsConfirmed, setGoodsConfirmed] = useState(false);
  const [currency, setCurrency] = useState<FinanceCurrency>(
    issuingOffice ? invoiceOfficeCurrency(issuingOffice) : "MRU"
  );
  const [manualAmount, setManualAmount] = useState("");
  const [adjustDirection, setAdjustDirection] = useState<
    "increase" | "decrease"
  >("increase");
  const [adjustment, setAdjustment] = useState("");
  const issuingOfficeId = issuingOffice ?? "";
  const [walletMethod, setWalletMethod] = useState("");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!initialCustomerId) return;
    const account = accounts.find(item => item.id === initialCustomerId);
    if (account && account.officeId === issuingOfficeId) {
      setAccountId(account.id);
      setAccountQuery(account.name);
    } else {
      setAccountId("");
    }
  }, [accounts, initialCustomerId, issuingOfficeId]);

  const wallet = trpc.office.get.useQuery(
    issuingOfficeId ? { officeId: issuingOfficeId as OfficeId } : undefined,
    {
      enabled: Boolean(
        workspace.online && workspace.base.userId && issuingOfficeId
      ),
      retry: false,
      refetchOnWindowFocus: false,
    }
  );
  const effectiveSettings =
    wallet.data ?? workspace.settingsForOffice?.(issuingOfficeId as OfficeId);
  const walletMethods = (effectiveSettings?.methods ?? []).filter(
    method => method.id !== "cash" && method.enabled
  );
  const paymentOptions = invoicePaymentOptions(c).filter(
    ([value]) => value !== "wallet" || walletMethods.length > 0
  );
  const filteredAccounts = useMemo(() => {
    const needle = accountQuery.trim().toLocaleLowerCase();
    return accounts
      .filter(
        account =>
          account.officeId === issuingOfficeId &&
          (!needle ||
            `${account.name} ${account.phone}`
              .toLocaleLowerCase()
              .includes(needle))
      )
      .slice(0, 12);
  }, [accounts, accountQuery, issuingOfficeId]);
  const choices = useMemo(
    () =>
      searchableInvoiceGoods(shipments, goodsQuery, workspace.invoices).filter(
        item =>
          (item.officeId ??
            shipments.find(shipment => shipment.id === item.shipmentId)?.packing
              ?.source) === issuingOfficeId &&
          (!shipmentId || item.shipmentId === shipmentId)
      ),
    [shipments, goodsQuery, workspace.invoices, shipmentId, issuingOfficeId]
  );
  const selectedChoices = useMemo(
    () =>
      searchableInvoiceGoods(shipments, "", workspace.invoices).filter(
        item =>
          selectedGoods.includes(item.goodsId) &&
          item.shipmentId === shipmentId &&
          (item.officeId ??
            shipments.find(shipment => shipment.id === item.shipmentId)?.packing
              ?.source) === issuingOfficeId
      ),
    [shipments, workspace.invoices, selectedGoods, shipmentId, issuingOfficeId]
  );
  const parsedManual = Number(manualAmount);
  const parsedAdjustment = Number(adjustment);
  const selectedShipment = shipments.find(
    shipment =>
      shipment.id === shipmentId &&
      (shipment.officeId ?? shipment.packing?.source) === issuingOfficeId
  );
  const pricingProjection = useMemo(() => {
    if (chargeKind !== "shipping") return null;
    return invoiceProjectionForCurrency(
      selectedShipment,
      currency,
      workspace.pricingProjections ?? []
    );
  }, [chargeKind, currency, selectedShipment, workspace.pricingProjections]);
  const pendingPricingCommand = useMemo(
    () =>
      Boolean(
        selectedShipment &&
          chargeKind === "shipping" &&
          workspace.commands?.some(
            command =>
              command.kind === "shipment_price" &&
              command.payload.shipmentId === selectedShipment.id
          )
      ),
    [chargeKind, selectedShipment, workspace.commands]
  );
  const calculation = useMemo(() => {
    if (
      !accountId ||
      (chargeKind === "shipping" && (!shipmentId || !selectedGoods.length))
    )
      return null;
    if (pendingPricingCommand) return null;
    const input: FinanceInvoiceInput = {
      invoiceId: "preview",
      customerId: accountId,
      issuingOfficeId: issuingOfficeId as OfficeId,
      employeeOfficeId: issuingOfficeId as OfficeId,
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
      ...(paymentMode === "wallet" && issuingOfficeId && walletMethod
        ? {
            payment: {
              office: issuingOfficeId as OfficeId,
              methodId: walletMethod,
              methodLabel:
                effectiveSettings?.methods.find(
                  method => method.id === walletMethod
                )?.label ?? walletMethod,
              ...(reference.trim() ? { reference: reference.trim() } : {}),
            },
          }
        : {}),
    };
    try {
      return calculateFinanceInvoice(
        input,
        chargeKind === "shipping" ? selectedShipment : undefined,
        chargeKind === "shipping" ? pricingProjection : undefined
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
    issuingOfficeId,
    homeOffice,
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
    pendingPricingCommand,
    pricingProjection,
  ]);
  const goodsTotals = invoiceGoodsTotals(selectedChoices);
  const total = calculation
    ? calculation.totalAmount
    : chargeKind === "general" && Number.isFinite(parsedManual)
      ? adjustmentTotal(
          Math.max(0, parsedManual),
          adjustDirection,
          Math.max(0, Number.isFinite(parsedAdjustment) ? parsedAdjustment : 0)
        )
      : 0;

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
    if (!canWrite) return setError(c.noPermission);
    const selectedAccount = accounts.find(account => account.id === accountId);
    if (
      !selectedAccount ||
      selectedAccount.officeId !== issuingOfficeId ||
      (paymentMode === "on_account" && !accountId)
    )
      return setError(c.accountRequired);
    if (
      !isSharedCustomerAccount(
        workspace.base.state.accounts.find(account => account.id === accountId)
      )
    )
      return setError(
        {
          ar: "شارك حساب العميل مع المكتب أولاً قبل إصدار الفاتورة.",
          en: "Share this customer account with the office before issuing an invoice.",
          zh: "开票前请先将客户账户共享至办公室。",
          tr: "Fatura kesmeden önce müşteri hesabını ofisle paylaşın.",
        }[language]
      );
    if (!issuingOfficeId) return setError(c.officeRequired);
    if (pendingPricingCommand) return setError(c.pricingPending);
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
      issuingOfficeId: issuingOfficeId as OfficeId,
      employeeOfficeId: issuingOfficeId as OfficeId,
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
              office: issuingOfficeId as OfficeId,
              methodId: walletMethod,
              methodLabel:
                effectiveSettings?.methods.find(
                  method => method.id === walletMethod
                )?.label ?? walletMethod,
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
      <ol className="mb-5 grid gap-2 sm:grid-cols-3" aria-label={c.newInvoice}>
        {[c.stageCustomer, c.stageDetails, c.stagePayment].map(
          (label, index) => (
            <li
              key={label}
              className="flex items-center gap-2 rounded-xl border border-[#dce4e7] bg-[#f7faf8] px-3 py-2 text-xs font-bold text-[#23445d]"
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#092d50] text-white">
                {index + 1}
              </span>
              {label}
            </li>
          )
        )}
      </ol>
      <div className="grid gap-4 lg:grid-cols-2">
        <PackingField label={c.office} required>
          <select
            className={inputClass}
            value={issuingOfficeId}
            disabled={!canChooseOffice || saving}
            onChange={event => {
              const next = event.target.value as OfficeId;
              if (!canChooseOffice || !officeIds.includes(next)) return;
              if (
                (accountId || selectedGoods.length || manualAmount) &&
                !window.confirm(
                  `${c.officeRequired}: ${officeLabel(language, next)}?`
                )
              )
                return;
              setRootOffice(next);
              setAccountId("");
              setAccountQuery("");
              setShipmentId("");
              setSelectedGoods([]);
              setGoodsConfirmed(false);
              setManualAmount("");
              setWalletMethod("");
              setReference("");
              setPaymentMode("cash");
              setCurrency(invoiceOfficeCurrency(next));
            }}
          >
            {(canChooseOffice
              ? officeIds
              : issuingOffice
                ? [issuingOffice]
                : []
            ).map(office => (
              <option key={office} value={office}>
                {officeLabel(language, office)}
              </option>
            ))}
          </select>
        </PackingField>
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
          <div className="flex flex-wrap gap-2 text-xs font-bold">
            <Link
              className="text-[#2d6380] underline"
              href="/operations/customers?new=1"
            >
              {c.newCustomer}
            </Link>
            {accountId && (
              <Link
                className="text-[#2d6380] underline"
                href={`/operations/customers/${encodeURIComponent(accountId)}`}
              >
                {c.openCustomer}
              </Link>
            )}
          </div>
        </PackingField>
        <PackingField
          label={c.paymentMode}
          required
          hint={
            homeOffice && homeOffice !== "nouakchott"
              ? c.walletNouakchottOnly
              : undefined
          }
        >
          <select
            className={inputClass}
            value={paymentMode}
            onChange={event => {
              const mode = event.target
                .value as FinanceInvoiceInput["paymentMode"];
              setPaymentMode(mode);
            }}
          >
            {paymentOptions.map(([value, label]) => (
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
                  .filter(
                    shipment =>
                      shipment.packing &&
                      !shipment.deleted &&
                      (shipment.officeId ?? shipment.packing.source) ===
                        issuingOfficeId
                  )
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
                  {goodsTotals.weight} {c.weight} · {goodsTotals.pieces}{" "}
                  {c.pieces}
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
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <span>
              <b className="block text-xs text-[#718088]">{c.baseAmount}</b>
              {formatLocalNumber(
                calculation?.baseAmount ??
                  (chargeKind === "general"
                    ? Math.max(0, parsedManual || 0)
                    : 0),
                language,
                2
              )}{" "}
              {currency}
            </span>
            <span>
              <b className="block text-xs text-[#718088]">{c.adjustment}</b>
              {adjustDirection === "increase" ? "+" : "−"}
              {formatLocalNumber(
                Number.isFinite(parsedAdjustment) ? parsedAdjustment : 0,
                language,
                2
              )}{" "}
              {currency}
            </span>
            <span>
              <b className="block text-xs text-[#718088]">{c.total}</b>
              <strong className="block text-xl text-[#092d50]">
                {formatLocalNumber(total, language, 2)} {currency}
              </strong>
            </span>
          </div>
          {chargeKind === "shipping" && pendingPricingCommand && (
            <p className="mt-2 flex gap-1 text-xs font-bold text-amber-800">
              <CircleAlert size={14} />
              {c.pricingPending}
            </p>
          )}
          {chargeKind === "shipping" &&
            !pendingPricingCommand &&
            !calculation &&
            selectedShipment && (
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
          <div
            className={`${inputClass} flex items-center justify-between`}
            aria-readonly="true"
          >
            <span>
              {issuingOffice
                ? officeLabel(language, issuingOffice)
                : c.officeRequired}
            </span>
            <span className="text-xs text-[#718088]">{c.officeReadOnly}</span>
          </div>
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
                {walletMethods.map(method => (
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
          disabled={saving || !canWrite || pendingPricingCommand}
        >
          <Plus size={16} />
          {saving ? c.saving : c.saveDraft}
        </button>
      </div>
    </section>
  );
}
