import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { emailEnrollments, users } from "../drizzle/schema";
import { hashSessionToken } from "./localAuth";
import { issueInitialManagerSetup, initialManagerSetupInfo, completeInitialManagerSetup } from "./initialManagerSetup";

const memory = vi.hoisted(() => ({ user: {} as any, tokens: [] as any[], events: [] as any[], session: vi.fn(), tail: Promise.resolve() }));
vi.mock("./accountSecurity", () => ({
  setEmailSession: memory.session,
  enrollGeneralManagerInTransaction: async (_tx: unknown, current: any, password: string) => {
    memory.user = { ...current, passwordHash: "test-enrolled-hash", loginMethod: "email" };
    return { user: { id: current.id, email: current.email, role: current.role, loginMethod: "email" }, token: "test-session-token" };
  },
}));
vi.mock("./audit", () => ({ appendAudit: async (_tx: unknown, event: unknown) => { memory.events.push(event); return 1; } }));
vi.mock("./db", () => {
  const dialect = new PgDialect();
  const parameters = (condition: any) => dialect.sqlToQuery(condition).params;
  const select = () => ({ from: (table: unknown) => {
    let params: any[] = [];
    const rows = () => table === users
      ? (memory.user.id === params[0] ? [memory.user] : [])
      : table === emailEnrollments ? memory.tokens.filter(row => row.tokenHash === params[0]) : [];
    const builder: any = { where: (condition: any) => { params = parameters(condition); return builder; }, limit: () => builder, for: async () => rows(), then: (resolve: any, reject: any) => Promise.resolve(rows()).then(resolve, reject) };
    return builder;
  } });
  const db: any = {
    select,
    insert: (table: unknown) => ({ values: async (value: any) => { if (table === emailEnrollments) memory.tokens.push({ ...value, consumedAt: null }); } }),
    update: (table: unknown) => ({ set: (value: any) => ({ where: async (condition: any) => {
      const params = parameters(condition);
      if (table === emailEnrollments) memory.tokens = memory.tokens.map(row => row.tokenHash === params[0] || row.userId === params[0] ? { ...row, ...value } : row);
      else if (table === users) memory.user = { ...memory.user, ...value };
    } }) }),
    transaction: (callback: any) => {
      const next = memory.tail.then(async () => {
        const backup = structuredClone({ user: memory.user, tokens: memory.tokens });
        try { return await callback(db); } catch (error) { memory.user = backup.user; memory.tokens = backup.tokens; throw error; }
      });
      memory.tail = next.then(() => undefined, () => undefined);
      return next;
    },
  };
  return { getDb: async () => db };
});
import { getDb } from "./db";
const code = "x".repeat(43);
const ctx: any = { req: { headers: {} }, res: {} };
beforeEach(() => {
  memory.user = { id: 1, openId: "existing-test-manager", name: "Manager", role: "admin", accountType: "employee", email: "manager@example.test", passwordHash: null, loginMethod: "google" };
  memory.tokens = [{ tokenHash: hashSessionToken(code), userId: 1, expiresAt: new Date(Date.now() + 60000), consumedAt: null }];
  memory.events = []; memory.session.mockClear(); memory.tail = Promise.resolve();
});
describe("Approved one-time manager setup", () => {
  it("info reveals only the capability-bound email and never signs in", async () => {
    expect(await initialManagerSetupInfo(code)).toMatchObject({ email: "manager@example.test" });
    expect(memory.user.passwordHash).toBeNull(); expect(memory.session).not.toHaveBeenCalled();
  });
  it("rejects invalid, unknown, expired and consumed codes", async () => {
    await expect(initialManagerSetupInfo("short")).rejects.toThrow("initial_setup_unavailable");
    await expect(initialManagerSetupInfo("y".repeat(43))).rejects.toThrow("initial_setup_unavailable");
    memory.tokens[0].expiresAt = new Date(Date.now() - 1);
    await expect(initialManagerSetupInfo(code)).rejects.toThrow("initial_setup_unavailable");
    memory.tokens[0].expiresAt = new Date(Date.now() + 60000); memory.tokens[0].consumedAt = new Date();
    await expect(completeInitialManagerSetup(ctx, { token: code, password: "secret-test-123" })).rejects.toThrow("initial_setup_unavailable");
    expect(memory.session).not.toHaveBeenCalled();
  });
  it("consumes the code with enrollment and keeps the existing manager identity", async () => {
    const result = await completeInitialManagerSetup(ctx, { token: code, password: "secret-test-123" });
    expect(result.user).toMatchObject({ id: 1, role: "admin", email: "manager@example.test" });
    expect(memory.tokens[0].consumedAt).toBeInstanceOf(Date);
    expect(memory.session).toHaveBeenCalledOnce();
    await expect(completeInitialManagerSetup(ctx, { token: code, password: "second-test-123" })).rejects.toThrow("initial_setup_unavailable");
  });
  it("two concurrent uses can enroll only once", async () => {
    const results = await Promise.allSettled([1, 2].map(() => completeInitialManagerSetup(ctx, { token: code, password: "secret-test-123" })));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(memory.session).toHaveBeenCalledOnce();
  });
  it("cannot enroll a non-root account or replace a configured password", async () => {
    memory.user.role = "user";
    await expect(completeInitialManagerSetup(ctx, { token: code, password: "secret-test-123" })).rejects.toThrow("initial_setup_unavailable");
    memory.user.role = "admin"; memory.user.loginMethod = "email"; memory.user.passwordHash = "already-configured";
    await expect(completeInitialManagerSetup(ctx, { token: code, password: "secret-test-123" })).rejects.toThrow("initial_setup_unavailable");
    expect(memory.session).not.toHaveBeenCalled();
  });
  it("repairs unsupported legacy credentials only through the bound private capability", async () => {
    memory.user.passwordHash = "legacy-fixture";
    const issued = await issueInitialManagerSetup(await getDb(), 1, "manager@example.test");
    expect(memory.user.passwordHash).toBe("legacy-fixture");
    expect((await initialManagerSetupInfo(issued.token)).email).toBe("manager@example.test");
    const result = await completeInitialManagerSetup(ctx, { token: issued.token, password: "new-unit-test-password" });
    expect(result.user).toMatchObject({ id: 1, role: "admin", loginMethod: "email" });
    await expect(initialManagerSetupInfo(issued.token)).rejects.toThrow("initial_setup_unavailable");
  });
  it("owner-only issuance uses 256-bit randomness, saves only a hash, and invalidates previous links", async () => {
    const issued = await issueInitialManagerSetup(await getDb(), 1, "manager@example.test");
    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(memory.tokens[0].consumedAt).toBeInstanceOf(Date);
    expect(memory.tokens[1].tokenHash).toBe(hashSessionToken(issued.token));
    expect(JSON.stringify(memory.tokens)).not.toContain(issued.token);
    expect(JSON.stringify(memory.events)).not.toContain(issued.token);
    expect(memory.user.passwordHash).toBeNull();
  });
  it("issuance refuses another expected email and leaves existing tokens intact", async () => {
    await expect(issueInitialManagerSetup(await getDb(), 1, "wrong@example.test")).rejects.toThrow("initial_setup_unavailable");
    expect(memory.tokens).toHaveLength(1); expect(memory.tokens[0].consumedAt).toBeNull();
  });
});
