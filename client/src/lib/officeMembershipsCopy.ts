export const officeMembershipCopyLanguages = ["ar", "en", "zh", "tr"] as const;
export type OfficeMembershipCopyLanguage =
  (typeof officeMembershipCopyLanguages)[number];

export type OfficeMembershipCopy = {
  search: string;
  searchPlaceholder: string;
  filterOffice: string;
  filterRole: string;
  allOffices: string;
  allRoles: string;
  noMatches: string;
  openMember: string;
  closeMember: string;
  setupSteps: [string, string, string, string];
  reviewTitle: string;
  savedPermissions: string;
  defaultPermissions: string;
  effectivePermissions: string;
  storedPermissionHint: string;
  effectivePermissionHint: string;
  retainedPreview: string;
  permissionsAboveCeiling: (permissions: string) => string;
  secureActions: string;
  secureActionsHint: string;
  showSecureActions: string;
  hideSecureActions: string;
  multipleOffices: string;
  roleGroups: {
    administration: string;
    operations: string;
    finance: string;
    oversight: string;
  };
};

const ar: OfficeMembershipCopy = {
  search: "بحث الموظفين",
  searchPlaceholder: "ابحث بالاسم أو البريد الإلكتروني",
  filterOffice: "تصفية حسب المكتب",
  filterRole: "تصفية حسب الوظيفة",
  allOffices: "كل المكاتب",
  allRoles: "كل الوظائف",
  noMatches: "لا يوجد موظفون مطابقون للبحث أو التصفية.",
  openMember: "فتح تفاصيل الموظف",
  closeMember: "إغلاق تفاصيل الموظف",
  setupSteps: ["١. الوظيفة", "٢. المكتب", "٣. مراجعة الصلاحيات", "٤. حفظ"],
  reviewTitle: "مراجعة قبل الحفظ",
  savedPermissions: "التخصيص المحفوظ",
  defaultPermissions: "قالب الوظيفة المقترح",
  effectivePermissions: "القيمة الفعالة بعد السقف وحارس المكتب",
  storedPermissionHint:
    "هذه هي الخريطة المحفوظة للعضو؛ لا تُستبدل بالافتراضي عند فتح الشاشة.",
  effectivePermissionHint:
    "هذه معاينة القراءة الفعلية، وليست منحة جديدة ولا تغيّر الخريطة المحفوظة.",
  retainedPreview: "المعاينة تحتفظ بالمنع المحفوظ عند تغيير الوظيفة أو المكتب.",
  permissionsAboveCeiling: permissions =>
    `الصلاحيات التالية أعلى من السقف المسموح: ${permissions}. لا يمكن حفظها من هنا؛ اطلب من المدير العام تعديل الإسناد.`,
  secureActions: "إجراءات حساسة",
  secureActionsHint: "تبقى مغلقة حتى تطلب فتحها صراحة.",
  showSecureActions: "إظهار إجراءات التعطيل وإعادة كلمة المرور",
  hideSecureActions: "إخفاء الإجراءات الحساسة",
  multipleOffices: "عضو متعدد المكاتب — راجع المدير الجذري",
  roleGroups: {
    administration: "الإدارة",
    operations: "تشغيل المصدر والمستودعات",
    finance: "المحاسبة والصندوق",
    oversight: "الإشراف والمشاهدة",
  },
};

const en: OfficeMembershipCopy = {
  search: "Search employees",
  searchPlaceholder: "Search by name or email",
  filterOffice: "Filter by office",
  filterRole: "Filter by role",
  allOffices: "All offices",
  allRoles: "All roles",
  noMatches: "No employees match the search or filters.",
  openMember: "Open employee details",
  closeMember: "Close employee details",
  setupSteps: ["1. Role", "2. Office", "3. Review permissions", "4. Save"],
  reviewTitle: "Review before saving",
  savedPermissions: "Saved customization",
  defaultPermissions: "Suggested role template",
  effectivePermissions: "Effective value after ceiling and office guard",
  storedPermissionHint:
    "This is the member's saved map; opening the screen does not replace it with defaults.",
  effectivePermissionHint:
    "This is a read-only effective preview, not a new grant and not a change to the saved map.",
  retainedPreview:
    "The preview retains saved denials when the role or office changes.",
  permissionsAboveCeiling: permissions =>
    `These permissions exceed your ceiling: ${permissions}. They cannot be saved from here; ask the general manager to adjust the assignment.`,
  secureActions: "Sensitive actions",
  secureActionsHint: "Closed until explicitly opened.",
  showSecureActions: "Show disable and password-reset actions",
  hideSecureActions: "Hide sensitive actions",
  multipleOffices: "Multi-office member — ask the root administrator to review",
  roleGroups: {
    administration: "Administration",
    operations: "Source and warehouse operations",
    finance: "Accounting and cash",
    oversight: "Oversight and viewing",
  },
};

const zh: OfficeMembershipCopy = {
  search: "搜索员工",
  searchPlaceholder: "按姓名或电子邮件搜索",
  filterOffice: "按办公室筛选",
  filterRole: "按职位筛选",
  allOffices: "所有办公室",
  allRoles: "所有职位",
  noMatches: "没有符合搜索或筛选条件的员工。",
  openMember: "打开员工详情",
  closeMember: "关闭员工详情",
  setupSteps: ["1. 职位", "2. 办公室", "3. 检查权限", "4. 保存"],
  reviewTitle: "保存前检查",
  savedPermissions: "已保存的自定义权限",
  defaultPermissions: "建议的职位模板",
  effectivePermissions: "应用上限和办公室保护后的有效值",
  storedPermissionHint: "这是员工已保存的权限；打开页面不会用默认值替换它。",
  effectivePermissionHint:
    "这是只读的有效预览，不是新授权，也不会修改已保存的权限。",
  retainedPreview: "更改职位或办公室时，预览会保留已保存的拒绝项。",
  permissionsAboveCeiling: permissions =>
    `以下权限高于可用上限：${permissions}。无法在此保存；请让总管理员调整分配。`,
  secureActions: "敏感操作",
  secureActionsHint: "只有明确打开后才显示。",
  showSecureActions: "显示停用和重置密码操作",
  hideSecureActions: "隐藏敏感操作",
  multipleOffices: "多办公室员工 — 请根管理员复核",
  roleGroups: {
    administration: "管理",
    operations: "始发地和仓库运营",
    finance: "会计和现金",
    oversight: "监督和查看",
  },
};

const tr: OfficeMembershipCopy = {
  search: "Çalışan ara",
  searchPlaceholder: "Ad veya e-postaya göre ara",
  filterOffice: "Ofise göre filtrele",
  filterRole: "Role göre filtrele",
  allOffices: "Tüm ofisler",
  allRoles: "Tüm roller",
  noMatches: "Arama veya filtrelerle eşleşen çalışan yok.",
  openMember: "Çalışan ayrıntılarını aç",
  closeMember: "Çalışan ayrıntılarını kapat",
  setupSteps: ["1. Rol", "2. Ofis", "3. İzinleri incele", "4. Kaydet"],
  reviewTitle: "Kaydetmeden önce incele",
  savedPermissions: "Kaydedilmiş özelleştirme",
  defaultPermissions: "Önerilen rol şablonu",
  effectivePermissions: "Tavan ve ofis koruması sonrası etkin değer",
  storedPermissionHint:
    "Bu üyenin kaydedilmiş haritasıdır; ekranı açmak varsayılanlarla değiştirmez.",
  effectivePermissionHint:
    "Bu salt okunur etkin önizlemedir; yeni yetki vermez ve kaydedilmiş haritayı değiştirmez.",
  retainedPreview:
    "Rol veya ofis değişince önizleme kaydedilmiş retleri korur.",
  permissionsAboveCeiling: permissions =>
    `Şu izinler tavanınızı aşıyor: ${permissions}. Buradan kaydedilemez; atamayı ayarlaması için genel yöneticiden yardım isteyin.`,
  secureActions: "Hassas işlemler",
  secureActionsHint: "Açıkça açılana kadar kapalıdır.",
  showSecureActions:
    "Devre dışı bırakma ve parola sıfırlama işlemlerini göster",
  hideSecureActions: "Hassas işlemleri gizle",
  multipleOffices: "Birden çok ofis üyesi — kök yöneticiden inceleme isteyin",
  roleGroups: {
    administration: "Yönetim",
    operations: "Kaynak ve depo operasyonları",
    finance: "Muhasebe ve kasa",
    oversight: "Gözetim ve görüntüleme",
  },
};

export const officeMembershipCopy: Record<
  OfficeMembershipCopyLanguage,
  OfficeMembershipCopy
> = { ar, en, zh, tr };

export function officeMembershipCopyFor(
  language: string
): OfficeMembershipCopy {
  return officeMembershipCopy[
    (officeMembershipCopyLanguages as readonly string[]).includes(language)
      ? (language as OfficeMembershipCopyLanguage)
      : "ar"
  ];
}
