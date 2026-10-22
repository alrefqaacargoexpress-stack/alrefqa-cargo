import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import Home from "./Home";
import { publicCopy } from "@/lib/publicCopy";

const f = vi.hoisted(() => ({ language: "ar" as "ar" | "en" | "zh" | "tr" }));

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({
    language: f.language,
    dir: f.language === "ar" ? "rtl" : "ltr",
  }),
}));
vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/components/LanguageSwitcher", () => ({ default: () => null }));
vi.mock("@/components/offices/PublicOfficeCards", () => ({
  default: () => null,
}));
vi.mock("@/components/offices/PublicWalletMethods", () => ({
  default: () => null,
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    branches: {
      public: {
        useQuery: () => ({ data: [], isLoading: false, isError: false }),
      },
    },
  },
}));
vi.mock("@/lib/branchDashboardCopy", async importOriginal => {
  const actual =
    await importOriginal<typeof import("@/lib/branchDashboardCopy")>();
  return {
    ...actual,
    readCachedPublicProfiles: () => [],
    cachePublicProfiles: () => undefined,
  };
});

function htmlText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

describe("Home hero", () => {
  for (const language of ["ar", "en", "zh", "tr"] as const) {
    it(`renders the ${language} hero image, copy, and anchors`, () => {
      f.language = language;
      const html = renderToStaticMarkup(<Home />);
      const hero = publicCopy[language].hero;

      expect(html).toContain('src="/images/alrefqa-camel-caravan.webp"');
      expect(html).toContain(`alt="${htmlText(hero.imageAlt)}"`);
      for (const text of [
        hero.title,
        hero.titleAccent,
        hero.description,
        hero.storyLine,
        hero.servicesCta,
        hero.trackingCta,
      ]) {
        expect(html).toContain(htmlText(text));
      }
      expect(html).toContain('href="#offices"');
      expect(html).toContain('href="#tracking"');
      expect(html).not.toContain(hero.routeLabel);
      expect(html).not.toContain(hero.routeCaption);
    });
  }

  it("uses the right-side overlay for Arabic and the left-side overlay for LTR copy", () => {
    f.language = "ar";
    const rtlHtml = renderToStaticMarkup(<Home />);
    expect(rtlHtml).toContain("right-0 bg-gradient-to-l");
    expect(rtlHtml).toContain('style="direction:ltr"');
    expect(rtlHtml).toContain('dir="rtl" class="relative z-10');

    f.language = "en";
    const ltrHtml = renderToStaticMarkup(<Home />);
    expect(ltrHtml).toContain("left-0 bg-gradient-to-r");
    expect(ltrHtml).toContain('dir="ltr" class="relative z-10');
  });
});
