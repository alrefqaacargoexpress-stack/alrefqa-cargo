import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import CustomerAccountForm from "./CustomerAccountForm";
vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "ar", dir: "rtl" }),
}));
const base = {
  userId: "1",
  offices: ["nouakchott"] as ["nouakchott"],
  role: "accountant",
  canEditAccounts: true,
  saveRecord: vi.fn(async () => true),
};
describe("account creation visibility", () => {
  it("shows the new account action when a financial employee can actually save accounts", () => {
    expect(
      renderToStaticMarkup(
        <CustomerAccountForm base={base} homeOffice="nouakchott" />
      )
    ).toContain("إنشاء حساب عميل");
  });
  it("hides creation for viewers, revoked office access, and an unavailable writer", () => {
    expect(
      renderToStaticMarkup(
        <CustomerAccountForm
          base={{ ...base, role: "viewer" }}
          homeOffice="nouakchott"
        />
      )
    ).toBe("");
    expect(
      renderToStaticMarkup(
        <CustomerAccountForm
          base={{ ...base, canEditAccounts: false }}
          homeOffice="nouakchott"
        />
      )
    ).toBe("");
    expect(
      renderToStaticMarkup(
        <CustomerAccountForm
          base={{ ...base, saveRecord: undefined }}
          homeOffice="nouakchott"
        />
      )
    ).toBe("");
  });
});
