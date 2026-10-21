import { describe, expect, it } from "vitest";
import { defaultOfficeProfile } from "./branches";
import { emptyPublicShippingRates } from "./publicShipping";
import { mergeOfficeProfile, sameOfficeProfile } from "./officeProfileMerge";
function profile() {
  const { version: _v, ...data } = defaultOfficeProfile("nouakchott");
  return data;
}
const rate = (amount: number) => ({
  amount,
  currency: "MRU" as const,
  unit: "kg" as const,
});
describe("Office profile three-way save", () => {
  it("merges an edited address without overwriting another employee's saved phone", () => {
    const base = profile();
    const current = { ...base, phone: "+22212345678" };
    const desired = { ...base, address: "User-entered address" };
    expect(mergeOfficeProfile(current, desired, base)).toMatchObject({
      phone: current.phone,
      address: desired.address,
    });
  });
  it("rejects two different changes to the same address and leaves the desired draft intact", () => {
    const base = profile();
    const desired = { ...base, address: "My draft" };
    expect(() =>
      mergeOfficeProfile({ ...base, address: "Concurrent edit" }, desired, base)
    ).toThrow("office_profile_version_conflict");
    expect(desired.address).toBe("My draft");
  });
  it("acknowledges a matching retry even when the baseline is older", () => {
    const base = profile();
    const saved = { ...base, address: "Saved address" };
    expect(
      sameOfficeProfile(mergeOfficeProfile(saved, saved, base), saved)
    ).toBe(true);
  });
  it("merges different service tariffs while treating each amount/currency/unit atomically", () => {
    const base = { ...profile(), shippingRates: emptyPublicShippingRates() };
    const current = {
      ...base,
      shippingRates: { ...base.shippingRates, sea: rate(200) },
    };
    const desired = {
      ...base,
      shippingRates: { ...base.shippingRates, airRegular: rate(500) },
    };
    expect(
      mergeOfficeProfile(current, desired, base).shippingRates
    ).toMatchObject({ sea: rate(200), airRegular: rate(500) });
    expect(() =>
      mergeOfficeProfile(
        {
          ...base,
          shippingRates: {
            ...base.shippingRates,
            airRegular: { ...rate(500), currency: "AED" },
          },
        },
        desired,
        base
      )
    ).toThrow();
  });
  it("preserves old employees, legacy GPS and sea address when they were not edited", () => {
    const base = {
      ...profile(),
      gps: { lat: 0, lng: 0 },
      employees: [{ id: "old", name: "Kept contact", phone: "+22212345" }],
    };
    const current = { ...base, seaAddress: "Existing sea address" };
    const result = mergeOfficeProfile(
      current,
      { ...base, mapUrl: "https://maps.google.com/?q=1,2" },
      base
    );
    expect(result.gps).toEqual(base.gps);
    expect(result.employees).toEqual(base.employees);
    expect(result.seaAddress).toBe(current.seaAddress);
  });
  it("does not treat absent optional fields as new zero-price tariffs", () => {
    const base = profile();
    const desired = {
      ...base,
      seaAddress: "",
      shippingRates: emptyPublicShippingRates(),
    };
    expect(sameOfficeProfile(base, desired)).toBe(true);
    expect(
      mergeOfficeProfile(base, desired, base).shippingRates
    ).toBeUndefined();
  });
  it("rejects a baseline belonging to another office", () => {
    const base = profile();
    expect(() =>
      mergeOfficeProfile(base, base, { ...base, officeId: "china" })
    ).toThrow("office_profile_base_mismatch");
  });
});
