import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import FinanceInvoices from "./FinanceInvoices";
import type { Invoice } from "@shared/operations";
import { blankPermissions } from "@shared/permissions";
const state = vi.hoisted(() => ({ workspace: {} as Record<string, any> }));
vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "ar", dir: "rtl" }),
}));
vi.mock("@/hooks/useFinanceWorkspace", () => ({
  useFinanceWorkspace: () => state.workspace,
}));
vi.mock("@/components/packing/PackingLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));
vi.mock("@/components/finance/InvoiceFinancialForm", () => ({
  default: () => null,
}));
vi.mock("@/components/finance/FinanceExcelPanel", () => ({
  default: () => null,
}));
vi.mock("@/components/finance/FinancialVoidPanel", () => ({
  default: () => null,
}));
function invoice(): Invoice {
  return {
    id: "TABLE-TEST",
    account: "Test account",
    amount: 33.41,
    status: "دين",
    issuedAt: "2026-10-28",
    scope: "shared",
    version: 2,
    officeId: "dubai",
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
      baseAmount: 34.52,
      adjustment: { direction: "decrease", amount: 1.11 },
      paidAmount: 10.01,
    },
  };
}
function render() {
  return renderToStaticMarkup(
    <Router ssrPath="/operations/invoices">
      <FinanceInvoices />
    </Router>
  );
}
describe("invoice table and print integration", () => {
  beforeEach(() => {
    state.workspace = {
      role: "accountant",
      offices: ["dubai"],
      homeOffice: "dubai",
      permissions: {
        ...blankPermissions(),
        invoices: "manage",
        payments: "manage",
      },
      canEdit: true,
      invoices: [invoice()],
      entries: [],
      commands: [],
      online: false,
      base: {
        userId: "TEST-USER",
        permissionFingerprint: "scope-1",
        state: { accounts: [] },
      },
      store: { commands: [], snapshot: { lastReadAt: null } },
      settingsForOffice: () => ({
        methods: [{ id: "cash", enabled: true, label: "Cash" }],
      }),
    };
  });
  it("binds PDF action to a confirmed row and uses exact helper remaining for settlement max", () => {
    const html = render();
    expect(html).toContain("طباعة / حفظ PDF");
    expect(html).toContain('max="23.4"');
    expect(html).toContain("TABLE-TEST");
  });
  it("marks inconsistent historical totals for review instead of offering settlement or changing the displayed original", () => {
    state.workspace.invoices = [{ ...invoice(), amount: 99 }];
    const html = render();
    expect(html).toContain("الإجمالي المسجل لا يطابق تفاصيل الفاتورة");
    expect(html).not.toContain('type="number"');
    expect(html).toContain('disabled=""');
    expect(state.workspace.invoices[0].amount).toBe(99);
  });
  it("does not offer settlement or PDF for a paid status with an unpaid remainder", () => {
    state.workspace.invoices = [{ ...invoice(), status: "مدفوعة" }];
    const html = render();
    expect(html).toContain("تحتاج القيم المالية لهذه الفاتورة إلى مراجعة");
    expect(html).not.toContain('type="number"');
  });
  it("keeps printing available to invoice viewers without requiring edit or Excel permissions", () => {
    state.workspace.canEdit = false;
    state.workspace.permissions = { ...blankPermissions(), invoices: "view" };
    const html = render();
    expect(html).toContain("طباعة / حفظ PDF");
    expect(html).not.toContain('type="number"');
  });
});
