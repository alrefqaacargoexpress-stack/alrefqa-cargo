import { describe, expect, it } from "vitest";
import { readDelegationPolicy } from "./branches";
import { blankPermissions } from "../shared/permissions";

function database(rows: unknown[]) {
  return { select: () => ({ from: () => ({ where: async () => rows }) }) };
}
const policy = {
  managerUserId: 3,
  officeId: "dubai",
  managerMembershipVersion: 5,
  policyVersion: 1,
  enabled: true,
  permissions: { ...blankPermissions(), invoices: "manage" },
};

describe("root-approved delegation policy is fail-closed", () => {
  it("uses a matching current policy without granting manager execution", async () => {
    const result = await readDelegationPolicy(
      database([policy]),
      3,
      "dubai",
      5
    );
    expect(result.configured).toBe(true);
    expect(result.ceiling?.invoices).toBe("manage");
    expect(result.policyVersion).toBe(1);
  });
  it("does not resurrect an older enabled policy after the latest revoke", async () => {
    const result = await readDelegationPolicy(
      database([policy, { ...policy, policyVersion: 2, enabled: false }]),
      3,
      "dubai",
      5
    );
    expect(result).toEqual({ configured: true });
  });
  it("rejects stale membership versions and does not use an earlier matching policy", async () => {
    expect(
      await readDelegationPolicy(
        database([
          { ...policy, policyVersion: 2, managerMembershipVersion: 4 },
          policy,
        ]),
        3,
        "dubai",
        5
      )
    ).toEqual({ configured: true });
  });
  it("never treats a database failure as absence of a configured policy", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: async () => {
            throw new Error("read failed");
          },
        }),
      }),
    };
    await expect(readDelegationPolicy(db, 3, "dubai", 5)).rejects.toThrow(
      "read failed"
    );
  });
  it("distinguishes genuinely absent policies from another office policy", async () => {
    expect(
      await readDelegationPolicy(database([policy]), 3, "turkey", 5)
    ).toEqual({ configured: false });
  });
});
