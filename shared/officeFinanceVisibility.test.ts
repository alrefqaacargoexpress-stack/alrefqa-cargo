import { describe, it, expect } from "vitest";
import {
  canBillShipmentCurrency,
  protectOfficeShipmentFinance,
} from "./officeFinanceVisibility";
import { createPackedShipment } from "./packing";
import type { Shipment } from "./operations";
const source = createPackedShipment({
  id: "visibility",
  tracking: "TEST",
  source: "dubai",
  pricePerKg: 10,
  pricePerKgMRU: 100,
  officeId: "dubai",
});
const incoming = {
  ...source,
  journey: { branch: "nouakchott", stage: "to_nouakchott" },
} as unknown as Shipment;
describe("Destination-office billing visibility", () => {
  it("lets the Nouakchott accountant bill its MRU quote without accessing source prices", () => {
    expect(
      canBillShipmentCurrency("accountant", ["nouakchott"], incoming, "MRU")
    ).toBe(true);
    expect(
      canBillShipmentCurrency("accountant", ["nouakchott"], incoming, "AED")
    ).toBe(false);
    const visible = protectOfficeShipmentFinance(incoming, "accountant", [
      "nouakchott",
    ]);
    expect(visible.packing?.pricePerKg).toBe(0);
    expect(visible.packing?.pricePerKgMRU).toBe(100);
    expect(incoming.packing?.pricePerKg).toBe(10);
  });
  it("does not expose a quote for an inaccessible destination or to a non-financial role", () => {
    expect(
      canBillShipmentCurrency("accountant", ["turkey"], incoming, "MRU")
    ).toBe(false);
    expect(
      canBillShipmentCurrency("tracking_staff", ["nouakchott"], incoming, "MRU")
    ).toBe(false);
  });
  it("preserves the source accountant's own quotes", () => {
    expect(
      protectOfficeShipmentFinance(incoming, "accountant", ["dubai"])
    ).toBe(incoming);
  });
});
