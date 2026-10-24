import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./audit", () => ({
  appendAudit: vi.fn(async (tx: { failAudit?: boolean }) => {
    if (tx.failAudit) throw new Error("simulated_audit_failure");
    return 1;
  }),
}));

import { dutyEvents, syncReceipts, users } from "../drizzle/schema";
import {
  dutyPayloadHash,
  endDutyForLogout,
  resolveDutyExpiry,
  validateDutySelection,
} from "./duty";

function comparisons(node: any): [string, unknown][] {
  if (!node?.queryChunks) return [];
  const out: [string, unknown][] = [];
  const chunks = node.queryChunks;
  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i]?.queryChunks) out.push(...comparisons(chunks[i]));
    if (
      typeof chunks[i]?.name === "string" &&
      chunks[i + 2] &&
      "value" in chunks[i + 2]
    )
      out.push([chunks[i].name, chunks[i + 2].value]);
  }
  return out;
}

function database() {
  const rows = new Map<unknown, any[]>([
    [users, []],
    [dutyEvents, []],
    [syncReceipts, []],
  ]);
  const db: any = { rows, failAudit: false };
  db.select = () => ({
    from: (table: unknown) => {
      let condition: any;
      let cap = Infinity;
      const result = () =>
        (rows.get(table) ?? [])
          .filter(row =>
            comparisons(condition).every(([key, value]) => row[key] === value)
          )
          .slice(0, cap)
          .map(row => structuredClone(row));
      const query: any = {
        where: (next: any) => {
          condition = next;
          return query;
        },
        limit: (value: number) => {
          cap = value;
          return query;
        },
        for: () => Promise.resolve(result()),
        then: (resolve: any, reject: any) =>
          Promise.resolve(result()).then(resolve, reject),
      };
      return query;
    },
  });
  db.insert = (table: unknown) => ({
    values: async (value: any) => {
      const list = rows.get(table) ?? [];
      if (
        table === syncReceipts &&
        list.some(
          row => row.userId === value.userId && row.changeId === value.changeId
        )
      )
        throw new Error("duplicate");
      if (
        table === dutyEvents &&
        list.some(
          row =>
            row.userId === value.userId && row.requestKey === value.requestKey
        )
      )
        throw new Error("duplicate");
      const next = structuredClone({
        id: value.id ?? list.length + 1,
        createdAt: value.createdAt ?? new Date("2026-10-24T13:00:00.000Z"),
        ...value,
      });
      list.push(next);
      rows.set(table, list);
      return { insertId: next.id };
    },
  });
  db.transaction = async (fn: (tx: any) => Promise<unknown>) => {
    const backup = new Map(
      [...rows].map(([table, list]) => [table, structuredClone(list)])
    );
    try {
      return await fn(db);
    } catch (error) {
      rows.clear();
      for (const [table, list] of backup) rows.set(table, list);
      throw error;
    }
  };
  return db;
}

const employee = {
  id: 7,
  openId: "employee-7",
  name: "Worker",
  email: "worker@example.test",
  loginMethod: "email",
  accountType: "employee" as const,
  role: "user" as const,
  passwordHash: null,
  mustChangePassword: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

const command = {
  id: "cmd-1",
  requestKey: "req-1",
  officeId: "dubai" as const,
  role: "staff" as const,
  reason: "start",
};

describe("server duty safeguards", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a non-root attempt to self-grant a role", () => {
    expect(() =>
      validateDutySelection(
        { role: "staff", offices: ["dubai"] },
        { ...command, role: "admin" }
      )
    ).toThrow("duty_role_must_match_assignment");
  });

  it("caps activation at a valid local session expiry and never extends it", () => {
    const now = new Date("2026-10-24T12:00:00.000Z");
    expect(
      resolveDutyExpiry(now, new Date("2026-10-24T14:00:00.000Z")).toISOString()
    ).toBe("2026-10-24T14:00:00.000Z");
    expect(resolveDutyExpiry(now, null).toISOString()).toBe(
      "2026-10-24T20:00:00.000Z"
    );
    expect(
      resolveDutyExpiry(now, new Date("2026-10-24T22:00:00.000Z")).toISOString()
    ).toBe("2026-10-24T20:00:00.000Z");
  });

  it("uses actor-scoped duty hashes for immutable replay checks", () => {
    expect(dutyPayloadHash("activate", command, 7)).toBe(
      dutyPayloadHash("activate", command, 7)
    );
    expect(dutyPayloadHash("activate", command, 7)).not.toBe(
      dutyPayloadHash("deactivate", command, 7)
    );
  });

  it("rolls back the off event when audit append fails, then safely replays", async () => {
    const db = database();
    db.rows.get(users).push(employee);
    db.rows.get(dutyEvents).push({
      id: 1,
      userId: 7,
      actorId: 7,
      role: "staff",
      officeId: "dubai",
      status: "on",
      reason: "start",
      membershipVersion: 1,
      expiresAt: new Date("2026-10-24T20:00:00.000Z"),
      requestKey: "prior",
      createdAt: new Date("2026-10-24T12:00:00.000Z"),
    });

    db.failAudit = true;
    await expect(endDutyForLogout(db, 7, "logout-1")).rejects.toThrow(
      "simulated_audit_failure"
    );
    expect(db.rows.get(dutyEvents)).toHaveLength(1);
    expect(db.rows.get(syncReceipts)).toHaveLength(0);

    db.failAudit = false;
    const first = await endDutyForLogout(db, 7, "logout-1");
    const second = await endDutyForLogout(db, 7, "logout-1");
    expect(first?.status).toBe("off");
    expect(second).toEqual(first);
    expect(db.rows.get(dutyEvents)).toHaveLength(2);
    expect(db.rows.get(syncReceipts)).toHaveLength(1);
  });
});
