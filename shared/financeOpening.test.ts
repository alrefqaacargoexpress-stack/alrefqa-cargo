import { describe, expect, it } from "vitest";
import {
  canWriteFinance,
  deriveShipmentReceivables,
  employeeFinanceOffice,
  financeCommandSchema,
  type FinanceCommand,
} from "./finance";
import { createPackedShipment, addPackingGoods } from "./packing";

describe("opening balance and source receivables contracts", () => {
  it("requires explicit office, currency, direction, date, amount and note", () => {
    const command: FinanceCommand = {
      id: "opening-command",
      kind: "opening_balance",
      createdAt: "2026-10-22T00:00:00.000Z",
      payload: {
        openingId: "opening-one",
        officeId: "nouakchott",
        currency: "MRU",
        direction: "credit",
        date: "2026-10-22",
        amount: 10,
        note: "Opening count",
      },
    };
    expect(financeCommandSchema.parse(command)).toEqual(command);
    expect(
      financeCommandSchema.safeParse({
        ...command,
        payload: { ...command.payload, note: "" },
      }).success
    ).toBe(false);
  });

  it("allows only the assigned accountant home office to write", () => {
    expect(
      canWriteFinance({
        role: "accountant",
        offices: ["nouakchott"],
        homeOffice: "nouakchott",
      })
    ).toBe(true);
    expect(
      canWriteFinance({
        role: "admin",
        offices: null,
        homeOffice: null,
      })
    ).toBe(false);
    expect(
      canWriteFinance({
        role: "office_manager",
        offices: ["nouakchott"],
        homeOffice: "nouakchott",
      })
    ).toBe(false);
    expect(() =>
      employeeFinanceOffice(
        {
          role: "accountant",
          offices: ["nouakchott"],
          homeOffice: "nouakchott",
        },
        "dubai"
      )
    ).toThrow("financial_office_mismatch");
  });

  it("derives source receivables per shipment with tracking, currency and amount", () => {
    let shipment = createPackedShipment({
      tracking: "SRC-001",
      source: "china",
      pricePerKg: 10,
      officeId: "china",
    });
    shipment = addPackingGoods(shipment, {
      name: "Box",
      phone: "222",
      unitWeight: 2,
      pieces: 1,
    });
    shipment.status = "في الطريق";
    const [row] = deriveShipmentReceivables([shipment], ["china"]);
    expect(row).toMatchObject({
      officeId: "china",
      currency: "CNY",
      total: 20,
    });
    expect(row.shipments).toEqual([
      expect.objectContaining({
        shipmentId: shipment.id,
        tracking: "SRC-001",
        amount: 20,
      }),
    ]);
  });
});
