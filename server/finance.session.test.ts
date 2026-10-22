import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
const caller = () =>
  appRouter.createCaller({
    user: {
      id: 7,
      openId: "test-session",
      name: "Test user",
      email: null,
      role: "user",
      loginMethod: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: {}, protocol: "https" },
    res: { clearCookie() {} },
  } as never);
describe("Finance session boundary", () => {
  it("rejects reading cached finance with another employee identifier", async () => {
    await expect(
      caller().finance.snapshot({ clientUserId: "8" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("rejects posting a pending operation after changing employee session", async () => {
    await expect(
      caller().finance.sync({ clientUserId: "8", commands: [] })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
