import { describe, expect, it } from "vitest";
import {
  canonicalDutyCommand,
  projectDutyAvailability,
  type DutyEventSnapshot,
} from "./duty";

const scope = {
  accountType: "employee" as const,
  role: "staff" as const,
  offices: ["dubai"] as const,
  membershipVersion: 4,
};

function event(overrides: Partial<DutyEventSnapshot> = {}): DutyEventSnapshot {
  return {
    id: 1,
    userId: 7,
    actorId: 7,
    role: "staff",
    officeId: "dubai",
    status: "on",
    reason: "start",
    membershipVersion: 4,
    expiresAt: new Date("2026-10-24T20:00:00.000Z"),
    requestKey: "req-1",
    createdAt: new Date("2026-10-24T12:00:00.000Z"),
    ...overrides,
  };
}

describe("shared duty contract", () => {
  it("projects a current activation as availability, not attendance", () => {
    const result = projectDutyAvailability(
      { id: 7, name: "Worker" },
      event(),
      scope,
      new Date("2026-10-24T13:00:00.000Z")
    );

    expect(result).toMatchObject({
      id: 7,
      role: "staff",
      office: "dubai",
      status: "on",
    });
    expect(result).not.toHaveProperty("gps");
    expect(result).not.toHaveProperty("attendance");
  });

  it("turns expired, off, and membership-stale events into off", () => {
    const now = new Date("2026-10-24T21:00:00.000Z");
    expect(
      projectDutyAvailability({ id: 7, name: "Worker" }, event(), scope, now)
        ?.status
    ).toBe("off");
    expect(
      projectDutyAvailability(
        { id: 7, name: "Worker" },
        event({ status: "off", expiresAt: null }),
        scope,
        new Date("2026-10-24T13:00:00.000Z")
      )?.status
    ).toBe("off");
    expect(
      projectDutyAvailability(
        { id: 7, name: "Worker" },
        event({ membershipVersion: 5 }),
        scope,
        new Date("2026-10-24T13:00:00.000Z")
      )?.status
    ).toBe("off");
  });

  it("canonicalizes the immutable command payload", () => {
    const command = {
      id: "cmd-1",
      requestKey: "req-1",
      officeId: "dubai" as const,
      role: "staff" as const,
      reason: "start",
    };
    expect(canonicalDutyCommand("activate", command, 7)).toBe(
      canonicalDutyCommand("activate", command, 7)
    );
    expect(canonicalDutyCommand("activate", command, 7)).not.toBe(
      canonicalDutyCommand("deactivate", command, 7)
    );
  });
});
