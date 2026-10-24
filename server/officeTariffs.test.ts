import { describe, expect, it, vi } from "vitest";
import { defaultOfficeProfile } from "../shared/branches";
import {
  tariffForPackingProfiles,
  createPackedShipment,
} from "../shared/packing";
import { officeProfiles, officeTariffHistory } from "../drizzle/schema";
import {
  creationTariff,
  profileTariffAt,
  rememberOfficeTariff,
  type TariffVersion,
} from "./officeTariffs";
const past = "2026-10-24T10:00:00.000Z";
const changed = "2026-10-24T11:00:00.750Z";
function profile(amount = 42) {
  return {
    ...defaultOfficeProfile("dubai"),
    version: 2,
    shippingRates: {
      airRegular: { amount, currency: "AED" as const, unit: "kg" as const },
      airExpress: null,
      sensitive: null,
      sea: null,
    },
  };
}
const history: TariffVersion[] = [
  {
    officeId: "dubai",
    profileVersion: 1,
    announcedAt: past,
    shippingRates: profile(37).shippingRates,
    sourceShippingRates: null,
  },
  {
    officeId: "dubai",
    profileVersion: 2,
    announcedAt: changed,
    shippingRates: profile(42).shippingRates,
    sourceShippingRates: null,
  },
];
describe("Immutable publication-time tariffs", () => {
  it("rejects an ambiguous legacy publication second rather than applying a new rate early", () => {
    expect(() =>
      profileTariffAt(
        profile(),
        "2026-10-24T11:00:00.000Z",
        [],
        new Date("2026-10-24T11:00:00.500Z")
      )
    ).toThrow("tariff_history_unavailable");
    expect(
      profileTariffAt(
        profile(),
        "2026-10-24T11:00:00.000Z",
        [],
        new Date("2026-10-24T11:00:01.000Z")
      ).version
    ).toBe(2);
  });
  it("selects 37 AED for a draft created before the newer 42 AED announcement", () => {
    const old = profileTariffAt(
      profile(),
      changed,
      history,
      new Date("2026-10-24T10:30:00.000Z")
    );
    expect(old.version).toBe(1);
    expect(old.shippingRates?.airRegular?.amount).toBe(37);
    expect(
      profileTariffAt(
        profile(),
        changed,
        history,
        new Date("2026-10-24T12:00:00.000Z")
      ).version
    ).toBe(2);
  });
  it("uses millisecond history, not truncated updatedAt, at an announcement boundary", () => {
    expect(
      profileTariffAt(
        profile(),
        "2026-10-24T11:00:00.000Z",
        history,
        new Date("2026-10-24T11:00:00.500Z")
      ).version
    ).toBe(1);
  });
  it("does not invent a rate earlier than any known publication", () => {
    expect(() =>
      profileTariffAt(
        profile(),
        changed,
        history,
        new Date("2026-10-23T00:00:00Z")
      )
    ).toThrow("tariff_history_unavailable");
  });
  it("uses a current unrecorded version only when its database timestamp proves it was already published", () => {
    expect(
      profileTariffAt(profile(), past, [], new Date("2026-10-24T10:30:00Z"))
        .version
    ).toBe(2);
    expect(() =>
      profileTariffAt(profile(), changed, [], new Date("2026-10-24T10:30:00Z"))
    ).toThrow("tariff_history_unavailable");
  });
  it("never reinterprets an old MRU announcement as AED", () => {
    const old = profileTariffAt(
      profile(),
      changed,
      [
        {
          ...history[0],
          shippingRates: {
            ...profile(37).shippingRates,
            airRegular: { amount: 37, currency: "MRU", unit: "kg" },
          },
        },
      ],
      new Date("2026-10-24T10:30:00Z")
    );
    expect(
      tariffForPackingProfiles({
        source: "dubai",
        service: "airRegular",
        sourceProfile: old,
        nouakchottProfile: defaultOfficeProfile("nouakchott"),
      }).pricePerKg
    ).toBe(0);
  });
  it("verifies an offline creation date against stored announcements and ignores supplied prices", async () => {
    const packing = createPackedShipment({
      source: "dubai",
      tracking: "HISTORY",
      pricePerKg: 999,
    }).packing;
    packing.createdAt = "2026-10-24T10:30:00.000Z";
    const db = {
      select: () => ({
        from: async (table: unknown) =>
          table === officeProfiles
            ? [
                {
                  officeId: "dubai",
                  version: 2,
                  profile: profile(),
                  updatedAt: changed,
                },
              ]
            : history,
      }),
    };
    const tariff = await creationTariff(
      db,
      packing,
      new Date("2026-10-24T12:00:00Z")
    );
    expect(tariff.pricePerKg).toBe(37);
    expect(tariff.snapshot.capturedAt).toBe(packing.createdAt);
    expect(tariff.snapshot.sourceProfileVersion).toBe(1);
    packing.createdAt = "2027-10-24T10:30:00Z";
    await expect(
      creationTariff(db, packing, new Date("2026-10-24T12:00:00Z"))
    ).rejects.toThrow("shipment_creation_date_invalid");
  });
  it("preserves an existing immutable announcement instead of overwriting it", async () => {
    const values = vi.fn();
    const current = { ...history[0], shippingRates: profile(37).shippingRates };
    const db = {
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [current] }) }),
      }),
      insert: () => ({ values }),
    };
    await rememberOfficeTariff(db, profile(37), 1, new Date(past), 1);
    expect(values).not.toHaveBeenCalled();
    await expect(
      rememberOfficeTariff(db, profile(45), 1, new Date(past), 1)
    ).rejects.toThrow("office_tariff_history_conflict");
  });
});
