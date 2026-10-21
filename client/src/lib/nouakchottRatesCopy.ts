import type { NouakchottRateSource } from "@shared/publicShipping";

export const nouakchottRatesLanguages = ["ar", "en", "zh", "tr"] as const;
export type NouakchottRatesLanguage = (typeof nouakchottRatesLanguages)[number];

export type NouakchottRatesCopy = {
  sectionTitle: string;
  sectionHint: string;
  source: string;
  sourceAriaLabel: string;
  fromCountry: string;
  savedRates: string;
  sourceLabels: Record<NouakchottRateSource, string>;
};

const ar: NouakchottRatesCopy = {
  sectionTitle: "أسعار الشحن لنواكشوط",
  sectionHint:
    "أدخل أسعار الشحن للبلدان الثلاثة: دبي وتركيا والصين بالوقية الجديدة MRU دون اختيار مصدر.",
  source: "مصدر الشحنة",
  sourceAriaLabel: "مصدر أسعار الشحن",
  fromCountry: "من",
  savedRates: "أسعار المصادر المحفوظة",
  sourceLabels: { dubai: "دبي", turkey: "تركيا", china: "الصين" },
};

const en: NouakchottRatesCopy = {
  sectionTitle: "Nouakchott shipping rates",
  sectionHint:
    "Enter shipping rates for all three origins—Dubai, Turkey, and China—in MRU without selecting a source.",
  source: "Shipment source",
  sourceAriaLabel: "Shipping rate source",
  fromCountry: "From",
  savedRates: "Saved source rates",
  sourceLabels: { dubai: "Dubai", turkey: "Turkey", china: "China" },
};

const zh: NouakchottRatesCopy = {
  sectionTitle: "努瓦克肖特运输价格",
  sectionHint:
    "请为迪拜、土耳其和中国这三个来源输入 MRU 运输价格，无需选择来源。",
  source: "货物来源",
  sourceAriaLabel: "运输价格来源",
  fromCountry: "来源",
  savedRates: "已保存的来源价格",
  sourceLabels: { dubai: "迪拜", turkey: "土耳其", china: "中国" },
};

const tr: NouakchottRatesCopy = {
  sectionTitle: "Nuakşot kargo ücretleri",
  sectionHint:
    "Kaynak seçmeden Dubai, Türkiye ve Çin olmak üzere üç kaynağın kargo ücretlerini MRU olarak girin.",
  source: "Gönderi kaynağı",
  sourceAriaLabel: "Kargo ücret kaynağı",
  fromCountry: "Kaynak",
  savedRates: "Kayıtlı kaynak ücretleri",
  sourceLabels: { dubai: "Dubai", turkey: "Türkiye", china: "Çin" },
};

export const nouakchottRatesCopy: Record<
  NouakchottRatesLanguage,
  NouakchottRatesCopy
> = { ar, en, zh, tr };

export function nouakchottRatesCopyFor(language: string): NouakchottRatesCopy {
  return nouakchottRatesCopy[
    (nouakchottRatesLanguages as readonly string[]).includes(language)
      ? (language as NouakchottRatesLanguage)
      : "ar"
  ];
}
