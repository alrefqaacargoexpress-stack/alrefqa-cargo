import { describe, expect, it } from "vitest";
import {
  officeMembershipSchema,
  canReadOfficeRecord,
  canWriteOfficeRecord,
} from "./branches";
import { canWrite, canViewFinance, type Shipment } from "./operations";
import { employeeFinanceOffice } from "./finance";
import {
  assertOfficeRecordWrite,
  canManageMembers,
} from "../server/operations";
import { assertTrackingCommand } from "./tracking";
import { canDeleteShipment } from "./shipmentDeletion";
const assignment = {
  userId: 8,
  role: "office_manager",
  offices: ["dubai"],
  homeOffice: "dubai",
  expectedVersion: 0,
};
const cargo = {
  id: "S1",
  tracking: "S1",
  account: "Customer",
  route: "Dubai",
  service: "جوي",
  status: "قيد التجهيز",
  eta: "later",
  amount: 20,
  officeId: "dubai",
} as Shipment;
describe("Office manager boundaries", () => {
  it("requires exactly one supported office assigned by the general manager", () => {
    for (const office of ["dubai", "turkey", "china"])
      expect(
        officeMembershipSchema.safeParse({
          ...assignment,
          offices: [office],
          homeOffice: office,
        }).success
      ).toBe(true);
    for (const offices of [[], ["nouakchott"], ["dubai", "china"]])
      expect(
        officeMembershipSchema.safeParse({
          ...assignment,
          offices,
          homeOffice: null,
        }).success
      ).toBe(false);
    expect(
      officeMembershipSchema.safeParse({ ...assignment, homeOffice: "china" })
        .success
    ).toBe(false);
    expect(
      officeMembershipSchema.safeParse({ ...assignment, role: "admin" }).success
    ).toBe(false);
  });
  it("permits shipment oversight and financial reading without financial or user mutations", () => {
    expect(canWrite("office_manager", "shipment")).toBe(true);
    expect(canWrite("office_manager", "invoice")).toBe(false);
    expect(canWrite("office_manager", "account")).toBe(false);
    expect(canViewFinance("office_manager")).toBe(true);
    expect(
      canManageMembers(
        { role: "user", openId: "office-manager-test" },
        "office_manager"
      )
    ).toBe(false);
    expect(canDeleteShipment("office_manager", cargo)).toBe(false);
  });
  it("hides another office even when its shipment passes through this office", () => {
    const other = {
      ...cargo,
      officeId: "china",
      journey: { branch: "dubai" },
    } as Shipment;
    expect(
      canReadOfficeRecord("office_manager", ["dubai"], "shipment", cargo)
    ).toBe(true);
    expect(
      canReadOfficeRecord("office_manager", ["dubai"], "shipment", other)
    ).toBe(false);
    expect(
      canWriteOfficeRecord("office_manager", ["dubai"], "shipment", other)
    ).toBe(false);
    expect(canReadOfficeRecord("office_manager", null, "shipment", cargo)).toBe(
      false
    );
    expect(
      canReadOfficeRecord(
        "office_manager",
        ["dubai", "china"],
        "shipment",
        cargo
      )
    ).toBe(false);
  });
  it("rejects movement of record ownership across branches", () => {
    expect(() =>
      assertOfficeRecordWrite(
        "office_manager",
        ["dubai"],
        "shipment",
        cargo,
        null
      )
    ).not.toThrow();
    expect(() =>
      assertOfficeRecordWrite(
        "office_manager",
        ["dubai"],
        "shipment",
        { ...cargo, officeId: "china" },
        cargo
      )
    ).toThrow();
    expect(() =>
      assertOfficeRecordWrite("office_manager", ["dubai"], "shipment", cargo, {
        ...cargo,
        officeId: "china",
      })
    ).toThrow();
    expect(() =>
      assertOfficeRecordWrite("office_manager", null, "shipment", cargo, null)
    ).toThrow();
  });
  it("keeps invoice debt attributed to the assigned office", () => {
    const scope = {
      role: "office_manager" as const,
      offices: ["dubai" as const],
      homeOffice: "dubai" as const,
    };
    expect(employeeFinanceOffice(scope)).toBe("dubai");
    expect(() => employeeFinanceOffice(scope, "china")).toThrow(
      "financial_office_mismatch"
    );
  });
  it("allows tracking notes but not general-manager cancellation", () => {
    const planned = {
      ...cargo,
      journey: {
        stage: "preparing",
        branch: "dubai",
        expectedDays: 8,
        startedAt: "2026-10-22T12:00:00Z",
        updatedAt: "2026-10-22T12:00:00Z",
        notes: [],
      },
    } as Shipment;
    expect(() =>
      assertTrackingCommand("office_manager", planned, {
        type: "note",
        text: "packing checked",
      })
    ).not.toThrow();
    expect(() =>
      assertTrackingCommand("office_manager", cargo, {
        type: "cancel",
        reason: "test",
      })
    ).toThrow("tracking_forbidden");
  });
});
