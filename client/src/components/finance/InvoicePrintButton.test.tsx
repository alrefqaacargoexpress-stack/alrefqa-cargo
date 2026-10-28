import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Invoice } from "@shared/operations";
import { blankPermissions } from "@shared/permissions";
import InvoicePrintButton, {
  type InvoicePrintButtonProps,
} from "./InvoicePrintButton";

const invoice: Invoice = {
  id: "PRINT-TEST",
  account: "اختبار محلي",
  amount: 10.01,
  status: "دين",
  issuedAt: "2026-10-28",
  officeId: "dubai",
  scope: "shared",
  version: 1,
  finance: {
    customerId: "c",
    chargeKind: "general",
    paymentMode: "on_account",
    issuingOfficeId: "dubai",
    financialOfficeId: "dubai",
    actorId: 1,
    actorName: "Test",
    recordedAt: "2026-10-28T00:00:00.000Z",
    currency: "AED",
    goods: [],
    baseAmount: 10.01,
    adjustment: { direction: "increase", amount: 0 },
    paidAmount: 0.01,
  },
};
function props(): InvoicePrintButtonProps {
  return {
    invoice,
    subject: {
      role: "general_accountant",
      offices: ["dubai"],
      homeOffice: "dubai",
      permissions: { ...blankPermissions(), invoices: "view" },
    },
    userId: "TEST-USER",
    permissionFingerprint: "scope-1",
    commands: [],
    online: false,
    lastReadAt: null,
    language: "ar",
  };
}
describe("invoice print button", () => {
  it("allows confirmed invoice printing with read-only invoices permission even offline, without excel/write grants", () => {
    const html = renderToStaticMarkup(<InvoicePrintButton {...props()} />);
    expect(html).toContain("طباعة / حفظ PDF");
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain("iframe");
    expect(html).not.toContain("اختبار محلي");
  });
  it("blocks local drafts, mismatched totals and missing financial details with a reason", () => {
    for (const changed of [
      { ...invoice, scope: "pending" as const },
      { ...invoice, amount: 40 },
      { ...invoice, finance: undefined },
    ]) {
      const html = renderToStaticMarkup(
        <InvoicePrintButton {...props()} invoice={changed} />
      );
      expect(html).toContain('disabled=""');
      expect(html).not.toContain("<iframe");
    }
  });
  it("blocks denied invoice permissions, office escape and logged-out identities", () => {
    for (const p of [
      { ...props(), userId: null },
      {
        ...props(),
        subject: { role: "accountant" as const, offices: ["china" as const] },
      },
      {
        ...props(),
        subject: { ...props().subject, permissions: blankPermissions() },
      },
    ]) {
      const html = renderToStaticMarkup(<InvoicePrintButton {...p} />);
      expect(html).toContain('disabled=""');
      expect(html).not.toContain("<iframe");
    }
  });
});
