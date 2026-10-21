import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PublicShippingRatesEditor, {
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
});
