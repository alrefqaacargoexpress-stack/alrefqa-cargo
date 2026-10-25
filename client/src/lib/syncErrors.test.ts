import { describe, expect, it } from "vitest";
import {
  isNonFailureSyncOutcome,
  normalizeSyncError,
  syncErrorCode,
} from "./syncErrors";

describe("sync error normalization", () => {
  it("uses TRPC data.code before a localized message", () => {
    const original = Object.assign(new Error("لا تملك صلاحية الوصول"), {
      data: { code: "FORBIDDEN" },
    });
    const normalized = normalizeSyncError(original);
    expect(normalized.message).toMatch(/^FORBIDDEN:/);
    expect(normalized.code).toBe("FORBIDDEN");
    expect((normalized as Error & { cause?: unknown }).cause).toBe(original);
  });

  it("recognizes unauthorized TRPC errors even when the text is Arabic", () => {
    const normalized = normalizeSyncError({
      message: "انتهت الجلسة",
      shape: { data: { code: "UNAUTHORIZED" } },
    });
    expect(normalized.message).toMatch(/^UNAUTHORIZED:/);
    expect(syncErrorCode(normalized)).toBe("UNAUTHORIZED");
  });

  it("keeps canceled, user-changed, and not-ready outcomes separate from failures", () => {
    expect(
      isNonFailureSyncOutcome(new DOMException("aborted", "AbortError"))
    ).toBe(true);
    expect(isNonFailureSyncOutcome(new Error("scope_changed"))).toBe(true);
    expect(isNonFailureSyncOutcome(new Error("not_ready"))).toBe(true);
    expect(isNonFailureSyncOutcome(new Error("transport_lock_lost"))).toBe(
      false
    );
    expect(
      normalizeSyncError(new Error("transport_lock_lost")).message
    ).toMatch(/^TRANSPORT_LOCK_LOST:/);
  });
});
