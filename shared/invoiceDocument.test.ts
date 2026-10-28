import { describe, expect, it } from "vitest";
import { blankPermissions } from "./permissions";
import type { FinanceCommand } from "./finance";
import type { Invoice } from "./operations";
import { invoiceDocumentAmounts, invoicePrintAccess } from "./invoiceDocument";

const recordedAt = "2026-10-28T12:00:00.000Z";

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "invoice-1",
    account: "Customer",
    amount: 128.75,
    status: "دين",
    issuedAt: "2026-10-28",
    officeId: "dubai",
    scope: "shared",
    version: 3,
    finance: {
      customerId: "customer-1",
      chargeKind: "shipping",
      paymentMode: "cash",
      issuingOfficeId: "dubai",
      financialOfficeId: "dubai",
      actorId: 7,
      actorName: "Accountant",
      recordedAt,
      currency: "AED",
      shipmentId: "shipment-1",
      goods: [
        {
          goodsId: "goods-1",
          cartonNumber: 1,
          name: "One",
          phone: "",
          weight: 1.25,
          pieces: 2,
        },
        {
          goodsId: "goods-2",
          cartonNumber: 2,
          name: "Two",
          phone: "",
          weight: 0.75,
          pieces: 3,
        },
      ],
      baseAmount: 125,
      adjustment: { direction: "increase", amount: 3.75 },
      paidAmount: 28.75,
    },
    ...overrides,
  };
}

function subject(
  overrides: Partial<Parameters<typeof invoicePrintAccess>[1]> = {}
) {
  return {
    role: "viewer" as const,
    offices: ["dubai"] as const,
    homeOffice: "dubai" as const,
    permissionsCustomized: true,
    permissions: { ...blankPermissions(), invoices: "view" as const },
    ...overrides,
  };
}

function command(
  kind: "invoice" | "settlement",
  payload: Record<string, unknown>
): FinanceCommand {
  if (kind === "invoice") {
    return {
      id: "command-1",
      createdAt: recordedAt,
      kind,
      payload: {
        invoiceId: "invoice-1",
        customerId: "customer-1",
        issuingOfficeId: "dubai",
        chargeKind: "general",
        paymentMode: "cash",
        currency: "AED",
        goodsIds: [],
        manualAmount: 10,
        adjustment: { direction: "increase", amount: 0 },
        ...payload,
      },
    };
  }
  return {
    id: "command-2",
    createdAt: recordedAt,
    kind,
    payload: {
      invoiceId: "invoice-1",
      expectedVersion: 3,
      amount: 10,
      description: "cash",
      ...payload,
    },
  };
}

describe("invoice document helpers", () => {
  it("uses persisted amounts and aggregates exact grams and pieces", () => {
    expect(invoiceDocumentAmounts(invoice())).toEqual({
      ok: true,
      baseAmount: 125,
      total: 128.75,
      paid: 28.75,
      remaining: 100,
      adjustment: { direction: "increase", amount: 3.75 },
      weight: 2,
      pieces: 5,
    });
  });

  it("supports decreases and zero adjustments without repricing", () => {
    const decrease = invoice({
      amount: 121.25,
      finance: {
        ...invoice().finance!,
        adjustment: { direction: "decrease", amount: 3.75 },
        paidAmount: 0,
      },
    });
    expect(invoiceDocumentAmounts(decrease)).toMatchObject({
      ok: true,
      baseAmount: 125,
      total: 121.25,
      paid: 0,
      remaining: 121.25,
      adjustment: { direction: "decrease", amount: 3.75 },
    });
    const zero = invoice({
      amount: 125,
      status: "مدفوعة",
      finance: {
        ...invoice().finance!,
        adjustment: { direction: "increase", amount: 0 },
        paidAmount: 125,
      },
    });
    expect(invoiceDocumentAmounts(zero)).toMatchObject({
      ok: true,
      total: 125,
      paid: 125,
      remaining: 0,
    });
  });

  it("blocks either paid-status contradiction without changing a historical record", () => {
    const paidWithDebt = invoice({ status: "مدفوعة" });
    const before = structuredClone(paidWithDebt);
    expect(invoiceDocumentAmounts(paidWithDebt)).toEqual({
      ok: false,
      reason: "invalid_amounts",
    });
    const debtWithNoRemaining = invoice({
      finance: { ...invoice().finance!, paidAmount: 128.75 },
    });
    expect(invoiceDocumentAmounts(debtWithNoRemaining)).toEqual({
      ok: false,
      reason: "invalid_amounts",
    });
    const emptyPaid = invoice({
      amount: 0,
      status: "مدفوعة",
      finance: {
        ...invoice().finance!,
        baseAmount: 0,
        adjustment: { direction: "increase", amount: 0 },
        paidAmount: 0,
      },
    });
    expect(invoiceDocumentAmounts(emptyPaid)).toMatchObject({
      ok: true,
      total: 0,
      paid: 0,
      remaining: 0,
    });
    expect(paidWithDebt).toEqual(before);
  });

  it("rejects total mismatch, overpayment, missing finance, and invalid values", () => {
    expect(invoiceDocumentAmounts(invoice({ amount: 128.74 }))).toEqual({
      ok: false,
      reason: "total_mismatch",
    });
    expect(
      invoiceDocumentAmounts(
        invoice({
          finance: { ...invoice().finance!, paidAmount: 128.76 },
        })
      )
    ).toEqual({ ok: false, reason: "invalid_amounts" });
    expect(invoiceDocumentAmounts(invoice({ finance: undefined }))).toEqual({
      ok: false,
      reason: "missing_details",
    });
    expect(
      invoiceDocumentAmounts(
        invoice({
          finance: { ...invoice().finance!, currency: "GBP" as never },
        })
      )
    ).toEqual({ ok: false, reason: "invalid_amounts" });
    expect(
      invoiceDocumentAmounts(
        invoice({
          finance: { ...invoice().finance!, baseAmount: Number.NaN },
        })
      )
    ).toEqual({ ok: false, reason: "invalid_amounts" });
  });

  it("authorizes a readonly invoice viewer without edit or Excel access", () => {
    const result = invoicePrintAccess(invoice(), subject());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.pendingSettlement).toBe(false);
  });

  it("enforces custom permissions, office scope, and matching financial office", () => {
    expect(
      invoicePrintAccess(
        invoice(),
        subject({ permissions: { ...blankPermissions(), invoices: "none" } })
      )
    ).toEqual({ ok: false, reason: "forbidden" });
    expect(
      invoicePrintAccess(invoice(), subject({ offices: ["china"] as const }))
    ).toEqual({ ok: false, reason: "forbidden" });
    expect(
      invoicePrintAccess(
        invoice(),
        subject({ offices: ["dubai", "china"] as const })
      )
    ).toEqual({ ok: false, reason: "forbidden" });
    expect(
      invoicePrintAccess(invoice(), subject({ homeOffice: "china" as const }))
    ).toEqual({ ok: false, reason: "forbidden" });
    expect(
      invoicePrintAccess(
        invoice({
          finance: { ...invoice().finance!, financialOfficeId: "china" },
        }),
        subject()
      )
    ).toEqual({ ok: false, reason: "forbidden" });
  });

  it("requires a shared positive version and rejects pending invoice creation", () => {
    expect(
      invoicePrintAccess(invoice({ scope: "pending" }), subject())
    ).toEqual({
      ok: false,
      reason: "not_confirmed",
    });
    expect(invoicePrintAccess(invoice({ version: 0 }), subject())).toEqual({
      ok: false,
      reason: "not_confirmed",
    });
    expect(
      invoicePrintAccess(invoice(), subject(), [command("invoice", {})])
    ).toEqual({ ok: false, reason: "pending_invoice" });
  });

  it("reports pending settlement without increasing saved paid amount", () => {
    const result = invoicePrintAccess(invoice(), subject(), [
      command("settlement", { amount: 50 }),
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pendingSettlement).toBe(true);
      expect(result.amounts.paid).toBe(28.75);
      expect(result.amounts.remaining).toBe(100);
    }
  });

  it("does not mutate deeply frozen inputs", () => {
    const frozen = structuredClone(invoice());
    const before = structuredClone(frozen);
    Object.freeze(frozen.finance!.goods[0]);
    Object.freeze(frozen.finance!.goods[1]);
    Object.freeze(frozen.finance!.goods);
    Object.freeze(frozen.finance!.adjustment);
    Object.freeze(frozen.finance);
    Object.freeze(frozen);
    expect(invoicePrintAccess(frozen, subject())).toMatchObject({ ok: true });
    expect(frozen).toEqual(before);
  });
});
