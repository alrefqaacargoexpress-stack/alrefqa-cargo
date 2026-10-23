import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PublishedPackingTariff from "./PublishedPackingTariff";
import { copyFor } from "@/lib/packingCopy";
import type { PackingSession } from "@shared/packing";
const snapshot: NonNullable<PackingSession["rateSnapshot"]> = {
  service: "airExpress",
  sourceOffice: "dubai",
  sourceRate: { amount: 18, currency: "AED", unit: "kg" },
  nouakchottRate: { amount: 220, currency: "MRU", unit: "kg" },
  sourceProfileVersion: 2,
  nouakchottProfileVersion: 3,
  capturedAt: "2026-10-23T00:00:00.000Z",
};
describe("Published packing tariff", () => {
  it("shows the chosen service and both real announced currencies in all four languages", () => {
    for (const language of ["ar", "en", "zh", "tr"] as const) {
      const c = copyFor(language);
      const html = renderToStaticMarkup(
        <PublishedPackingTariff
          snapshot={snapshot}
          service="airExpress"
          c={c}
          language={language}
          confirmed
        />
      );
      expect(html).toContain(c.airExpress);
      expect(html).toContain("AED");
      expect(html).toContain("MRU");
      expect(html).not.toContain(c.amountHidden);
    }
  });
  it("never labels missing prices as a free zero tariff", () => {
    const c = copyFor("ar");
    const html = renderToStaticMarkup(
      <PublishedPackingTariff c={c} service="airRegular" language="ar" />
    );
    expect(html).toContain(c.tariffUndefined);
    expect(html).toContain("غير محدد لا يعني مجانًا");
    expect(html).not.toContain("0 AED");
  });
  it("keeps a cubic meter tariff distinct from a kg tariff", () => {
    const html = renderToStaticMarkup(
      <PublishedPackingTariff
        c={copyFor("ar")}
        language="ar"
        service="sea"
        snapshot={{
          ...snapshot,
          service: "sea",
          sourceRate: { amount: 150, currency: "USD", unit: "m3" },
        }}
      />
    );
    expect(html).toContain("USD");
    expect(html).toContain("متر مكعب");
    expect(html).toContain("لا تُحوَّل تلقائيًا");
  });
});
