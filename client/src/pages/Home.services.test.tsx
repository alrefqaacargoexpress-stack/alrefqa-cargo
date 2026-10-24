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
    auth: {
      me: {
        useQuery: () => ({ data: null, isLoading: false, isError: false }),
      },
    },
    operations: {
      access: {
        useQuery: () => ({
          data: undefined,
          isLoading: false,
          isError: false,
        }),
      },
    },
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
const legacyServiceTitles = {
  ar: ["الشحن العادي", "الشحن السريع", "الشحن البحري", "توصيل إلى المنزل"],
  en: ["Standard shipping", "Express shipping", "Sea freight", "Home delivery"],
  zh: ["普通货运", "快速运输", "海运", "送货上门"],
  tr: ["Standart kargo", "Hızlı kargo", "Deniz kargo", "Eve teslimat"],
} as const;

const legacyTrackingText = [
  "رقم الشحنة",
  "أدخل رقم الشحنة",
  "Shipment number",
  "Enter shipment number",
  "货件编号",
  "输入货件编号",
  "Gönderi numarası",
  "Gönderi numarasını girin",
];

function htmlText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

describe("Home public inquiry and navigation contract", () => {
  it("uses the exact Arabic WhatsApp instructions", () => {
    expect(publicCopy.ar.tracking.instructions).toEqual([
      "الاسم أو الماركة المكتوبة على البضاعة.",
      "رقم الهاتف المدون على الشحنة قبل إرسالها إلى المكتب.",
    ]);
  });

  for (const language of ["ar", "en", "zh", "tr"] as const) {
    it(`renders the translated inquiry form and no legacy services in ${language}`, () => {
      f.language = language;
      const html = renderToStaticMarkup(<Home />);
      const tracking = publicCopy[language].tracking;

      expect(html).toContain('href="/track"');
      expect(html).toContain('id="offices"');
      expect(html).toContain('id="contact"');
      expect(html).not.toContain('id="services"');
      expect(html).not.toContain('href="#services"');

      expect(html).toContain('id="inquiry-name"');
      expect(html).toContain('id="inquiry-phone"');
      expect(html).toContain(htmlText(tracking.title));
      for (const instruction of tracking.instructions) {
        expect(html).toContain(htmlText(instruction));
      }
      for (const text of [
        tracking.nameLabel,
        tracking.namePlaceholder,
        tracking.phoneLabel,
        tracking.phonePlaceholder,
        tracking.button,
      ]) {
        expect(html).toContain(htmlText(text));
      }

      for (const title of legacyServiceTitles[language]) {
        expect(html).not.toContain(`>${title}<`);
      }
      for (const text of legacyTrackingText) {
        expect(html).not.toContain(text);
      }
    });
  }
});
