import type {
  PublicShippingRate,
  ShippingRateKey,
} from "@shared/publicShipping";
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
const fallbackDraft = (): ShippingRateDraft => ({
  amount: "",
  currency: "MRU",
  unit: "kg",
});

export function shippingRateDraftsFrom(
  value: PublicShippingRateMap | undefined
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
          : fallbackDraft(),
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
  disabled,
  onChange,
}: {
  value: ShippingRateDrafts;
  copy: PublicShippingCopy;
  disabled?: boolean;
  onChange: (value: ShippingRateDrafts) => void;
}) {
  return (
    <div className="mt-5 rounded-2xl border border-[#edf1f1] bg-[#fbfcfb] p-4">
      <h3 className="font-black text-[#092d50]">{copy.ratesTitle}</h3>
      <p className="mt-1 text-xs text-[#718088]">{copy.ratesHint}</p>
      <div className="mt-4 grid gap-3">
        {shippingRateKeys.map(key => {
          const rate = value[key];
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
                    value={rate.amount}
                    disabled={disabled}
                    onChange={event =>
                      onChange({
                        ...value,
                        [key]: { ...rate, amount: event.target.value },
                      })
                    }
                  />
                </PackingField>
                <PackingField label={copy.currency}>
                  <select
                    className={packingInputClass}
                    value={rate.currency}
                    disabled={disabled}
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
                    {currencies.map(currency => (
                      <option key={currency} value={currency}>
                        {copy.currencies[currency]}
                      </option>
                    ))}
                  </select>
                </PackingField>
                <PackingField label={copy.unit}>
                  <select
                    className={packingInputClass}
                    value={rate.unit}
                    disabled={disabled}
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
                    {units.map(unit => (
                      <option key={unit} value={unit}>
                        {copy.units[unit]}
                      </option>
                    ))}
                  </select>
                </PackingField>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
