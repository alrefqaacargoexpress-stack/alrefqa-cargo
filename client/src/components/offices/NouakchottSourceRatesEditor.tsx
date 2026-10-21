import { useState } from "react";
import {
  nouakchottRateSources,
  type NouakchottRateSource,
  type NouakchottSourceRates,
} from "@shared/publicShipping";
import type { PublicShippingCopy } from "@/lib/publicShippingCopy";
import type { NouakchottRatesCopy } from "@/lib/nouakchottRatesCopy";
import PublicShippingRatesEditor, {
  shippingRateDraftsFrom,
  shippingRatesFromDrafts,
  type ShippingRateDrafts,
} from "@/components/offices/PublicShippingRatesEditor";

export type NouakchottSourceRateDrafts = Record<
  NouakchottRateSource,
  ShippingRateDrafts
>;

export function nouakchottSourceRateDraftsFrom(
  value: NouakchottSourceRates | undefined
): NouakchottSourceRateDrafts {
  return Object.fromEntries(
    nouakchottRateSources.map(source => [
      source,
      shippingRateDraftsFrom(value?.[source]),
    ])
  ) as NouakchottSourceRateDrafts;
}

export function nouakchottSourceRatesFromDrafts(
  value: NouakchottSourceRateDrafts
): NouakchottSourceRates {
  return Object.fromEntries(
    nouakchottRateSources.map(source => [
      source,
      shippingRatesFromDrafts(value[source]),
    ])
  ) as NouakchottSourceRates;
}

// Short aliases keep the source-specific conversion utilities convenient for callers/tests.
export const sourceRateDraftsFrom = nouakchottSourceRateDraftsFrom;
export const sourceRatesFromDrafts = nouakchottSourceRatesFromDrafts;

export default function NouakchottSourceRatesEditor({
  value,
  shippingCopy,
  copy,
  disabled,
  onChange,
}: {
  value: NouakchottSourceRateDrafts;
  shippingCopy: PublicShippingCopy;
  copy: NouakchottRatesCopy;
  disabled?: boolean;
  onChange: (value: NouakchottSourceRateDrafts) => void;
}) {
  const [source, setSource] = useState<NouakchottRateSource>("dubai");
  const rates = value[source];

  return (
    <div className="mt-5 rounded-2xl border border-[#dce8e4] bg-[#f7fbfa] p-4">
      <h3 className="font-black text-[#092d50]">{copy.sectionTitle}</h3>
      <p className="mt-1 text-xs text-[#718088]">{copy.sectionHint}</p>
      <div className="mt-4">
        <label className="grid gap-2 text-sm font-semibold text-[#243f52]">
          <span>{copy.source}</span>
          <select
            aria-label={copy.sourceAriaLabel}
            className="min-h-11 rounded-xl border border-[#d7e1e3] bg-white px-3 py-2 text-sm outline-none focus:border-[#2e6280]"
            value={source}
            disabled={disabled}
            onChange={event =>
              setSource(event.target.value as NouakchottRateSource)
            }
          >
            {nouakchottRateSources.map(item => (
              <option key={item} value={item}>
                {copy.sourceLabels[item]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <PublicShippingRatesEditor
        value={rates}
        copy={shippingCopy}
        fixedCurrency="MRU"
        ariaLabelPrefix={copy.sourceLabels[source]}
        disabled={disabled}
        onChange={next => onChange({ ...value, [source]: next })}
      />
    </div>
  );
}
