import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultOfficeProfile } from "@shared/branches";
import {
  emptyNouakchottSourceRates,
  emptyPublicShippingRates,
} from "@shared/publicShipping";
import { publicShippingCopy } from "@/lib/publicShippingCopy";
import OfficeProfileEditor, {
  changedOfficeRateValidationError,
} from "./OfficeProfileEditor";
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

  it("keeps an unchanged legacy rate on address-only saves and rejects a changed one locally", () => {
    const saved = {
      ...defaultOfficeProfile("dubai"),
      shippingRates: {
        ...emptyPublicShippingRates(),
        sea: { amount: 500, currency: "MRU" as const, unit: "m3" as const },
      },
    };
    expect(
      changedOfficeRateValidationError(
        { ...saved, address: "New office address" },
        saved,
        publicShippingCopy.en
      )
    ).toBe("");
    expect(
      changedOfficeRateValidationError(
        {
          ...saved,
          shippingRates: {
            ...saved.shippingRates,
            sea: { amount: 550, currency: "MRU", unit: "m3" },
          },
        },
        saved,
        publicShippingCopy.en
      )
    ).toContain("office currency: AED");
  });

  it("renders the legacy adoption action disabled for a read-only office", () => {
    const profile = {
      ...defaultOfficeProfile("dubai"),
      version: 2,
      shippingRates: {
        ...emptyPublicShippingRates(),
        airRegular: {
          amount: 37,
          currency: "MRU" as const,
          unit: "m3" as const,
        },
      },
    };
    const html = renderToStaticMarkup(
      <OfficeProfileEditor
        profile={profile}
        canEdit={false}
        online
        onSave={async () => null}
      />
    );
    expect(html).toContain("This is a saved legacy rate");
    expect(html).toContain(
      'disabled="">Adopt a new rate with this currency and unit'
    );
    expect(html).toContain("Read-only mode");
  });

  it("keeps public contacts in the existing profile editor without exposing account fields", () => {
    const profile = {
      ...defaultOfficeProfile("dubai"),
      version: 3,
      employees: [
        { id: "public-contact-1", name: "Dubai desk", phone: "+971501234567" },
      ],
    };
    const html = renderToStaticMarkup(
      <OfficeProfileEditor
        profile={profile}
        canEdit
        online
        onSave={async () => null}
      />
    );
    expect(html).toContain("Public office employees");
    expect(html).toContain('value="Dubai desk"');
    expect(html).toContain('value="+971501234567"');
    expect(html).toContain("Add public employee");
    expect(html).not.toContain("userId");
  });
});
