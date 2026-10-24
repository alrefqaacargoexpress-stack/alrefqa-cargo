import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PublicShippingRatesEditor, {
  fallbackCurrencyForOffice,
  shippingRateDraftsFrom,
  shippingRatesFromDrafts,
} from "./PublicShippingRatesEditor";
import { publicShippingCopy } from "@/lib/publicShippingCopy";

describe("PublicShippingRatesEditor", () => {
  it("serializes empty amounts as null and keeps each service unit/currency", () => {
    const drafts = shippingRateDraftsFrom({
      airRegular: null,
      airExpress: { amount: 12.5, currency: "USD", unit: "kg" },
      sensitive: null,
      sea: { amount: 40, currency: "AED", unit: "m3" },
    });
    expect(shippingRatesFromDrafts(drafts)).toEqual({
      airRegular: null,
      airExpress: { amount: 12.5, currency: "USD", unit: "kg" },
      sensitive: null,
      sea: { amount: 40, currency: "AED", unit: "m3" },
    });
  });

  it("renders distinct rate fields without inventing a zero price", () => {
    const html = renderToStaticMarkup(
      <PublicShippingRatesEditor
        value={shippingRateDraftsFrom({
          airRegular: null,
          airExpress: null,
          sensitive: null,
          sea: null,
        })}
        copy={publicShippingCopy.en}
        onChange={() => undefined}
      />
    );
    expect(html).toContain("Leave empty to keep unpublished");
    expect(html).not.toContain('value="0"');
  });

  it("uses the office currency only for new blank drafts", () => {
    expect(fallbackCurrencyForOffice("dubai")).toBe("AED");
    expect(fallbackCurrencyForOffice("china")).toBe("CNY");
    expect(fallbackCurrencyForOffice("turkey")).toBe("TRY");
    expect(fallbackCurrencyForOffice("nouakchott")).toBe("MRU");
    expect(shippingRateDraftsFrom(undefined, "dubai").airRegular).toEqual({
      amount: "",
      currency: "AED",
      unit: "kg",
    });
  });

  it("does not reinterpret a saved legacy MRU rate by office", () => {
    const drafts = shippingRateDraftsFrom(
      {
        airRegular: { amount: 37, currency: "MRU", unit: "kg" },
        airExpress: null,
        sensitive: null,
        sea: null,
      },
      "dubai"
    );
    expect(drafts.airRegular).toEqual({
      amount: "37",
      currency: "MRU",
      unit: "kg",
    });
    expect(shippingRatesFromDrafts(drafts).airRegular).toEqual({
      amount: 37,
      currency: "MRU",
      unit: "kg",
    });
  });

  it("locks new Dubai announcements while showing a legacy rate truthfully", () => {
    const html = renderToStaticMarkup(
      <PublicShippingRatesEditor
        value={shippingRateDraftsFrom(
          {
            airRegular: { amount: 500, currency: "MRU", unit: "m3" },
            airExpress: null,
            sensitive: null,
            sea: null,
          },
          "dubai"
        )}
        copy={publicShippingCopy.en}
        officeId="dubai"
        fixedCurrency="AED"
        requiredUnit="kg"
        onChange={() => undefined}
      />
    );
    expect(html).toContain('value="MRU"');
    expect(html).toContain('value="m3"');
    expect(html).toMatch(/<input[^>]*disabled=""[^>]*value="500"/);
    expect(html).toContain("This is a saved legacy rate");
    expect(html).toContain("500 MRU per m³ → 500 AED per kg");
    expect(html).toContain("Adopt a new rate with this currency and unit");
    expect(html).toContain('<option value="AED" selected="">AED</option>');
    expect(html).toContain('<option value="kg" selected="">per kg</option>');
    expect(
      html.match(/<select[^>]*disabled=""[^>]*>\<option value="AED"/g)
    ).toHaveLength(3);
  });

  it("keeps legacy adoption disabled in read-only mode", () => {
    const html = renderToStaticMarkup(
      <PublicShippingRatesEditor
        value={shippingRateDraftsFrom({
          airRegular: { amount: 37, currency: "MRU", unit: "kg" },
          airExpress: null,
          sensitive: null,
          sea: null,
        })}
        copy={publicShippingCopy.en}
        fixedCurrency="AED"
        requiredUnit="kg"
        disabled
        onChange={() => undefined}
      />
    );
    expect(html).toContain("This is a saved legacy rate");
    expect(html).toContain(
      "Adopt a new rate with this currency and unit</button>"
    );
    expect(html).toContain('disabled="">Adopt a new rate');
  });
});
