export const shipmentPriceLanguages = ["ar", "en", "zh", "tr"] as const;
export type ShipmentPriceLanguage = (typeof shipmentPriceLanguages)[number];

export type ShipmentPriceCopy = {
  title: string;
  shipment: string;
  side: string;
  source: string;
  destination: string;
  rate: string;
  reason: string;
  reasonPlaceholder: string;
  expectedRevision: string;
  expectedVersion: string;
  original: string;
  approved: string;
  history: string;
  confirm: string;
  save: string;
  saving: string;
  saved: string;
  savedOffline: string;
  synced: string;
  noAccess: string;
  waitSync: string;
  finalBlocked: string;
  invoiceBlocked: string;
  pendingBlocked: string;
  projectionMissing: string;
  projectionMismatch: string;
  invalid: string;
  noShipments: string;
  kg: string;
  readOnly: string;
  sourceOffice: string;
  destinationOffice: string;
  originLabel: string;
  approvedLabel: string;
};

const ar: ShipmentPriceCopy = {
  title: "تجاوز سعر الشحنة",
  shipment: "الشحنة",
  side: "الجهة",
  source: "المصدر",
  destination: "الوجهة",
  rate: "السعر لكل كغ",
  reason: "سبب اعتماد السعر",
  reasonPlaceholder: "اذكر سبب تعديل السعر",
  expectedRevision: "مراجعة التسعير المتوقعة",
  expectedVersion: "نسخة سجل السعر",
  original: "السعر الأصلي",
  approved: "السعر المعتمد الفعّال",
  history: "سجل السعر: الأصل مقابل المعتمد",
  confirm: "أؤكد اعتماد هذا السعر وإرساله للمراجعة/المزامنة.",
  save: "اعتماد السعر",
  saving: "جارٍ الحفظ…",
  saved: "حُفظ تجاوز السعر كمسودة محلية.",
  savedOffline: "حُفظت المسودة محليًا؛ ستتم المزامنة عند الاتصال.",
  synced: "أقر الخادم تجاوز السعر.",
  noAccess: "لا تملك صلاحية إدارة أسعار هذه الجهة.",
  waitSync: "بانتظار مزامنة إسقاط التسعير الموثوق؛ لا يمكن التخمين.",
  finalBlocked: "حُسمت حالة الشحنة؛ يقرر الخادم السعر النهائي.",
  invoiceBlocked: "توجد فاتورة أو مطالبة مالية؛ يقرر الخادم السعر النهائي.",
  pendingBlocked: "يوجد تجاوز سعر معلق لهذه الشحنة والجهة.",
  projectionMissing: "لا يوجد إسقاط تسعيري موثوق لهذه الجهة.",
  projectionMismatch: "إسقاط التسعير لا يطابق الشحنة أو نطاق المكتب.",
  invalid: "أدخل سعرًا موجبًا وسببًا واضحًا.",
  noShipments: "لا توجد شحنات قابلة للتسعير.",
  kg: "كغ",
  readOnly: "عرض فقط",
  sourceOffice: "مكتب المصدر",
  destinationOffice: "مكتب نواكشوط",
  originLabel: "أصل الشحنة",
  approvedLabel: "اعتماد التسعير",
};

const en: ShipmentPriceCopy = {
  title: "Shipment price override",
  shipment: "Shipment",
  side: "Side",
  source: "Source",
  destination: "Destination",
  rate: "Price per kg",
  reason: "Approval reason",
  reasonPlaceholder: "Explain why this rate is approved",
  expectedRevision: "Expected pricing revision",
  expectedVersion: "Price record version",
  original: "Original rate",
  approved: "Effective approved rate",
  history: "Price history: original vs approved",
  confirm: "I confirm this rate and authorize its review/sync.",
  save: "Approve price",
  saving: "Saving…",
  saved: "Price override saved as a local draft.",
  savedOffline: "Draft saved locally; it will sync when online.",
  synced: "The server acknowledged the price override.",
  noAccess: "You cannot manage prices for this side.",
  waitSync: "Waiting for a trusted pricing projection; guessing is disabled.",
  finalBlocked: "The shipment is final; the server decides the final price.",
  invoiceBlocked: "An invoice or financial claim exists; the server decides the final price.",
  pendingBlocked: "A price override is already pending for this shipment and side.",
  projectionMissing: "No trusted pricing projection exists for this side.",
  projectionMismatch: "The pricing projection does not match the shipment or office scope.",
  invalid: "Enter a positive rate and a clear reason.",
  noShipments: "No shipments are available for pricing.",
  kg: "kg",
  readOnly: "Read only",
  sourceOffice: "Source office",
  destinationOffice: "Nouakchott office",
  originLabel: "Shipment origin",
  approvedLabel: "Pricing approval",
};

const zh: ShipmentPriceCopy = {
  title: "货件价格覆盖",
  shipment: "货件",
  side: "方向",
  source: "来源",
  destination: "目的地",
  rate: "每公斤价格",
  reason: "批准原因",
  reasonPlaceholder: "说明批准此价格的原因",
  expectedRevision: "预期定价修订",
  expectedVersion: "价格记录版本",
  original: "原始价格",
  approved: "有效批准价格",
  history: "价格历史：原始与批准",
  confirm: "我确认此价格并授权审核/同步。",
  save: "批准价格",
  saving: "保存中…",
  saved: "价格覆盖已保存为本地草稿。",
  savedOffline: "草稿已保存；联网后将同步。",
  synced: "服务器已确认价格覆盖。",
  noAccess: "您无权管理此方向的价格。",
  waitSync: "正在等待可信定价投影，禁止猜测。",
  finalBlocked: "货件已进入最终状态，由服务器决定最终价格。",
  invoiceBlocked: "已有发票或财务索赔，由服务器决定最终价格。",
  pendingBlocked: "此货件和方向已有待处理价格覆盖。",
  projectionMissing: "此方向没有可信定价投影。",
  projectionMismatch: "定价投影与货件或办公室范围不匹配。",
  invalid: "请输入正价格和清晰原因。",
  noShipments: "没有可定价货件。",
  kg: "公斤",
  readOnly: "只读",
  sourceOffice: "来源办公室",
  destinationOffice: "努瓦克肖特办公室",
  originLabel: "货件原始价格",
  approvedLabel: "定价批准",
};

const tr: ShipmentPriceCopy = {
  title: "Gönderi fiyatı geçersiz kılma",
  shipment: "Gönderi",
  side: "Taraf",
  source: "Kaynak",
  destination: "Hedef",
  rate: "Kg başına fiyat",
  reason: "Onay nedeni",
  reasonPlaceholder: "Bu fiyatın neden onaylandığını açıklayın",
  expectedRevision: "Beklenen fiyat revizyonu",
  expectedVersion: "Fiyat kaydı sürümü",
  original: "Özgün fiyat",
  approved: "Etkin onaylı fiyat",
  history: "Fiyat geçmişi: özgün ve onaylı",
  confirm: "Bu fiyatı ve inceleme/eşitleme yetkisini onaylıyorum.",
  save: "Fiyatı onayla",
  saving: "Kaydediliyor…",
  saved: "Fiyat değişikliği yerel taslak olarak kaydedildi.",
  savedOffline: "Taslak yerelde kaydedildi; bağlantı kurulunca eşitlenecek.",
  synced: "Sunucu fiyat değişikliğini onayladı.",
  noAccess: "Bu taraf için fiyat yönetme yetkiniz yok.",
  waitSync: "Güvenilir fiyat projeksiyonu bekleniyor; tahmin yapılamaz.",
  finalBlocked: "Gönderi son durumda; nihai fiyatı sunucu belirler.",
  invoiceBlocked: "Fatura veya mali talep var; nihai fiyatı sunucu belirler.",
  pendingBlocked: "Bu gönderi ve taraf için zaten bekleyen bir fiyat değişikliği var.",
  projectionMissing: "Bu taraf için güvenilir fiyat projeksiyonu yok.",
  projectionMismatch: "Fiyat projeksiyonu gönderi veya ofis kapsamıyla eşleşmiyor.",
  invalid: "Pozitif bir fiyat ve açık bir neden girin.",
  noShipments: "Fiyatlandırılabilir gönderi yok.",
  kg: "kg",
  readOnly: "Salt okunur",
  sourceOffice: "Kaynak ofis",
  destinationOffice: "Nouakchott ofisi",
  originLabel: "Gönderi aslı",
  approvedLabel: "Fiyat onayı",
};

const copies = { ar, en, zh, tr } satisfies Record<ShipmentPriceLanguage, ShipmentPriceCopy>;

export function shipmentPriceCopyFor(language: string): ShipmentPriceCopy {
  return copies[(shipmentPriceLanguages as readonly string[]).includes(language) ? (language as ShipmentPriceLanguage) : "en"];
}
