import type { OfficeId, OfficeProfile } from "./branches";
import {
  shippingRateKeys,
  type PublicShippingRate,
  type ShippingRateKey,
} from "./publicShipping";

export const officeRateCurrencies = {
  dubai: "AED",
  turkey: "TRY",
  china: "CNY",
  nouakchott: "MRU",
} as const satisfies Record<OfficeId, PublicShippingRate["currency"]>;

export type OfficeRateViolation = {
  code: "office_rate_currency_required" | "office_rate_kg_required";
  service: ShippingRateKey;
  source?: "dubai" | "turkey" | "china";
  expectedCurrency: PublicShippingRate["currency"];
};

export function samePublishedRate(
  left: PublicShippingRate | null | undefined,
  right: PublicShippingRate | null | undefined
): boolean {
  if (!left || !right) return !left && !right;
  return (
    left.amount === right.amount &&
    left.currency === right.currency &&
    left.unit === right.unit
  );
}

/** Apply the new policy only to a changed announcement, never to historical reads. */
export function changedOfficeRateViolations(
  next: OfficeProfile,
  saved: OfficeProfile
): OfficeRateViolation[] {
  const violations: OfficeRateViolation[] = [];
  const check = (
    service: ShippingRateKey,
    rate: PublicShippingRate | null | undefined,
    previous: PublicShippingRate | null | undefined,
    expectedCurrency: PublicShippingRate["currency"],
    source?: "dubai" | "turkey" | "china"
  ) => {
    if (!rate || samePublishedRate(rate, previous)) return;
    if (rate.currency !== expectedCurrency)
      violations.push({
        code: "office_rate_currency_required",
        service,
        source,
        expectedCurrency,
      });
    if (rate.unit !== "kg")
      violations.push({
        code: "office_rate_kg_required",
        service,
        source,
        expectedCurrency,
      });
  };
  for (const service of shippingRateKeys)
    check(
      service,
      next.shippingRates?.[service],
      saved.shippingRates?.[service],
      officeRateCurrencies[next.officeId]
    );
  if (next.officeId === "nouakchott") {
    for (const source of ["dubai", "turkey", "china"] as const)
      for (const service of shippingRateKeys)
        check(
          service,
          next.sourceShippingRates?.[source][service],
          saved.sourceShippingRates?.[source][service],
          "MRU",
          source
        );
  }
  return violations;
}
