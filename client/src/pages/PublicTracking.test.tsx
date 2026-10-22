import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import PublicTracking from "./PublicTracking";
import { publicTrackingCopy } from "@/lib/publicTrackingCopy";

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
vi.mock("@/lib/trpc", () => ({
  trpc: {
    publicTracking: {
      lookup: {
        useMutation: () => ({
          isPending: false,
          mutateAsync: vi.fn(),
          reset: vi.fn(),
        }),
      },
    },
  },
}));

describe("PublicTracking page", () => {
  for (const language of ["ar", "en", "zh", "tr"] as const) {
    it(`renders the public form in ${language}`, () => {
      f.language = language;
      const html = renderToStaticMarkup(<PublicTracking />);
      const copy = publicTrackingCopy[language];
      expect(html).toContain(copy.title);
      expect(html).toContain(`id="public-tracking-number"`);
      expect(html).toContain(`id="public-tracking-phone"`);
      expect(html).toContain(copy.submit);
      expect(html).not.toMatch(/invoice|facture|فاتورة|fatura|payment|الدفع/i);
    });
  }
});
