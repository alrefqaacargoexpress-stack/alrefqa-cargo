import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import CustomerStatement from "./CustomerStatement";
import {
  customerAccountCopy,
  customerAccountCopyFor,
} from "@/lib/customerAccountCopy";
import { searchableCustomerAccounts } from "@shared/customerAccounts";
import type { Account } from "@shared/operations";
import type {
  CustomerInvoiceSummary,
  CustomerStatementRow,
} from "@shared/customerAccounts";
vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "ar", dir: "rtl" }),
}));
vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
const invoice: CustomerInvoiceSummary = {
  id: "INV-7",
  amount: 100,
  paidAmount: 30,
  outstanding: 70,
  status: "دين",
  issuedAt: "2026-01-02",
  currency: "MRU",
  officeId: "nouakchott",
  issuingOfficeId: "nouakchott",
  paymentMode: "on_account",
  actorName: "A",
};
const row: CustomerStatementRow = {
  id: "movement-7",
  kind: "collection",
  date: "2026-01-03",
  recordedAt: "2026-01-03T10:00:00.000Z",
  description: "Cash collection",
  officeId: "nouakchott",
  currency: "MRU",
  debit: 0,
  credit: 30,
  actorName: "A",
};
describe("customer account UI", () => {
  it("keeps all four dictionaries complete", () => {
    const keys = Object.keys(customerAccountCopy.ar).sort();
    for (const language of ["ar", "en", "zh", "tr"] as const)
      expect(Object.keys(customerAccountCopy[language]).sort()).toEqual(keys);
  });
  it("renders only identifier-based invoices and movements, never goods/weight/shipments", () => {
    const html = renderToStaticMarkup(
      <CustomerStatement
        invoices={[invoice]}
        rows={[row]}
        balances={[]}
        previousBalance={0}
      />
    );
    expect(html).toContain("INV-7");
    expect(html).toContain("Cash collection");
    expect(html).not.toContain("goods");
    expect(html).not.toContain("weight");
    expect(html).not.toContain("shipments");
  });
  it("keeps legacy balance separate from new currency totals", () => {
    const html = renderToStaticMarkup(
      <CustomerStatement
        invoices={[]}
        rows={[]}
        balances={[]}
        previousBalance={55}
      />
    );
    expect(html).toContain("55");
    expect(html).toContain(customerAccountCopy.ar.previousBalanceHint);
  });
  it("searches the actual account by its identifier without name aggregation", () => {
    const account = {
      id: "account-7",
      name: "Same name",
      phone: "+22212345",
      city: "",
      balance: 0,
      shipments: 0,
      updatedAt: "2026-01-01",
    } satisfies Account;
    expect(searchableCustomerAccounts([account], "account-7")).toEqual([
      account,
    ]);
  });
  it("provides a fallback dictionary for every supported language", () => {
    for (const language of ["ar", "en", "zh", "tr"])
      expect(customerAccountCopyFor(language).title).toBeTruthy();
  });
});
