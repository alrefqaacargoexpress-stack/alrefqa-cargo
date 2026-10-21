import { beforeEach, describe, expect, it, vi } from "vitest";
import { officeSettings } from "../drizzle/schema";
import { defaultOfficeSettings } from "@shared/office";
const f = vi.hoisted(() => ({ db: null as any, audit: vi.fn(async () => 1) }));
vi.mock("./db", () => ({ getDb: async () => f.db }));
vi.mock("./audit", () => ({
  appendAudit: f.audit,
  readAudit: vi.fn(async () => ({ items: [], nextCursor: null })),
}));
import { appRouter } from "./routers";
function fixture() {
  const settings = defaultOfficeSettings();
  const row: any = {
    id: 1,
    office: settings.office,
    version: 1,
    methods: settings.methods,
  };
  let writes = 0;
  const db: any = {
    select: () => ({
      from: (table: unknown) => {
        const builder: any = {
          where: () => builder,
          limit: () => builder,
          for: async () => (table === officeSettings ? [row] : []),
          then: (resolve: any) =>
            Promise.resolve(table === officeSettings ? [row] : []).then(
              resolve
            ),
        };
        return builder;
      },
    }),
    update: () => ({
      set: (values: any) => ({
        where: async () => {
          writes++;
          Object.assign(row, structuredClone(values));
        },
      }),
    }),
    transaction: async (fn: any) => fn(db),
  };
  f.db = db;
  const caller = appRouter.createCaller({
    user: { id: 916, name: "Test manager", role: "admin", openId: "test-only" },
    req: { headers: {} },
    res: {},
  } as any);
  const methods = settings.methods.map(m =>
    m.id === "bankily"
      ? {
          ...m,
          accountNumber: "+22212345678",
          accountName: "Owner supplied",
          showToCustomers: true,
        }
      : m
  );
  return { row, caller, methods, writes: () => writes };
}
describe("Office wallet acknowledged saves", () => {
  beforeEach(() => vi.clearAllMocks());
  it("acknowledges a repeated save after the response is lost without writing another audit event", async () => {
    const x = fixture();
    const request = {
      office: "nouakchott" as const,
      methods: x.methods,
      expectedVersion: 1,
    };
    const first = await x.caller.office.update(request);
    const replay = await x.caller.office.update(request);
    expect(first.version).toBe(2);
    expect(replay.version).toBe(2);
    expect(x.writes()).toBe(1);
    expect(f.audit).toHaveBeenCalledOnce();
    expect(replay.methods.find(m => m.id === "bankily")?.accountNumber).toBe(
      "+22212345678"
    );
  });
  it("rejects a different wallet number with the same stale version without overwriting the saved value", async () => {
    const x = fixture();
    await x.caller.office.update({
      office: "nouakchott",
      methods: x.methods,
      expectedVersion: 1,
    });
    const altered = x.methods.map(m =>
      m.id === "bankily" ? { ...m, accountNumber: "+22287654321" } : m
    );
    await expect(
      x.caller.office.update({
        office: "nouakchott",
        methods: altered,
        expectedVersion: 1,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(x.writes()).toBe(1);
    expect(
      x.row.methods.find((m: any) => m.id === "bankily").accountNumber
    ).toBe("+22212345678");
  });
});
