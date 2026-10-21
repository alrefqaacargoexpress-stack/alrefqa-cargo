import { describe, expect, it } from "vitest";
import {
  defaultOfficeProfile,
  officeProfileSchema,
  officeProfileUpdateSchema,
  type OfficeProfile,
} from "./branches";
import {
  emptyNouakchottSourceRates,
  emptyPublicShippingRates,
  nouakchottSourceRatesSchema,
} from "./publicShipping";
import { mergeOfficeProfile, sameOfficeProfile } from "./officeProfileMerge";
const rate = (amount: number) => ({
  amount,
  currency: "MRU" as const,
  unit: "kg" as const,
});
function profile(
  office: "nouakchott" | "dubai" | "turkey" | "china" = "nouakchott"
): OfficeProfile {
  const { version: _version, ...data } = defaultOfficeProfile(office);
  return data;
}
describe("Nouakchott source-specific MRU tariffs", () => {
  it("starts empty without copying any existing tariffs or creating zero prices", () => {
    const x = profile();
    x.shippingRates = {
      ...emptyPublicShippingRates(),
      airRegular: { amount: 5, currency: "AED", unit: "kg" },
    };
    const desired = { ...x, sourceShippingRates: emptyNouakchottSourceRates() };
    expect(sameOfficeProfile(x, desired)).toBe(true);
    expect(
      mergeOfficeProfile(x, desired, x).sourceShippingRates
    ).toBeUndefined();
    expect(mergeOfficeProfile(x, desired, x).shippingRates).toEqual(
      x.shippingRates
    );
  });
  it("accepts different MRU prices for Dubai, Turkey and China and preserves their units", () => {
    const sourceShippingRates = emptyNouakchottSourceRates();
    sourceShippingRates.dubai.airRegular = rate(400);
    sourceShippingRates.turkey.airExpress = rate(600);
    sourceShippingRates.china.sea = { ...rate(1200), unit: "m3" };
    const parsed = officeProfileUpdateSchema.parse({
      ...profile(),
      sourceShippingRates,
      expectedVersion: 0,
    });
    expect(parsed.sourceShippingRates).toEqual(sourceShippingRates);
    expect(sourceShippingRates.dubai.sea).toBeNull();
  });
  it("rejects a source-specific price in AED/CNY/TRY and invalid decimals", () => {
    for (const currency of ["AED", "CNY", "TRY"]) {
      const rates = emptyNouakchottSourceRates();
      expect(
        nouakchottSourceRatesSchema.safeParse({
          ...rates,
          dubai: { ...rates.dubai, airRegular: { ...rate(5), currency } },
        }).success
      ).toBe(false);
    }
    for (const amount of [-1, Infinity, NaN, 1.001]) {
      const rates = emptyNouakchottSourceRates();
      rates.china.airRegular = rate(amount);
      expect(nouakchottSourceRatesSchema.safeParse(rates).success).toBe(false);
    }
  });
  it("does not add the source field to the other three offices or reinterpret their currencies", () => {
    for (const office of ["dubai", "turkey", "china"] as const) {
      const old = {
        ...profile(office),
        shippingRates: {
          ...emptyPublicShippingRates(),
          airRegular: {
            amount: 7,
            currency: "AED" as const,
            unit: "kg" as const,
          },
        },
      };
      expect(officeProfileSchema.parse(old)).toEqual(old);
      expect(
        officeProfileSchema.safeParse({
          ...old,
          sourceShippingRates: emptyNouakchottSourceRates(),
        }).success
      ).toBe(false);
      const edited = { ...old, address: "User changed only address" };
      const merged = mergeOfficeProfile(old, edited, old);
      expect(merged.shippingRates).toEqual(old.shippingRates);
      expect(merged.sourceShippingRates).toBeUndefined();
    }
  });
  it("merges changes to different sources/services without losing the existing public price or profile fields", () => {
    const base = {
      ...profile(),
      shippingRates: { ...emptyPublicShippingRates(), sensitive: rate(800) },
      sourceShippingRates: emptyNouakchottSourceRates(),
    };
    const current = structuredClone(base);
    current.sourceShippingRates.china.sea = { ...rate(1300), unit: "m3" };
    current.phone = "+22212345678";
    const desired = structuredClone(base);
    desired.sourceShippingRates.dubai.airRegular = rate(400);
    desired.sourceShippingRates.china.airExpress = rate(650);
    const result = mergeOfficeProfile(current, desired, base);
    expect(result.sourceShippingRates).toMatchObject({
      dubai: { airRegular: rate(400) },
      china: { airExpress: rate(650), sea: { ...rate(1300), unit: "m3" } },
    });
    expect(result.shippingRates).toEqual(base.shippingRates);
    expect(result.phone).toBe(current.phone);
    expect(base.sourceShippingRates.dubai.airRegular).toBeNull();
  });
  it("rejects competing edits to the same origin/service and acknowledges a matching retry", () => {
    const base = {
      ...profile(),
      sourceShippingRates: emptyNouakchottSourceRates(),
    };
    const saved = structuredClone(base);
    saved.sourceShippingRates.turkey.airRegular = rate(450);
    expect(
      sameOfficeProfile(mergeOfficeProfile(saved, saved, base), saved)
    ).toBe(true);
    const desired = structuredClone(base);
    desired.sourceShippingRates.turkey.airRegular = rate(475);
    expect(() => mergeOfficeProfile(saved, desired, base)).toThrow(
      "office_profile_version_conflict"
    );
    expect(saved.sourceShippingRates.turkey.airRegular?.amount).toBe(450);
  });
  it("does not reset a source price when an older client changes another profile field", () => {
    const base = profile();
    const current = {
      ...base,
      sourceShippingRates: emptyNouakchottSourceRates(),
    };
    current.sourceShippingRates.dubai.sea = { ...rate(900), unit: "shipment" };
    const desired = { ...base, address: "Address edited from older app" };
    const merged = mergeOfficeProfile(current, desired, base);
    expect(merged.sourceShippingRates).toEqual(current.sourceShippingRates);
    expect(merged.address).toBe(desired.address);
  });
});
