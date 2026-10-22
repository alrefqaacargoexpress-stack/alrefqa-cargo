import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import { hashPassword } from "./localAuth";
const state = vi.hoisted(() => ({ user: null as any, createLocalSession: vi.fn(), upsertUser: vi.fn() }));
vi.mock("./db", () => ({ getUserByEmail: async () => state.user, createLocalSession: state.createLocalSession, upsertUser: state.upsertUser }));
const password = "unit-test-password-only";
const caller = () => appRouter.createCaller({ user: null, req: { headers: {}, protocol: "https" }, res: { cookie: vi.fn() } } as never);
beforeEach(async () => {
  state.createLocalSession.mockClear(); state.upsertUser.mockClear();
  state.user = { id: 7, openId: "unit-admin", role: "admin", accountType: "employee", loginMethod: "email", email: "manager@example.test", passwordHash: await hashPassword(password), mustChangePassword: false };
});
describe("Login derives identity from the saved account", () => {
  it("a manager logs in with email and password only", async () => {
    const result = await caller().auth.login({ email: "manager@example.test", password });
    expect(result.user).toMatchObject({ id: 7, role: "admin", accountType: "employee" });
    expect(result.user).not.toHaveProperty("passwordHash");
    expect(state.createLocalSession).toHaveBeenCalledOnce();
  });
  it("a stale customer hint does not reject or change the existing manager", async () => {
    const result = await caller().auth.login({ email: "manager@example.test", password, accountType: "customer" });
    expect(result.user.role).toBe("admin"); expect(result.accountType).toBe("employee");
  });
  it("an employee hint does not promote a customer to staff or manager", async () => {
    state.user = { ...state.user, role: "user", accountType: "customer" };
    const result = await caller().auth.login({ email: "manager@example.test", password, accountType: "employee" });
    expect(result.user.role).toBe("user"); expect(result.accountType).toBe("customer");
  });
  it("the page cannot submit a role or grant admin", async () => {
    await expect(caller().auth.login({ email: "manager@example.test", password, role: "admin" } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.createLocalSession).not.toHaveBeenCalled();
  });
  it("a wrong password still fails without creating a session", async () => {
    await expect(caller().auth.login({ email: "manager@example.test", password: "wrong-unit-password" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(state.createLocalSession).not.toHaveBeenCalled();
  });
});
