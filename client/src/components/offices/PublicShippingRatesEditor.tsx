import type {
  PublicShippingRate,
  ShippingRateKey,
} from "@shared/publicShipping";
import type { OfficeId } from "@shared/branches";
import { shippingRateKeys } from "@shared/publicShipping";
import type { PublicShippingCopy } from "@/lib/publicShippingCopy";
import {
  PackingField,
  packingInputClass,
} from "@/components/packing/PackingPrimitives";

export type ShippingRateDraft = {
  amount: string;
  currency: PublicShippingRate["currency"];
  unit: PublicShippingRate["unit"];
};

export type ShippingRateDrafts = Record<ShippingRateKey, ShippingRateDraft>;

const currencies: PublicShippingRate["currency"][] = [
  "MRU",
  "AED",
  "CNY",
  "TRY",
  "USD",
  "EUR",
];
const units: PublicShippingRate["unit"][] = ["kg", "m3", "shipment"];

export function fallbackCurrencyForOffice(
  officeId?: OfficeId
): PublicShippingRate["currency"] {
  return officeId === "dubai"
    ? "AED"
    : officeId === "china"
      ? "CNY"
      : officeId === "turkey"
        ? "TRY"
        : "MRU";
}

const fallbackDraft = (officeId?: OfficeId): ShippingRateDraft => ({
  amount: "",
  currency: fallbackCurrencyForOffice(officeId),
  unit: "kg",
});

export function shippingRateDraftsFrom(
  value: PublicShippingRateMap | undefined,
  officeId?: OfficeId
): ShippingRateDrafts {
  return Object.fromEntries(
    shippingRateKeys.map(key => {
      const rate = value?.[key];
      return [
        key,
        rate
          ? {
              amount: String(rate.amount),
              currency: rate.currency,
              unit: rate.unit,
            }
          : fallbackDraft(officeId),
      ];
    })
  ) as ShippingRateDrafts;
}

type PublicShippingRateMap = Record<ShippingRateKey, PublicShippingRate | null>;

export function shippingRatesFromDrafts(
  value: ShippingRateDrafts
): PublicShippingRateMap {
  return Object.fromEntries(
    shippingRateKeys.map(key => {
      const draft = value[key];
      const amount = draft.amount.trim();
      return [
        key,
        amount === ""
          ? null
          : {
              amount: Number(amount),
              currency: draft.currency,
              unit: draft.unit,
            },
      ];
    })
  ) as PublicShippingRateMap;
}

export default function PublicShippingRatesEditor({
  value,
  copy,
  officeId,
  fixedCurrency,
  requiredUnit,
  ariaLabelPrefix,
  disabled,
  onChange,
}: {
  value: ShippingRateDrafts;
  copy: PublicShippingCopy;
  officeId?: OfficeId;
  /** Required currency for newly published or explicitly adopted rates. */
  fixedCurrency?: PublicShippingRate["currency"];
  /** Required unit for newly published or explicitly adopted rates. */
  requiredUnit?: PublicShippingRate["unit"];
  ariaLabelPrefix?: string;
  disabled?: boolean;
  onChange: (value: ShippingRateDrafts) => void;
}) {
  const policyUnit = fixedCurrency ? (requiredUnit ?? "kg") : requiredUnit;

  return (
    <div className="mt-5 rounded-2xl border border-[#edf1f1] bg-[#fbfcfb] p-4">
      <h3 className="font-black text-[#092d50]">{copy.ratesTitle}</h3>
      <p className="mt-1 text-xs text-[#718088]">{copy.ratesHint}</p>
      <div className="mt-4 grid gap-3">
        {shippingRateKeys.map(key => {
          const rate = value[key];
          const hasAmount = rate.amount.trim() !== "";
          const legacy = Boolean(
            hasAmount &&
              fixedCurrency &&
              (rate.currency !== fixedCurrency ||
                (policyUnit && rate.unit !== policyUnit))
          );
          const fieldLabel = ariaLabelPrefix
            ? `${ariaLabelPrefix} ${copy.serviceLabels[key]}`
            : undefined;
          const currencyOptions = legacy
            ? [rate.currency]
            : fixedCurrency
              ? [fixedCurrency]
              : currencies;
          const unitOptions = legacy
            ? [rate.unit]
            : policyUnit
              ? [policyUnit]
              : units;
          const adoptLegacyRate = () => {
            if (disabled || !fixedCurrency || !policyUnit) return;
            onChange({
              ...value,
              [key]: {
                ...rate,
                currency: fixedCurrency,
                unit: policyUnit,
              },
            });
          };
          return (
            <div
              key={key}
              className="rounded-xl border border-[#e5ecee] bg-white p-3"
            >
              <div className="grid gap-3 md:grid-cols-[1.3fr_1fr_1fr] md:items-end">
                <PackingField label={copy.serviceLabels[key]}>
                  <input
                    className={packingInputClass}
                    type="number"
                    min="0"
                    max="999999999"
                    step="0.01"
                    inputMode="decimal"
                    placeholder={copy.amountPlaceholder}
                    aria-label={
                      fieldLabel ? `${fieldLabel} ${copy.amount}` : undefined
                    }
                    value={rate.amount}
                    disabled={disabled || legacy}
                    onChange={event => {
                      if (disabled || legacy) return;
                      onChange({
                        ...value,
                        [key]: {
                          ...rate,
                          amount: event.target.value,
                        },
                      });
                    }}
                  />
                </PackingField>
                <PackingField label={copy.currency}>
                  <select
                    aria-label={
                      fieldLabel ? `${fieldLabel} ${copy.currency}` : undefined
                    }
                    className={packingInputClass}
                    value={rate.currency}
                    disabled={disabled || Boolean(fixedCurrency) || legacy}
                    onChange={event =>
                      onChange({
                        ...value,
                        [key]: {
                          ...rate,
                          currency: event.target
                            .value as ShippingRateDraft["currency"],
                        },
                      })
                    }
                  >
                    {currencyOptions.map(currency => (
                      <option key={currency} value={currency}>
                        {copy.currencies[currency] ?? currency}
                      </option>
                    ))}
                  </select>
                </PackingField>
                <PackingField label={copy.unit}>
                  <select
                    aria-label={
                      fieldLabel ? `${fieldLabel} ${copy.unit}` : undefined
                    }
                    className={packingInputClass}
                    value={rate.unit}
                    disabled={disabled || Boolean(policyUnit) || legacy}
                    onChange={event =>
                      onChange({
                        ...value,
                        [key]: {
                          ...rate,
                          unit: event.target.value as ShippingRateDraft["unit"],
                        },
                      })
                    }
                  >
                    {unitOptions.map(unit => (
                      <option key={unit} value={unit}>
                        {copy.units[unit]}
                      </option>
                    ))}
                  </select>
                </PackingField>
              </div>
              {legacy && fixedCurrency && policyUnit && (
                <div
                  role="alert"
                  className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950"
                >
                  <p>{copy.legacyRateWarning}</p>
                  <p className="mt-1 font-bold" dir="ltr">
                    {copy.adoptRatePreview}: {rate.amount}{" "}
                    {copy.currencies[rate.currency] ?? rate.currency}{" "}
                    {copy.units[rate.unit]} → {rate.amount}{" "}
                    {copy.currencies[fixedCurrency] ?? fixedCurrency}{" "}
                    {copy.units[policyUnit]}
                  </p>
                  <button
                    type="button"
                    className="mt-2 rounded-lg border border-amber-300 bg-white px-3 py-2 font-bold text-amber-900 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={disabled}
                    onClick={adoptLegacyRate}
                  >
                    {copy.adoptRate}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
