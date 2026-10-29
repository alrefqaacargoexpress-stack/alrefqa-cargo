import { z } from "zod";
import { officeProfileSchema } from "@shared/branches";
import type { Language } from "@/lib/publicCopy";
import type { OfficeId, VersionedOfficeProfile } from "@shared/branches";
import type { TrackingStage } from "@shared/tracking";

export const PUBLIC_OFFICE_CACHE_KEY = "alrefqaa.public.office-profiles.v1";

export const officeDashboardCopy = {
  ar: {
    offices: "المكاتب العامة",
    office: "المكتب",
    address: "العنوان المؤكد",
    addressUnknown: "العنوان غير منشور بعد",
    phone: "هاتف المكتب",
    noPhone: "لا يوجد هاتف منشور",
    employees: "جهة اتصال عامة",
    availableEmployees: "الموظفون المتاحون الآن",
    availableBadge: "حاضر للعمل",
    whatsappEmployee: "تواصل عبر واتساب",
    hours: "ساعات العمل",
    break: "الاستراحة",
    hoursUnknown: "لم تحدد ساعات العمل بعد",
    closed: "مغلق",
    timezone: "المنطقة الزمنية",
    map: "فتح الموقع على خرائط Google",
    requestAddress: "اطلب العنوان المؤكد عبر واتساب",
    unavailable: "تعذر تحديث بيانات المكاتب",
    loading: "جارٍ تحميل بيانات المكاتب…",
    legacy: "مرجع الاتصال المعروف سابقاً",
    legacyDetail: "يُستخدم فقط للتواصل وطلب العنوان حتى يُحفظ ملف عام مؤكد.",
    dashboard: "لوحة مكتب الرفكة",
    profile: "الملف العام",
    shipments: "الشحنات المرتبطة",
    accounts: "الحسابات المرتبطة",
    invoices: "الفواتير المرتبطة",
    financeHidden: "البيانات المالية غير متاحة لهذا الدور.",
    noAccess: "لا تملك صلاحية الوصول إلى هذا المكتب.",
    loadingDashboard: "جارٍ تحميل بيانات المكتب…",
    noRecords: "لا توجد سجلات محفوظة لهذا المكتب.",
    stage: "مرحلة الرحلة",
    status: "الحالة",
    tracking: "رقم التتبع",
    account: "العميل",
    amount: "المبلغ",
    paid: "مدفوعة",
    awaiting: "بانتظار الدفع",
    confirmArrival: "تأكيد وصول الشحنة إلى المكتب",
    arrivalReason: "سبب التأكيد",
    arrivalPrompt: "اكتب سبباً مختصراً لتأكيد وصول الشحنة إلى نواكشوط.",
    confirm: "تأكيد الوصول",
    cancel: "إلغاء",
    connected: "متصل",
    offlineArrival: "يلزم اتصال لتأكيد الوصول",
    confirmed: "تم تسجيل وصول الشحنة إلى المكتب، وليس تسليمها للعميل.",
    newShipment: "إنشاء شحنة للمكتب",
    accountsLink: "إدارة الحسابات",
    invoicesLink: "إدارة الفواتير",
    settingsLink: "إعدادات المكتب",
    unassigned: "سجلات غير مخصصة",
    unassignedDetail: "هذه السجلات محفوظة كما هي ولم تُوزع تلقائياً على مكتب.",
    assign: "تعيين للمكتب",
    assignReason: "سبب التعيين",
    assignPrompt: "اكتب سبباً يوضح التعيين اليدوي.",
    assigned: "تم التعيين اليدوي مع حفظ السجل الأصلي.",
    assignConfirm: "تأكيد التعيين",
    entityAccount: "حساب",
    entityInvoice: "فاتورة",
    unknownCount: "سجلات غير معروفة",
  },
  en: {
    offices: "Public offices",
    office: "Office",
    address: "Confirmed address",
    addressUnknown: "Address not published yet",
    phone: "Office phone",
    noPhone: "No public phone",
    employees: "Public contact",
    availableEmployees: "Employees available now",
    availableBadge: "Available for work",
    whatsappEmployee: "Contact on WhatsApp",
    hours: "Opening hours",
    break: "Break",
    hoursUnknown: "Opening hours have not been set",
    closed: "Closed",
    timezone: "Timezone",
    map: "Open location in Google Maps",
    requestAddress: "Request the confirmed address on WhatsApp",
    unavailable: "Unable to update office information",
    loading: "Loading office information…",
    legacy: "Known legacy contact reference",
    legacyDetail:
      "Use only to contact the team and request an address until a public profile is confirmed.",
    dashboard: "Al-Rafqaa office dashboard",
    profile: "Public profile",
    shipments: "Related shipments",
    accounts: "Related accounts",
    invoices: "Related invoices",
    financeHidden: "Financial data is not available for this role.",
    noAccess: "You do not have access to this office.",
    loadingDashboard: "Loading office data…",
    noRecords: "No saved records are associated with this office.",
    stage: "Journey stage",
    status: "Status",
    tracking: "Tracking",
    account: "Customer",
    amount: "Amount",
    paid: "Paid",
    awaiting: "Awaiting payment",
    confirmArrival: "Confirm shipment arrival at office",
    arrivalReason: "Confirmation reason",
    arrivalPrompt: "Enter a short reason for confirming arrival at Nouakchott.",
    confirm: "Confirm arrival",
    cancel: "Cancel",
    connected: "Online",
    offlineArrival: "Connection required to confirm arrival",
    confirmed:
      "Arrival at the office was recorded; this is not customer delivery.",
    newShipment: "Create shipment for office",
    accountsLink: "Manage accounts",
    invoicesLink: "Manage invoices",
    settingsLink: "Office settings",
    unassigned: "Unassigned records",
    unassignedDetail:
      "These records remain unchanged and were not allocated automatically.",
    assign: "Assign to office",
    assignReason: "Assignment reason",
    assignPrompt: "Enter a reason for this manual assignment.",
    assigned: "Record assigned manually with its original content preserved.",
    assignConfirm: "Confirm assignment",
    entityAccount: "Account",
    entityInvoice: "Invoice",
    unknownCount: "Unknown records",
  },
  zh: {
    offices: "公开办公室",
    office: "办公室",
    address: "已确认地址",
    addressUnknown: "地址尚未公开",
    phone: "办公室电话",
    noPhone: "暂无公开电话",
    employees: "公开联系人",
    availableEmployees: "当前可联系的员工",
    availableBadge: "正在工作",
    whatsappEmployee: "通过 WhatsApp 联系",
    hours: "营业时间",
    break: "休息时间",
    hoursUnknown: "尚未设置营业时间",
    closed: "休息",
    timezone: "时区",
    map: "在 Google 地图中打开位置",
    requestAddress: "通过 WhatsApp 请求已确认地址",
    unavailable: "无法更新办公室信息",
    loading: "正在加载办公室信息…",
    legacy: "已知旧联系方式参考",
    legacyDetail: "在公开档案确认前，仅用于联系团队并请求地址。",
    dashboard: "Al-Rafqaa 办公室面板",
    profile: "公开档案",
    shipments: "相关货运",
    accounts: "相关账户",
    invoices: "相关发票",
    financeHidden: "此角色无法查看财务数据。",
    noAccess: "你没有访问此办公室的权限。",
    loadingDashboard: "正在加载办公室数据…",
    noRecords: "没有保存的办公室记录。",
    stage: "旅程阶段",
    status: "状态",
    tracking: "追踪号",
    account: "客户",
    amount: "金额",
    paid: "已付款",
    awaiting: "待付款",
    confirmArrival: "确认货运抵达办公室",
    arrivalReason: "确认原因",
    arrivalPrompt: "请输入确认抵达努瓦克肖特的简短原因。",
    confirm: "确认抵达",
    cancel: "取消",
    connected: "在线",
    offlineArrival: "需要联网才能确认抵达",
    confirmed: "已记录抵达办公室；这不是交付给客户。",
    newShipment: "为办公室创建货运",
    accountsLink: "管理账户",
    invoicesLink: "管理发票",
    settingsLink: "办公室设置",
    unassigned: "未分配记录",
    unassignedDetail: "这些记录保持原样，未被自动分配到办公室。",
    assign: "分配到办公室",
    assignReason: "分配原因",
    assignPrompt: "请输入手动分配原因。",
    assigned: "记录已手动分配，原始内容已保留。",
    assignConfirm: "确认分配",
    entityAccount: "账户",
    entityInvoice: "发票",
    unknownCount: "未知记录",
  },
  tr: {
    offices: "Herkese açık ofisler",
    office: "Ofis",
    address: "Onaylı adres",
    addressUnknown: "Adres henüz yayınlanmadı",
    phone: "Ofis telefonu",
    noPhone: "Herkese açık telefon yok",
    employees: "Herkese açık iletişim",
    availableEmployees: "Şu anda uygun çalışanlar",
    availableBadge: "Çalışmaya hazır",
    whatsappEmployee: "WhatsApp'tan iletişim",
    hours: "Çalışma saatleri",
    break: "Mola",
    hoursUnknown: "Çalışma saatleri henüz belirlenmedi",
    closed: "Kapalı",
    timezone: "Saat dilimi",
    map: "Konumu Google Haritalar'da aç",
    requestAddress: "Onaylı adresi WhatsApp'tan iste",
    unavailable: "Ofis bilgileri güncellenemedi",
    loading: "Ofis bilgileri yükleniyor…",
    legacy: "Bilinen eski iletişim referansı",
    legacyDetail:
      "Herkese açık profil onaylanana kadar yalnızca ekiple iletişim ve adres talebi için kullanın.",
    dashboard: "Al-Rafqaa ofis paneli",
    profile: "Herkese açık profil",
    shipments: "İlgili gönderiler",
    accounts: "İlgili hesaplar",
    invoices: "İlgili faturalar",
    financeHidden: "Bu rol için finansal veri kullanılamıyor.",
    noAccess: "Bu ofise erişim yetkiniz yok.",
    loadingDashboard: "Ofis verileri yükleniyor…",
    noRecords: "Bu ofisle ilişkili kayıt yok.",
    stage: "Yolculuk aşaması",
    status: "Durum",
    tracking: "Takip",
    account: "Müşteri",
    amount: "Tutar",
    paid: "Ödendi",
    awaiting: "Ödeme bekliyor",
    confirmArrival: "Gönderinin ofise gelişini onayla",
    arrivalReason: "Onay nedeni",
    arrivalPrompt: "Nuakşot'a gelişi onaylamak için kısa bir neden yazın.",
    confirm: "Gelişi onayla",
    cancel: "İptal",
    connected: "Çevrimiçi",
    offlineArrival: "Gelişi onaylamak için bağlantı gerekir",
    confirmed: "Ofise geliş kaydedildi; bu müşteriye teslimat değildir.",
    newShipment: "Ofis için gönderi oluştur",
    accountsLink: "Hesapları yönet",
    invoicesLink: "Faturaları yönet",
    settingsLink: "Ofis ayarları",
    unassigned: "Atanmamış kayıtlar",
    unassignedDetail:
      "Bu kayıtlar değiştirilmeden bırakıldı ve otomatik atanmadı.",
    assign: "Ofise ata",
    assignReason: "Atama nedeni",
    assignPrompt: "Manuel atama için bir neden yazın.",
    assigned: "Kayıt, özgün içeriği korunarak manuel atandı.",
    assignConfirm: "Atamayı onayla",
    entityAccount: "Hesap",
    entityInvoice: "Fatura",
    unknownCount: "Bilinmeyen kayıtlar",
  },
} as const;

export function branchDashboardCopy(language: Language) {
  return officeDashboardCopy[language];
}

const stageLabels: Record<Language, Record<TrackingStage, string>> = {
  ar: {
    preparing: "قيد التجهيز",
    dubai_airport: "التجهيز داخل مطار دبي",
    dubai_customs: "جمارك دبي",
    to_dakar: "بانتظار الإقلاع إلى مطار دكار",
    departed_dakar: "أقلعت الشحنة باتجاه مطار دكار",
    dakar_airport: "مطار داكار",
    to_nouakchott: "إلى نواكشوط",
    arrived_office: "وصل إلى المكتب",
  },
  en: {
    preparing: "Preparing",
    dubai_airport: "Dubai airport",
    dubai_customs: "Dubai customs",
    to_dakar: "Awaiting departure to Dakar",
    departed_dakar: "Departed for Dakar airport",
    dakar_airport: "Dakar airport",
    to_nouakchott: "To Nouakchott",
    arrived_office: "Arrived at office",
  },
  zh: {
    preparing: "准备中",
    dubai_airport: "迪拜机场",
    dubai_customs: "迪拜海关",
    to_dakar: "等待起飞前往达喀尔",
    departed_dakar: "已起飞前往达喀尔机场",
    dakar_airport: "达喀尔机场",
    to_nouakchott: "前往努瓦克肖特",
    arrived_office: "已抵达办公室",
  },
  tr: {
    preparing: "Hazırlanıyor",
    dubai_airport: "Dubai havalimanı",
    dubai_customs: "Dubai gümrüğü",
    to_dakar: "Dakar uçuşu için kalkış bekleniyor",
    departed_dakar: "Dakar havaalanına doğru havalandı",
    dakar_airport: "Dakar havalimanı",
    to_nouakchott: "Nuakşot'a gidiyor",
    arrived_office: "Ofise ulaştı",
  },
};

export function stageLabel(
  stage: TrackingStage | null | undefined,
  language: Language
) {
  return stage ? stageLabels[language][stage] : "—";
}

export function weekdayLabel(day: number, language: Language) {
  const labels = {
    ar: [
      "الأحد",
      "الاثنين",
      "الثلاثاء",
      "الأربعاء",
      "الخميس",
      "الجمعة",
      "السبت",
    ],
    en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    zh: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
    tr: ["Pazar", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"],
  } as const;
  return labels[language][day] ?? String(day);
}

export function shipmentStatusLabel(
  status: string | undefined,
  language: Language
) {
  const labels: Record<Language, Record<string, string>> = {
    ar: {
      "قيد التجهيز": "قيد التجهيز",
      "في الطريق": "في الطريق",
      "وصلت للمكتب": "وصلت للمكتب",
      "جاهزة للتسليم": "جاهزة للتسليم",
      "بانتظار الدفع": "بانتظار الدفع",
      مسلّمة: "مسلّمة",
    },
    en: {
      "قيد التجهيز": "Preparing",
      "في الطريق": "In transit",
      "وصلت للمكتب": "Arrived at office",
      "جاهزة للتسليم": "Ready for delivery",
      "بانتظار الدفع": "Awaiting payment",
      مسلّمة: "Delivered",
    },
    zh: {
      "قيد التجهيز": "准备中",
      "في الطريق": "运输中",
      "وصلت للمكتب": "已到办公室",
      "جاهزة للتسليم": "待交付",
      "بانتظار الدفع": "待付款",
      مسلّمة: "已交付",
    },
    tr: {
      "قيد التجهيز": "Hazırlanıyor",
      "في الطريق": "Yolda",
      "وصلت للمكتب": "Ofise ulaştı",
      "جاهزة للتسليم": "Teslime hazır",
      "بانتظار الدفع": "Ödeme bekliyor",
      مسلّمة: "Teslim edildi",
    },
  };
  return (status && labels[language][status]) || status || "—";
}

export function safeTelHref(phone: string | null | undefined) {
  if (!phone) return null;
  const cleaned = phone
    .trim()
    .replace(/[^\d+]/g, "")
    .replace(/(?!^)\+/g, "");
  return /^\+?\d{5,20}$/.test(cleaned) ? `tel:${cleaned}` : null;
}

export function readCachedPublicProfiles(): VersionedOfficeProfile[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(PUBLIC_OFFICE_CACHE_KEY) ?? "null"
    );
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      value => isCachedProfile(value) && hasPublicProfileContent(value)
    );
  } catch {
    return [];
  }
}

export function cachePublicProfiles(profiles: VersionedOfficeProfile[]) {
  if (typeof window === "undefined" || !profiles.length) return;
  try {
    localStorage.setItem(
      PUBLIC_OFFICE_CACHE_KEY,
      JSON.stringify(
        profiles.filter(
          value => isCachedProfile(value) && hasPublicProfileContent(value)
        )
      )
    );
  } catch {
    /* A cache is an enhancement, never a source of truth. */
  }
}

function hasPublicProfileContent(profile: VersionedOfficeProfile) {
  return Boolean(
    profile.address ||
      profile.phone ||
      profile.mapUrl ||
      profile.gps ||
      profile.hours.length ||
      profile.employees.length
  );
}

function isCachedProfile(value: unknown): value is VersionedOfficeProfile {
  return officeProfileSchema
    .safeExtend({ version: z.number().int().nonnegative() })
    .safeParse(value).success;
}

export function profileMap(profiles: VersionedOfficeProfile[] | undefined) {
  return new Map<OfficeId, VersionedOfficeProfile>(
    (profiles ?? []).map(profile => [profile.officeId, profile])
  );
}
