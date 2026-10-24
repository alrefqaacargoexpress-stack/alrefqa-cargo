import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  customerShipmentAccess,
  entityLifecycle,
  memberRoles,
  records,
  users,
} from "../drizzle/schema";
import type { User } from "../drizzle/schema";
import { addPackingGoods, createPackedShipment } from "../shared/packing";

let officeScope = "dubai";
let retiredEntities = new Set<string>();

vi.mock("./branches", () => ({
  branchForbidden: (message: string) =>
    new TRPCError({ code: "FORBIDDEN", message }),
  readOfficeScope: async () => ({
    role: "office_manager",
    offices: [officeScope],
    homeOffice: officeScope,
    membershipVersion: 1,
  }),
  rootAdmin: () => false,
}));
vi.mock("./lifecycle", () => ({
  isEmployeeDisabled: async () => false,
  assertActiveEntity: async (
    _db: unknown,
    entity: string,
    recordId: string
  ) => {
    if (retiredEntities.has(`${entity}:${recordId}`))
      throw new TRPCError({
        code: "CONFLICT",
        message: "record_permanently_retired",
      });
  },
}));
vi.mock("./audit", () => ({ appendAudit: vi.fn(async () => undefined) }));
vi.mock("@shared/permissions", async importOriginal => ({
  ...(await importOriginal<typeof import("@shared/permissions")>()),
  permissionAllowed: () => true,
}));

const at = new Date("2026-10-24T10:00:00.000Z");
const actor = {
  id: 3,
  openId: "employee-3",
  name: "Office Manager",
  email: "manager@example.test",
  accountType: "employee",
  role: "user",
  createdAt: at,
  updatedAt: at,
  lastSignedIn: at,
} as User;
const target = {
  id: 8,
  openId: "customer-8",
  name: "Customer",
  email: "customer@example.test",
  accountType: "customer",
  role: "user",
  createdAt: at,
  updatedAt: at,
  lastSignedIn: at,
} as User;

function fixture() {
  let shipment = createPackedShipment({
    tracking: "PRIVATE-1",
    source: "dubai",
  });
  shipment = addPackingGoods(shipment, {
    name: "Linked good",
    phone: "+22211111111",
    pieces: 1,
    unitWeight: 1,
  });
  shipment = {
    ...shipment,
    id: "shipment-1",
    officeId: "dubai",
    packing: {
      ...shipment.packing,
      cartons: shipment.packing.cartons.map(carton => ({
        ...carton,
        closed: true,
      })),
    },
  };
  return {
    shipment,
    account: {
      id: "account-1",
      name: "Account",
      phone: "+22299999999",
      city: "Dubai",
      shipments: 1,
      balance: 0,
      updatedAt: at.toISOString(),
      officeId: "dubai" as const,
    },
  };
}

type State = {
  shipment: ReturnType<typeof fixture>["shipment"];
  account: ReturnType<typeof fixture>["account"];
  access?: any[];
};

function fakeDb(state: State) {
  let recordReads = 0;
  return {
    select: () => {
      let table: unknown;
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
        for() {
          return builder;
        },
        then(
          resolve: (value: unknown) => unknown,
          reject?: (error: unknown) => unknown
        ) {
          let rows: unknown[] = [];
          if (table === users) rows = [target];
          else if (table === memberRoles) rows = [];
          else if (table === entityLifecycle) rows = [];
          else if (table === records) {
            recordReads++;
            rows = [
              recordReads === 1
                ? {
                    entity: "account",
                    recordId: state.account.id,
                    version: 1,
                    data: state.account,
                  }
                : {
                    entity: "shipment",
                    recordId: state.shipment.id,
                    version: 1,
                    data: state.shipment,
                  },
            ];
          } else if (table === customerShipmentAccess)
            rows = state.access ?? [];
          return Promise.resolve(rows).then(resolve, reject);
        },
      };
      return builder;
    },
    insert: () => ({ values: () => Promise.resolve() }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  };
}

function linkInput(goodsId: string) {
  return {
    targetEmail: target.email,
    customerAccountId: "account-1",
    shipmentId: "shipment-1",
    goods: [{ goodsId, expectedVersion: 0 }],
  };
}

describe("customer tracking link mutations", () => {
  beforeEach(() => {
    officeScope = "dubai";
    retiredEntities = new Set();
  });

  it("grants and revokes a good for the exact customer", async () => {
    const { grantCustomerShipmentAccess, revokeCustomerShipmentAccess } =
      await import("./customerTracking");
    const f = fixture();
    const goodsId = f.shipment.packing!.cartons[0].goods[0].id;
    const grant = await grantCustomerShipmentAccess(
      fakeDb(f),
      actor,
      linkInput(goodsId)
    );
    expect(grant.items[0]).toMatchObject({
      userId: target.id,
      customerAccountId: "account-1",
      shipmentId: "shipment-1",
      goodsId,
      status: "active",
      version: 1,
    });

    const revoke = await revokeCustomerShipmentAccess(
      fakeDb({
        ...f,
        access: [
          {
            id: "access-1",
            userId: target.id,
            customerAccountId: "account-1",
            shipmentId: "shipment-1",
            goodsId,
            officeId: "dubai",
            status: "active",
            version: 1,
            createdAt: at,
            updatedAt: at,
          },
        ],
      }),
      actor,
      {
        customerAccountId: "account-1",
        shipmentId: "shipment-1",
        goods: [{ goodsId, expectedVersion: 1 }],
      }
    );
    expect(revoke.items[0]).toMatchObject({ status: "revoked", version: 2 });
  });

  it("rejects a wrong-office grant and retired shipment revoke", async () => {
    const { grantCustomerShipmentAccess, revokeCustomerShipmentAccess } =
      await import("./customerTracking");
    const f = fixture();
    const goodsId = f.shipment.packing!.cartons[0].goods[0].id;

    officeScope = "turkey";
    await expect(
      grantCustomerShipmentAccess(fakeDb(f), actor, linkInput(goodsId))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    officeScope = "dubai";
    retiredEntities = new Set(["shipment:shipment-1"]);
    await expect(
      revokeCustomerShipmentAccess(
        fakeDb({
          ...f,
          access: [
            {
              id: "access-1",
              userId: target.id,
              customerAccountId: "account-1",
              shipmentId: "shipment-1",
              goodsId,
              officeId: "dubai",
              status: "active",
              version: 1,
              createdAt: at,
              updatedAt: at,
            },
          ],
        }),
        actor,
        {
          customerAccountId: "account-1",
          shipmentId: "shipment-1",
          goods: [{ goodsId, expectedVersion: 1 }],
        }
      )
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
