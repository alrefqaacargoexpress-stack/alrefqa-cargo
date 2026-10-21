import type { OfficeId } from "@shared/branches";

export const branchSettingsLanguages = ["ar", "en", "zh", "tr"] as const;
export type BranchSettingsLanguage = (typeof branchSettingsLanguages)[number];

export type BranchSettingsCopy = {
  title: string;
  description: string;
  office: string;
  chooseOffice: string;
  profile: string;
  profileHint: string;
  publicNotice: string;
  publicContactsNotice: string;
  address: string;
  phone: string;
  timezone: string;
  gps: string;
  gpsHint: string;
  mapLink: string;
  latitude: string;
  longitude: string;
  manualGpsOnly: string;
  workHours: string;
  workHoursHint: string;
  setSchedule: string;
  closed: string;
  open: string;
  start: string;
  end: string;
  break: string;
  noSchedule: string;
  employees: string;
  employeeName: string;
  employeePhone: string;
  addContact: string;
  deleteContact: string;
  contactPayload: string;
  contactRequired: string;
  phoneInvalid: string;
  gpsInvalid: string;
  hoursInvalid: string;
  saveProfile: string;
  saving: string;
  saved: string;
  saveConfirm: string;
  readOnly: string;
  adminOnly: string;
  onlineRequired: string;
  loading: string;
  loadError: string;
  retry: string;
  dirty: string;
  reloadConfirm: string;
  conflict: string;
  conflictDetail: string;
  reload: string;
  noProfile: string;
  memberships: string;
  membershipsHint: string;
  member: string;
  email: string;
  role: string;
  offices: string;
  saveMember: string;
  memberSaved: string;
  memberLoadError: string;
  memberSaveError: string;
  globalLegacy: string;
  employeeLoginRequired: string;
  contactNoAccess: string;
  rootAdminLocked: string;
  noMemberAccess: string;
  noOfficeAccess: string;
  publicProfile: string;
  paymentMethods: string;
  paymentMethodsNouakchottOnly: string;
  paymentMethodsReadOnly: string;
  paymentMethodsAdminOnly: string;
  enabled: string;
  disabled: string;
  methodId: string;
  methodLabel: string;
  addMethod: string;
  removeMethod: string;
  paymentInvalid: string;
  paymentSaved: string;
  paymentConflict: string;
  paymentReload: string;
  paymentSaveConfirm: string;
  noPaymentSettings: string;
  currentVersion: string;
  confirm: string;
  cancel: string;
  unknownError: string;
};

const ar: BranchSettingsCopy = {
  title: "إعدادات المكاتب",
  description: "الملف العام والدوام وأعضاء كل مكتب",
  office: "المكتب",
  chooseOffice: "اختر المكتب",
  profile: "الملف العام للمكتب",
  profileHint: "هذه البيانات عامة بعد الحفظ ولا تشمل بيانات الدخول أو الحساب.",
  publicNotice:
    "سيظهر العنوان والدوام والموقع وأسماء وأرقام الموظفين للعامة بعد الحفظ",
  publicContactsNotice:
    "جهات الاتصال هذه عامة فقط ولا تمنح الموظف صلاحية دخول.",
  address: "العنوان العام",
  phone: "هاتف المكتب العام",
  timezone: "المنطقة الزمنية",
  gps: "الموقع الجغرافي",
  gpsHint:
    "ألصق رابط موقع المكتب من خرائط Google أو أي خريطة أخرى يدويًا فقط. لن نطلب إذن موقع الجهاز.",
  mapLink: "رابط الموقع على الخريطة",
  latitude: "خط العرض",
  longitude: "خط الطول",
  manualGpsOnly: "إدخال يدوي، اختياري",
  workHours: "ساعات العمل",
  workHoursHint: "لا نضع ساعات افتراضية. اترك اليوم غير محدد حتى تعرف جدوله.",
  setSchedule: "تحديد جدول العمل",
  closed: "مغلق",
  open: "مفتوح",
  start: "البداية",
  end: "النهاية",
  break: "الاستراحة",
  noSchedule: "لم يُحدد جدول هذا اليوم",
  employees: "موظفو المكتب الظاهرون للعامة",
  employeeName: "اسم الموظف",
  employeePhone: "رقم الموظف",
  addContact: "إضافة موظف عام",
  deleteContact: "حذف جهة الاتصال",
  contactPayload: "سيُنشر الاسم والرقم التاليان للعامة:",
  contactRequired: "أدخل اسم الموظف ورقمه قبل الإضافة.",
  phoneInvalid: "أدخل رقمًا صالحًا من 5 إلى 40 رمزًا.",
  gpsInvalid: "أدخل رابط خريطة HTTPS صالحًا أو اتركه فارغًا.",
  hoursInvalid: "تحقق من ترتيب الساعات وأن تكون الاستراحة داخل ساعات العمل.",
  saveProfile: "حفظ الملف العام",
  saving: "جارٍ الحفظ…",
  saved: "تم حفظ الملف العام",
  saveConfirm:
    "سيُنشر هذا الملف العام وجهات الاتصال التالية. هل تريد المتابعة؟",
  readOnly: "وضع القراءة فقط",
  adminOnly: "تعديل ملف المكتب متاح للمدير فقط.",
  onlineRequired:
    "لا يمكن حفظ إعدادات المكتب دون اتصال بالإنترنت. لم تُحفظ مسودة محلية.",
  loading: "جارٍ تحميل إعدادات المكاتب…",
  loadError: "تعذر تحميل إعدادات المكاتب.",
  retry: "إعادة المحاولة",
  dirty: "تغييرات غير محفوظة",
  reloadConfirm: "إعادة تحميل نسخة الخادم واستبدال التغييرات غير المحفوظة؟",
  conflict: "تعارض في النسخة",
  conflictDetail:
    "تغير الملف على الخادم. أعد التحميل وراجع تغييراتك قبل الحفظ.",
  reload: "إعادة تحميل",
  noProfile: "لا يوجد ملف لهذا المكتب.",
  memberships: "صلاحيات الموظفين",
  membershipsHint: "العضوية تمنح صلاحية التطبيق فقط؛ لا تعني نشر رقم الموظف.",
  member: "الموظف",
  email: "البريد الإلكتروني",
  role: "الدور",
  offices: "المكاتب المسموح بها",
  saveMember: "حفظ الصلاحية",
  memberSaved: "تم حفظ صلاحية الموظف",
  memberLoadError: "تعذر تحميل أعضاء الفريق.",
  memberSaveError: "تعذر حفظ صلاحية الموظف.",
  globalLegacy: "صلاحية عامة قديمة لم تُقسم بعد؛ سيغير الحفظ نطاقها صراحة.",
  employeeLoginRequired: "سجل دخول الموظف أولاً، ثم اربطه بالمكتب",
  contactNoAccess: "جهة الاتصال العامة لا تمنح صلاحية دخول.",
  rootAdminLocked: "لا يمكن تعديل المدير الجذري أو ترقيته من هذه الشاشة.",
  noMemberAccess: "إدارة العضويات متاحة للمدير فقط.",
  noOfficeAccess: "لا توجد صلاحية قراءة لهذا المكتب.",
  publicProfile: "معلومات الملف العام",
  paymentMethods: "طرق الدفع اليدوية",
  paymentMethodsNouakchottOnly: "تظهر طرق الدفع القديمة لمكتب نواكشوط فقط.",
  paymentMethodsReadOnly: "هذه الطرق للقراءة فقط لهذا الدور.",
  paymentMethodsAdminOnly:
    "تعديل طرق الدفع متاح للمدير المالي أو المدير وفق واجهة الدفع القديمة.",
  enabled: "مفعّلة",
  disabled: "معطّلة",
  methodId: "المعرّف",
  methodLabel: "الاسم الظاهر",
  addMethod: "إضافة طريقة",
  removeMethod: "إزالة",
  paymentInvalid: "تحقق من طرق الدفع قبل الحفظ.",
  paymentSaved: "تم حفظ طرق الدفع",
  paymentConflict: "تغيرت طرق الدفع على الخادم؛ أعد التحميل.",
  paymentReload: "إعادة تحميل طرق الدفع",
  paymentSaveConfirm: "هل تريد حفظ طرق الدفع هذه؟",
  noPaymentSettings: "لا توجد طرق دفع محفوظة.",
  currentVersion: "النسخة الحالية",
  confirm: "تأكيد",
  cancel: "إلغاء",
  unknownError: "حدث خطأ غير متوقع.",
};

const en: BranchSettingsCopy = {
  title: "Office settings",
  description: "Public profile, hours, and memberships for every office",
  office: "Office",
  chooseOffice: "Choose office",
  profile: "Public office profile",
  profileHint:
    "This data is public after saving and excludes login or account data.",
  publicNotice:
    "The address, hours, location, and employee names and phone numbers will be public after saving",
  publicContactsNotice:
    "These contacts are public only and do not grant the employee login access.",
  address: "Public address",
  phone: "Public office phone",
  timezone: "Time zone",
  gps: "GPS location",
  gpsHint:
    "Paste the office map link manually. We never request device location permission.",
  mapLink: "Map location link",
  latitude: "Latitude",
  longitude: "Longitude",
  manualGpsOnly: "Manual entry, optional",
  workHours: "Work hours",
  workHoursHint:
    "No fake default hours are added. Leave a day unset until its schedule is known.",
  setSchedule: "Set work schedule",
  closed: "Closed",
  open: "Open",
  start: "Start",
  end: "End",
  break: "Break",
  noSchedule: "This day has no schedule yet",
  employees: "Public office employees",
  employeeName: "Employee name",
  employeePhone: "Employee phone",
  addContact: "Add public employee",
  deleteContact: "Delete contact",
  contactPayload: "The following name and phone will be public:",
  contactRequired: "Enter an employee name and phone before adding.",
  phoneInvalid: "Enter a valid phone number with 5–40 characters.",
  gpsInvalid: "Enter a valid HTTPS map link, or leave it empty.",
  hoursInvalid: "Check time order and keep the break inside work hours.",
  saveProfile: "Save public profile",
  saving: "Saving…",
  saved: "Public profile saved",
  saveConfirm:
    "This public profile and the following contacts will be published. Continue?",
  readOnly: "Read-only mode",
  adminOnly: "Only an administrator can edit the office profile.",
  onlineRequired:
    "Office settings cannot be saved offline. No local draft was stored.",
  loading: "Loading office settings…",
  loadError: "Could not load office settings.",
  retry: "Retry",
  dirty: "Unsaved changes",
  reloadConfirm: "Reload the server version and replace unsaved changes?",
  conflict: "Version conflict",
  conflictDetail:
    "The profile changed on the server. Reload and review your changes before saving.",
  reload: "Reload",
  noProfile: "No profile exists for this office.",
  memberships: "Employee access",
  membershipsHint:
    "Membership grants app access only; it does not publish an employee phone number.",
  member: "Employee",
  email: "Email",
  role: "Role",
  offices: "Allowed offices",
  saveMember: "Save access",
  memberSaved: "Employee access saved",
  memberLoadError: "Could not load team members.",
  memberSaveError: "Could not save employee access.",
  globalLegacy:
    "Legacy global access has not been split; saving will explicitly change its scope.",
  employeeLoginRequired:
    "The employee must sign in first, then link them to the office",
  contactNoAccess: "A public contact does not grant login access.",
  rootAdminLocked: "The root administrator cannot be changed or promoted here.",
  noMemberAccess: "Membership management is available to administrators only.",
  noOfficeAccess: "You do not have read access to this office.",
  publicProfile: "Public profile information",
  paymentMethods: "Manual payment methods",
  paymentMethodsNouakchottOnly:
    "The legacy payment section is shown for Nouakchott only.",
  paymentMethodsReadOnly: "These methods are read-only for this role.",
  paymentMethodsAdminOnly:
    "Payment editing follows the existing administrator/finance payment API.",
  enabled: "Enabled",
  disabled: "Disabled",
  methodId: "Identifier",
  methodLabel: "Display label",
  addMethod: "Add method",
  removeMethod: "Remove",
  paymentInvalid: "Review payment methods before saving.",
  paymentSaved: "Payment methods saved",
  paymentConflict: "Payment methods changed on the server; reload them.",
  paymentReload: "Reload payment methods",
  paymentSaveConfirm: "Save these payment methods?",
  noPaymentSettings: "No saved payment methods.",
  currentVersion: "Current version",
  confirm: "Confirm",
  cancel: "Cancel",
  unknownError: "An unexpected error occurred.",
};

const zh: BranchSettingsCopy = {
  title: "办公室设置",
  description: "所有办公室的公开资料、时间和成员权限",
  office: "办公室",
  chooseOffice: "选择办公室",
  profile: "办公室公开资料",
  profileHint: "保存后这些资料公开，但不包括登录或账户数据。",
  publicNotice: "保存后，地址、工作时间、位置以及员工姓名和电话号码将公开",
  publicContactsNotice: "这些联系人仅用于公开展示，不会授予员工登录权限。",
  address: "公开地址",
  phone: "办公室公开电话",
  timezone: "时区",
  gps: "GPS 位置",
  gpsHint: "请仅手动粘贴办公室地图链接；我们不会请求设备定位权限。",
  mapLink: "地图位置链接",
  latitude: "纬度",
  longitude: "经度",
  manualGpsOnly: "手动输入，可选",
  workHours: "工作时间",
  workHoursHint: "不会添加虚假的默认时间。未知日期请保持未设置。",
  setSchedule: "设置工作时间",
  closed: "关闭",
  open: "营业",
  start: "开始",
  end: "结束",
  break: "休息",
  noSchedule: "此日期尚未设置时间",
  employees: "公开办公室员工",
  employeeName: "员工姓名",
  employeePhone: "员工电话",
  addContact: "添加公开员工",
  deleteContact: "删除联系人",
  contactPayload: "以下姓名和电话将公开：",
  contactRequired: "添加前请输入员工姓名和电话。",
  phoneInvalid: "请输入 5–40 个字符的有效电话号码。",
  gpsInvalid: "请输入有效的 HTTPS 地图链接，或留空。",
  hoursInvalid: "请检查时间顺序，并确保休息时间在工作时间内。",
  saveProfile: "保存公开资料",
  saving: "正在保存…",
  saved: "公开资料已保存",
  saveConfirm: "该公开资料和以下联系人将被发布。继续吗？",
  readOnly: "只读模式",
  adminOnly: "只有管理员可以编辑办公室资料。",
  onlineRequired: "办公室设置不能离线保存。没有保存本地草稿。",
  loading: "正在加载办公室设置…",
  loadError: "无法加载办公室设置。",
  retry: "重试",
  dirty: "有未保存的更改",
  reloadConfirm: "重新加载服务器版本并替换未保存的更改吗？",
  conflict: "版本冲突",
  conflictDetail: "服务器上的资料已改变。请重新加载并检查更改后再保存。",
  reload: "重新加载",
  noProfile: "此办公室没有资料。",
  memberships: "员工访问权限",
  membershipsHint: "成员资格仅授予应用访问权，不会公开员工电话号码。",
  member: "员工",
  email: "电子邮件",
  role: "角色",
  offices: "允许的办公室",
  saveMember: "保存权限",
  memberSaved: "员工权限已保存",
  memberLoadError: "无法加载团队成员。",
  memberSaveError: "无法保存员工权限。",
  globalLegacy: "旧的全局权限尚未拆分；保存将明确更改其范围。",
  employeeLoginRequired: "员工必须先登录，然后才能关联办公室",
  contactNoAccess: "公开联系人不会授予登录权限。",
  rootAdminLocked: "根管理员不能在此更改或提升。",
  noMemberAccess: "只有管理员可以管理成员权限。",
  noOfficeAccess: "您没有读取此办公室的权限。",
  publicProfile: "公开资料信息",
  paymentMethods: "手工付款方式",
  paymentMethodsNouakchottOnly: "旧付款部分仅显示努瓦克肖特。",
  paymentMethodsReadOnly: "此角色只能读取这些方式。",
  paymentMethodsAdminOnly: "付款编辑继续使用现有管理员/财务付款 API。",
  enabled: "已启用",
  disabled: "已停用",
  methodId: "标识符",
  methodLabel: "显示名称",
  addMethod: "添加方式",
  removeMethod: "移除",
  paymentInvalid: "保存前请检查付款方式。",
  paymentSaved: "付款方式已保存",
  paymentConflict: "服务器上的付款方式已改变，请重新加载。",
  paymentReload: "重新加载付款方式",
  paymentSaveConfirm: "保存这些付款方式吗？",
  noPaymentSettings: "没有已保存的付款方式。",
  currentVersion: "当前版本",
  confirm: "确认",
  cancel: "取消",
  unknownError: "发生意外错误。",
};

const tr: BranchSettingsCopy = {
  title: "Ofis ayarları",
  description:
    "Her ofis için herkese açık profil, çalışma saatleri ve üyelikler",
  office: "Ofis",
  chooseOffice: "Ofis seçin",
  profile: "Herkese açık ofis profili",
  profileHint:
    "Bu bilgiler kaydedildikten sonra herkese açıktır; giriş ve hesap bilgileri dahil değildir.",
  publicNotice:
    "Adres, çalışma saatleri, konum ve çalışan adları ile telefonları kaydedildikten sonra herkese açık olur",
  publicContactsNotice:
    "Bu kişiler yalnızca herkese açıktır ve çalışana giriş yetkisi vermez.",
  address: "Herkese açık adres",
  phone: "Herkese açık ofis telefonu",
  timezone: "Saat dilimi",
  gps: "GPS konumu",
  gpsHint:
    "Koordinatları elle girin; tarayıcı konum izni istemeyiz ve koordinat tahmin etmeyiz.",
  mapLink: "Harita konum bağlantısı",
  latitude: "Enlem",
  longitude: "Boylam",
  manualGpsOnly: "Elle giriş, isteğe bağlı",
  workHours: "Çalışma saatleri",
  workHoursHint:
    "Sahte varsayılan saat eklenmez. Saat bilinmiyorsa günü ayarlanmamış bırakın.",
  setSchedule: "Çalışma programını belirle",
  closed: "Kapalı",
  open: "Açık",
  start: "Başlangıç",
  end: "Bitiş",
  break: "Mola",
  noSchedule: "Bu gün için program henüz yok",
  employees: "Herkese açık ofis çalışanları",
  employeeName: "Çalışan adı",
  employeePhone: "Çalışan telefonu",
  addContact: "Herkese açık çalışan ekle",
  deleteContact: "Kişiyi sil",
  contactPayload: "Aşağıdaki ad ve telefon herkese açık olacaktır:",
  contactRequired: "Eklemek için çalışan adı ve telefonu girin.",
  phoneInvalid: "5–40 karakterlik geçerli bir telefon girin.",
  gpsInvalid:
    "İki geçerli enlem-boylam değeri girin veya ikisini de boş bırakın.",
  hoursInvalid:
    "Saat sırasını kontrol edin ve molayı çalışma saatleri içinde tutun.",
  saveProfile: "Herkese açık profili kaydet",
  saving: "Kaydediliyor…",
  saved: "Herkese açık profil kaydedildi",
  saveConfirm:
    "Bu herkese açık profil ve aşağıdaki kişiler yayınlanacak. Devam edilsin mi?",
  readOnly: "Salt okunur mod",
  adminOnly: "Ofis profilini yalnızca yönetici düzenleyebilir.",
  onlineRequired:
    "Ofis ayarları çevrimdışı kaydedilemez. Yerel taslak saklanmadı.",
  loading: "Ofis ayarları yükleniyor…",
  loadError: "Ofis ayarları yüklenemedi.",
  retry: "Tekrar dene",
  dirty: "Kaydedilmemiş değişiklikler",
  reloadConfirm:
    "Sunucu sürümü yeniden yüklenip kaydedilmemiş değişiklikler değiştirilsin mi?",
  conflict: "Sürüm çakışması",
  conflictDetail:
    "Profil sunucuda değişti. Yeniden yükleyip değişikliklerinizi inceleyin.",
  reload: "Yeniden yükle",
  noProfile: "Bu ofis için profil yok.",
  memberships: "Çalışan erişimi",
  membershipsHint:
    "Üyelik yalnızca uygulama erişimi verir; çalışan telefonunu yayınlamaz.",
  member: "Çalışan",
  email: "E-posta",
  role: "Rol",
  offices: "İzinli ofisler",
  saveMember: "Erişimi kaydet",
  memberSaved: "Çalışan erişimi kaydedildi",
  memberLoadError: "Ekip üyeleri yüklenemedi.",
  memberSaveError: "Çalışan erişimi kaydedilemedi.",
  globalLegacy:
    "Eski genel erişim bölünmedi; kaydetmek kapsamı açıkça değiştirir.",
  employeeLoginRequired:
    "Çalışan önce giriş yapmalı, sonra ofise bağlanmalıdır",
  contactNoAccess: "Herkese açık kişi girişi yetkisi vermez.",
  rootAdminLocked: "Kök yönetici burada değiştirilemez veya yükseltilemez.",
  noMemberAccess: "Üyelik yönetimi yalnızca yöneticilere açıktır.",
  noOfficeAccess: "Bu ofisi okuma yetkiniz yok.",
  publicProfile: "Herkese açık profil bilgileri",
  paymentMethods: "Manuel ödeme yöntemleri",
  paymentMethodsNouakchottOnly:
    "Eski ödeme bölümü yalnızca Nuakşot için gösterilir.",
  paymentMethodsReadOnly: "Bu rol için yöntemler salt okunurdur.",
  paymentMethodsAdminOnly:
    "Ödeme düzenleme mevcut yönetici/finans ödeme API'sini kullanır.",
  enabled: "Etkin",
  disabled: "Devre dışı",
  methodId: "Tanımlayıcı",
  methodLabel: "Görünen ad",
  addMethod: "Yöntem ekle",
  removeMethod: "Kaldır",
  paymentInvalid: "Kaydetmeden önce ödeme yöntemlerini kontrol edin.",
  paymentSaved: "Ödeme yöntemleri kaydedildi",
  paymentConflict: "Ödeme yöntemleri sunucuda değişti; yeniden yükleyin.",
  paymentReload: "Ödeme yöntemlerini yeniden yükle",
  paymentSaveConfirm: "Bu ödeme yöntemleri kaydedilsin mi?",
  noPaymentSettings: "Kayıtlı ödeme yöntemi yok.",
  currentVersion: "Geçerli sürüm",
  confirm: "Onayla",
  cancel: "İptal",
  unknownError: "Beklenmeyen bir hata oluştu.",
};

export const branchSettingsCopy: Record<
  BranchSettingsLanguage,
  BranchSettingsCopy
> = { ar, en, zh, tr };
export const officeIds: readonly OfficeId[] = [
  "nouakchott",
  "dubai",
  "china",
  "turkey",
];

export function branchSettingsCopyFor(language: string): BranchSettingsCopy {
  return branchSettingsCopy[
    (branchSettingsLanguages as readonly string[]).includes(language)
      ? (language as BranchSettingsLanguage)
      : "ar"
  ];
}

export function officeName(language: string, officeId: OfficeId): string {
  const names: Record<BranchSettingsLanguage, Record<OfficeId, string>> = {
    ar: {
      nouakchott: "نواكشوط",
      dubai: "دبي",
      china: "الصين",
      turkey: "تركيا",
    },
    en: {
      nouakchott: "Nouakchott",
      dubai: "Dubai",
      china: "China",
      turkey: "Turkey",
    },
    zh: {
      nouakchott: "努瓦克肖特",
      dubai: "迪拜",
      china: "中国",
      turkey: "土耳其",
    },
    tr: {
      nouakchott: "Nuakşot",
      dubai: "Dubai",
      china: "Çin",
      turkey: "Türkiye",
    },
  };
  return names[
    (branchSettingsLanguages as readonly string[]).includes(language)
      ? (language as BranchSettingsLanguage)
      : "ar"
  ][officeId];
}
