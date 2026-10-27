export const officeSettingsSections = [
  "profile",
  "employees",
  "wallets",
  "permissions",
] as const;

export type OfficeSettingsSection = (typeof officeSettingsSections)[number];

export type OfficeSettingsSectionCopy = {
  profile: string;
  employees: string;
  wallets: string;
  permissions: string;
  employeeScopeHint: string;
  permissionsHint: string;
};

const ar: OfficeSettingsSectionCopy = {
  profile: "ملف المكتب",
  employees: "إدارة الموظفين",
  wallets: "طرق الدفع",
  permissions: "صلاحياتي الفعّالة",
  employeeScopeHint:
    "المكتب المحدد هنا سياق للملف، والقائمة تعرض الموظفين الذين سمح الخادم برؤيتهم؛ لا تُخفِ موظفين غير معيّنين.",
  permissionsHint: "خريطة القراءة فقط لصلاحياتك الفعّالة الحالية.",
};

const en: OfficeSettingsSectionCopy = {
  profile: "Office profile",
  employees: "Employee management",
  wallets: "Payment methods",
  permissions: "My effective access",
  employeeScopeHint:
    "The selected office is profile context. This roster remains the server-visible employee list; it does not hide unassigned employees.",
  permissionsHint: "A read-only map of your current effective permissions.",
};

const zh: OfficeSettingsSectionCopy = {
  profile: "办公室资料",
  employees: "员工管理",
  wallets: "付款方式",
  permissions: "我的有效权限",
  employeeScopeHint:
    "此处选择的办公室仅用于资料上下文。列表仍显示服务器允许您查看的员工，不会隐藏未分配员工。",
  permissionsHint: "您当前有效权限的只读地图。",
};

const tr: OfficeSettingsSectionCopy = {
  profile: "Ofis profili",
  employees: "Çalışan yönetimi",
  wallets: "Ödeme yöntemleri",
  permissions: "Etkin erişimim",
  employeeScopeHint:
    "Seçilen ofis profil bağlamıdır. Bu liste sunucunun görünür kıldığı çalışanları gösterir; atanmamış çalışanları gizlemez.",
  permissionsHint: "Mevcut etkin yetkilerinizin salt okunur haritası.",
};

const copy: Record<string, OfficeSettingsSectionCopy> = { ar, en, zh, tr };

export function officeSettingsSectionFromPanel(
  panel: string | null | undefined
): OfficeSettingsSection {
  return (officeSettingsSections as readonly string[]).includes(panel ?? "")
    ? (panel as OfficeSettingsSection)
    : "profile";
}

export function officeSettingsCopyFor(
  language: string
): OfficeSettingsSectionCopy {
  return copy[language] ?? en;
}

export function officeSettingsLocationWithQuery(
  location: string,
  changes: Record<string, string | null>
): string {
  const [pathAndQuery, hash = ""] = location.split("#", 2);
  const [path, query = ""] = pathAndQuery.split("?", 2);
  const params = new URLSearchParams(query);
  for (const [key, value] of Object.entries(changes)) {
    if (value == null) params.delete(key);
    else params.set(key, value);
  }
  const nextQuery = params.toString();
  return `${path}${nextQuery ? `?${nextQuery}` : ""}${hash ? `#${hash}` : ""}`;
}
