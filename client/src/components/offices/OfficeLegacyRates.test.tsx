import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultOfficeProfile } from "@shared/branches";
import {
  emptyNouakchottSourceRates,
  emptyPublicShippingRates,
} from "@shared/publicShipping";
import { publicShippingCopy } from "@/lib/publicShippingCopy";
import OfficeProfileEditor from "./OfficeProfileEditor";
import PublicOfficeCards from "./PublicOfficeCards";
vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "en", dir: "ltr" }),
}));
function nkt() {
  const sourceShippingRates = emptyNouakchottSourceRates();
  sourceShippingRates.dubai.airRegular = {
    amount: 12.5,
    currency: "MRU",
    unit: "kg",
  };
  sourceShippingRates.dubai.airExpress = {
    amount: 47.25,
    currency: "MRU",
    unit: "kg",
  };
  return {
    ...defaultOfficeProfile("nouakchott"),
    version: 4,
    seaAddress: "Preserved sea address",
    sourceShippingRates,
    shippingRates: {
      ...emptyPublicShippingRates(),
      airRegular: {
        amount: 99.75,
        currency: "MRU" as const,
        unit: "kg" as const,
      },
    },
  };
}
describe("Nouakchott old rates section removal is presentation-only", () => {
  it("hides the old public rate group and keeps Dubai rates and sea address visible without mutating the saved profile", () => {
    const p = nkt(),
      before = structuredClone(p);
    const html = renderToStaticMarkup(<PublicOfficeCards profiles={[p]} />);
    expect(html).not.toContain(publicShippingCopy.en.savedRates);
    expect(html).not.toContain("99.75");
    expect(html).toContain("12.5 MRU");
    expect(html).toContain("47.25 MRU");
    expect(html).toContain("Preserved sea address");
    expect(p).toEqual(before);
  });
  it("does not expose the old four editor fields while preserving the stored rates", () => {
    const p = nkt(),
      before = structuredClone(p),
      save = vi.fn(async () => null);
    const html = renderToStaticMarkup(
      <OfficeProfileEditor profile={p} canEdit online onSave={save} />
    );
    expect(html).not.toContain('value="99.75"');
    expect(html).toContain('value="12.5"');
    expect(html).toContain('value="47.25"');
    expect(html).toContain("Preserved sea address");
    expect(p).toEqual(before);
    expect(save).not.toHaveBeenCalled();
  });
  it("retains the other office's existing rate fields, currencies and public rates", () => {
    const p = {
      ...defaultOfficeProfile("turkey"),
      version: 2,
      shippingRates: {
        ...emptyPublicShippingRates(),
        airRegular: {
          amount: 99.75,
          currency: "TRY" as const,
          unit: "kg" as const,
        },
      },
    };
    const publicHtml = renderToStaticMarkup(
      <PublicOfficeCards profiles={[p]} />
    );
    expect(publicHtml).toContain(publicShippingCopy.en.savedRates);
    expect(publicHtml).toContain("99.75");
    const editor = renderToStaticMarkup(
      <OfficeProfileEditor
        profile={p}
        canEdit
        online
        onSave={async () => null}
      />
    );
    expect(editor).toContain('value="99.75"');
    expect(editor).toContain('value="TRY"');
  });
});
