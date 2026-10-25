import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../drizzle/schema";
import { memberRoles, records } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
let role: "staff" | "accountant" | null = null;
const rows = [
  {
    entity: "account",
    recordId: "A1",
    version: 1,
    data: {
      id: "A1",
      name: "Client",
      phone: "+222123456",
      city: "City",
      shipments: 0,
      balance: 777,
      updatedAt: "now",
      officeId: "dubai",
    },
  },
  {
    entity: "invoice",
    recordId: "I1",
    version: 1,
    data: {
      id: "I1",
      account: "Client",
      amount: 888,
      status: "مدفوعة",
      issuedAt: "2026-10-21",
      officeId: "dubai",
    },
  },
];
const transaction = vi.fn();
const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));
function selected(table: unknown) {
  const values =
    table === memberRoles
      ? role
        ? [{ role, offices: ["dubai"], homeOffice: "dubai", version: 1 }]
        : []
      : table === records
        ? rows
        : [];
  const builder: any = {
    where: () => builder,
    limit: () => builder,
    for: () => Promise.resolve(values),
    then: (resolve: any, reject: any) =>
      Promise.resolve(values).then(resolve, reject),
  };
  return builder;
}
vi.mock("./db", () => ({ getDb }));
import { appRouter } from "./routers";
const user = {
  id: 99,
  openId: "non-owner-test",
  name: "Test",
  email: "test@example.test",
  role: "user",
  loginMethod: "test",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
} as User;
function caller(authenticated = true) {
  return appRouter.createCaller({
    user: authenticated ? user : null,
    req: { headers: {} },
    res: {},
  } as unknown as TrpcContext);
}
describe("Server-side role isolation", () => {
  beforeEach(() => {
    role = null;
    transaction.mockReset();
    getDb.mockClear();
    getDb.mockResolvedValue({
      select: () => ({ from: selected }),
      transaction,
    });
  });
  it("rejects snapshots from unauthenticated sessions", async () => {
    await expect(caller(false).operations.snapshot()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
  it("rejects snapshots from registered but unapproved users", async () => {
    await expect(caller().operations.snapshot()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("rejects a mismatched read owner before opening the database", async () => {
    await expect(
      caller().operations.snapshot({ clientUserId: "100" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getDb).not.toHaveBeenCalled();
  });
  it("does not expose financial accounts or invoices to warehouse staff", async () => {
    role = "staff";
    const snapshot = await caller().operations.snapshot();
    expect(snapshot.invoices).toEqual([]);
    expect(snapshot.accounts).toEqual([]);
  });
  it("permits a single-office accountant to read that office's invoices and amounts", async () => {
    role = "accountant";
    const snapshot = await caller().operations.snapshot();
    expect(snapshot.invoices[0].amount).toBe(888);
    expect(snapshot.accounts[0].balance).toBe(777);
  });
  it("rejects sync from unapproved users before starting a write", async () => {
    await expect(
      caller().operations.sync({ changes: [] })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(transaction).not.toHaveBeenCalled();
  });
  it("does not disclose a previously applied invoice after financial access is revoked", async () => {
    role = "staff";
    transaction.mockImplementationOnce(async (callback: any) =>
      callback({ select: () => ({ from: selected }) })
    );
    const change = {
      id: "previous-change",
      label: "Invoice",
      createdAt: "now",
      entity: "invoice" as const,
      recordId: "I1",
      expectedVersion: null,
      data: {
        id: "I1",
        account: "Client",
        amount: 888,
        status: "مدفوعة" as const,
        issuedAt: "2026-10-21",
        officeId: "dubai" as const,
      },
    };
    const result = await caller().operations.sync({ changes: [change] });
    expect(result.applied).toEqual([]);
    expect(result.conflicts).toEqual([
      { changeId: change.id, reason: "permission_denied", current: null },
    ]);
  });
});
