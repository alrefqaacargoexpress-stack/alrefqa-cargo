import { describe, expect, it } from "vitest";
import {
  canWrite,
  type Account,
  type Invoice,
  type Shipment,
} from "@shared/operations";
import { canReadOfficeRecord, officeMembershipSchema } from "@shared/branches";
import { assertOfficeRecordWrite, prepareRecordForWrite } from "./operations";
import { assertTrackingCommand } from "@shared/tracking";
import { canDeleteShipment } from "@shared/shipmentDeletion";

const at = "2026-10-22T20:00:00.000Z";
const cargo: Shipment = {
  id: "S-test",
  tracking: "S-test",
  account: "Clients",
  route: "Dubai → Nouakchott",
  service: "جوي",
  status: "قيد التجهيز",
  eta: "Not confirmed",
  amount: 0,
  officeId: "dubai",
  packing: {
    source: "dubai",
    pricePerKg: 0,
    createdAt: at,
    updatedAt: at,
    cartons: [
      {
        number: 1,
        closed: false,
        goods: [
          {
            id: "G-test",
            name: "Brand",
            phone: "0012345",
            unitWeight: 1,
            pieces: 2,
          },
        ],
      },
    ],
  },
};
const account: Account = {
  id: "A-test",
  name: "Client",
  phone: "0012345",
  city: "Dubai",
  balance: 0,
  shipments: 0,
  officeId: "dubai",
  updatedAt: at,
};

describe("Warehouse and accountant capability boundaries", () => {
  it("gives warehouse cargo access, never account or invoice writes", () => {
    expect(canWrite("staff", "shipment")).toBe(true);
    expect(canWrite("staff", "account")).toBe(false);
    expect(canWrite("staff", "invoice")).toBe(false);
    expect(canReadOfficeRecord("staff", ["dubai"], "account", account)).toBe(
      false
    );
    for (const role of ["admin", "office_manager", "accountant"] as const)
      expect(canWrite(role, "invoice")).toBe(false);
    expect(canWrite("office_manager", "account")).toBe(false);
    expect(canWrite("admin", "account")).toBe(false);
    expect(canWrite("accountant", "account")).toBe(true);
  });
  it("requires a single office and a source office for the stage permission", () => {
    const member = {
      userId: 8,
      role: "staff",
      offices: ["dubai"],
      homeOffice: "dubai",
      expectedVersion: 0,
      canUpdateTracking: true,
    };
    expect(officeMembershipSchema.safeParse(member).success).toBe(true);
    expect(
      officeMembershipSchema.safeParse({
        ...member,
        offices: ["dubai", "china"],
      }).success
    ).toBe(false);
    expect(
      officeMembershipSchema.safeParse({
        ...member,
        offices: ["nouakchott"],
        homeOffice: "nouakchott",
      }).success
    ).toBe(false);
    expect(
      officeMembershipSchema.safeParse({ ...member, role: "accountant" })
        .success
    ).toBe(false);
    expect(
      officeMembershipSchema.safeParse({
        ...member,
        role: "source_warehouse",
        offices: ["nouakchott"],
        homeOffice: "nouakchott",
        canUpdateTracking: false,
      }).success
    ).toBe(false);
    expect(
      officeMembershipSchema.safeParse({
        ...member,
        role: "destination_warehouse",
        offices: ["dubai"],
        homeOffice: "dubai",
        canUpdateTracking: false,
      }).success
    ).toBe(false);
    expect(
      officeMembershipSchema.safeParse({
        ...member,
        role: "destination_warehouse",
        offices: ["nouakchott"],
        homeOffice: "nouakchott",
        canUpdateTracking: false,
      }).success
    ).toBe(true);
    expect(canReadOfficeRecord("staff", null, "shipment", cargo)).toBe(false);
    expect(
      canReadOfficeRecord("accountant", ["dubai", "china"], "account", account)
    ).toBe(false);
  });
  it("cannot create source cargo from Nouakchott or move a legacy source shipment", () => {
    expect(() =>
      assertOfficeRecordWrite("staff", ["dubai"], "shipment", cargo, null)
    ).not.toThrow();
    expect(() =>
      assertOfficeRecordWrite(
        "staff",
        ["nouakchott"],
        "shipment",
        { ...cargo, officeId: "nouakchott" },
        null
      )
    ).toThrow();
    const { officeId, ...legacy } = cargo;
    expect(() =>
      assertOfficeRecordWrite(
        "staff",
        ["china"],
        "shipment",
        { ...cargo, officeId: "china" },
        legacy
      )
    ).toThrow();
  });
  it("cannot disguise a foreign source with an allowed operational office id", () => {
    const forged = {
      ...cargo,
      packing: { ...cargo.packing!, source: "china" as const },
    };
    for (const role of ["staff", "office_manager", "admin"] as const)
      expect(() =>
        assertOfficeRecordWrite(role, ["dubai"], "shipment", forged, null)
      ).toThrow("shipment_source_office_mismatch");
    expect(() =>
      assertOfficeRecordWrite("staff", ["dubai"], "shipment", cargo, null)
    ).not.toThrow();
  });
  it("blocks every generic invoice, including legacy paid invoices", () => {
    const invoice = {
      id: "I-test",
      account: "A-test",
      amount: 10,
      status: "مدفوعة",
      issuedAt: at,
    } as Invoice;
    for (const role of ["admin", "accountant", "office_manager"] as const)
      expect(() => prepareRecordForWrite(role, invoice, null)).toThrow(
        "finance_command_required"
      );
  });
  it("prevents direct balance edits or financial opening through account creation", () => {
    expect(() =>
      prepareRecordForWrite("accountant", { ...account, balance: 99 }, account)
    ).toThrow("finance_command_required");
    expect(() =>
      prepareRecordForWrite("accountant", { ...account, balance: 99 }, null)
    ).toThrow("finance_command_required");
    expect(
      prepareRecordForWrite(
        "accountant",
        { ...account, name: "Renamed" },
        account
      )
    ).toMatchObject({ name: "Renamed", balance: 0 });
  });
  it("keeps financial settings under the accountant command API", () => {
    expect(() =>
      prepareRecordForWrite(
        "staff",
        { ...cargo, packing: { ...cargo.packing!, pricePerKg: 3 } },
        null
      )
    ).toThrow("financial_write_forbidden");
    expect(() =>
      prepareRecordForWrite(
        "admin",
        { ...cargo, packing: { ...cargo.packing!, pricePerKg: 3 } },
        cargo
      )
    ).toThrow("finance_command_required");
  });
  it("permits adding goods but not route, shipment identity or final status changes", () => {
    const next = structuredClone(cargo);
    next.packing!.cartons[0].goods.push({
      id: "G-second",
      name: "Second",
      phone: "",
      unitWeight: 2,
      pieces: 1,
    });
    expect(
      (prepareRecordForWrite("staff", next, cargo) as Shipment).packing
        ?.cartons[0].goods
    ).toHaveLength(2);
    expect(() =>
      prepareRecordForWrite("staff", { ...cargo, route: "Different" }, cargo)
    ).toThrow("warehouse_fields_forbidden");
    expect(() =>
      prepareRecordForWrite("staff", { ...cargo, status: "مسلّمة" }, cargo)
    ).toThrow("tracking_command_required");
    expect(canDeleteShipment("staff", cargo)).toBe(false);
  });
  it("preserves an omitted storage field but refuses forged storage updates", () => {
    const current = {
      ...cargo,
      destinationStorage: [
        {
          goodsId: "G-test",
          warehouse: "Main",
          shelf: "R01",
          updatedAt: at,
          updatedBy: 2,
        },
      ],
    };
    const changed = prepareRecordForWrite("admin", cargo, current) as Shipment;
    expect(changed.destinationStorage).toEqual(current.destinationStorage);
    expect(() =>
      prepareRecordForWrite(
        "admin",
        { ...current, destinationStorage: [] },
        current
      )
    ).toThrow("warehouse_command_required");
  });
  it("warehouse stages move sequentially, never transfer, note or cancel", () => {
    const current = {
      ...cargo,
      journey: {
        stage: "dubai_airport",
        branch: "dubai",
        startedAt: at,
        updatedAt: at,
        expectedDays: 9,
        notes: [],
      },
    } as Shipment;
    expect(() =>
      assertTrackingCommand("staff", current, {
        type: "stage",
        stage: "dubai_customs",
        reason: "Verified",
      })
    ).not.toThrow();
    expect(() =>
      assertTrackingCommand("staff", current, {
        type: "stage",
        stage: "dakar_airport",
        reason: "Skip",
      })
    ).toThrow();
    expect(() =>
      assertTrackingCommand("staff", current, {
        type: "transfer",
        branch: "china",
        reason: "Move",
      })
    ).toThrow();
    expect(() =>
      assertTrackingCommand("staff", current, {
        type: "note",
        text: "Not a stage",
      })
    ).toThrow();
    expect(() =>
      assertTrackingCommand("staff", cargo, {
        type: "stage",
        stage: "preparing",
        reason: "Confirmed preparation",
      })
    ).not.toThrow();
  });
});
