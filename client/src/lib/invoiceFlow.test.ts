import { describe, expect, it } from "vitest";
import { canWriteFinanceUi, invoiceGoodsTotals } from "./financeInvoiceCopy";

describe("invoice flow UI helpers", () => {
  it("allows writes only for an accountant with one valid home office", () => {
    expect(canWriteFinanceUi("accountant", ["dubai"], "dubai")).toBe(true);
    expect(canWriteFinanceUi("office_manager", ["dubai"], "dubai")).toBe(false);
    expect(canWriteFinanceUi("admin", ["dubai"], "dubai")).toBe(true);
    expect(canWriteFinanceUi("accountant", ["dubai", "china"], "dubai")).toBe(
      false
    );
    expect(canWriteFinanceUi("accountant", ["dubai"], "china")).toBe(false);
    expect(canWriteFinanceUi("accountant", null, "dubai")).toBe(false);
  });

  it("sums real weight and pieces rather than selected-line count", () => {
    expect(
      invoiceGoodsTotals([
        { weight: 2.125, pieces: 3 },
        { weight: 0.5, pieces: 2 },
      ])
    ).toEqual({ weight: 2.625, pieces: 5 });
  });
});
