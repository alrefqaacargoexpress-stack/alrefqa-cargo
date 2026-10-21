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
  sectionTitle: "أسعار مصادر نواكشوط",
  sectionHint: "أسعار ثابتة بالوقية الجديدة MRU حسب مصدر الشحنة.",
  source: "مصدر الشحنة",
  sourceAriaLabel: "مصدر أسعار الشحن",
  fromCountry: "من",
  savedRates: "أسعار المصادر المحفوظة",
  sourceLabels: { dubai: "دبي", turkey: "تركيا", china: "الصين" },
};

const en: NouakchottRatesCopy = {
  sectionTitle: "Nouakchott source rates",
  sectionHint: "Fixed new ouguiya (MRU) rates by shipment source.",
  source: "Shipment source",
  sourceAriaLabel: "Shipping rate source",
  fromCountry: "From",
  savedRates: "Saved source rates",
  sourceLabels: { dubai: "Dubai", turkey: "Turkey", china: "China" },
};

const zh: NouakchottRatesCopy = {
  sectionTitle: "努瓦克肖特来源价格",
  sectionHint: "按货物来源设置固定的新乌吉亚（MRU）价格。",
  source: "货物来源",
  sourceAriaLabel: "运输价格来源",
  fromCountry: "来源",
  savedRates: "已保存的来源价格",
  sourceLabels: { dubai: "迪拜", turkey: "土耳其", china: "中国" },
};

const tr: NouakchottRatesCopy = {
  sectionTitle: "Nuakşot kaynak ücretleri",
  sectionHint: "Gönderi kaynağına göre sabit yeni uguiya (MRU) ücretleri.",
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
