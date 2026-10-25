import type { PermissionKey } from "@shared/permissions";

export const permissionCopyLanguages = ["ar", "en", "zh", "tr"] as const;
export type PermissionCopyLanguage = (typeof permissionCopyLanguages)[number];

type PermissionCopy = {
  title: string;
  permission: string;
  hint: string;
  ceiling: string;
  unavailable: string;
  rootOnly: string;
  delegatedBy: string;
  none: string;
  view: string;
  manage: string;
  keys: Record<PermissionKey, string>;
};

const ar: PermissionCopy = {
  title: "مصفوفة الصلاحيات",
  permission: "الصلاحية",
  hint: "تُطبّق الصلاحيات الفعّالة على كل مكتب محدد للموظف.",
  ceiling: "الحد الأقصى المتاح",
  unavailable: "غير متاح ضمن سقفك",
  rootOnly: "للمدير الجذري فقط",
  delegatedBy: "مفوّض من",
  none: "بدون",
  view: "عرض",
  manage: "إدارة",
  keys: {
    shipments: "الشحنات",
    shipment_send: "إرسال الشحنات",
    shipment_delete: "حذف الشحنات",
    tracking: "التتبع",
    arrival: "تأكيد الوصول",
    storage: "التخزين",
    customers: "العملاء",
    invoices: "الفواتير",
    payments: "المدفوعات",
    expenses: "المصروفات",
    shipment_cost: "تكلفة المصدر",
    arrival_cost: "تكلفة الوصول",
    opening_balance: "الرصيد الافتتاحي",
    shipment_prices: "أسعار الشحنات: مشاهدة / تحديد سعر",
    reports: "التقارير",
    finance_reports: "التقارير المالية",
    excel: "تصدير Excel",
    office_settings: "إعدادات المكتب",
    office_wallets: "محافظ المكتب",
    employees: "الموظفون",
    audit: "سجل التدقيق",
    office_assign: "تعيين المكاتب",
    invoice_void: "إلغاء الفواتير",
    entry_void: "إلغاء القيود",
    employee_disable: "تعطيل الموظفين",
  },
};

const en: PermissionCopy = {
  title: "Permission matrix",
  permission: "Permission",
  hint: "Effective permissions apply across every office assigned to the employee.",
  ceiling: "Available ceiling",
  unavailable: "Unavailable within your ceiling",
  rootOnly: "Root administrator only",
  delegatedBy: "Delegated by",
  none: "None",
  view: "View",
  manage: "Manage",
  keys: {
    shipments: "Shipments",
    shipment_send: "Send shipments",
    shipment_delete: "Delete shipments",
    tracking: "Tracking",
    arrival: "Confirm arrival",
    storage: "Storage",
    customers: "Customers",
    invoices: "Invoices",
    payments: "Payments",
    expenses: "Expenses",
    shipment_cost: "Source cost",
    arrival_cost: "Arrival cost",
    opening_balance: "Opening balance",
    shipment_prices: "Shipment prices: view / set rate",
    reports: "Reports",
    finance_reports: "Finance reports",
    excel: "Excel export",
    office_settings: "Office settings",
    office_wallets: "Office wallets",
    employees: "Employees",
    audit: "Audit log",
    office_assign: "Assign offices",
    invoice_void: "Void invoices",
    entry_void: "Void entries",
    employee_disable: "Disable employees",
  },
};

const zh: PermissionCopy = {
  title: "权限矩阵",
  permission: "权限",
  hint: "有效权限适用于分配给员工的每个办公室。",
  ceiling: "可用上限",
  unavailable: "超出你的权限上限",
  rootOnly: "仅限根管理员",
  delegatedBy: "委托者",
  none: "无",
  view: "查看",
  manage: "管理",
  keys: {
    shipments: "货运",
    shipment_send: "发送货运",
    shipment_delete: "删除货运",
    tracking: "追踪",
    arrival: "确认到达",
    storage: "仓储",
    customers: "客户",
    invoices: "发票",
    payments: "付款",
    expenses: "支出",
    shipment_cost: "始发成本",
    arrival_cost: "到达成本",
    opening_balance: "期初余额",
    shipment_prices: "货运价格：查看 / 设置单价",
    reports: "报告",
    finance_reports: "财务报告",
    excel: "Excel 导出",
    office_settings: "办公室设置",
    office_wallets: "办公室钱包",
    employees: "员工",
    audit: "审计日志",
    office_assign: "分配办公室",
    invoice_void: "作废发票",
    entry_void: "作废账目",
    employee_disable: "停用员工",
  },
};

const tr: PermissionCopy = {
  title: "Yetki matrisi",
  permission: "Yetki",
  hint: "Etkin izinler çalışana atanan her ofiste geçerlidir.",
  ceiling: "Kullanılabilir üst sınır",
  unavailable: "Yetki sınırınızın dışında",
  rootOnly: "Yalnızca kök yönetici",
  delegatedBy: "Veren",
  none: "Yok",
  view: "Görüntüle",
  manage: "Yönet",
  keys: {
    shipments: "Gönderiler",
    shipment_send: "Gönderi gönderme",
    shipment_delete: "Gönderi silme",
    tracking: "Takip",
    arrival: "Varışı onaylama",
    storage: "Depo",
    customers: "Müşteriler",
    invoices: "Faturalar",
    payments: "Ödemeler",
    expenses: "Giderler",
    shipment_cost: "Çıkış maliyeti",
    arrival_cost: "Varış maliyeti",
    opening_balance: "Açılış bakiyesi",
    shipment_prices: "Gönderi fiyatları: görüntüle / belirle",
    reports: "Raporlar",
    finance_reports: "Finans raporları",
    excel: "Excel dışa aktarma",
    office_settings: "Ofis ayarları",
    office_wallets: "Ofis cüzdanları",
    employees: "Çalışanlar",
    audit: "Denetim günlüğü",
    office_assign: "Ofis atama",
    invoice_void: "Faturaları iptal et",
    entry_void: "Kayıtları iptal et",
    employee_disable: "Çalışanları devre dışı bırak",
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
