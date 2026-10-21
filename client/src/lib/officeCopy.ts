export const OFFICE_LANGUAGES = ["ar", "en", "zh", "tr"] as const;
export type OfficeLanguage = (typeof OFFICE_LANGUAGES)[number];

export type OfficeCopy = {
  title: string;
  description: string;
  office: string;
  nouakchott: string;
  paymentMethods: string;
  paymentMethod: string;
  methodLabel: string;
  methodId: string;
  enabled: string;
  disabled: string;
  addMethod: string;
  removeMethod: string;
  save: string;
  saving: string;
  saved: string;
  readOnly: string;
  adminOnly: string;
  onlineRequired: string;
  connectionRequired: string;
  loading: string;
  loadError: string;
  retry: string;
  noSettings: string;
  dirty: string;
  saveSummary: string;
  confirmSave: string;
  conflict: string;
  conflictDetail: string;
  reload: string;
  invalidMethods: string;
  duplicateMethod: string;
  invalidId: string;
  invalidLabel: string;
  maxMethods: string;
  required: string;
  noAccess: string;
  tracking: string;
  settings: string;
  none: string;
  optional: string;
  reference: string;
  referenceHint: string;
  methodDisabled: string;
  oldMethod: string;
  paymentHint: string;
  officeCaption: string;
  auditHint: string;
  currentVersion: string;
  keepExisting: string;
};

export const officeCopy: Record<OfficeLanguage, OfficeCopy> = {
  ar: {
    title: "إعدادات المكتب",
    description: "طرق الدفع اليدوية لمكتب نواكشوط",
    office: "المكتب",
    nouakchott: "نواكشوط",
    paymentMethods: "طرق الدفع",
    paymentMethod: "طريقة الدفع",
    methodLabel: "الاسم الظاهر",
    methodId: "المعرّف",
    enabled: "مفعّلة",
    disabled: "معطّلة",
    addMethod: "إضافة طريقة",
    removeMethod: "إزالة",
    save: "حفظ الإعدادات",
    saving: "جارٍ الحفظ…",
    saved: "تم حفظ إعدادات المكتب",
    readOnly: "وضع القراءة فقط",
    adminOnly: "تعديل إعدادات المكتب متاح للمدير فقط.",
    onlineRequired: "تحتاج إعدادات المكتب إلى اتصال بالإنترنت ولا تُحفظ كمسودة محلية.",
    connectionRequired: "الاتصال بالإنترنت مطلوب للحفظ. بقيت التغييرات غير المحفوظة هنا.",
    loading: "جارٍ تحميل إعدادات المكتب…",
    loadError: "تعذر تحميل إعدادات المكتب من الخادم.",
    retry: "إعادة المحاولة",
    noSettings: "لا توجد إعدادات مكتب متاحة.",
    dirty: "تغييرات غير محفوظة",
    saveSummary: "ملخص التحديث",
    confirmSave: "هل تريد حفظ إعدادات طرق الدفع هذه الآن؟",
    conflict: "تعارض في النسخة",
    conflictDetail: "تغيّرت الإعدادات على الخادم. أعد التحميل وراجع تغييراتك قبل الحفظ.",
    reload: "إعادة تحميل",
    invalidMethods: "تحقق من طرق الدفع قبل الحفظ.",
    duplicateMethod: "المعرّف مستخدم أكثر من مرة.",
    invalidId: "المعرّف يجب أن يتكون من a-z و0-9 و _ أو - وبحد أقصى 64 حرفًا.",
    invalidLabel: "اسم طريقة الدفع مطلوب وبحد أقصى 120 حرفًا.",
    maxMethods: "يمكن حفظ 50 طريقة دفع كحد أقصى.",
    required: "هذا الحقل مطلوب.",
    noAccess: "لا تملك صلاحية الوصول إلى إعدادات المكتب.",
    tracking: "التتبع",
    settings: "الإعدادات",
    none: "بدون طريقة دفع",
    optional: "اختياري",
    reference: "مرجع الدفع",
    referenceHint: "مرجع يدوي اختياري، بحد أقصى 240 حرفًا.",
    methodDisabled: "الطريقة معطّلة؛ سيبقى الاختيار القديم ظاهرًا للحفاظ على السجل.",
    oldMethod: "طريقة محفوظة سابقًا",
    paymentHint: "اختيار الطريقة أثناء بقاء الفاتورة معلّقة هو تخطيط لطريقة الدفع، وليس إثباتًا للسداد.",
    officeCaption: "مكتب نواكشوط · تسجيل يدوي فقط، بدون شحن رصيد أو محفظة.",
    auditHint: "تُسجّل تغييرات الإعدادات في سجل التدقيق.",
    currentVersion: "النسخة الحالية",
    keepExisting: "الإبقاء على الطريقة المحفوظة",
  },
  en: {
    title: "Office settings",
    description: "Manual payment methods for the Nouakchott office",
    office: "Office",
    nouakchott: "Nouakchott",
    paymentMethods: "Payment methods",
    paymentMethod: "Payment method",
    methodLabel: "Display label",
    methodId: "Identifier",
    enabled: "Enabled",
    disabled: "Disabled",
    addMethod: "Add method",
    removeMethod: "Remove",
    save: "Save settings",
    saving: "Saving…",
    saved: "Office settings saved",
    readOnly: "Read-only mode",
    adminOnly: "Only an administrator can edit office settings.",
    onlineRequired: "Office settings require an online connection and are never stored as a local draft.",
    connectionRequired: "An internet connection is required to save. Your unsaved changes remain here.",
    loading: "Loading office settings…",
    loadError: "Could not load office settings from the server.",
    retry: "Retry",
    noSettings: "No office settings are available.",
    dirty: "Unsaved changes",
    saveSummary: "Update summary",
    confirmSave: "Save these payment method settings now?",
    conflict: "Version conflict",
    conflictDetail: "The settings changed on the server. Reload and review your changes before saving.",
    reload: "Reload",
    invalidMethods: "Review the payment methods before saving.",
    duplicateMethod: "An identifier is used more than once.",
    invalidId: "Identifier must use a-z, 0-9, _ or - and be at most 64 characters.",
    invalidLabel: "A payment method label is required and may be at most 120 characters.",
    maxMethods: "At most 50 payment methods can be saved.",
    required: "This field is required.",
    noAccess: "You do not have access to office settings.",
    tracking: "Tracking",
    settings: "Settings",
    none: "No payment method",
    optional: "Optional",
    reference: "Payment reference",
    referenceHint: "Optional manual reference, up to 240 characters.",
    methodDisabled: "This method is disabled; the old selection remains visible to preserve history.",
    oldMethod: "Previously saved method",
    paymentHint: "Selecting a method while an invoice is pending is a planned method, not proof of payment.",
    officeCaption: "Nouakchott office · manual recording only, with no wallet or balance charging.",
    auditHint: "Settings changes are recorded in the audit log.",
    currentVersion: "Current version",
    keepExisting: "Keep saved method",
  },
  zh: {
    title: "办公室设置",
    description: "努瓦克肖特办公室的手工付款方式",
    office: "办公室",
    nouakchott: "努瓦克肖特",
    paymentMethods: "付款方式",
    paymentMethod: "付款方式",
    methodLabel: "显示名称",
    methodId: "标识符",
    enabled: "已启用",
    disabled: "已停用",
    addMethod: "添加方式",
    removeMethod: "移除",
    save: "保存设置",
    saving: "正在保存…",
    saved: "办公室设置已保存",
    readOnly: "只读模式",
    adminOnly: "只有管理员可以编辑办公室设置。",
    onlineRequired: "办公室设置需要在线连接，不会保存为本地草稿。",
    connectionRequired: "保存需要互联网连接。未保存的更改仍保留在此页面。",
    loading: "正在加载办公室设置…",
    loadError: "无法从服务器加载办公室设置。",
    retry: "重试",
    noSettings: "没有可用的办公室设置。",
    dirty: "有未保存的更改",
    saveSummary: "更新摘要",
    confirmSave: "现在保存这些付款方式设置吗？",
    conflict: "版本冲突",
    conflictDetail: "服务器上的设置已发生变化。请重新加载并检查更改后再保存。",
    reload: "重新加载",
    invalidMethods: "保存前请检查付款方式。",
    duplicateMethod: "同一个标识符被使用了多次。",
    invalidId: "标识符只能包含 a-z、0-9、_ 或 -，最多 64 个字符。",
    invalidLabel: "付款方式名称不能为空且最多 120 个字符。",
    maxMethods: "最多可以保存 50 种付款方式。",
    required: "此字段为必填项。",
    noAccess: "你无权访问办公室设置。",
    tracking: "追踪",
    settings: "设置",
    none: "不选择付款方式",
    optional: "可选",
    reference: "付款参考号",
    referenceHint: "可选手工参考号，最多 240 个字符。",
    methodDisabled: "该方式已停用；为保留历史记录，旧选择仍会显示。",
    oldMethod: "之前保存的方式",
    paymentHint: "待付款发票选择方式只是计划方式，不是付款凭证。",
    officeCaption: "努瓦克肖特办公室 · 仅手工记录，不充值、不扣钱包余额。",
    auditHint: "设置更改会记录在审计日志中。",
    currentVersion: "当前版本",
    keepExisting: "保留已保存方式",
  },
  tr: {
    title: "Ofis ayarları",
    description: "Nouakchott ofisi için manuel ödeme yöntemleri",
    office: "Ofis",
    nouakchott: "Nouakchott",
    paymentMethods: "Ödeme yöntemleri",
    paymentMethod: "Ödeme yöntemi",
    methodLabel: "Görünen ad",
    methodId: "Tanımlayıcı",
    enabled: "Etkin",
    disabled: "Devre dışı",
    addMethod: "Yöntem ekle",
    removeMethod: "Kaldır",
    save: "Ayarları kaydet",
    saving: "Kaydediliyor…",
    saved: "Ofis ayarları kaydedildi",
    readOnly: "Salt okunur mod",
    adminOnly: "Ofis ayarlarını yalnızca yönetici düzenleyebilir.",
    onlineRequired: "Ofis ayarları çevrimiçi bağlantı gerektirir ve yerel taslak olarak saklanmaz.",
    connectionRequired: "Kaydetmek için internet bağlantısı gerekir. Kaydedilmemiş değişiklikler burada tutulur.",
    loading: "Ofis ayarları yükleniyor…",
    loadError: "Ofis ayarları sunucudan yüklenemedi.",
    retry: "Tekrar dene",
    noSettings: "Kullanılabilir ofis ayarı yok.",
    dirty: "Kaydedilmemiş değişiklikler",
    saveSummary: "Güncelleme özeti",
    confirmSave: "Bu ödeme yöntemi ayarları şimdi kaydedilsin mi?",
    conflict: "Sürüm çakışması",
    conflictDetail: "Ayarlar sunucuda değişti. Kaydetmeden önce yeniden yükleyip değişikliklerinizi inceleyin.",
    reload: "Yeniden yükle",
    invalidMethods: "Kaydetmeden önce ödeme yöntemlerini kontrol edin.",
    duplicateMethod: "Bir tanımlayıcı birden fazla kullanılmış.",
    invalidId: "Tanımlayıcı a-z, 0-9, _ veya - kullanmalı ve 64 karakteri geçmemelidir.",
    invalidLabel: "Ödeme yöntemi adı zorunludur ve en fazla 120 karakter olabilir.",
    maxMethods: "En fazla 50 ödeme yöntemi kaydedilebilir.",
    required: "Bu alan zorunludur.",
    noAccess: "Ofis ayarlarına erişiminiz yok.",
    tracking: "Takip",
    settings: "Ayarlar",
    none: "Ödeme yöntemi yok",
    optional: "İsteğe bağlı",
    reference: "Ödeme referansı",
    referenceHint: "İsteğe bağlı manuel referans, en fazla 240 karakter.",
    methodDisabled: "Bu yöntem devre dışı; geçmişi korumak için eski seçim görünür kalır.",
    oldMethod: "Önceden kaydedilen yöntem",
    paymentHint: "Bekleyen faturada yöntem seçmek planlanan yöntemi belirtir, ödeme kanıtı değildir.",
    officeCaption: "Nouakchott ofisi · yalnızca manuel kayıt; cüzdan veya bakiye tahsilatı yoktur.",
    auditHint: "Ayar değişiklikleri denetim günlüğüne kaydedilir.",
    currentVersion: "Geçerli sürüm",
    keepExisting: "Kayıtlı yöntemi koru",
  },
};

export function officeCopyFor(language: string): OfficeCopy {
  return officeCopy[(language as OfficeLanguage) in officeCopy ? (language as OfficeLanguage) : "ar"];
}
