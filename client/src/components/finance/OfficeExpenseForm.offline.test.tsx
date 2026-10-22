import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import OfficeExpenseForm from "./OfficeExpenseForm";
const state = vi.hoisted(() => ({
  language: "ar" as "ar" | "en" | "zh" | "tr",
}));
vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({
    language: state.language,
    dir: state.language === "ar" ? "rtl" : "ltr",
  }),
}));
describe("Expense drafts without a connection", () => {
  it.each(["ar", "en", "zh", "tr"] as const)(
    "allows a local draft offline in %s",
    language => {
      state.language = language;
      const html = renderToStaticMarkup(
        <OfficeExpenseForm
          allowedOffices={["nouakchott"]}
          initialOffice="nouakchott"
          shipments={[]}
          canEdit={true}
          role="accountant"
          homeOffice="nouakchott"
          online={false}
          saveCommand={async () => true}
        />
      );
      const submit = html.match(/<button[^>]*type="submit"[^>]*>/)?.[0];
      expect(submit).toBeDefined();
      expect(submit).not.toMatch(/\sdisabled(?:=|[ >])/);
    }
  );
  it("does not grant an expense action to a role without financial permission", () => {
    const html = renderToStaticMarkup(
      <OfficeExpenseForm
        allowedOffices={["nouakchott"]}
        shipments={[]}
        canEdit={true}
        role="office_manager"
        homeOffice="nouakchott"
        online={true}
        saveCommand={async () => true}
      />
    );
    expect(html.match(/<button[^>]*type="submit"[^>]*>/)?.[0]).toContain(
      "disabled"
    );
  });
});
