import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateProfile } from "./branches";
import { defaultOfficeProfile, type OfficeProfile } from "../shared/branches";
import { blankPermissions } from "../shared/permissions";
import { emptyPublicShippingRates } from "../shared/publicShipping";
import {
  users,
  memberRoles,
  officeProfiles,
  type User,
} from "../drizzle/schema";
import { appendAudit } from "./audit";
import { rememberOfficeTariff } from "./officeTariffs";
import { isEmployeeDisabled } from "./lifecycle";
vi.mock("./audit", () => ({ appendAudit: vi.fn(async () => 1) }));
vi.mock("./officeTariffs", () => ({
  rememberOfficeTariff: vi.fn(async () => undefined),
}));
vi.mock("./lifecycle", async importOriginal => ({
  ...(await importOriginal<typeof import("./lifecycle")>()),
  isEmployeeDisabled: vi.fn(async () => false),
}));
const manager = {
  id: 81,
  openId: "office-test",
  role: "user",
  name: "Manager",
  accountType: "employee",
} as User;
function fixture() {
  const { version: _v, ...base } = defaultOfficeProfile("dubai");
  let profile = {
    officeId: "dubai",
    version: 1,
    profile: base,
    updatedAt: new Date("2026-10-24T10:00:00Z"),
    updatedBy: 81,
  };
  const membership = {
    userId: 81,
    role: "office_manager",
    offices: ["dubai"],
    homeOffice: "dubai",
    version: 1,
    permissions: {
      ...blankPermissions(),
      office_settings: "manage" as "manage" | "view" | "none",
    },
  };
  let writes = 0;
  let revokeOnLock = false;
  const tx: any = {
    select: () => {
      let table: any;
      const rows = () =>
        table === officeProfiles
          ? [profile]
          : table === memberRoles
            ? [membership]
            : table === users
              ? [manager]
              : [];
      const b: any = {
        from: (t: any) => {
          table = t;
          return b;
        },
        where: () => b,
        limit: () => b,
        for: async () => {
          if (table === officeProfiles && revokeOnLock)
            membership.permissions.office_settings = "none";
          return rows();
        },
        then: (r: any, e: any) => Promise.resolve(rows()).then(r, e),
      };
      return b;
    },
    update: () => ({
      set: (value: any) => ({
        where: async () => {
          writes++;
          profile = { ...profile, ...structuredClone(value) };
        },
      }),
    }),
    insert: () => ({
      values: async () => {
        writes++;
      },
    }),
    transaction: async (fn: any) => fn(tx),
  };
  return {
    db: tx,
    membership,
    base,
    get: () => profile,
    writes: () => writes,
    revoke: () => {
      revokeOnLock = true;
    },
    setProfile: (value: OfficeProfile) => {
      profile.profile = value;
    },
  };
}
describe("Office profile authority inside the locked transaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isEmployeeDisabled).mockResolvedValue(false);
  });
  it("saves only the manager's assigned office and audits their real role", async () => {
    const f = fixture();
    const result = await updateProfile(
      f.db,
      manager,
      { ...f.base, address: "Own address", expectedVersion: 1 },
      "admin"
    );
    expect(result.address).toBe("Own address");
    expect(appendAudit).toHaveBeenCalledWith(
      f.db,
      expect.objectContaining({
        actor: expect.objectContaining({ role: "office_manager" }),
      })
    );
  });
  it("rejects another office even when a caller labels the actor admin", async () => {
    const f = fixture();
    const { version: _v, ...china } = defaultOfficeProfile("china");
    await expect(
      updateProfile(
        f.db,
        manager,
        { ...china, address: "Outside", expectedVersion: 1 },
        "admin"
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.writes()).toBe(0);
  });
  it("keeps view-only and explicitly denied managers read-only", async () => {
    for (const level of ["view", "none"] as const) {
      const f = fixture();
      f.membership.permissions.office_settings = level;
      await expect(
        updateProfile(f.db, manager, {
          ...f.base,
          address: "Forbidden",
          expectedVersion: 1,
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(f.writes()).toBe(0);
    }
  });
  it("rechecks a revoked membership after the profile lock", async () => {
    const f = fixture();
    f.revoke();
    await expect(
      updateProfile(f.db, manager, {
        ...f.base,
        address: "Stale grant",
        expectedVersion: 1,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.writes()).toBe(0);
  });
  it("rejects disabled accounts before a profile/history write", async () => {
    const f = fixture();
    vi.mocked(isEmployeeDisabled).mockResolvedValue(true);
    await expect(
      updateProfile(f.db, manager, {
        ...f.base,
        address: "Disabled",
        expectedVersion: 1,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.writes()).toBe(0);
    expect(rememberOfficeTariff).not.toHaveBeenCalled();
  });
  it("rejects a new Dubai announcement in MRU before writing or auditing", async () => {
    const f = fixture();
    const shippingRates = {
      ...emptyPublicShippingRates(),
      airRegular: { amount: 37, currency: "MRU" as const, unit: "kg" as const },
    };
    await expect(
      updateProfile(f.db, manager, {
        ...f.base,
        shippingRates,
        expectedVersion: 1,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "office_rate_currency_required",
    });
    expect(f.writes()).toBe(0);
    expect(appendAudit).not.toHaveBeenCalled();
  });
  it("preserves a legacy rate unchanged when only the address is saved", async () => {
    const f = fixture();
    const base = {
      ...f.base,
      shippingRates: {
        ...emptyPublicShippingRates(),
        sea: { amount: 500, currency: "USD" as const, unit: "m3" as const },
      },
    };
    f.setProfile(base);
    const result = await updateProfile(f.db, manager, {
      ...base,
      address: "New",
      expectedVersion: 1,
    });
    expect(result.shippingRates).toEqual(base.shippingRates);
    expect(result.address).toBe("New");
  });
});
