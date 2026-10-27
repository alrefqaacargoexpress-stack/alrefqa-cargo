import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import RoleWorkspaceShell from "./RoleWorkspaceShell";
import { roleWorkspaceTasks } from "@/lib/roleWorkspace";

describe("compact role identity", () => {
  it("shows the general manager identity without duplicating all work shortcuts", () => {
    const subject = { role: "admin" as const, offices: null };
    const html = renderToStaticMarkup(
      <RoleWorkspaceShell
        language="ar"
        dir="rtl"
        name="المالك"
        subject={subject}
        tasks={roleWorkspaceTasks(subject)}
      />
    );
    expect(html).toContain("المدير العام");
    expect(html).toContain("كل المكاتب");
    expect(html).not.toContain("المهمة الحالية");
    expect(html).not.toContain("شحنة جديدة");
    expect(html).not.toContain("المزيد من الصلاحيات");
  });
  it("shows only the assigned office for an employee", () => {
    const html = renderToStaticMarkup(
      <RoleWorkspaceShell
        language="en"
        dir="ltr"
        name="Employee"
        subject={{ role: "source_warehouse", offices: ["dubai"] }}
      />
    );
    expect(html).toContain("Dubai");
    expect(html).not.toContain("All offices");
  });
});
