import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SyncConflictPanel from "./SyncConflictPanel";
import type { PendingChange } from "@shared/operations";
import { syncReasonMessage } from "@/lib/syncReasonCopy";
const request = {
  id: "C1",
  entity: "shipment",
  recordId: "S1",
  label: "حذف EXP 100",
  expectedVersion: 4,
  action: "delete-shipment",
  createdAt: "now",
  data: {},
} as PendingChange;
function render(reason: string) {
  return renderToStaticMarkup(
    <SyncConflictPanel
      conflicts={[{ changeId: "C1", reason, current: null }]}
      queue={[request]}
      language="ar"
      busy={false}
      onRetry={vi.fn()}
      onKeepLocal={vi.fn()}
      onUseServer={vi.fn()}
    />
  );
}
describe("Helpful conflict explanation", () => {
  it("shows a specific reason and draft label instead of repeating the generic heading", () => {
    const html = render("finance_command_required");
    expect(html).toContain("حذف EXP 100");
    expect(html).toContain(syncReasonMessage("finance_command_required", "ar"));
    expect(html).toContain("تجهيز إعادة محاولة آمنة");
    expect(html).toContain("لن يُرسل الطلب");
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("bg-emerald");
  });
  it("does not expose a raw unknown server error or database detail", () => {
    const html = render("SQL error: private record 1234");
    expect(html).not.toContain("SQL error");
    expect(html).toContain(syncReasonMessage("unknown", "ar"));
  });
  it("explains legacy receipts and keeps server replacement disabled without a current record", () => {
    const html = render("legacy_receipt_requires_review");
    expect(html).toContain("إقرار قديم");
    expect(html).toMatch(/disabled=""[^>]*>استخدام نسخة الخادم/);
  });
});
