import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
import { appRouter } from "./routers";

function readonlyFake() {
  return {
    select: () => {
      const query: any = {
        from: () => query,
        where: () => query,
        limit: () => query,
        for: () => query,
        then: (resolve: any, reject: any) =>
          Promise.resolve([]).then(resolve, reject),
      };
      return query;
    },
  };
}
function context(
  user: Partial<NonNullable<TrpcContext["user"]>> | null
): TrpcContext {
  return {
    req: { headers: {} } as any,
    res: { setHeader: vi.fn() } as any,
    user: user
      ? ({
          id: 7,
          openId: "test-session",
          name: "Test",
          email: "test@example.invalid",
          accountType: "customer",
          role: "user",
          mustChangePassword: false,
          ...user,
        } as any)
      : null,
  };
}

beforeEach(() => mocks.getDb.mockReset().mockResolvedValue(readonlyFake()));

describe("customer and office router authorization without live database", () => {
  it("rejects unauthenticated customer tracking before touching the database", async () => {
    await expect(
      appRouter.createCaller(context(null)).customerTracking.mine({})
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("rejects unfinished password/enrollment sessions before customer data access", async () => {
    await expect(
      appRouter
        .createCaller(context({ mustChangePassword: true }))
        .customerTracking.mine({})
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "password_change_required",
    });
    await expect(
      appRouter
        .createCaller(context({ emailEnrollmentOnly: true } as any))
        .customerTracking.mine({})
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "email_setup_required",
    });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("does not accept a customer-selected userId", async () => {
    await expect(
      appRouter
        .createCaller(context({}))
        .customerTracking.mine({ userId: 8 } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("preserves the public legacy no-input office call with safe metadata", async () => {
    const result = await appRouter.createCaller(context(null)).office.public();
    expect(result).toEqual({ office: "nouakchott", methods: [] });
    expect(result).not.toHaveProperty("updatedBy");
  });
  it("keeps root no-input office reads compatible and no-store", async () => {
    const ctx = context({ role: "admin", accountType: "employee" });
    const result = await appRouter.createCaller(ctx).office.get();
    expect(result.office).toBe("nouakchott");
    expect(ctx.res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
  });
  it("does not let an unassigned customer read wallet ledgers", async () => {
    await expect(
      appRouter
        .createCaller(context({}))
        .office.walletLedger({ officeId: "dubai" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
