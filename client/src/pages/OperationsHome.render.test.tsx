import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import OperationsHome from "./OperationsHome";
import { blankPermissions } from "@shared/permissions";
const state = vi.hoisted(() => ({ workspace: {} as Record<string, unknown> }));
vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "ar", dir: "rtl" }),
}));
vi.mock("@/hooks/useOperationsWorkspace", () => ({
  useOperationsWorkspace: () => state.workspace,
}));
vi.mock("@/components/packing/PackingLayout", () => ({
  default: ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));

describe("job-specific dashboard rendering", () => {
  beforeEach(() => {
    state.workspace = { role: "admin", offices: null, permissions: null };
  });
  it("starts the owner dashboard with office and employee management", () => {
    const html = renderToStaticMarkup(
      <Router ssrPath="/operations">
        <OperationsHome />
      </Router>
    );
    expect(html).toContain("لوحة المدير العام");
    expect(html.indexOf("المكاتب والموظفون")).toBeLessThan(
      html.indexOf("الشحن والإرسال والتتبع")
    );
    expect(html).toContain("/operations/settings?panel=employees");
    expect(html).not.toContain("المهمة الحالية");
    expect(html).not.toContain("تجميع الشحنات");
  });
  it("keeps source work focused without customer finance or assigning managers", () => {
    state.workspace = {
      role: "source_warehouse",
      offices: ["dubai"],
      permissions: null,
    };
    const html = renderToStaticMarkup(
      <Router ssrPath="/operations">
        <OperationsHome />
      </Router>
    );
    expect(html).toContain("عمل مخزن المصدر");
    expect(html).toContain("شحنة جديدة");
    expect(html).not.toContain("/operations/finance");
    expect(html).not.toContain("/operations/settings");
  });
  it("does not generate tasks from the role when permissions are explicitly denied", () => {
    state.workspace = {
      role: "office_manager",
      offices: ["dubai"],
      permissions: blankPermissions(),
    };
    const html = renderToStaticMarkup(
      <Router ssrPath="/operations">
        <OperationsHome />
      </Router>
    );
    expect(html).not.toContain("panel=employees");
    expect(html).not.toContain("/operations/finance");
  });
});
