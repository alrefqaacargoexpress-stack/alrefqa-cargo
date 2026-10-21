import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmArrival,
  hideForOfficeScope,
  recordVisible,
  recordWritable,
  updateProfile,
  memberFromRow,
  type OfficeScope,
} from "./branches";
import {
  records,
  syncReceipts,
  officeProfiles,
  type User,
} from "../drizzle/schema";
import { createPackedShipment } from "@shared/packing";
import { defaultOfficeProfile } from "@shared/branches";
import { appendAudit } from "./audit";
vi.mock("./audit", () => ({ appendAudit: vi.fn(async () => {}) }));
const user = {
  id: 99,
  openId: "office-test",
  name: "Warehouse test",
  email: "private@example.test",
  role: "user",
} as User;
const scope: OfficeScope = {
  role: "staff",
  offices: ["nouakchott"],
  membershipVersion: 1,
};
function fixture() {
  const shipment = {
    ...createPackedShipment({
      tracking: "ARRIVAL",
      source: "dubai",
      officeId: "dubai",
      pricePerKg: 10,
      pricePerKgMRU: 100,
    }),
    status: "في الطريق" as const,
    journey: {
      stage: "to_nouakchott" as const,
      branch: "dakar" as const,
      startedAt: "2026-10-21T00:00:00.000Z",
      expectedDays: 9,
      updatedAt: "2026-10-21T00:00:00.000Z",
      notes: [],
    },
  };
  const row = {
    id: 1,
    entity: "shipment",
    recordId: shipment.id,
    version: 1,
    data: shipment,
  };
  const receipts: any[] = [];
  const profiles: any[] = [];
  let writes = 0;
  const tx: any = {
    select: () => ({
      from: (table: unknown) => {
        const selected =
          table === records
            ? [row]
            : table === syncReceipts
              ? receipts
              : table === officeProfiles
                ? profiles
                : [];
        const builder: any = {
          where: () => builder,
          limit: () => builder,
          for: () => Promise.resolve(selected),
          then: (resolve: any) => Promise.resolve(selected).then(resolve),
        };
        return builder;
      },
    }),
    update: () => ({
      set: (values: any) => ({
        where: async () => {
          writes++;
          Object.assign(row, values);
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: async (value: any) => {
        writes++;
        if (table === syncReceipts) receipts.push(value);
        if (table === officeProfiles) profiles.push(value);
      },
    }),
  };
  return {
    row,
    shipment,
    receipts,
    profiles,
    writes: () => writes,
    db: { transaction: async (callback: any) => callback(tx) },
  };
}
const request = (shipmentId: string) => ({
  shipmentId,
  expectedVersion: 1,
  requestId: "arrival-test",
  reason: "Received and checked in the Nouakchott warehouse",
});
describe("Office backend protection and warehouse arrival", () => {
  beforeEach(() => vi.clearAllMocks());
  it("lets the Nouakchott warehouse confirm actual inbound arrival without leaking financial prices", async () => {
    const f = fixture();
    const result = await confirmArrival(
      f.db,
      user,
      scope,
      request(f.shipment.id)
    );
    expect(result.shipment.journey?.stage).toBe("arrived_office");
    expect(result.shipment.journey?.branch).toBe("nouakchott");
    expect(result.shipment.status).toBe("وصلت للمكتب");
    expect(result.shipment.packing?.pricePerKg).toBe(0);
    expect(f.row.data.packing?.pricePerKg).toBe(10);
    expect(f.row.data.packing?.pricePerKgMRU).toBe(100);
    expect(f.row.data.journey.notes[0]).toMatchObject({
      actorId: user.id,
      actorName: user.name,
    });
    expect(appendAudit).toHaveBeenCalledOnce();
  });
  it("acknowledges an arrival retry without adding another audit event or exposing stored finance", async () => {
    const f = fixture();
    await confirmArrival(f.db, user, scope, request(f.shipment.id));
    const before = f.writes();
    const replay = await confirmArrival(
      f.db,
      user,
      scope,
      request(f.shipment.id)
    );
    expect(replay.shipment.packing?.pricePerKg).toBe(0);
    expect(f.writes()).toBe(before);
    expect(appendAudit).toHaveBeenCalledOnce();
  });
  it("denies arrival after warehouse office access is changed or for an accountant/viewer role", async () => {
    const f = fixture();
    for (const invalid of [
      { ...scope, offices: ["china"] as const },
      { ...scope, role: "accountant" as const },
      { ...scope, role: "viewer" as const },
    ])
      await expect(
        confirmArrival(
          f.db,
          user,
          invalid as OfficeScope,
          request(f.shipment.id)
        )
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.writes()).toBe(0);
  });
  it("does not advance a preparing shipment, a cancelled shipment or a stale version", async () => {
    const first = fixture();
    first.row.data.journey.stage = "preparing" as any;
    await expect(
      confirmArrival(
        first.db,
        user,
        { ...scope, role: "admin", offices: null },
        request(first.shipment.id)
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const cancelled = fixture();
    (cancelled.row.data as any).deleted = {
      at: "2026-10-21T00:00:00.000Z",
      reason: "Cancelled",
    };
    await expect(
      confirmArrival(cancelled.db, user, scope, request(cancelled.shipment.id))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const stale = fixture();
    stale.row.version = 2;
    await expect(
      confirmArrival(stale.db, user, scope, request(stale.shipment.id))
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(first.writes() + cancelled.writes() + stale.writes()).toBe(0);
  });
  it("separates visibility of incoming goods from ownership of financial prices and generic writes", () => {
    const f = fixture();
    expect(recordVisible(scope, "shipment", f.shipment)).toBe(true);
    expect(recordWritable(scope, "shipment", f.shipment)).toBe(false);
    expect(
      hideForOfficeScope(f.shipment, "accountant", ["nouakchott"]).packing
        ?.pricePerKg
    ).toBe(0);
    expect(
      hideForOfficeScope(f.shipment, "accountant", ["dubai"]).packing
        ?.pricePerKg
    ).toBe(10);
  });
  it("saves only supplied public profile fields with a checked version and audit entry", async () => {
    const f = fixture();
    const { version, ...profile } = defaultOfficeProfile("china");
    const result = await updateProfile(f.db, user, {
      ...profile,
      address: "Public address",
      employees: [
        {
          id: "public-contact",
          name: "Public employee",
          phone: "+86123456789",
        },
      ],
      expectedVersion: 0,
    });
    expect(result.version).toBe(1);
    expect(result.employees[0].name).toBe("Public employee");
    expect(f.profiles[0].profile.expectedVersion).toBeUndefined();
    expect(f.profiles[0].profile.userId).toBeUndefined();
    expect(appendAudit).toHaveBeenCalledOnce();
  });
  it("rejects stale office settings rather than replacing a newer profile", async () => {
    const f = fixture();
    const { version, ...profile } = defaultOfficeProfile("china");
    f.profiles.push({
      officeId: "china",
      profile: { ...profile, address: "Saved by another manager" },
      version: 2,
    });
    await expect(
      updateProfile(f.db, user, { ...profile, expectedVersion: 1 })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(f.writes()).toBe(0);
  });
  it("does not demote a real root administrator through an old member role row", () => {
    expect(
      memberFromRow({
        userId: 1,
        rootRole: "admin",
        memberRole: "staff",
        offices: ["china"],
      }).role
    ).toBe("admin");
  });
});
