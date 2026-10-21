import type { Language } from "@/lib/publicCopy";

export type WalletCopy = {
  title: string;
  description: string;
  loading: string;
  loadError: string;
  retry: string;
  readOnly: string;
  enabled: string;
  disabled: string;
  accountNumber: string;
  accountName: string;
  instructions: string;
  showToCustomers: string;
  confirmVisibility: string;
  visibleHint: string;
  hiddenHint: string;
  methodId: string;
  methodLabel: string;
  addMethod: string;
  removeMethod: string;
  newMethod: string;
  reloadConfirm: string;
  save: string;
  saving: string;
  saved: string;
  invalid: string;
  serverError: string;
  offline: string;
  conflict: string;
  noMethods: string;
  manualOnly: string;
  copy: string;
  copied: string;
  copyFailed: string;
  beneficiary: string;
  customerNote: string;
  names: Record<string, string>;
};

const ar: WalletCopy = {
  title: "طرق التحصيل اليدوي في نواكشوط",
  description:
    "أدخل أرقام المحافظ واسم المستفيد والتعليمات، ثم اختر صراحة ما سيظهر للعملاء.",
  loading: "جارٍ تحميل إعدادات التحصيل…",
  loadError: "تعذر تحميل إعدادات التحصيل.",
  retry: "إعادة المحاولة",
  readOnly: "للقراءة فقط",
  enabled: "مفعّلة",
  disabled: "معطّلة",
  accountNumber: "رقم المحفظة / الهاتف",
  accountName: "اسم المستفيد (اختياري، موصى به)",
  instructions: "تعليمات التحويل اليدوي",
  showToCustomers: "إظهار للعملاء",
  confirmVisibility: "سيصبح رقم المحفظة وتعليماتها علنية. هل تريد المتابعة؟",
  visibleHint: "سيظهر بعد الحفظ إذا كانت الطريقة مفعّلة ورقمها صالحًا.",
  hiddenHint: "لن يظهر للعملاء حتى لو كانت الطريقة مفعّلة.",
  methodId: "المعرّف",
  methodLabel: "اسم الطريقة",
  addMethod: "إضافة طريقة",
  removeMethod: "حذف الطريقة الجديدة",
  newMethod: "طريقة جديدة",
  reloadConfirm: "لديك مسودة غير محفوظة. استبدالها بنسخة الخادم؟",
  save: "حفظ طرق التحصيل",
  saving: "جارٍ الحفظ…",
  saved: "أقرّ الخادم حفظ طرق التحصيل.",
  invalid: "تحقق من رقم المحفظة والحقول قبل الحفظ.",
  serverError: "تعذر حفظ إعدادات التحصيل بسبب خطأ في الخادم أو الاتصال.",
  offline: "يلزم اتصال مباشر لحفظ إعدادات المكتب؛ لم يُحفظ مسودة محلية.",
  conflict: "تغيرت إعدادات التحصيل على الخادم. أعد التحميل ثم راجع مسودتك.",
  noMethods: "لا توجد طرق محفوظة.",
  manualOnly: "التحويل يدوي فقط؛ لا تشارك PIN أو كلمة المرور أو OTP.",
  copy: "نسخ الرقم",
  copied: "تم النسخ",
  copyFailed: "تعذر النسخ؛ انسخ الرقم يدويًا.",
  beneficiary: "المستفيد",
  customerNote: "هذه بيانات للتحويل اليدوي وليست تنفيذًا أو تأكيدًا للدفع.",
  names: {
    bankily: "بنكيلي",
    masrvi: "مصرفي",
    gazapay: "غزة باي",
    sedad: "السداد",
    cash: "نقدي",
  },
};
const en: WalletCopy = {
  title: "Nouakchott manual collection methods",
  description:
    "Enter wallet numbers, beneficiary names, and instructions, then explicitly choose what customers can see.",
  loading: "Loading collection settings…",
  loadError: "Collection settings could not be loaded.",
  retry: "Retry",
  readOnly: "Read only",
  enabled: "Enabled",
  disabled: "Disabled",
  accountNumber: "Wallet / phone number",
  accountName: "Beneficiary name (optional, recommended)",
  instructions: "Manual transfer instructions",
  showToCustomers: "Show to customers",
  confirmVisibility:
    "The wallet number and instructions will become public. Continue?",
  visibleHint:
    "It will be public after saving when enabled with a valid number.",
  hiddenHint: "It stays private even when the method is enabled.",
  methodId: "Identifier",
  methodLabel: "Method name",
  addMethod: "Add method",
  removeMethod: "Remove new method",
  newMethod: "New method",
  reloadConfirm:
    "You have unsaved changes. Replace them with the server version?",
  save: "Save collection methods",
  saving: "Saving…",
  saved: "The server acknowledged the collection methods save.",
  invalid: "Check the wallet number and fields before saving.",
  serverError:
    "Collection settings could not be saved because of a server or connection error.",
  offline:
    "A live connection is required to save office settings; no local draft was saved.",
  conflict:
    "Collection settings changed on the server. Reload and review your draft.",
  noMethods: "No saved methods.",
  manualOnly: "Manual transfer only; never share a PIN, password, or OTP.",
  copy: "Copy number",
  copied: "Copied",
  copyFailed: "Copy failed; copy the number manually.",
  beneficiary: "Beneficiary",
  customerNote:
    "These details are for a manual transfer, not payment execution or confirmation.",
  names: {
    bankily: "Bankily",
    masrvi: "Masrvi",
    gazapay: "Gazapay",
    sedad: "Sedad",
    cash: "Cash",
  },
};
const zh: WalletCopy = {
  title: "努瓦克肖特手工收款方式",
  description: "填写钱包号码、收款人姓名和说明，并明确选择客户可见的内容。",
  loading: "正在加载收款设置…",
  loadError: "无法加载收款设置。",
  retry: "重试",
  readOnly: "只读",
  enabled: "已启用",
  disabled: "已停用",
  accountNumber: "钱包 / 手机号码",
  accountName: "收款人姓名（可选，建议填写）",
  instructions: "手工转账说明",
  showToCustomers: "向客户显示",
  confirmVisibility: "钱包号码和说明将公开。要继续吗？",
  visibleHint: "启用且号码有效，保存后才会公开。",
  hiddenHint: "即使启用，也不会向客户显示。",
  methodId: "标识符",
  methodLabel: "方式名称",
  addMethod: "添加方式",
  removeMethod: "删除新方式",
  newMethod: "新方式",
  reloadConfirm: "您有未保存的更改。要用服务器版本替换吗？",
  save: "保存收款方式",
  saving: "正在保存…",
  saved: "服务器已确认收款方式保存成功。",
  invalid: "保存前请检查钱包号码和字段。",
  serverError: "由于服务器或连接错误，无法保存收款设置。",
  offline: "保存办公室设置需要实时连接；未保存本地草稿。",
  conflict: "服务器上的收款设置已改变。请重新加载并检查草稿。",
  noMethods: "没有已保存的方式。",
  manualOnly: "仅限手工转账；不要分享 PIN、密码或 OTP。",
  copy: "复制号码",
  copied: "已复制",
  copyFailed: "复制失败；请手动复制号码。",
  beneficiary: "收款人",
  customerNote: "这些信息仅用于手工转账，不执行或确认付款。",
  names: {
    bankily: "Bankily",
    masrvi: "Masrvi",
    gazapay: "Gazapay",
    sedad: "Sedad",
    cash: "现金",
  },
};
const tr: WalletCopy = {
  title: "Nuakşot manuel tahsilat yöntemleri",
  description:
    "Cüzdan numaralarını, yararlanıcı adlarını ve talimatları girin; müşterilerin göreceklerini açıkça seçin.",
  loading: "Tahsilat ayarları yükleniyor…",
  loadError: "Tahsilat ayarları yüklenemedi.",
  retry: "Tekrar dene",
  readOnly: "Salt okunur",
  enabled: "Etkin",
  disabled: "Devre dışı",
  accountNumber: "Cüzdan / telefon numarası",
  accountName: "Yararlanıcı adı (isteğe bağlı, önerilir)",
  instructions: "Manuel transfer talimatları",
  showToCustomers: "Müşterilere göster",
  confirmVisibility:
    "Cüzdan numarası ve talimatlar yayınlanacak. Devam edilsin mi?",
  visibleHint: "Etkin ve geçerli numaralıysa kayıttan sonra yayınlanır.",
  hiddenHint: "Etkin olsa bile müşterilere gösterilmez.",
  methodId: "Tanımlayıcı",
  methodLabel: "Yöntem adı",
  addMethod: "Yöntem ekle",
  removeMethod: "Yeni yöntemi kaldır",
  newMethod: "Yeni yöntem",
  reloadConfirm:
    "Kaydedilmemiş değişiklikler var. Sunucu sürümüyle değiştirilsin mi?",
  save: "Tahsilat yöntemlerini kaydet",
  saving: "Kaydediliyor…",
  saved: "Sunucu, tahsilat yöntemlerinin kaydedildiğini onayladı.",
  invalid: "Kaydetmeden önce cüzdan numarasını ve alanları kontrol edin.",
  serverError:
    "Tahsilat ayarları sunucu veya bağlantı hatası nedeniyle kaydedilemedi.",
  offline:
    "Ofis ayarlarını kaydetmek için canlı bağlantı gerekir; yerel taslak kaydedilmedi.",
  conflict:
    "Tahsilat ayarları sunucuda değişti. Yeniden yükleyip taslağı inceleyin.",
  noMethods: "Kayıtlı yöntem yok.",
  manualOnly: "Yalnızca manuel transfer; PIN, parola veya OTP paylaşmayın.",
  copy: "Numarayı kopyala",
  copied: "Kopyalandı",
  copyFailed: "Kopyalama başarısız; numarayı elle kopyalayın.",
  beneficiary: "Yararlanıcı",
  customerNote:
    "Bu bilgiler manuel transfer içindir; ödeme yürütme veya onayı değildir.",
  names: {
    bankily: "Bankily",
    masrvi: "Masrvi",
    gazapay: "Gazapay",
    sedad: "Sedad",
    cash: "Nakit",
  },
};

export const walletCopy: Record<Language, WalletCopy> = { ar, en, zh, tr };
export function walletCopyFor(language: string): WalletCopy {
  return walletCopy[
    (Object.keys(walletCopy) as string[]).includes(language)
      ? (language as Language)
      : "ar"
  ];
}
