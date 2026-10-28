import { describe, expect, it } from "vitest";
import type { Invoice } from "@shared/operations";
import {
  buildInvoicePrintHtml,
  escapeInvoiceHtml,
  invoicePdfFilename,
  invoicePrintDate,
} from "./invoicePrint";
import { invoicePrintCopy } from "./invoicePrintCopy";

export function printTestInvoice(): Invoice {
  return {
    id: "INV-2026-001",
    account: "زبون تجريبي للعرض فقط",
    amount: 33.41,
    status: "دين",
    issuedAt: "2026-10-28",
    officeId: "dubai",
    scope: "shared",
    version: 2,
    payment: {
      office: "dubai",
      methodId: "cash",
      methodLabel: "نقدي",
      reference: "R-001",
    },
    finance: {
      customerId: "TEST-CUSTOMER",
      chargeKind: "shipping",
      paymentMode: "on_account",
      issuingOfficeId: "dubai",
      financialOfficeId: "dubai",
      actorId: 1,
      actorName: "محاسب تجريبي",
      recordedAt: "2026-10-28T10:20:00.000Z",
      currency: "AED",
      shipmentId: "TEST-SHIPMENT",
      goods: [
        {
          goodsId: "G1",
          cartonNumber: 1,
          name: "قماش تجريبي",
          phone: "",
          weight: 0.933,
          pieces: 3,
        },
      ],
      baseAmount: 34.52,
      adjustment: { direction: "decrease", amount: 1.11 },
      paidAmount: 10.01,
    },
  };
}
const opts = {
  language: "ar" as const,
  online: true,
  lastReadAt: "2026-10-28T10:30:00.000Z",
  pendingSettlement: false,
};
describe("private printable invoice document", () => {
  it("prints the recorded total, paid, remaining and correction in exact cents without recalculating a rate", () => {
    const html = buildInvoicePrintHtml(printTestInvoice(), opts);
    for (const value of [
      "34.52 AED",
      "33.41 AED",
      "10.01 AED",
      "23.40 AED",
      "−1.11 AED",
      "0.933",
      "دبي",
      "R-001",
      "محاسب تجريبي",
    ])
      expect(html).toContain(value);
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("مؤسسة الرفكة للشحن");
    expect(html).toContain("size: A4");
    expect(html).toContain("table-header-group");
    expect(html).toContain("break-inside: avoid");
    expect(html).not.toContain("سعر الكيلو");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("https://");
  });
  it("escapes all invoice/customer/goods/payment text rather than creating HTML or scripts", () => {
    const invoice = printTestInvoice();
    invoice.account = '<img src=x onerror="alert(1)">';
    invoice.id = "</title><script>alert(1)</script>";
    invoice.finance!.goods[0].name =
      '<iframe src="https://evil.invalid"></iframe>';
    invoice.payment!.reference = '<svg onload="evil()">';
    const html = buildInvoicePrintHtml(invoice, opts);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<svg");
    expect(html).toContain("&lt;img");
    expect(html).toContain("&lt;iframe");
    expect(html).toContain("&lt;svg");
    expect(escapeInvoiceHtml("\"&<>'")).toBe("&quot;&amp;&lt;&gt;&#39;");
  });
  it("rejects mismatched totals, legacy details and nonconfirmed copies without changing the invoice", () => {
    const invoice = printTestInvoice();
    const original = structuredClone(invoice);
    expect(() =>
      buildInvoicePrintHtml({ ...invoice, amount: 99 }, opts)
    ).toThrow("total_mismatch");
    expect(() =>
      buildInvoicePrintHtml({ ...invoice, finance: undefined }, opts)
    ).toThrow("missing_details");
    expect(() =>
      buildInvoicePrintHtml({ ...invoice, scope: "pending" }, opts)
    ).toThrow("not_confirmed");
    expect(() =>
      buildInvoicePrintHtml({ ...invoice, version: 0 }, opts)
    ).toThrow("not_confirmed");
    expect(invoice).toEqual(original);
  });
  it("marks the offline snapshot and pending payments without adding them to confirmed paid", () => {
    const html = buildInvoicePrintHtml(printTestInvoice(), {
      ...opts,
      online: false,
      pendingSettlement: true,
    });
    expect(html).toContain(invoicePrintCopy.ar.offline);
    expect(html).toContain(invoicePrintCopy.ar.pendingPayment);
    expect(html).toContain("10.01 AED");
    expect(html).toContain("آخر قراءة للبيانات");
    expect(html).toContain("UTC");
  });
  it.each(["ar", "en", "zh", "tr"] as const)(
    "has translated print guidance and complete document structure for %s",
    language => {
      const html = buildInvoicePrintHtml(printTestInvoice(), {
        ...opts,
        language,
      });
      expect(html).toContain(`lang="${language}"`);
      expect(html).toContain(invoicePrintCopy[language].invoice);
      for (const text of Object.values(invoicePrintCopy[language]))
        expect(text.trim()).not.toBe("");
      expect(html).toContain("33.41 AED");
      expect(html).toMatch(/<\/article><\/body><\/html>$/);
    }
  );
  it("does not replace a recorded issue date with today's date and sanitizes PDF filenames", () => {
    expect(invoicePrintDate("2024-01-02", "ar")).toBe("2024-01-02");
    expect(invoicePrintDate("invalid", "en")).toBe("invalid");
    expect(invoicePdfFilename("INV/1:foo?x")).toBe(
      "Alrefqa-invoice-INV_1_foo_x.pdf"
    );
    expect(invoicePdfFilename("الفاتورة-10")).toContain("الفاتورة-10");
  });
  it("does not put general invoices into a fictitious goods table", () => {
    const invoice = printTestInvoice();
    invoice.finance = {
      ...invoice.finance!,
      chargeKind: "general",
      shipmentId: undefined,
      goods: [],
    };
    const html = buildInvoicePrintHtml(invoice, opts);
    expect(html).not.toContain("<table");
    expect(html).toContain("مبلغ عام");
    expect(html).toContain("33.41 AED");
  });
});
