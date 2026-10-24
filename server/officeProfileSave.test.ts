import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateProfile } from "./branches";
import { defaultOfficeProfile } from "../shared/branches";
import {
  emptyPublicShippingRates,
  emptyNouakchottSourceRates,
} from "../shared/publicShipping";
import { appendAudit } from "./audit";
import type { User } from "../drizzle/schema";
import { officeProfiles } from "../drizzle/schema";
vi.mock("./audit", () => ({ appendAudit: vi.fn(async () => 1) }));
import { rememberOfficeTariff } from "./officeTariffs";
vi.mock("./officeTariffs", () => ({
  rememberOfficeTariff: vi.fn(async () => undefined),
}));
const admin = {
  id: 91,
  openId: "test-only",
  name: "Test manager",
  role: "admin",
} as User;
function initial() {
  const { version: _v, ...data } = defaultOfficeProfile("nouakchott");
  return data;
}
function fixture() {
  let row: any = null;
  let writes = 0;
  const tx: any = {
    select: () => {
      let selected: any[] = [];
      const builder: any = {
        from: (table: any) => {
          selected = table === officeProfiles && row ? [row] : [];
          return builder;
        },
        where: () => builder,
        limit: () => builder,
        for: async () => selected,
        then: (resolve: any, reject: any) =>
          Promise.resolve(selected).then(resolve, reject),
      };
      return builder;
    },
    insert: () => ({
      values: async (value: any) => {
        writes++;
        row = structuredClone(value);
      },
    }),
    update: () => ({
      set: (value: any) => ({
        where: async () => {
          writes++;
          row = { ...row, ...structuredClone(value) };
        },
      }),
    }),
  };
  return {
    db: { transaction: async (fn: any) => fn(tx) },
    get: () => row,
    set: (r: any) => {
      row = structuredClone(r);
    },
    writes: () => writes,
  };
}
describe("Acknowledged office profile persistence", () => {
  beforeEach(() => vi.clearAllMocks());
  it("stores sea address and chosen MRU tariffs, not the request baseline", async () => {
    const f = fixture(),
      base = initial();
    const shippingRates = {
      ...emptyPublicShippingRates(),
      airRegular: {
        amount: 400,
        currency: "MRU" as const,
        unit: "kg" as const,
      },
      sea: { amount: 1200, currency: "MRU" as const, unit: "kg" as const },
    };
    const saved = await updateProfile(f.db, admin, {
      ...base,
      seaAddress: "Owner-entered sea warehouse",
      shippingRates,
      expectedVersion: 0,
      baseProfile: base,
    });
    expect(saved.version).toBe(1);
    expect(f.get().profile.shippingRates).toEqual(shippingRates);
    expect(f.get().profile.seaAddress).toBe(saved.seaAddress);
    expect(f.get().profile.baseProfile).toBeUndefined();
    expect(f.get().profile.expectedVersion).toBeUndefined();
    expect(appendAudit).toHaveBeenCalledOnce();
  });
  it("acknowledges a retry after an already committed request without creating a second event", async () => {
    const f = fixture(),
      base = initial();
    const request = {
      ...base,
      address: "Submitted address",
      expectedVersion: 0,
      baseProfile: base,
    };
    await updateProfile(f.db, admin, request);
    const writes = f.writes();
    const retry = await updateProfile(f.db, admin, request);
    expect(retry.version).toBe(1);
    expect(retry.address).toBe(request.address);
    expect(f.writes()).toBe(writes);
    expect(appendAudit).toHaveBeenCalledOnce();
  });
  it("merges a changed address into a later phone version without overwriting it", async () => {
    const f = fixture(),
      base = initial();
    f.set({
      officeId: base.officeId,
      version: 2,
      profile: { ...base, phone: "+22212345678" },
    });
    const result = await updateProfile(f.db, admin, {
      ...base,
      address: "New draft",
      expectedVersion: 1,
      baseProfile: base,
    });
    expect(result.version).toBe(3);
    expect(result.phone).toBe("+22212345678");
    expect(result.address).toBe("New draft");
    expect(appendAudit).toHaveBeenCalledOnce();
  });
  it("rejects actual same-field conflict without a profile write or audit event", async () => {
    const f = fixture(),
      base = initial();
    f.set({
      officeId: base.officeId,
      version: 2,
      profile: { ...base, address: "Other manager's address" },
    });
    await expect(
      updateProfile(f.db, admin, {
        ...base,
        address: "My unsaved draft",
        expectedVersion: 1,
        baseProfile: base,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(f.writes()).toBe(0);
    expect(f.get().profile.address).toBe("Other manager's address");
    expect(appendAudit).not.toHaveBeenCalled();
  });
  it("preserves existing public contacts and GPS when only the map link changes", async () => {
    const f = fixture(),
      base = {
        ...initial(),
        gps: { lat: 0, lng: 0 },
        employees: [
          { id: "old", name: "Original contact", phone: "+22212345678" },
        ],
      };
    f.set({ officeId: base.officeId, version: 1, profile: base });
    await updateProfile(f.db, admin, {
      ...base,
      mapUrl: "https://maps.google.com/?q=1,2",
      expectedVersion: 1,
      baseProfile: base,
    });
    expect(f.get().profile.gps).toEqual(base.gps);
    expect(f.get().profile.employees).toEqual(base.employees);
  });
  it("saves source-specific MRU tariffs in Nouakchott and replays their acknowledgment once", async () => {
    const f = fixture(),
      base = initial();
    const sourceShippingRates = emptyNouakchottSourceRates();
    sourceShippingRates.dubai.airRegular = {
      amount: 400,
      currency: "MRU",
      unit: "kg",
    };
    sourceShippingRates.turkey.airExpress = {
      amount: 650,
      currency: "MRU",
      unit: "kg",
    };
    sourceShippingRates.china.sea = {
      amount: 1300,
      currency: "MRU",
      unit: "kg",
    };
    const request = {
      ...base,
      sourceShippingRates,
      expectedVersion: 0,
      baseProfile: base,
    };
    const saved = await updateProfile(f.db, admin, request);
    const replay = await updateProfile(f.db, admin, request);
    expect(saved.sourceShippingRates).toEqual(sourceShippingRates);
    expect(f.get().profile.sourceShippingRates).toEqual(sourceShippingRates);
    expect(replay.version).toBe(saved.version);
    expect(f.writes()).toBe(1);
    expect(appendAudit).toHaveBeenCalledOnce();
    expect(f.get().profile.shippingRates).toBeUndefined();
  });
  it("records the previous publication time and the new version without replacing history", async () => {
    const f = fixture();
    const base = initial();
    const previousTime = new Date("2026-10-23T12:00:00Z");
    f.set({
      officeId: base.officeId,
      version: 1,
      profile: base,
      updatedAt: previousTime,
      updatedBy: admin.id,
    });
    await updateProfile(f.db, admin, {
      ...base,
      address: "New address",
      expectedVersion: 1,
    });
    const calls = vi.mocked(rememberOfficeTariff).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][2]).toBe(1);
    expect(calls[0][3]).toEqual(previousTime);
    expect(calls[1][2]).toBe(2);
    expect(calls[1][3]).toBeInstanceOf(Date);
    expect(f.get().profile.address).toBe("New address");
    expect(appendAudit).toHaveBeenCalledOnce();
  });
});
