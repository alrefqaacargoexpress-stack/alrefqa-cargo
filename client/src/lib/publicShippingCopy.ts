import type { ShippingRateKey } from "@shared/publicShipping";

export const publicShippingLanguages = ["ar", "en", "zh", "tr"] as const;
export type PublicShippingLanguage = (typeof publicShippingLanguages)[number];

export type PublicShippingCopy = {
  sectionTitle: string;
  sectionHint: string;
  publicWarning: string;
  seaAddress: string;
  seaAddressHint: string;
  ratesTitle: string;
  ratesHint: string;
  legacyRateWarning: string;
  adoptRate: string;
  adoptRatePreview: string;
  rateCurrencyRequired: (currency: string) => string;
  rateUnitRequired: (unit: string) => string;
  serviceLabels: Record<ShippingRateKey, string>;
  amount: string;
  currency: string;
  unit: string;
  amountPlaceholder: string;
  noRate: string;
  units: Record<"kg" | "m3" | "shipment", string>;
  currencies: Record<string, string>;
  savedRates: string;
  savedSeaAddress: string;
  invoiceNotice: string;
  conflictError: string;
  reloadLatest: string;
  reloadLatestConfirm: string;
  reloadLatestDiscarded: string;
  reloadFailed: string;
  permissionError: string;
  validationError: string;
  authError: string;
  saveFailed: string;
};

const ar: PublicShippingCopy = {
  sectionTitle: "الشحن العام",
  sectionHint: "انشر عنوان الشحن البحري وأسعار الخدمات التي حفظتها فقط.",
  publicWarning: "هذه الأسعار عامة وإرشادية مستقلة عن فاتورة الشحنة النهائية.",
  seaAddress: "عنوان الشحن البحري",
  seaAddressHint: "اتركه فارغاً إذا لم يُؤكد العنوان بعد.",
  ratesTitle: "أسعار الشحن العامة",
  ratesHint: "الخانة الفارغة تحفظ null، ولا نضع سعراً افتراضياً أو صفراً.",
  legacyRateWarning:
    "هذا سعر قديم محفوظ كما هو، ولا يطابق سياسة الإعلان الجديدة. لن يتغير عند حفظ العنوان فقط.",
  adoptRate: "اعتماد سعر جديد بهذه العملة والوحدة",
  adoptRatePreview: "المعاينة",
  rateCurrencyRequired: (currency: string) =>
    `السعر المعدل يجب أن يكون بعملة المكتب: ${currency}. السعر القديم لم يتغير.`,
  rateUnitRequired: (unit: string) =>
    `السعر المعدل يجب أن يكون بوحدة ${unit}. السعر القديم لم يتغير.`,
  serviceLabels: {
    airRegular: "الجوي العادي",
    airExpress: "الجوي السريع",
    sensitive: "البضاعة الحساسة",
    sea: "البحري",
  },
  amount: "السعر",
  currency: "العملة",
  unit: "الوحدة",
  amountPlaceholder: "اتركه فارغاً لعدم النشر",
  noRate: "لا يوجد سعر محفوظ",
  units: { kg: "لكل كغ", m3: "لكل م³", shipment: "لكل شحنة" },
  currencies: {
    MRU: "أوقية MRU",
    AED: "درهم AED",
    CNY: "يوان CNY",
    TRY: "ليرة TRY",
    USD: "دولار USD",
    EUR: "يورو EUR",
  },
  savedRates: "الأسعار العامة المحفوظة",
  savedSeaAddress: "عنوان الشحن البحري",
  invoiceNotice:
    "تنبيه: هذه الأسعار العامة مستقلة عن فاتورة الشحنة وقد تختلف عنها.",
  conflictError:
    "تغير الملف على الخادم. أعد تحميل أحدث نسخة وراجع المسودة قبل الحفظ؛ لن نكتب فوق التغيير تلقائياً.",
  reloadLatest: "جلب أحدث نسخة للمراجعة",
  reloadLatestConfirm:
    "لديك مسودة غير محفوظة. جلب أحدث نسخة سيلغي هذه المسودة. هل تريد المتابعة؟",
  reloadLatestDiscarded: "تم جلب أحدث نسخة؛ لم تُحفظ المسودة السابقة.",
  reloadFailed: "تعذر جلب أحدث نسخة.",
  permissionError: "لا تملك صلاحية تعديل ملف المكتب.",
  validationError: "تحقق من قيم الملف والأسعار قبل الحفظ.",
  authError: "انتهت جلسة الدخول. سجل الدخول ثم حاول مجدداً.",
  saveFailed: "فشل حفظ الملف أو حدثت مشكلة في الاتصال. بقيت المسودة دون تغيير.",
};

const en: PublicShippingCopy = {
  sectionTitle: "Public shipping",
  sectionHint: "Publish only the sea address and service rates that you save.",
  publicWarning:
    "These public rates are indicative and independent from the final shipment invoice.",
  seaAddress: "Sea shipping address",
  seaAddressHint: "Leave it empty until the address is confirmed.",
  ratesTitle: "Public shipping rates",
  ratesHint: "An empty field saves null; no default or zero price is added.",
  legacyRateWarning:
    "This is a saved legacy rate and does not match the new publication policy. It stays unchanged when you save only the address.",
  adoptRate: "Adopt a new rate with this currency and unit",
  adoptRatePreview: "Preview",
  rateCurrencyRequired: (currency: string) =>
    `An edited rate must use the office currency: ${currency}. The legacy rate was not changed.`,
  rateUnitRequired: (unit: string) =>
    `An edited rate must use ${unit}. The legacy rate was not changed.`,
  serviceLabels: {
    airRegular: "Regular air",
    airExpress: "Express air",
    sensitive: "Sensitive goods",
    sea: "Sea freight",
  },
  amount: "Rate",
  currency: "Currency",
  unit: "Unit",
  amountPlaceholder: "Leave empty to keep unpublished",
  noRate: "No saved rate",
  units: { kg: "per kg", m3: "per m³", shipment: "per shipment" },
  currencies: {
    MRU: "MRU",
    AED: "AED",
    CNY: "CNY",
    TRY: "TRY",
    USD: "USD",
    EUR: "EUR",
  },
  savedRates: "Saved public rates",
  savedSeaAddress: "Sea shipping address",
  invoiceNotice:
    "Notice: these public rates are independent from the shipment invoice and may differ.",
  conflictError:
    "The profile changed on the server. Get the latest version and review your draft before saving; no change is overwritten automatically.",
  reloadLatest: "Get latest version to review",
  reloadLatestConfirm:
    "You have unsaved changes. Getting the latest version will discard this draft. Continue?",
  reloadLatestDiscarded:
    "The latest version was loaded; the previous draft was not saved.",
  reloadFailed: "Could not get the latest version.",
  permissionError: "You do not have permission to edit this office profile.",
  validationError: "Review the profile and rate values before saving.",
  authError: "Your session has expired. Sign in and try again.",
  saveFailed:
    "The profile could not be saved or the connection failed. Your draft is unchanged.",
};

const zh: PublicShippingCopy = {
  sectionTitle: "公开运输",
  sectionHint: "只发布已保存的海运地址和服务价格。",
  publicWarning: "这些公开价格仅供参考，与最终货运发票相互独立。",
  seaAddress: "海运地址",
  seaAddressHint: "地址确认前请留空。",
  ratesTitle: "公开运输价格",
  ratesHint: "空白输入会保存为 null；不会添加默认价格或零。",
  legacyRateWarning:
    "这是已保存的旧价格，不符合新的发布政策。只保存地址时不会更改它。",
  adoptRate: "采用此货币和单位的新价格",
  adoptRatePreview: "预览",
  rateCurrencyRequired: (currency: string) =>
    `修改后的价格必须使用办公室货币：${currency}。旧价格未更改。`,
  rateUnitRequired: (unit: string) =>
    `修改后的价格必须使用${unit}。旧价格未更改。`,
  serviceLabels: {
    airRegular: "普通空运",
    airExpress: "快速空运",
    sensitive: "敏感货物",
    sea: "海运",
  },
  amount: "价格",
  currency: "货币",
  unit: "单位",
  amountPlaceholder: "留空表示不公开",
  noRate: "没有已保存的价格",
  units: { kg: "每公斤", m3: "每立方米", shipment: "每票" },
  currencies: {
    MRU: "MRU",
    AED: "AED",
    CNY: "CNY",
    TRY: "TRY",
    USD: "USD",
    EUR: "EUR",
  },
  savedRates: "已保存的公开价格",
  savedSeaAddress: "海运地址",
  invoiceNotice: "提示：公开价格独立于货运发票，可能与发票不同。",
  conflictError:
    "服务器上的资料已改变。请获取最新版本并检查草稿；不会自动覆盖更改。",
  reloadLatest: "获取最新版本并审核",
  reloadLatestConfirm: "你有未保存的草稿。获取最新版本会丢弃该草稿。继续吗？",
  reloadLatestDiscarded: "已加载最新版本；之前的草稿未保存。",
  reloadFailed: "无法获取最新版本。",
  permissionError: "你没有编辑此办公室资料的权限。",
  validationError: "保存前请检查资料和价格。",
  authError: "登录会话已过期。请登录后重试。",
  saveFailed: "资料保存失败或连接出现问题。草稿保持不变。",
};

const tr: PublicShippingCopy = {
  sectionTitle: "Herkese açık kargo",
  sectionHint:
    "Yalnızca kaydettiğiniz deniz adresini ve hizmet ücretlerini yayınlayın.",
  publicWarning:
    "Bu herkese açık ücretler gösterge niteliğindedir ve nihai gönderi faturasından bağımsızdır.",
  seaAddress: "Deniz kargo adresi",
  seaAddressHint: "Adres doğrulanana kadar boş bırakın.",
  ratesTitle: "Herkese açık kargo ücretleri",
  ratesHint:
    "Boş alan null olarak kaydedilir; varsayılan veya sıfır ücret eklenmez.",
  legacyRateWarning:
    "Bu, yeni yayın politikasına uymayan kayıtlı eski bir ücrettir. Yalnızca adresi kaydettiğinizde değişmez.",
  adoptRate: "Bu para birimi ve birimle yeni ücreti kabul et",
  adoptRatePreview: "Önizleme",
  rateCurrencyRequired: (currency: string) =>
    `Düzenlenen ücret ofis para birimini kullanmalıdır: ${currency}. Eski ücret değiştirilmedi.`,
  rateUnitRequired: (unit: string) =>
    `Düzenlenen ücret ${unit} kullanmalıdır. Eski ücret değiştirilmedi.`,
  serviceLabels: {
    airRegular: "Standart hava",
    airExpress: "Ekspres hava",
    sensitive: "Hassas ürünler",
    sea: "Deniz kargo",
  },
  amount: "Ücret",
  currency: "Para birimi",
  unit: "Birim",
  amountPlaceholder: "Yayınlamamak için boş bırakın",
  noRate: "Kayıtlı ücret yok",
  units: { kg: "kg başına", m3: "m³ başına", shipment: "gönderi başına" },
  currencies: {
    MRU: "MRU",
    AED: "AED",
    CNY: "CNY",
    TRY: "TRY",
    USD: "USD",
    EUR: "EUR",
  },
  savedRates: "Kayıtlı herkese açık ücretler",
  savedSeaAddress: "Deniz kargo adresi",
  invoiceNotice:
    "Not: Bu herkese açık ücretler gönderi faturasından bağımsızdır ve farklı olabilir.",
  conflictError:
    "Profil sunucuda değişti. En son sürümü getirip taslağı inceleyin; değişiklik otomatik olarak üzerine yazılmaz.",
  reloadLatest: "İncelemek için en son sürümü getir",
  reloadLatestConfirm:
    "Kaydedilmemiş değişiklikleriniz var. En son sürüm bu taslağı silecek. Devam edilsin mi?",
  reloadLatestDiscarded: "En son sürüm yüklendi; önceki taslak kaydedilmedi.",
  reloadFailed: "En son sürüm getirilemedi.",
  permissionError: "Bu ofis profilini düzenleme yetkiniz yok.",
  validationError: "Kaydetmeden önce profil ve ücretleri kontrol edin.",
  authError: "Oturumunuzun süresi doldu. Giriş yapıp tekrar deneyin.",
  saveFailed:
    "Profil kaydedilemedi veya bağlantı hatası oluştu. Taslağınız korunuyor.",
};

export const publicShippingCopy: Record<
  PublicShippingLanguage,
  PublicShippingCopy
> = { ar, en, zh, tr };

export function publicShippingCopyFor(language: string): PublicShippingCopy {
  return publicShippingCopy[
    (publicShippingLanguages as readonly string[]).includes(language)
      ? (language as PublicShippingLanguage)
      : "ar"
  ];
}
