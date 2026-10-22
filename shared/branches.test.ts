import { describe, expect, it } from "vitest";
import {
  canReadOfficeRecord,
  canWriteOfficeRecord,
  defaultOfficeProfile,
  mapsHref,
  officeMembershipSchema,
  officeProfileSchema,
  ownerOffice,
  recordBelongsToOffice,
  shipmentOffices,
} from "./branches";
import { createPackedShipment } from "./packing";
import type { Account, Invoice } from "./operations";
const shipment = () =>
  createPackedShipment({ tracking: "OFFICE", source: "dubai", pricePerKg: 1 });
const account: Account = {
  id: "A",
  name: "Account",
  phone: "12345",
  city: "China",
  shipments: 1,
  balance: 10,
  updatedAt: "2026-10-21",
};
const invoice: Invoice = {
  id: "I",
  account: "Account",
  amount: 10,
  status: "مدفوعة",
  issuedAt: "2026-10-21",
};
describe("Office profiles and explicit record scope", () => {
  it("persists a deliberately selected operational office without changing the physical source", () => {
    const selected = createPackedShipment({
      tracking: "NKT-ENTRY",
      source: "dubai",
      officeId: "nouakchott",
      pricePerKg: 1,
    });
    expect(selected.officeId).toBe("nouakchott");
    expect(selected.packing.source).toBe("dubai");
    expect(shipment().officeId).toBeUndefined();
  });
  it("starts all office profiles without guessed addresses, coordinates, hours or employees", () => {
    for (const id of ["nouakchott", "dubai", "china", "turkey"] as const) {
      const profile = defaultOfficeProfile(id);
      expect(profile.address).toBe("");
      expect(profile.mapUrl).toBeNull();
      expect(profile.hours).toEqual([]);
      expect(profile.employees).toEqual([]);
      const { version, ...data } = profile;
      expect(officeProfileSchema.safeParse(data).success).toBe(true);
    }
  });
  it("validates a manually pasted HTTPS map link and break bounds without accessing device location", () => {
    const { version, ...profile } = defaultOfficeProfile("nouakchott");
    expect(
      officeProfileSchema.safeParse({
        ...profile,
        mapUrl: "javascript:alert(1)",
      }).success
    ).toBe(false);
    expect(
      officeProfileSchema.safeParse({
        ...profile,
        mapUrl: "https://maps.google.com/?q=1,2",
      }).success
    ).toBe(true);
    expect(
      officeProfileSchema.safeParse({
        ...profile,
        hours: [
          {
            day: 1,
            closed: false,
            work: { start: "09:00", end: "18:00" },
            break: { start: "08:00", end: "10:00" },
          },
        ],
      }).success
    ).toBe(false);
    expect(mapsHref("https://maps.google.com/?q=1,2")).toBe(
      "https://maps.google.com/?q=1,2"
    );
  });
  it("accepts public employee name and phone but rejects login or permissions fields in public contact data", () => {
    const { version, ...profile } = defaultOfficeProfile("turkey");
    const employee = {
      id: "contact",
      name: "Office employee",
      phone: "+90 123456789",
    };
    expect(
      officeProfileSchema.safeParse({ ...profile, employees: [employee] })
        .success
    ).toBe(true);
    expect(
      officeProfileSchema.safeParse({
        ...profile,
        employees: [{ ...employee, role: "admin", email: "private" }],
      }).success
    ).toBe(false);
  });
  it("keeps old financial records unassigned rather than guessing by city, name or payment", () => {
    expect(ownerOffice("account", account)).toBeNull();
    expect(ownerOffice("invoice", invoice)).toBeNull();
    expect(recordBelongsToOffice("account", account, "china")).toBe(false);
    expect(ownerOffice("account", { ...account, officeId: "china" })).toBe(
      "china"
    );
  });
  it("displays a source shipment without rewriting it and shows Nouakchott only on actual inbound tracking", () => {
    const original = shipment();
    expect(shipmentOffices(original)).toEqual(["dubai"]);
    const inbound = {
      ...original,
      journey: {
        stage: "to_nouakchott" as const,
        branch: "dakar" as const,
        startedAt: "2026-10-21T00:00:00.000Z",
        expectedDays: 9,
        updatedAt: "2026-10-21T00:00:00.000Z",
        notes: [],
      },
    };
    expect(shipmentOffices(inbound)).toEqual(["dubai", "nouakchott"]);
    expect(original.journey).toBeUndefined();
    expect(original.officeId).toBeUndefined();
  });
  it("keeps administrator access and denies unassigned or foreign warehouse/accountant access", () => {
    const original = shipment();
    expect(canReadOfficeRecord("staff", null, "shipment", original)).toBe(
      false
    );
    expect(canReadOfficeRecord("admin", [], "shipment", original)).toBe(true);
    expect(canReadOfficeRecord("staff", ["china"], "shipment", original)).toBe(
      false
    );
    expect(
      canWriteOfficeRecord("accountant", ["china"], "account", {
        ...account,
        officeId: "china",
      })
    ).toBe(true);
    expect(
      canWriteOfficeRecord("accountant", ["china"], "account", account)
    ).toBe(false);
    expect(canReadOfficeRecord("staff", [], "shipment", original)).toBe(false);
  });
  it("does not grant access merely from a public telephone or permit global administrator promotion in office assignment", () => {
    expect(
      officeMembershipSchema.safeParse({
        userId: 1,
        role: "staff",
        offices: ["dubai"],
        expectedVersion: 0,
      }).success
    ).toBe(true);
    expect(
      officeMembershipSchema.safeParse({
        userId: 1,
        role: "admin",
        offices: ["dubai"],
        expectedVersion: 0,
      }).success
    ).toBe(false);
    expect(
      officeMembershipSchema.safeParse({
        userId: 1,
        role: "staff",
        offices: ["dubai", "dubai"],
        expectedVersion: 0,
      }).success
    ).toBe(false);
  });
});
