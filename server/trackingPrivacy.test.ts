import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppRole } from "@shared/operations";
import type { User } from "../drizzle/schema";
import { memberRoles, records } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
let role: AppRole | null = "viewer";
const original = {
  id: "private-shipment",
  tracking: "PRIVATE-TRACK",
  account: "Private Name",
  route: "Dubai",
  service: "جوي",
  status: "قيد التجهيز",
  eta: "Later",
  amount: 700,
  packing: {
    source: "dubai",
    pricePerKg: 8,
    pricePerKgMRU: 100,
    createdAt: "2026-10-21T00:00:00.000Z",
    updatedAt: "2026-10-21T00:00:00.000Z",
    cartons: [
      {
        number: 1,
        closed: false,
        goods: [
          {
            id: "private-goods",
            name: "Secret Brand",
            phone: "Secret Phone",
            unitWeight: 1,
            pieces: 1,
          },
        ],
      },
    ],
  },
};
const rows = [
  { entity: "shipment", recordId: original.id, version: 1, data: original },
  {
    entity: "account",
    recordId: "A",
    version: 1,
    data: {
      id: "A",
      name: "Secret Account",
      phone: "p",
      city: "c",
      shipments: 1,
      balance: 999,
      updatedAt: "now",
    },
  },
];
vi.mock("./db", () => ({
  getDb: async () => ({
    select: () => ({
      from: (table: unknown) => {
        const selected =
          table === memberRoles
            ? role
              ? [{ role }]
              : []
            : table === records
              ? rows
              : [];
        const builder: any = {
          where: () => builder,
          orderBy: () => builder,
          limit: () => builder,
          offset: () => builder,
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve(selected).then(resolve),
        };
        return builder;
      },
    }),
  }),
}));
import { appRouter } from "./routers";
const user = {
  id: 999,
  openId: "privacy-non-owner",
  name: "Privacy Test",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
} as User;
const caller = () =>
  appRouter.createCaller({
    user,
    req: { headers: {} },
    res: {},
  } as unknown as TrpcContext);
describe("Tracking-only role privacy at the old snapshot endpoint", () => {
  beforeEach(() => {
    role = "viewer";
  });
  it("does not expose legacy accounts, cargo or finance to a viewer", async () => {
    const state = await caller().operations.snapshot();
    expect(state.accounts).toEqual([]);
    expect(state.shipments).toEqual([]);
    expect(state.invoices).toEqual([]);
    expect(JSON.stringify(state)).not.toContain("Secret");
  });
  it("does not expose generic snapshots to a tracking employee", async () => {
    role = "tracking_staff";
    const state = await caller().operations.snapshot();
    expect(state.accounts).toEqual([]);
    expect(state.shipments).toEqual([]);
    expect(state.invoices).toEqual([]);
  });
  it("keeps supervisors nonfinancial and does not leak account balances", async () => {
    role = "supervisor";
    const state = await caller().operations.snapshot();
    expect(state.accounts).toEqual([]);
    expect(state.invoices).toEqual([]);
    expect(state.shipments[0].amount).toBe(0);
    expect(state.shipments[0].packing?.pricePerKg).toBe(0);
    expect(state.shipments[0].packing?.pricePerKgMRU).toBe(0);
  });
  it("shows the current state without cargo, branch, dates, planning or revision to a viewer", async () => {
    const result = await caller().tracking.list({ search: "PRIVATE" });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      tracking: "PRIVATE-TRACK",
      status: "قيد التجهيز",
      branch: null,
      startedAt: null,
      expectedDays: null,
      updatedAt: null,
      version: 0,
    });
    expect(JSON.stringify(result)).not.toContain("Secret");
    expect(JSON.stringify(result)).not.toContain("Private Name");
  });
  it("rejects viewer details and audit access regardless of a guessed shipment identifier", async () => {
    await expect(
      caller().tracking.detail({ shipmentId: original.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller().tracking.audit({ shipmentId: original.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
