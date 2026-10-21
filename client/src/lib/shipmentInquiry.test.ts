import { describe, expect, it } from "vitest";
import { buildShipmentInquiryMessage } from "./shipmentInquiry";

describe("buildShipmentInquiryMessage", () => {
  it("includes trimmed name and phone only, without a shipment number", () => {
    const copy = {
      whatsappText: "أرغب في طلب آخر تحديث.",
      nameLabel: "الاسم أو الماركة",
      phoneLabel: "رقم الهاتف",
    };
    const before = { ...copy };

    const message = buildShipmentInquiryMessage(
      copy,
      "  اسم تجريبي  ",
      "  +00000000000  "
    );

    expect(message).toBe(
      "أرغب في طلب آخر تحديث.\nالاسم أو الماركة: اسم تجريبي\nرقم الهاتف: +00000000000"
    );
    expect(message).toContain("الاسم أو الماركة: اسم تجريبي");
    expect(message).toContain("رقم الهاتف: +00000000000");
    expect(message).not.toContain("رقم الشحنة");
    expect(message).not.toMatch(/shipment\s*number|tracking\s*number/i);
    expect(copy).toEqual(before);
  });
});
