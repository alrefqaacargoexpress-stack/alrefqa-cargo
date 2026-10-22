export const customerAccountLanguages = ["ar", "en", "zh", "tr"] as const;
export type CustomerAccountLanguage = (typeof customerAccountLanguages)[number];

export type CustomerAccountCopy = {
  title: string;
  description: string;
  search: string;
  newAccount: string;
  name: string;
  phone: string;
  office: string;
  selectOffice: string;
  selectOfficeHint: string;
  city: string;
  save: string;
  cancel: string;
  required: string;
  noAccounts: string;
  noResults: string;
  phoneMissing: string;
  open: string;
  shared: string;
  pending: string;
  local: string;
  export: string;
  oldAccounts: string;
  detail: string;
  back: string;
  invoices: string;
  statement: string;
  movements: string;
  date: string;
  descriptionColumn: string;
  officeColumn: string;
  debit: string;
  credit: string;
  currency: string;
  invoice: string;
  received: string;
  paidOut: string;
  owed: string;
  inFavor: string;
  noFinancialAccess: string;
  staffHint: string;
  previousBalance: string;
  previousBalanceHint: string;
  noMovements: string;
  noInvoices: string;
  addMovement: string;
  direction: string;
  customerCredit: string;
  customerDebit: string;
  amount: string;
  paymentMode: string;
  cash: string;
  wallet: string;
  walletMethod: string;
  reference: string;
  addDescription: string;
  saveMovement: string;
  syncNow: string;
  accountSyncConfirm: string;
  accountShared: string;
  publishAccount: string;
  accountPublished: string;
  publishFailed: string;
  syncConfirm: string;
  savedLocally: string;
  sharedSuccess: string;
  syncFailed: string;
  saving: string;
  loading: string;
  accessDenied: string;
  accountNotFound: string;
  validation: string;
  createSuccess: string;
  saveFailed: string;
  localDraft: string;
  newMovement: string;
  movementSaveFailed: string;
};

const ar: CustomerAccountCopy = {
  newMovement: "إضافة حركة أخرى (تُحفظ المسودة السابقة)",
  movementSaveFailed: "تعذر حفظ الحركة؛ لم تسجل محليًا وبقي الإدخال.",
  title: "حسابات العملاء",
  description: "دليل حسابات فعلية بالاسم والهاتف، دون بضائع أو شحنات.",
  search: "ابحث بالاسم أو الهاتف أو المعرّف",
  newAccount: "إنشاء حساب عميل",
  name: "اسم العميل",
  phone: "الهاتف",
  office: "المكتب",
  selectOffice: "اختر مكتب الحركة",
  selectOfficeHint: "اختر المكتب الذي تُنسب إليه هذه الحركة قبل المتابعة.",
  city: "المدينة (اختياري)",
  save: "حفظ الحساب",
  cancel: "إلغاء",
  required: "الاسم والهاتف مطلوبان.",
  noAccounts: "لا توجد حسابات عملاء محفوظة.",
  noResults: "لا توجد حسابات مطابقة.",
  phoneMissing: "لا يوجد هاتف",
  open: "فتح الحساب",
  shared: "مشترك",
  pending: "معلّق",
  local: "محلي",
  export: "تصدير Excel",
  oldAccounts: "الحسابات القديمة في Excel",
  detail: "تفاصيل حساب العميل",
  back: "رجوع إلى الحسابات",
  invoices: "الفواتير الحقيقية",
  statement: "كشف الحساب",
  movements: "حركات القبض والصرف",
  date: "التاريخ",
  descriptionColumn: "الوصف",
  officeColumn: "المكتب",
  debit: "صرف له",
  credit: "قبض لصالحه",
  currency: "العملة",
  invoice: "الفاتورة",
  received: "القبض",
  paidOut: "الصرف",
  owed: "له على العميل",
  inFavor: "لصالح العميل",
  noFinancialAccess: "العرض المالي متاح للمدير والمحاسب فقط.",
  staffHint: "يمكنك رؤية الاسم والهاتف والحالة المسموح بها فقط.",
  previousBalance: "الرصيد السابق",
  previousBalanceHint: "رصيد قديم بلا عملة؛ لا يدخل في إجمالي الحركات الجديدة.",
  noMovements: "لا توجد حركات مالية لهذا الحساب.",
  noInvoices: "لا توجد فواتير مرتبطة بهذا المعرّف.",
  addMovement: "إضافة حركة",
  direction: "نوع الحركة",
  customerCredit: "قبض لصالحه",
  customerDebit: "صرف له",
  amount: "المبلغ",
  paymentMode: "طريقة الدفع",
  cash: "نقدًا",
  wallet: "محفظة",
  walletMethod: "طريقة المحفظة",
  reference: "المرجع (اختياري)",
  addDescription: "الوصف",
  saveMovement: "حفظ الحركة محليًا",
  syncNow: "تسجيل الحركة المشتركة",
  accountSyncConfirm:
    "حفظ هذا الحساب مع الفريق الآن؟ سيُرسل هذا الحساب فقط ولن تُزامن باقي المسودات.",
  accountShared: "تم تسجيل الحساب مع الفريق.",
  publishAccount: "نشر الحساب للفريق",
  accountPublished: "تم نشر الحساب للفريق.",
  publishFailed: "لم يُنشر الحساب؛ بقيت المسودة المحلية ويمكن إعادة المحاولة.",
  syncConfirm:
    "هل تريد تسجيل هذه الحركة مع الفريق الآن؟ سيُرسل هذا المعرّف فقط.",
  savedLocally: "حُفظت الحركة محليًا فقط؛ لم تصبح قيدًا مشتركًا.",
  sharedSuccess: "تم تسجيل الحركة المشتركة.",
  syncFailed: "تعذر التسجيل المشترك؛ بقيت المسودة المحلية محفوظة.",
  saving: "جارٍ الحفظ…",
  loading: "جارٍ تحميل الحسابات…",
  accessDenied: "لا تملك صلاحية الوصول.",
  accountNotFound: "حساب العميل غير موجود.",
  validation: "تحقق من الحقول المطلوبة والمبلغ وطريقة الدفع.",
  createSuccess: "تم حفظ الحساب محليًا.",
  saveFailed: "تعذر حفظ الحساب؛ بقي الإدخال كما هو.",
  localDraft: "مسودة محلية",
};
const en: CustomerAccountCopy = {
  ...ar,
  newMovement: "Add another movement (previous draft retained)",
  movementSaveFailed:
    "Movement could not be saved locally; your input remains.",
  title: "Customer accounts",
  description:
    "Actual customer accounts by name and phone, without goods or shipments.",
  search: "Search by name, phone, or ID",
  newAccount: "Create customer account",
  name: "Customer name",
  phone: "Phone",
  office: "Office",
  selectOffice: "Select movement office",
  selectOfficeHint:
    "Choose the office to attribute this movement to before continuing.",
  city: "City (optional)",
  save: "Save account",
  cancel: "Cancel",
  required: "Name and phone are required.",
  noAccounts: "No saved customer accounts.",
  noResults: "No matching accounts.",
  phoneMissing: "No phone",
  open: "Open account",
  shared: "Shared",
  pending: "Pending",
  local: "Local",
  export: "Export Excel",
  oldAccounts: "Older accounts in Excel",
  detail: "Customer account",
  back: "Back to accounts",
  invoices: "Actual invoices",
  statement: "Account statement",
  movements: "Collections and payouts",
  date: "Date",
  descriptionColumn: "Description",
  officeColumn: "Office",
  debit: "Paid out",
  credit: "Collected",
  currency: "Currency",
  invoice: "Invoice",
  received: "Collected",
  paidOut: "Paid out",
  owed: "Due from customer",
  inFavor: "In customer's favor",
  noFinancialAccess:
    "Financial view is available to admins and accountants only.",
  staffHint: "You can see the permitted name, phone, and status only.",
  previousBalance: "Previous balance",
  previousBalanceHint:
    "An old balance without a known currency; excluded from new movement totals.",
  noMovements: "No financial movements for this account.",
  noInvoices: "No invoices linked to this ID.",
  addMovement: "Add movement",
  direction: "Movement type",
  customerCredit: "Collected for customer",
  customerDebit: "Paid to customer",
  amount: "Amount",
  paymentMode: "Payment method",
  cash: "Cash",
  wallet: "Wallet",
  walletMethod: "Wallet method",
  reference: "Reference (optional)",
  addDescription: "Description",
  saveMovement: "Save movement locally",
  syncNow: "Post shared movement",
  syncConfirm:
    "Post this movement with the team now? Only this ID will be sent.",
  publishAccount: "Publish account to team",
  accountPublished: "Account posted to the team.",
  publishFailed: "Account was not posted; the local draft remains for retry.",
  savedLocally: "Movement saved locally only; it is not shared yet.",
  sharedSuccess: "Movement posted to the shared ledger.",
  syncFailed: "Shared posting failed; the local draft was preserved.",
  saving: "Saving…",
  loading: "Loading accounts…",
  accessDenied: "You do not have access.",
  accountNotFound: "Customer account not found.",
  validation: "Check required fields, amount, and payment method.",
  createSuccess: "Account saved locally.",
  saveFailed: "Account could not be saved; your input was preserved.",
  localDraft: "Local draft",
};
const zh: CustomerAccountCopy = {
  ...en,
  newMovement: "新增交易（保留上一草稿）",
  movementSaveFailed: "交易未保存在本地，输入仍保留。",
  title: "客户账户",
  description: "按姓名和电话管理真实客户账户，不显示商品或货运。",
  search: "按姓名、电话或 ID 搜索",
  newAccount: "创建客户账户",
  name: "客户姓名",
  phone: "电话",
  office: "办公室",
  selectOffice: "选择交易办公室",
  selectOfficeHint: "继续前请选择归属此交易的办公室。",
  city: "城市（可选）",
  save: "保存账户",
  cancel: "取消",
  required: "姓名和电话为必填项。",
  noAccounts: "尚无保存的客户账户。",
  noResults: "没有匹配的账户。",
  phoneMissing: "无电话",
  open: "打开账户",
  shared: "共享",
  pending: "待处理",
  local: "本地",
  export: "导出 Excel",
  oldAccounts: "旧账户 Excel",
  detail: "客户账户",
  back: "返回账户",
  invoices: "真实发票",
  statement: "账户对账单",
  movements: "收款和付款",
  date: "日期",
  descriptionColumn: "说明",
  officeColumn: "办公室",
  debit: "付给客户",
  credit: "为客户收款",
  currency: "货币",
  invoice: "发票",
  received: "收款",
  paidOut: "付款",
  owed: "客户应付",
  inFavor: "客户有余额",
  noFinancialAccess: "只有管理员和会计可以查看财务。",
  staffHint: "您只能查看允许的姓名、电话和状态。",
  previousBalance: "以前余额",
  previousBalanceHint: "没有已知货币的旧余额；不计入新交易总额。",
  noMovements: "此账户没有财务交易。",
  noInvoices: "没有链接到此 ID 的发票。",
  addMovement: "添加交易",
  direction: "交易类型",
  customerCredit: "为客户收款",
  customerDebit: "付给客户",
  amount: "金额",
  paymentMode: "付款方式",
  cash: "现金",
  wallet: "钱包",
  walletMethod: "钱包方式",
  reference: "参考（可选）",
  addDescription: "说明",
  saveMovement: "在本地保存交易",
  syncNow: "记录共享交易",
  syncConfirm: "现在与团队记录此交易吗？只会发送此 ID。",
  publishAccount: "向团队发布账户",
  accountPublished: "账户已发布给团队。",
  publishFailed: "账户未发布；本地草稿仍可重试。",
  savedLocally: "交易仅保存在本地，尚未共享。",
  sharedSuccess: "交易已记录到共享账本。",
  syncFailed: "共享记录失败；本地草稿已保留。",
  saving: "正在保存…",
  loading: "正在加载账户…",
  accessDenied: "您无权访问。",
  accountNotFound: "未找到客户账户。",
  validation: "请检查必填项、金额和付款方式。",
  createSuccess: "账户已保存在本地。",
  saveFailed: "账户保存失败；您的输入已保留。",
  localDraft: "本地草稿",
};
const tr: CustomerAccountCopy = {
  ...en,
  newMovement: "Başka hareket ekle (önceki taslak korunur)",
  movementSaveFailed: "Hareket yerelde kaydedilemedi; girdiniz korunuyor.",
  title: "Müşteri hesapları",
  description:
    "Mal veya gönderi göstermeden gerçek müşteri hesaplarını ad ve telefonla yönetin.",
  search: "Ad, telefon veya ID ile ara",
  newAccount: "Müşteri hesabı oluştur",
  name: "Müşteri adı",
  phone: "Telefon",
  office: "Ofis",
  selectOffice: "Hareket ofisini seç",
  selectOfficeHint: "Devam etmeden önce hareketin atanacağı ofisi seçin.",
  city: "Şehir (isteğe bağlı)",
  save: "Hesabı kaydet",
  cancel: "İptal",
  required: "Ad ve telefon zorunludur.",
  noAccounts: "Kayıtlı müşteri hesabı yok.",
  noResults: "Eşleşen hesap yok.",
  phoneMissing: "Telefon yok",
  open: "Hesabı aç",
  shared: "Ortak",
  pending: "Bekliyor",
  local: "Yerel",
  export: "Excel dışa aktar",
  oldAccounts: "Eski hesaplar Excel'de",
  detail: "Müşteri hesabı",
  back: "Hesaplara dön",
  invoices: "Gerçek faturalar",
  statement: "Hesap ekstresi",
  movements: "Tahsilat ve ödemeler",
  date: "Tarih",
  descriptionColumn: "Açıklama",
  officeColumn: "Ofis",
  debit: "Müşteriye ödeme",
  credit: "Müşteri adına tahsilat",
  currency: "Para birimi",
  invoice: "Fatura",
  received: "Tahsilat",
  paidOut: "Ödeme",
  owed: "Müşteriden alacak",
  inFavor: "Müşteri lehine",
  noFinancialAccess:
    "Mali görünüm yalnızca yöneticiler ve muhasebeciler içindir.",
  staffHint: "Yalnızca izin verilen ad, telefon ve durumu görebilirsiniz.",
  previousBalance: "Önceki bakiye",
  previousBalanceHint:
    "Para birimi bilinmeyen eski bakiye; yeni hareket toplamlarına dahil değildir.",
  noMovements: "Bu hesapta mali hareket yok.",
  noInvoices: "Bu ID ile bağlantılı fatura yok.",
  addMovement: "Hareket ekle",
  direction: "Hareket türü",
  customerCredit: "Müşteri adına tahsilat",
  customerDebit: "Müşteriye ödeme",
  amount: "Tutar",
  paymentMode: "Ödeme yöntemi",
  cash: "Nakit",
  wallet: "Cüzdan",
  walletMethod: "Cüzdan yöntemi",
  reference: "Referans (isteğe bağlı)",
  addDescription: "Açıklama",
  saveMovement: "Hareketi yerelde kaydet",
  syncNow: "Ortak hareketi kaydet",
  syncConfirm:
    "Bu hareket şimdi ekiple kaydedilsin mi? Yalnızca bu ID gönderilecek.",
  publishAccount: "Hesabı ekibe yayınla",
  accountPublished: "Hesap ekibe yayınlandı.",
  publishFailed: "Hesap yayınlanmadı; yerel taslak yeniden denenebilir.",
  savedLocally: "Hareket yalnızca yerelde kaydedildi; henüz ortak değil.",
  sharedSuccess: "Hareket ortak deftere kaydedildi.",
  syncFailed: "Ortak kayıt başarısız; yerel taslak korundu.",
  saving: "Kaydediliyor…",
  loading: "Hesaplar yükleniyor…",
  accessDenied: "Erişiminiz yok.",
  accountNotFound: "Müşteri hesabı bulunamadı.",
  validation: "Zorunlu alanları, tutarı ve ödeme yöntemini kontrol edin.",
  createSuccess: "Hesap yerelde kaydedildi.",
  saveFailed: "Hesap kaydedilemedi; girdiniz korundu.",
  localDraft: "Yerel taslak",
};

export const customerAccountCopy: Record<
  CustomerAccountLanguage,
  CustomerAccountCopy
> = { ar, en, zh, tr };
export function customerAccountCopyFor(language: string): CustomerAccountCopy {
  return customerAccountCopy[
    (customerAccountLanguages as readonly string[]).includes(language)
      ? (language as CustomerAccountLanguage)
      : "ar"
  ];
}
