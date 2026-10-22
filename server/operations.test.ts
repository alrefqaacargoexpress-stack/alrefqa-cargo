import { describe, expect, it, vi } from "vitest";
import type {
  AppRole,
  EntityRecord,
  PendingChange,
  SyncResult,
} from "@shared/operations";
import {
  applyChangeInMemory,
  canManageMembers,
  parseChange,
  roleForUser,
  type MemoryRow,
} from "./operations";

const account = (id: string, balance = 0): EntityRecord => ({
  id,
  name: "حساب تجريبي",
  phone: "0500000000",
  city: "الرياض",
  shipments: 0,
  balance,
  updatedAt: "2026-01-01T00:00:00.000Z",
  scope: "shared",
  version: 1,
});
const change = (
  id: string,
  expectedVersion: number | null,
  data: EntityRecord = account("a-1")
): PendingChange => ({
  id,
  label: "test",
  createdAt: "2026-01-01T00:00:00.000Z",
  entity: "account",
  recordId: data.id,
  expectedVersion,
  data,
});

const user = (role: "user" | "admin" = "user", openId = "member") => ({
  id: 7,
  openId,
  role,
});

describe("operations pure policy", () => {
  it("never promotes the first visitor and only a configured owner/root admin gets admin", () => {
    vi.stubEnv("OWNER_OPEN_ID", "owner-open-id");
    expect(roleForUser(user("user", "visitor"), null)).toBeNull();
    expect(roleForUser(user("user", "owner-open-id"), null)).toBe("admin");
    expect(roleForUser(user("admin", "database-admin"), null)).toBe("admin");
    expect(canManageMembers(user("user", "visitor"), "staff")).toBe(false);
    vi.unstubAllEnvs();
  });

  it("enforces ACL and optimistic versions without overwriting the current row", () => {
    let state = new Map<string, MemoryRow>();
    const created = applyChangeInMemory(
      state,
      parseChange(change("c-1", null)),
      "accountant"
    );
    state = created.nextState;
    expect(created.result.applied).toHaveLength(1);
    expect(
      (created.result.applied[0]?.record as EntityRecord & { balance: number })
        .balance
    ).toBe(0);

    const stale = applyChangeInMemory(
      state,
      parseChange(change("c-2", 99, account("a-1", 40))),
      "accountant"
    );
    expect(stale.result.applied).toHaveLength(0);
    expect(stale.result.conflicts[0]?.reason).toBe("version_conflict");
    expect(
      (stale.result.conflicts[0]?.current as EntityRecord & { balance: number })
        .balance
    ).toBe(0);

    const forbidden = applyChangeInMemory(
      state,
      parseChange({
        ...change("c-3", 1),
        entity: "invoice",
        recordId: "i-1",
        data: {
          id: "i-1",
          account: "a-1",
          amount: 10,
          status: "بانتظار الدفع",
          issuedAt: "2026-01-01",
        },
      }),
      "staff"
    );
    expect(forbidden.result.conflicts[0]?.reason).toBe("forbidden");
  });

  it("replays the same receipt and never applies a duplicate change", () => {
    let state = new Map<string, MemoryRow>();
    const receipts = new Map<string, SyncResult>();
    const sync = (input: PendingChange, role: AppRole) => {
      const receipt = receipts.get(input.id);
      if (receipt) return receipt;
      const applied = applyChangeInMemory(state, parseChange(input), role);
      state = applied.nextState;
      receipts.set(input.id, applied.result);
      return applied.result;
    };
    const first = sync(change("same-id", null), "accountant");
    const retry = sync(
      change("same-id", null, account("a-1", 999)),
      "accountant"
    );
    expect(first).toEqual(retry);
    expect(state.get("account:a-1")?.data).toMatchObject({ balance: 0 });
  });

  it("rejects unknown fields and unsafe values", () => {
    expect(() =>
      parseChange({
        ...change("bad", null),
        data: { ...account("bad"), unknown: true },
      })
    ).toThrow();
    expect(() =>
      parseChange({
        ...change("bad2", null),
        data: { ...account("bad2"), balance: Number.NaN },
      })
    ).toThrow();
  });
});
