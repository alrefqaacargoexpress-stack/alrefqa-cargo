import { describe, expect, it } from "vitest";
import { defaultOfficeProfile } from "./branches";
import {
  emptyPublicShippingRates,
  emptyNouakchottSourceRates,
} from "./publicShipping";
import {
  changedOfficeRateViolations,
  officeRateCurrencies,
} from "./officeRatePolicy";

describe("Office publication currency and unit policy", () => {
  for (const officeId of ["dubai", "turkey", "china", "nouakchott"] as const) {
    it(`accepts a new kilogram rate only in ${officeId}'s currency`, () => {
      const saved = defaultOfficeProfile(officeId);
      const next = {
        ...saved,
        shippingRates: {
          ...emptyPublicShippingRates(),
          airRegular: {
            amount: 37,
            currency: officeRateCurrencies[officeId],
            unit: "kg" as const,
          },
        },
      };
      expect(changedOfficeRateViolations(next, saved)).toEqual([]);
      next.shippingRates.airRegular.currency = (
        officeId === "nouakchott" ? "AED" : "MRU"
      ) as typeof next.shippingRates.airRegular.currency;
      expect(changedOfficeRateViolations(next, saved)).toEqual([
        expect.objectContaining({ code: "office_rate_currency_required" }),
      ]);
    });
  }
  it("preserves a legacy wrong currency and cubic rate on an address-only edit", () => {
    const saved = {
      ...defaultOfficeProfile("dubai"),
      shippingRates: {
        ...emptyPublicShippingRates(),
        sea: { amount: 500, currency: "MRU" as const, unit: "m3" as const },
      },
    };
    const next = {
      ...saved,
      address: "New address",
      shippingRates: {
        ...saved.shippingRates,
        sea: { unit: "m3" as const, currency: "MRU" as const, amount: 500 },
      },
    };
    expect(changedOfficeRateViolations(next, saved)).toEqual([]);
    expect(saved.shippingRates.sea).toEqual({
      amount: 500,
      currency: "MRU",
      unit: "m3",
    });
  });
  it("rejects editing a legacy rate unless its currency and unit are explicitly corrected", () => {
    const saved = {
      ...defaultOfficeProfile("dubai"),
      shippingRates: {
        ...emptyPublicShippingRates(),
        sea: { amount: 500, currency: "MRU" as const, unit: "m3" as const },
      },
    };
    const wrong = {
      ...saved,
      shippingRates: {
        ...saved.shippingRates,
        sea: { ...saved.shippingRates.sea, amount: 550 },
      },
    };
    expect(changedOfficeRateViolations(wrong, saved).map(v => v.code)).toEqual([
      "office_rate_currency_required",
      "office_rate_kg_required",
    ]);
    const corrected = {
      ...wrong,
      shippingRates: {
        ...wrong.shippingRates,
        sea: { amount: 550, currency: "AED" as const, unit: "kg" as const },
      },
    };
    expect(changedOfficeRateViolations(corrected, saved)).toEqual([]);
  });
  it("leaves unchanged Nouakchott source rates alone and keeps new rates MRU/kg", () => {
    const sourceShippingRates = emptyNouakchottSourceRates();
    sourceShippingRates.china.sea = {
      amount: 1200,
      currency: "MRU",
      unit: "m3",
    };
    const saved = {
      ...defaultOfficeProfile("nouakchott"),
      sourceShippingRates,
    };
    expect(
      changedOfficeRateViolations({ ...saved, phone: "+22212345678" }, saved)
    ).toEqual([]);
    const next = structuredClone(saved);
    next.sourceShippingRates.china.sea!.amount = 1300;
    expect(changedOfficeRateViolations(next, saved)).toEqual([
      expect.objectContaining({
        code: "office_rate_kg_required",
        source: "china",
      }),
    ]);
    next.sourceShippingRates.china.sea!.unit = "kg";
    expect(changedOfficeRateViolations(next, saved)).toEqual([]);
  });
  it("does not recreate rates that were absent from the old profile", () => {
    const saved = defaultOfficeProfile("turkey");
    expect(
      changedOfficeRateViolations(
        { ...saved, address: "Office address" },
        saved
      )
    ).toEqual([]);
  });
});
