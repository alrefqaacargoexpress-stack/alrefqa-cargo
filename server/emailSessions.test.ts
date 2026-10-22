import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { sdk } from "./_core/sdk";
import { COOKIE_NAME } from "@shared/const";
import { LOCAL_SESSION_COOKIE } from "./localAuth";
import { registerOAuthRoutes } from "./_core/oauth";
const mocks = vi.hoisted(() => ({ getUserByOpenId: vi.fn(), getUserByLocalSessionHash: vi.fn(), upsertUser: vi.fn() }));
vi.mock("./db", () => mocks);
const user = { id: 7, openId: "legacy-general-test", role: "admin", name: "Test", email: "admin@example.test", loginMethod: "google", accountType: "employee", passwordHash: null, mustChangePassword: false, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
const request = (cookie: string) => ({ path: "/api/trpc/auth.me", headers: { cookie } } as never);
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("MANUS_PROJECT_ID", "unit-project"); vi.stubEnv("MANUS_JWT_SECRET", "unit-testing-key-not-deployed"); mocks.getUserByOpenId.mockResolvedValue(user); });
afterEach(() => vi.unstubAllEnvs());
async function oldSession() { return sdk.signSession({ openId: user.openId, appId: "unit-project", name: "Test" }); }
describe("Email-only account session boundary", () => {
  it("accepts a verified existing general manager only for enrollment", async () => {
    const signed = await oldSession();
    expect(await sdk.authenticateRequest(request(`${COOKIE_NAME}=${signed}`))).toMatchObject({ id: 7, emailEnrollmentOnly: true });
  });
  it("rejects the same Manus session after email credentials have been configured", async () => {
    mocks.getUserByOpenId.mockResolvedValue({ ...user, passwordHash: "configured-hash", loginMethod: "email" });
    await expect(sdk.authenticateRequest(request(`${COOKIE_NAME}=${await oldSession()}`))).rejects.toThrow("Email login required");
  });
  it("does not admit a non-root legacy user or auto-create a new provider user", async () => {
    mocks.getUserByOpenId.mockResolvedValue({ ...user, role: "user" });
    await expect(sdk.authenticateRequest(request(`${COOKIE_NAME}=${await oldSession()}`))).rejects.toThrow("Email login required");
    mocks.getUserByOpenId.mockResolvedValue(undefined);
    await expect(sdk.authenticateRequest(request(`${COOKIE_NAME}=${await oldSession()}`))).rejects.toThrow("User not found");
    expect(mocks.upsertUser).not.toHaveBeenCalled();
  });
  it("honors a database-backed local session without the provider", async () => {
    mocks.getUserByLocalSessionHash.mockResolvedValue({ ...user, loginMethod: "email", passwordHash: "configured-hash" });
    expect(await sdk.authenticateRequest(request(`${LOCAL_SESSION_COOKIE}=random-test-token`))).toMatchObject({ id: 7, loginMethod: "email" });
    expect(mocks.getUserByOpenId).not.toHaveBeenCalled();
  });
  it("a revoked local session cannot fall back to an old provider session", async () => {
    mocks.getUserByLocalSessionHash.mockResolvedValue(undefined);
    await expect(sdk.authenticateRequest(request(`${LOCAL_SESSION_COOKIE}=revoked-token; ${COOKIE_NAME}=${await oldSession()}`))).rejects.toThrow("Invalid email session");
    expect(mocks.getUserByOpenId).not.toHaveBeenCalled();
  });
  it("old callbacks cannot create or renew provider sessions", async () => {
    let handler: any;
    registerOAuthRoutes({ get: (_path: string, callback: unknown) => { handler = callback; } } as never);
    const response: any = { status: vi.fn(() => response), json: vi.fn() };
    handler({}, response);
    expect(response.status).toHaveBeenCalledWith(410);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ error: "email_login_required" }));
    expect(mocks.upsertUser).not.toHaveBeenCalled();
  });
});
