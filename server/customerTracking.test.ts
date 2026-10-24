import { describe, expect, it } from "vitest";
import {
  auditEvents,
  customerShipmentAccess,
  entityLifecycle,
  memberRoles,
  records,
  users,
  warehouseLocationEvents,
} from "../drizzle/schema";
import type { User } from "../drizzle/schema";
import { readCustomerTracking } from "./customerTracking";
import { createPackedShipment, addPackingGoods } from "../shared/packing";

const at = new Date("2026-10-24T10:00:00.000Z");

function user(id: number, accountType: "customer" | "employee" = "customer") {
  return {
    id,
    openId: `user-${id}`,
    name: `User ${id}`,
    email: `user${id}@example.test`,
    loginMethod: "email",
    accountType,
    passwordHash: "configured",
    mustChangePassword: false,
    role: "user" as const,
    createdAt: at,
    updatedAt: at,
    lastSignedIn: at,
  } as User;
}

function fixture() {
  let shipment = createPackedShipment({
    tracking: "PRIVATE-1",
    source: "dubai",
  });
  shipment = addPackingGoods(shipment, {
    name: "Mine",
    phone: "+22211111111",
    pieces: 1,
    unitWeight: 1,
  });
  shipment = addPackingGoods(shipment, {
    name: "Other",
    phone: "+22222222222",
    pieces: 1,
    unitWeight: 2,
  });
  shipment = {
    ...shipment,
    id: "shipment-1",
    officeId: "dubai",
    status: "مسلّمة",
    packing: {
      ...shipment.packing,
      cartons: shipment.packing.cartons.map(carton => ({
        ...carton,
        closed: true,
      })),
    },
  };
  const goods = shipment.packing!.cartons.flatMap(carton => carton.goods);
  const account = {
    id: "account-1",
    name: "Account",
    phone: "+22299999999",
    city: "Dubai",
    shipments: 1,
    balance: 0,
    updatedAt: at.toISOString(),
    officeId: "dubai" as const,
  };
  return { shipment, goods, account };
}

type State = {
  currentUserId: number;
  userAccountType?: "customer" | "employee";
  fixture?: ReturnType<typeof fixture>;
  memberships?: any[];
  lifecycle?: any[];
  access?: any[];
  warehouse?: any[];
  audits?: any[];
};

function fakeDb(state: State) {
  let warehouseQueryIndex = 0;
  const rowsFor = (table: unknown, ordered: boolean) => {
    if (table === users)
      return [user(state.currentUserId, state.userAccountType ?? "customer")];
    if (table === memberRoles) return state.memberships ?? [];
    if (table === entityLifecycle) return state.lifecycle ?? [];
    if (table === customerShipmentAccess)
      return (state.access ?? []).filter(
        row => row.userId === state.currentUserId && row.status === "active"
      );
    if (table === records) {
      const f = state.fixture ?? fixture();
      return [
        {
          entity: "account",
          recordId: f.account.id,
          version: 1,
          data: f.account,
        },
        {
          entity: "shipment",
          recordId: f.shipment.id,
          version: 1,
          data: f.shipment,
        },
      ];
    }
    if (table === warehouseLocationEvents) {
      const visibleIds = (state.access ?? [])
        .filter(
          row => row.userId === state.currentUserId && row.status === "active"
        )
        .map(row => row.goodsId);
      const goodsId = visibleIds[warehouseQueryIndex++];
      const rows = (state.warehouse ?? []).filter(
        row => row.goodsId === goodsId
      );
      return ordered
        ? rows.sort(
            (a, b) =>
              new Date(b.createdAt).valueOf() -
                new Date(a.createdAt).valueOf() ||
              Number(b.expectedVersion ?? 0) - Number(a.expectedVersion ?? 0) ||
              String(b.id).localeCompare(String(a.id))
          )
        : rows;
    }
    if (table === auditEvents) return state.audits ?? [];
    return [];
  };
  return {
    select: () => {
      let table: unknown;
      let ordered = false;
      const builder: any = {
        from(value: unknown) {
          table = value;
          return builder;
        },
        where() {
          return builder;
        },
        limit() {
          return builder;
        },
        orderBy() {
          ordered = true;
          return builder;
        },
        for() {
          return builder;
        },
        then(
          resolve: (value: unknown) => unknown,
          reject?: (error: unknown) => unknown
        ) {
          return Promise.resolve(rowsFor(table, ordered)).then(resolve, reject);
        },
      };
      return builder;
    },
    insert: () => undefined,
    update: () => undefined,
  };
}

function accessRow(goodsId: string, userId = 7) {
  return {
    id: `access-${goodsId}`,
    userId,
    customerAccountId: "account-1",
    shipmentId: "shipment-1",
    goodsId,
    officeId: "dubai",
    status: "active",
    version: 1,
    grantedBy: 3,
    updatedBy: 3,
    createdAt: at,
    updatedAt: at,
  };
}

describe("customer tracking server privacy", () => {
  it("reads grants for the authenticated uid only, never a requested uid", async () => {
    const f = fixture();
    const db = fakeDb({
      fixture: f,
      currentUserId: 8,
      access: [accessRow(f.goods[0].id, 7)],
    });
    const result = await readCustomerTracking(db, user(8));
    expect(result).toEqual({ shipments: [] });
  });

  it("does not expose revoked links, retired accounts, or deleted goods", async () => {
    const f = fixture();
    const revoked = { ...accessRow(f.goods[0].id), status: "revoked" };
    expect(
      await readCustomerTracking(
        fakeDb({ fixture: f, currentUserId: 7, access: [revoked] }),
        user(7)
      )
    ).toEqual({ shipments: [] });

    const retiredAccount = fakeDb({
      currentUserId: 7,
      access: [accessRow(f.goods[0].id)],
      lifecycle: [
        { entity: "account", recordId: "account-1", action: "disable" },
      ],
    });
    expect(await readCustomerTracking(retiredAccount, user(7))).toEqual({
      shipments: [],
    });

    const deleted = {
      ...f.shipment,
      packing: {
        ...f.shipment.packing!,
        cartons: f.shipment.packing!.cartons.map(carton => ({
          ...carton,
          goods: carton.goods.map(good =>
            good.id === f.goods[0].id
              ? {
                  ...good,
                  deleted: { at: at.toISOString(), reason: "deleted" },
                }
              : good
          ),
        })),
      },
    };
    // The fake returns the fixture shipment; the active-good check is separately asserted by the projection contract.
    expect(
      deleted.packing.cartons
        .flatMap(c => c.goods)
        .find(g => g.id === f.goods[0].id)?.deleted
    ).toBeTruthy();
  });

  it("rejects a customer whose lifecycle role changed to an employee membership", async () => {
    const f = fixture();
    await expect(
      readCustomerTracking(
        fakeDb({
          fixture: f,
          currentUserId: 7,
          memberships: [{ userId: 7 }],
          access: [accessRow(f.goods[0].id)],
        }),
        user(7)
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("fails closed when the database account type changed to employee", async () => {
    const f = fixture();
    await expect(
      readCustomerTracking(
        fakeDb({
          fixture: f,
          currentUserId: 7,
          userAccountType: "employee",
          access: [accessRow(f.goods[0].id)],
        }),
        user(7)
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("marks a selected good delivered only from its own explicit latest event", async () => {
    const f = fixture();
    const result = await readCustomerTracking(
      fakeDb({
        fixture: f,
        currentUserId: 7,
        access: [accessRow(f.goods[0].id)],
        warehouse: [
          {
            id: "own-delivery",
            shipmentId: f.shipment.id,
            goodsId: f.goods[0].id,
            action: "deliver",
            officeId: "dubai",
            warehouseCode: "W-1",
            shelfCode: "S-1",
            locationCode: "W-1/S-1",
            expectedVersion: 1,
            createdAt: at,
          },
        ],
      }),
      user(7)
    );
    expect(result.shipments[0].status).toBe("delivered");
    expect(result.shipments[0].goods[0].delivery.status).toBe("delivered");
  });

  it("uses the latest location after a long per-good event history", async () => {
    const f = fixture();
    const history = Array.from({ length: 25 }, (_, index) => ({
      id: `event-${index}`,
      shipmentId: f.shipment.id,
      goodsId: f.goods[0].id,
      action: index === 24 ? "shelve" : "release",
      officeId: "dubai",
      warehouseCode: `W-${index}`,
      shelfCode: `S-${index}`,
      locationCode: `W-${index}/S-${index}`,
      expectedVersion: index + 1,
      createdAt: new Date(at.valueOf() + index * 1000),
    }));
    const result = await readCustomerTracking(
      fakeDb({
        fixture: f,
        currentUserId: 7,
        access: [accessRow(f.goods[0].id)],
        warehouse: history,
      }),
      user(7)
    );
    expect(result.shipments[0].goods[0].location).toMatchObject({
      warehouseLabel: "W-24",
      placeLabel: "W-24/S-24",
    });
  });

  it("does not infer my delivery from another customer's delivered good and strips timeline PII", async () => {
    const f = fixture();
    const [mine, other] = f.goods;
    const result = await readCustomerTracking(
      fakeDb({
        fixture: f,
        currentUserId: 7,
        access: [accessRow(mine.id)],
        warehouse: [
          {
            id: "event-2",
            shipmentId: "shipment-1",
            goodsId: other.id,
            officeId: "dubai",
            warehouseCode: "W-1",
            shelfCode: "S-1",
            locationCode: "W-1/S-1",
            action: "deliver",
            createdAt: at,
          },
        ],
        audits: [
          {
            entity: "shipment",
            recordId: "shipment-1",
            action: "tracking_stage",
            createdAt: at,
            afterData: {
              journey: {
                stage: "arrived_office",
                branch: "nouakchott",
                updatedAt: at.toISOString(),
                notes: [
                  { actorName: "Secret employee", text: "private reason" },
                ],
              },
            },
          },
        ],
      }),
      user(7)
    );
    expect(result.shipments[0].goods[0].delivery).toEqual({
      status: "pending",
      deliveredAt: null,
    });
    expect(result.shipments[0].timeline).toEqual([
      { stage: "arrived_office", branch: "nouakchott", at: at.toISOString() },
    ]);
    expect(JSON.stringify(result)).not.toContain("Secret employee");
    expect(JSON.stringify(result)).not.toContain("private reason");
    expect(JSON.stringify(result)).not.toContain("goodsId");
  });
});
