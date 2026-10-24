import { describe, expect, it } from "vitest";
import { formatMyShipmentsTimestamp } from "./MyShipments";

describe("my shipments safe timestamps", () => {
  it("formats a real ISO timestamp", () => {
    const value = formatMyShipmentsTimestamp(
      "2026-10-24T21:00:00.000Z",
      "en",
      "—"
    );
    expect(value).not.toBe("—");
    expect(value).not.toMatch(/invalid/i);
  });

  it("does not invent a date for malformed or missing values", () => {
    expect(formatMyShipmentsTimestamp(null, "ar", "لا يوجد")).toBe("لا يوجد");
    expect(formatMyShipmentsTimestamp("not-a-date", "tr", "Yok")).toBe("Yok");
  });
});
