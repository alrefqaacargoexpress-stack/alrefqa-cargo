import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadWorkspace,
  saveWorkspace,
  stageChange,
  applySyncResult,
  type Workspace,
} from "./offlineStore";
import { EMPTY_STATE, type Account } from "@shared/operations";
const account: Account = {
  id: "OFF-ACCOUNT",
  name: "Office account",
  phone: "",
  city: "Nouakchott",
  shipments: 0,
  balance: 100,
  updatedAt: "2026-10-21T00:00:00.000Z",
  officeId: "nouakchott",
};
describe("Office data local preservation", () => {
  const storage = new Map<string, string>();
  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    vi.stubGlobal("window", { localStorage });
    vi.stubGlobal("navigator", {
      locks: {
        request: async (_key: string, callback: () => Promise<unknown>) =>
          callback(),
      },
    });
  });
  it("preserves optional office metadata and an optional account telephone after reloading a saved workspace", async () => {
    const workspace: Workspace = {
      state: { ...EMPTY_STATE, accounts: [account] },
      queue: [],
      revision: 0,
    };
    await saveWorkspace("9801", workspace);
    expect(loadWorkspace("9801").state.accounts[0]).toEqual(account);
  });
  it("keeps office assignment in queued exports and rejected synchronization rather than replacing data", () => {
    const initial: Workspace = {
      state: { ...EMPTY_STATE, accounts: [] },
      queue: [],
      revision: 0,
    };
    const queued = stageChange(
      initial,
      "account",
      account,
      "Nouakchott account"
    );
    const after = applySyncResult(queued, {
      applied: [],
      conflicts: [
        {
          changeId: queued.queue[0].id,
          reason: "office_access_changed",
          current: null,
        },
      ],
    });
    expect(after.queue[0].data.officeId).toBe("nouakchott");
    expect(after.state.accounts[0].balance).toBe(100);
  });
  it("does not assign an office automatically to historical accounts from a city label", () => {
    const { officeId, ...legacy } = account;
    const initial: Workspace = {
      state: { ...EMPTY_STATE, accounts: [legacy] },
      queue: [],
      revision: 0,
    };
    expect(loadWorkspace("unrelated-user").state.accounts).toEqual([]);
    const queued = stageChange(
      initial,
      "account",
      { ...legacy, balance: 120 },
      "Legacy account"
    );
    expect(queued.queue[0].data.officeId).toBeUndefined();
  });
});
