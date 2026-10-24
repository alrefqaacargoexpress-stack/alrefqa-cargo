import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultOfficeProfile } from "@shared/branches";
import { publicShippingCopy } from "@/lib/publicShippingCopy";
import { nouakchottRatesCopy } from "@/lib/nouakchottRatesCopy";
import PublicOfficeCards from "./PublicOfficeCards";
import NouakchottSourceRatesEditor, {
  nouakchottSourceRateDraftsFrom,
  nouakchottSourceRatesFromDrafts,
} from "./NouakchottSourceRatesEditor";

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "en", dir: "ltr" }),
}));

describe("Nouakchott source rates", () => {
  it("keeps blank source fields null and renders fixed MRU with all sources and services", () => {
    const drafts = nouakchottSourceRateDraftsFrom(undefined);
    expect(nouakchottSourceRatesFromDrafts(drafts)).toEqual({
      dubai: {
        airRegular: null,
        airExpress: null,
        sensitive: null,
        sea: null,
      },
      turkey: {
        airRegular: null,
        airExpress: null,
        sensitive: null,
        sea: null,
      },
      china: {
        airRegular: null,
        airExpress: null,
        sensitive: null,
        sea: null,
      },
    });
    const html = renderToStaticMarkup(
      <NouakchottSourceRatesEditor
        value={drafts}
        shippingCopy={publicShippingCopy.en}
        copy={nouakchottRatesCopy.en}
        onChange={() => undefined}
      />
    );
    expect(html.match(/<fieldset/g)).toHaveLength(3);
    expect(html.match(/<input/g)).toHaveLength(12);
    expect(html.match(/aria-label="[^"]+ (Rate|Unit)"/g)).toHaveLength(24);
    expect(html).not.toContain('aria-label="Shipping rate source"');
    expect(html).not.toContain('<select aria-label="Shipping rate source"');
    expect(html).toContain("Dubai");
    expect(html).toContain("Turkey");
    expect(html).toContain("China");
    expect(
      html.match(/<select[^>]*aria-label="[^"]+ Currency"[^>]*disabled[^>]*>/g)
    ).toHaveLength(12);
    expect(html.match(/<option value="MRU"/g)).toHaveLength(12);
    expect(html).not.toContain('value="USD"');
    expect(html).toContain('aria-label="Dubai Regular air Rate"');
    expect(html).toContain('aria-label="Dubai Regular air Unit"');
    expect(html).not.toContain('value="0"');
  });

  it("shows only saved Nouakchott source rates and does not leak them to other offices", () => {
    const sourceShippingRates = nouakchottSourceRatesFromDrafts(
      nouakchottSourceRateDraftsFrom({
        dubai: {
          airRegular: { amount: 12.5, currency: "MRU", unit: "kg" },
          airExpress: null,
          sensitive: null,
          sea: null,
        },
        turkey: {
          airRegular: null,
          airExpress: null,
          sensitive: { amount: 45, currency: "MRU", unit: "shipment" },
          sea: null,
        },
        china: {
          airRegular: null,
          airExpress: null,
          sensitive: null,
          sea: null,
        },
      })
    );
    const nouakchott = {
      ...defaultOfficeProfile("nouakchott"),
      version: 1,
      sourceShippingRates,
    };
    const otherOffice = {
      ...defaultOfficeProfile("dubai"),
      version: 1,
    };
    const html = renderToStaticMarkup(
      <PublicOfficeCards profiles={[nouakchott, otherOffice]} />
    );
    expect(html).toContain("From: Dubai");
    expect(html).toContain("From: Turkey");
    expect(html).toContain("12.5 MRU");
    expect(html).toContain("45 MRU");
    expect(html).toContain("per kg");
    expect(html).toContain("per shipment");
    expect(html).not.toContain("From: China");
  });

  it("shows a legacy source unit as MRU/m³ and offers an explicit kg adoption", () => {
    const rates = nouakchottSourceRateDraftsFrom({
      dubai: {
        airRegular: { amount: 1200, currency: "MRU", unit: "m3" },
        airExpress: null,
        sensitive: null,
        sea: null,
      },
      turkey: {
        airRegular: null,
        airExpress: null,
        sensitive: null,
        sea: null,
      },
      china: {
        airRegular: null,
        airExpress: null,
        sensitive: null,
        sea: null,
      },
    });
    const html = renderToStaticMarkup(
      <NouakchottSourceRatesEditor
        value={rates}
        shippingCopy={publicShippingCopy.en}
        copy={nouakchottRatesCopy.en}
        onChange={() => undefined}
      />
    );
    expect(html).toContain("1200 MRU per m³ → 1200 MRU per kg");
    expect(html).toContain("Adopt a new rate with this currency and unit");
    expect(html).toContain('option value="m3" selected="">per m³</option>');
    expect(html).toContain('option value="MRU" selected="">MRU</option>');
  });
});
