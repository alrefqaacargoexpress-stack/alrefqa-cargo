import type { PermissionKey } from "@shared/permissions";

export const permissionCopyLanguages = ["ar", "en", "zh", "tr"] as const;
export type PermissionCopyLanguage = (typeof permissionCopyLanguages)[number];

type PermissionCopy = {
  title: string;
  permission: string;
  hint: string;
  ceiling: string;
  current: string;
  effective: string;
  source: string;
  sourceSaved: string;
  sourceDefault: string;
  sourcePreview: string;
  unavailable: string;
  aboveCeiling: string;
  rootOnly: string;
  delegatedBy: string;
  none: string;
  view: string;
  manage: string;
  groups: Record<string, string>;
  keys: Record<PermissionKey, string>;
};

const ar: PermissionCopy = {
  title: "مصفوفة الصلاحيات",
  permission: "الصلاحية",
  hint: "تظهر الخريطة المحفوظة والقيمة الفعالة والسقف دون منح صلاحية من العرض.",
  ceiling: "السقف المتاح",
  current: "المحفوظة / الحالية",
  effective: "الفعالة",
  source: "المصدر",
  sourceSaved: "تخصيص محفوظ",
  sourceDefault: "قالب الوظيفة",
  sourcePreview: "معاينة التغيير",
  unavailable: "غير متاح ضمن سقفك",
  aboveCeiling: "المحفوظة أعلى من السقف — لا يمكن رفعها من هنا",
  rootOnly: "للمدير العام فقط",
  delegatedBy: "مفوّض من",
  none: "ممنوع",
  view: "مشاهدة فقط",
  manage: "تنفيذ",
  groups: {
    management: "إدارة المكاتب والموظفين",
    shipping: "الشحن والإرسال والتتبع",
    warehouse: "الوصول والمستودع والرفوف",
    salesCustomers: "العملاء والفواتير والتحصيل",
    financeCost: "الحسابات والتكاليف والصندوق",
    reportsAudit: "التقارير وExcel والتدقيق",
  },
  keys: {
    shipments: "الشحنات",
    shipment_send: "إرسال الشحنات",
    shipment_delete: "حذف الشحنات",
    tracking: "التتبع",
    market_warehouse: "مستودع الماركت والاستعلام",
    arrival: "تأكيد الوصول",
    storage: "التخزين والرفوف",
    customers: "العملاء",
    invoices: "الفواتير",
    payments: "المدفوعات والتحصيل",
    expenses: "المصروفات والديون",
    shipment_cost: "تكلفة المصدر",
    arrival_cost: "تكلفة الوصول",
    opening_balance: "الرصيد الافتتاحي",
    shipment_prices: "أسعار الشحنات: مشاهدة / تحديد سعر",
    reports: "التقارير",
    finance_reports: "التقارير المالية",
    excel: "تصدير Excel",
    office_settings: "إعدادات المكتب",
    office_wallets: "محافظ المكتب والصندوق",
    employees: "الموظفون",
    audit: "سجل التدقيق",
    office_assign: "تعيين المكاتب",
    invoice_void: "إلغاء الفواتير",
    entry_void: "إلغاء القيود",
    employee_disable: "تعطيل الموظفين",
    profit_withdrawal: "سحب الأرباح من الصندوق",
  },
};

const en: PermissionCopy = {
  title: "Permission matrix",
  permission: "Permission",
  hint: "The saved map, effective value, and ceiling are shown without granting access from display.",
  ceiling: "Available ceiling",
  current: "Saved / current",
  effective: "Effective",
  source: "Source",
  sourceSaved: "Saved customization",
  sourceDefault: "Role template",
  sourcePreview: "Change preview",
  unavailable: "Unavailable within your ceiling",
  aboveCeiling: "Saved value is above the ceiling — it cannot be raised here",
  rootOnly: "General administrator only",
  delegatedBy: "Delegated by",
  none: "Prohibited",
  view: "View only",
  manage: "Execute",
  groups: {
    management: "Office and employee management",
    shipping: "Shipping, sending, and tracking",
    warehouse: "Arrival, warehouse, and shelves",
    salesCustomers: "Customers, invoices, and collections",
    financeCost: "Accounts, costs, and cash",
    reportsAudit: "Reports, Excel, and audit",
  },
  keys: {
    shipments: "Shipments",
    shipment_send: "Send shipments",
    shipment_delete: "Delete shipments",
    tracking: "Tracking",
    market_warehouse: "Market warehouse inquiry",
    arrival: "Confirm arrival",
    storage: "Storage and shelves",
    customers: "Customers",
    invoices: "Invoices",
    payments: "Payments and collections",
    expenses: "Expenses and debts",
    shipment_cost: "Source cost",
    arrival_cost: "Arrival cost",
    opening_balance: "Opening balance",
    shipment_prices: "Shipment prices: view / set rate",
    reports: "Reports",
    finance_reports: "Finance reports",
    excel: "Excel export",
    office_settings: "Office settings",
    office_wallets: "Office wallets and cash",
    employees: "Employees",
    audit: "Audit log",
    office_assign: "Assign offices",
    invoice_void: "Void invoices",
    entry_void: "Void entries",
    employee_disable: "Disable employees",
    profit_withdrawal: "Profit withdrawal from cash",
  },
};

const zh: PermissionCopy = {
  title: "权限矩阵",
  permission: "权限",
  hint: "显示已保存权限、有效值和上限；显示不会授予新权限。",
  ceiling: "可用上限",
  current: "已保存 / 当前",
  effective: "有效值",
  source: "来源",
  sourceSaved: "已保存的自定义权限",
  sourceDefault: "职位模板",
  sourcePreview: "变更预览",
  unavailable: "超出你的权限上限",
  aboveCeiling: "已保存值高于上限 — 此处不能提升",
  rootOnly: "仅限总管理员",
  delegatedBy: "委托者",
  none: "禁止",
  view: "仅查看",
  manage: "执行",
  groups: {
    management: "办公室和员工管理",
    shipping: "货运、发送和追踪",
    warehouse: "到达、仓库和货架",
    salesCustomers: "客户、发票和收款",
    financeCost: "账户、成本和现金",
    reportsAudit: "报告、Excel 和审计",
  },
  keys: {
    shipments: "货运",
    shipment_send: "发送货运",
    shipment_delete: "删除货运",
    tracking: "追踪",
    market_warehouse: "市场仓查询",
    arrival: "确认到达",
    storage: "仓储和货架",
    customers: "客户",
    invoices: "发票",
    payments: "付款和收款",
    expenses: "支出和债务",
    shipment_cost: "始发成本",
    arrival_cost: "到达成本",
    opening_balance: "期初余额",
    shipment_prices: "货运价格：查看 / 设置单价",
    reports: "报告",
    finance_reports: "财务报告",
    excel: "Excel 导出",
    office_settings: "办公室设置",
    office_wallets: "办公室钱包和现金",
    employees: "员工",
    audit: "审计日志",
    office_assign: "分配办公室",
    invoice_void: "作废发票",
    entry_void: "作废账目",
    employee_disable: "停用员工",
    profit_withdrawal: "从现金中提取利润",
  },
};

const tr: PermissionCopy = {
  title: "Yetki matrisi",
  permission: "Yetki",
  hint: "Kaydedilmiş harita, etkin değer ve tavan gösterilir; görüntüleme erişim vermez.",
  ceiling: "Kullanılabilir üst sınır",
  current: "Kaydedilmiş / mevcut",
  effective: "Etkin",
  source: "Kaynak",
  sourceSaved: "Kaydedilmiş özelleştirme",
  sourceDefault: "Rol şablonu",
  sourcePreview: "Değişiklik önizlemesi",
  unavailable: "Yetki sınırınızın dışında",
  aboveCeiling: "Kaydedilmiş değer tavandan yüksek — burada yükseltilemez",
  rootOnly: "Yalnızca genel yönetici",
  delegatedBy: "Veren",
  none: "Yasak",
  view: "Yalnızca görüntüle",
  manage: "Yürüt",
  groups: {
    management: "Ofis ve çalışan yönetimi",
    shipping: "Gönderi, gönderme ve takip",
    warehouse: "Varış, depo ve raflar",
    salesCustomers: "Müşteriler, faturalar ve tahsilat",
    financeCost: "Hesaplar, maliyetler ve kasa",
    reportsAudit: "Raporlar, Excel ve denetim",
  },
  keys: {
    shipments: "Gönderiler",
    shipment_send: "Gönderi gönderme",
    shipment_delete: "Gönderi silme",
    tracking: "Takip",
    market_warehouse: "Market depo sorgusu",
    arrival: "Varışı onaylama",
    storage: "Depo ve raflar",
    customers: "Müşteriler",
    invoices: "Faturalar",
    payments: "Ödemeler ve tahsilat",
    expenses: "Giderler ve borçlar",
    shipment_cost: "Çıkış maliyeti",
    arrival_cost: "Varış maliyeti",
    opening_balance: "Açılış bakiyesi",
    shipment_prices: "Gönderi fiyatları: görüntüle / belirle",
    reports: "Raporlar",
    finance_reports: "Finans raporları",
    excel: "Excel dışa aktarma",
    office_settings: "Ofis ayarları",
    office_wallets: "Ofis cüzdanları ve kasa",
    employees: "Çalışanlar",
    audit: "Denetim günlüğü",
    office_assign: "Ofis atama",
    invoice_void: "Faturaları iptal et",
    entry_void: "Kayıt iptali",
    employee_disable: "Çalışanları devre dışı bırak",
    profit_withdrawal: "Kasadan kâr çekimi",
  },
};

export const newPermissionsCopy: Record<
  PermissionCopyLanguage,
  PermissionCopy
> = {
  ar,
  en,
  zh,
  tr,
};

export function newPermissionsCopyFor(language: string): PermissionCopy {
  return newPermissionsCopy[
    (permissionCopyLanguages as readonly string[]).includes(language)
      ? (language as PermissionCopyLanguage)
      : "ar"
  ];
}
