import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import CustomerTrackingTimeline from "./CustomerTrackingTimeline";
import { customerTrackingCopy } from "@/lib/customerTrackingCopy";
import { trackingCopy } from "@/lib/trackingCopy";

const shipment = {
  tracking: "AR-100",
  status: "in_transit" as const,
  stage: "to_dakar" as const,
  branch: "dakar" as const,
  updatedAt: "2026-10-24T21:00:00.000Z",
  goods: [
    {
      name: "Box",
      pieces: 2,
      unitWeight: 1,
      weight: 2,
      delivery: { status: "pending" as const, deliveredAt: null },
      location: null,
    },
  ],
  totalPieces: 2,
  totalWeight: 2,
  timeline: [
    {
      stage: "preparing" as const,
      branch: "dubai" as const,
      at: "2026-10-23T21:00:00.000Z",
    },
  ],
};

describe("customer tracking timeline", () => {
  it.each(["ar", "en", "zh", "tr"] as const)(
    "renders recorded events only in %s",
    language => {
      const html = renderToStaticMarkup(
        <CustomerTrackingTimeline
          shipment={shipment}
          copy={customerTrackingCopy[language]}
          language={language}
        />
      );
      expect(html).toContain(customerTrackingCopy[language].timeline);
      expect(html).toContain(trackingCopy[language].stages.preparing);
      expect(html).not.toMatch(/invoice|amount|phone|actor|note/i);
    }
  );
});
