import { beforeEach, describe, expect, it, vi } from "vitest";
import { users, localSessions } from "../drizzle/schema";
import { hashPassword, verifyPassword, publicUser } from "./localAuth";
import { configureGeneralManagerEmail, changeAccountPassword, resetAccountPassword } from "./accountSecurity";
import { appRouter } from "./routers";

const memory = vi.hoisted(() => ({ user: {} as any, duplicateEmail: false, deleted: 0, inserted: [] as any[], audit: [] as any[] }));
vi.mock("./audit", () => ({ appendAudit: async (_tx: unknown, event: any) => { memory.audit.push(event); return 1; }, readAudit: vi.fn() }));
vi.mock("./db", () => {
  const db: any = {
    select: (projection?: unknown) => ({ from: (table: unknown) => {
      const value = table === users ? (projection ? (memory.duplicateEmail ? [{ id: 99 }] : []) : [memory.user]) : [];
      const builder: any = { where: () => builder, limit: () => builder, for: () => Promise.resolve(value), then: (resolve: any, reject: any) => Promise.resolve(value).then(resolve, reject) };
      return builder;
    } }),
    update: () => ({ set: (changes: any) => ({ where: async () => { memory.user = { ...memory.user, ...changes }; } }) }),
    delete: (table: unknown) => ({ where: async () => { if (table === localSessions) memory.deleted++; } }),
    insert: () => ({ values: async (value: unknown) => { memory.inserted.push(value); } }),
    transaction: async (callback: any) => callback(db),
  };
  return { getDb: async () => db };
});
function user(role: "admin" | "user" = "admin") {
  return { id: 7, openId: "legacy-admin-test", name: "General", email: "Admin@Example.test", loginMethod: "google", accountType: "employee", role, passwordHash: null, mustChangePassword: false, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
}
function context(account: any) { return { user: account, req: { headers: {}, protocol: "https" }, res: { cookie: vi.fn(), clearCookie: vi.fn() } } as any; }
const password = "temporary-test-1234";
beforeEach(() => { memory.user = user(); memory.duplicateEmail = false; memory.deleted = 0; memory.inserted = []; memory.audit = []; });
describe("Email manager enrollment and password security", () => {
  it("configures an existing general manager without changing id, root role or openId", async () => {
    const ctx = context({ ...memory.user, emailEnrollmentOnly: true });
    const result = await configureGeneralManagerEmail(ctx, password);
    expect(result.user).toMatchObject({ id: 7, openId: "legacy-admin-test", role: "admin", email: "admin@example.test", loginMethod: "email" });
    expect(result.user).not.toHaveProperty("passwordHash");
    expect(await verifyPassword(password, memory.user.passwordHash)).toBe(true);
    expect(memory.deleted).toBe(1); expect(memory.inserted).toHaveLength(1);
    expect(memory.inserted[0]).toHaveProperty("tokenHash"); expect(memory.inserted[0]).not.toHaveProperty("token");
    expect(ctx.res.cookie).toHaveBeenCalledWith("alrefqa_session", expect.any(String), expect.objectContaining({ secure: true, httpOnly: true, sameSite: "none" }));
    expect(JSON.stringify(memory.audit)).not.toContain(password);
    expect(JSON.stringify(memory.audit)).not.toContain("scrypt$");
  });
  it("does not allow a registered visitor or office manager to enroll as general manager", async () => {
    await expect(configureGeneralManagerEmail(context(user("user")), password)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(memory.inserted).toEqual([]);
  });
  it("requires a verified user for enrollment", async () => {
    await expect(appRouter.createCaller(context(null)).auth.configureEmail({ password })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("rejects repeated initial setup after a local password exists", async () => {
    memory.user.passwordHash = await hashPassword(password);
    await expect(configureGeneralManagerEmail(context(memory.user), "different-test-1234")).rejects.toMatchObject({ message: "email_login_already_configured" });
    expect(memory.deleted).toBe(0);
  });
  it("refuses enrollment when another account owns the same email", async () => {
    memory.duplicateEmail = true;
    await expect(configureGeneralManagerEmail(context(memory.user), password)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(memory.inserted).toEqual([]);
  });
  it("general manager resets an existing legacy employee in place, requires change, and revokes sessions", async () => {
    const admin = user(); memory.user = { ...user("user"), id: 8, openId: "legacy-employee-test" };
    await resetAccountPassword(context(admin), 8, password);
    expect(memory.user).toMatchObject({ id: 8, role: "user", openId: "legacy-employee-test", loginMethod: "email", mustChangePassword: true });
    expect(memory.deleted).toBe(1); expect(memory.inserted).toEqual([]);
    expect(JSON.stringify(memory.audit)).not.toContain(password);
  });
  it("office manager cannot reset another password or replace root credentials", async () => {
    await expect(resetAccountPassword(context(user("user")), 8, password)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(resetAccountPassword(context(user()), 7, password)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(memory.deleted).toBe(0);
  });
  it("the employee reset endpoint cannot reset a customer password", async () => {
    memory.user = { ...user("user"), accountType: "customer" };
    await expect(resetAccountPassword(context(user()), 7, password)).rejects.toMatchObject({ message: "employee_account_required" });
    expect(memory.deleted).toBe(0);
  });
  it("normal password change requires current password and a different replacement", async () => {
    memory.user = { ...user(), loginMethod: "email", passwordHash: await hashPassword(password) };
    const ctx = context(memory.user);
    await expect(changeAccountPassword(ctx, { newPassword: "new-secret-test-1234" })).rejects.toMatchObject({ message: "current_password_incorrect" });
    await expect(changeAccountPassword(ctx, { currentPassword: "incorrect-test-123", newPassword: "new-secret-test-1234" })).rejects.toMatchObject({ message: "current_password_incorrect" });
    await expect(changeAccountPassword(ctx, { currentPassword: password, newPassword: password })).rejects.toMatchObject({ message: "new_password_must_differ" });
    expect(memory.deleted).toBe(0);
    await changeAccountPassword(ctx, { currentPassword: password, newPassword: "new-secret-test-1234" });
    expect(await verifyPassword(password, memory.user.passwordHash)).toBe(false);
    expect(memory.deleted).toBe(1); expect(memory.inserted).toHaveLength(1);
  });
  it("temporary passwords can only change to a different password before operational access", async () => {
    memory.user = { ...user("user"), loginMethod: "email", passwordHash: await hashPassword(password), mustChangePassword: true };
    const ctx = context(memory.user);
    await expect(appRouter.createCaller(ctx).operations.snapshot()).rejects.toMatchObject({ message: "password_change_required" });
    await expect(appRouter.createCaller(ctx).operations.resetPassword({ userId: 8, temporaryPassword: password })).rejects.toMatchObject({ message: "password_change_required" });
    const result = await changeAccountPassword(ctx, { newPassword: "new-secret-test-1234" });
    expect(result.user.mustChangePassword).toBe(false);
  });
  it("legacy enrollment session cannot access operations or assign roles", async () => {
    const caller = appRouter.createCaller(context({ ...user(), emailEnrollmentOnly: true }));
    await expect(caller.operations.access()).rejects.toMatchObject({ message: "email_setup_required" });
    await expect(caller.branches.members()).rejects.toMatchObject({ message: "email_setup_required" });
  });
  it("public projections never contain a password hash", () => {
    expect(publicUser({ ...user(), passwordHash: "secret-hash", emailEnrollmentOnly: true })).not.toHaveProperty("passwordHash");
  });
});
