import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareCustomerAccount } from "./customerAccountCreation";
import { accountDataSchema } from "../server/operations";
import { emptyWorkspace, stageChange } from "../client/src/lib/offlineStore";
import type { Account } from "./operations";
const account: Account = {
  id: "new-account",
  name: " عميل جديد ",
  phone: "+22211111",
  city: "",
  balance: 0,
  shipments: 0,
  updatedAt: "2026-10-22T01:00:00Z",
  officeId: "nouakchott",
};
beforeEach(() => {
  vi.stubGlobal("window", {
    localStorage: { getItem: () => null, setItem: () => {} },
  });
});
describe("new customer account creation", () => {
  it("accepts name and phone without a city in local and server schemas", () => {
    const prepared = prepareCustomerAccount(account, null, "accountant", [
      "nouakchott",
    ]);
    expect(prepared.name).toBe("عميل جديد");
    expect(accountDataSchema.safeParse(prepared).success).toBe(true);
    const draft = stageChange(
      emptyWorkspace(),
      "account",
      prepared,
      prepared.name
    );
    expect(draft.state.accounts).toHaveLength(1);
    expect(draft.queue[0].recordId).toBe(account.id);
  });
  it("rejects an office outside permissions and a viewer", () => {
    expect(() =>
      prepareCustomerAccount(account, null, "accountant", ["china"])
    ).toThrow("account_forbidden");
    expect(() =>
      prepareCustomerAccount(account, null, "viewer", ["nouakchott"])
    ).toThrow("account_forbidden");
  });
  it("preserves an existing office, old balance and metadata when editing contacts", () => {
    const existing = { ...account, balance: 850, shipments: 3 };
    const updated = prepareCustomerAccount(
      { ...account, name: "الاسم المصحح", officeId: "dubai" },
      existing,
      "admin",
      null
    );
    expect(updated.balance).toBe(850);
    expect(updated.shipments).toBe(3);
    expect(updated.officeId).toBe("nouakchott");
    expect(existing.name).toBe(account.name);
  });
  it("requires an office and phone for new accounts and never invents an opening credit", () => {
    expect(() =>
      prepareCustomerAccount(
        { ...account, officeId: undefined },
        null,
        "admin",
        null
      )
    ).toThrow("account_fields_required");
    expect(() =>
      prepareCustomerAccount({ ...account, phone: "" }, null, "admin", null)
    ).toThrow("account_fields_required");
    expect(() =>
      prepareCustomerAccount({ ...account, balance: 10 }, null, "admin", null)
    ).toThrow("opening_balance_requires_review");
  });
});
