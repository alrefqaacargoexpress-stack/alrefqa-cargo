import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import Home from "./Home";
import { publicCopy, type Language } from "@/lib/publicCopy";
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
describe("Requested service introduction removal", () => {
  for (const language of ["ar", "en", "zh", "tr"] as const)
    it(`removes the introductory three lines in ${language} but keeps all service cards and links`, () => {
      f.language = language;
      const html = renderToStaticMarkup(<Home />);
      const source = publicCopy[language as Language].services;
      expect(html).not.toContain(source.eyebrow);
      expect(html).not.toContain(source.title);
      expect(html).not.toContain(source.description);
      expect(html).toContain('id="services"');
      expect(html).toContain('href="#services"');
      for (const service of source.items) expect(html).toContain(service.title);
    });
});
