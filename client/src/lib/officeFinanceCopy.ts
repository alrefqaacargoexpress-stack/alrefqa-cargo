import type { FinanceCurrency } from "@shared/finance";

export const officeFinanceLanguages = ["ar", "en", "zh", "tr"] as const;
export type OfficeFinanceLanguage = (typeof officeFinanceLanguages)[number];

export type OfficeFinanceCopy = {
  title: string;
  description: string;
  noAccess: string;
  loading: string;
  chooseOffice: string;
  allOffices: string;
  homeOffice: string;
  homeOfficeHint: string;
  officialSnapshot: string;
  pending: string;
  sync: string;
  syncing: string;
  syncDone: string;
  syncConflicts: string;
  syncNoResult: string;
  offline: string;
  error: string;
  retry: string;
  billing: string;
  balances: string;
  revenue: string;
  expenses: string;
  shipmentCosts: string;
  dailyExpenses: string;
  monthlyExpenses: string;
  net: string;
  debts: string;
  collections: string;
  noEntries: string;
  ledger: string;
  ledgerHint: string;
  actor: string;
  recordedAt: string;
  office: string;
  date: string;
  currency: string;
  kind: string;
  descriptionLabel: string;
  shipmentRevenue: string;
  invoiceRevenue: string;
  customerDebt: string;
  debtPayment: string;
  collection: string;
  shipmentCost: string;
  dailyExpense: string;
  monthlyExpense: string;
  addExpense: string;
  expenseCategory: string;
  amount: string;
  shipment: string;
  selectShipment: string;
  noShipment: string;
  saveExpense: string;
  saving: string;
  saved: string;
  required: string;
  invalidAmount: string;
  shipmentRequired: string;
  sameOfficeHint: string;
  pendingHint: string;
  draftsExcluded: string;
  legacyBalanceHint: string;
  invoices: string;
};

const ar: OfficeFinanceCopy = {
  title: "المالية حسب المكاتب",
  description: "لقطة الخادم الرسمية للقيود المالية، مع عملة ومكتب واضحين",
  noAccess: "الوصول المالي متاح للمدير والمحاسب فقط.",
  loading: "جارٍ تحميل اللقطة المالية…",
  chooseOffice: "اختر المكتب",
  allOffices: "كل المكاتب المسموحة",
  homeOffice: "مكتب الموظف",
  homeOfficeHint:
    "تُسند ديون الموظف إلى مكتبه المحدد؛ ولا تُعد مسوداتك المحلية رصيداً رسمياً.",
  officialSnapshot: "بيانات رسمية من لقطة الخادم فقط",
  pending: "مسودات معلقة",
  sync: "مزامنة المسودات",
  syncing: "جارٍ المزامنة…",
  syncDone: "تمت مزامنة المسودات",
  syncConflicts: "توجد تعارضات؛ بقيت المسودات للمراجعة",
  syncNoResult: "لم تُطبق مسودة",
  offline: "أنت غير متصل؛ يمكن مراجعة اللقطة، ولا يمكن إرسال مصروف جديد.",
  error: "تعذر تحميل المالية.",
  retry: "إعادة المحاولة",
  billing: "الفوترة",
  balances: "الأرصدة الرسمية حسب العملة",
  revenue: "الإيراد",
  expenses: "المصروفات",
  shipmentCosts: "تكاليف الشحن",
  dailyExpenses: "مصروف يومي",
  monthlyExpenses: "مصروف شهري",
  net: "الصافي",
  debts: "الديون",
  collections: "التحصيل",
  noEntries: "لا توجد قيود في هذا النطاق.",
  ledger: "دفتر القيود",
  ledgerHint:
    "كل سطر صادر من الخادم مع الفاعل والوقت والمكتب والتاريخ والعملة؛ لا يمكن تعديل القيود المنشورة.",
  actor: "الفاعل",
  recordedAt: "وقت التسجيل",
  office: "المكتب",
  date: "التاريخ",
  currency: "العملة",
  kind: "النوع",
  descriptionLabel: "الوصف",
  shipmentRevenue: "إيراد شحنة",
  invoiceRevenue: "إيراد فاتورة",
  customerDebt: "دين عميل",
  debtPayment: "سداد دين",
  collection: "تحصيل",
  shipmentCost: "تكلفة شحنة",
  dailyExpense: "مصروف يومي",
  monthlyExpense: "مصروف شهري",
  addExpense: "إضافة مصروف",
  expenseCategory: "تصنيف المصروف",
  amount: "المبلغ",
  shipment: "الشحنة",
  selectShipment: "اختر شحنة من المكتب نفسه",
  noShipment: "لا توجد شحنات متاحة لهذا المكتب.",
  saveExpense: "حفظ المصروف",
  saving: "جارٍ الحفظ…",
  saved: "تم حفظ المصروف في قائمة المسودات",
  required: "هذا الحقل مطلوب.",
  invalidAmount: "أدخل مبلغاً صالحاً غير سالب؛ الصفر مسموح لتكلفة الشحنة.",
  shipmentRequired: "اختر شحنة لتكلفة الشحن.",
  sameOfficeHint: "تُعرض الشحنات التي يطابق مالكها مكتب المصروف فقط.",
  pendingHint: "المسودة محلية حتى المزامنة ولا تدخل الأرصدة الرسمية.",
  draftsExcluded: "المسودات المحلية مستثناة من الأرصدة حتى يعتمدها الخادم.",
  legacyBalanceHint:
    "أرصدة الحسابات القديمة يدوية وبلا عملة محددة؛ لا تدخل هذا التجميع.",
  invoices: "الفواتير",
};

const en: OfficeFinanceCopy = {
  title: "Office finance",
  description: "Official server ledger with an explicit office and currency",
  noAccess: "Finance access is limited to administrators and accountants.",
  loading: "Loading the finance snapshot…",
  chooseOffice: "Choose office",
  allOffices: "All permitted offices",
  homeOffice: "Employee office",
  homeOfficeHint:
    "Employee debt is assigned to the employee's office; local drafts are not official balances.",
  officialSnapshot: "Official data from the server snapshot only",
  pending: "Pending drafts",
  sync: "Sync drafts",
  syncing: "Syncing…",
  syncDone: "Drafts synced",
  syncConflicts: "Conflicts found; drafts remain for review",
  syncNoResult: "No draft was applied",
  offline:
    "You are offline. The snapshot is readable, but new expenses cannot be sent.",
  error: "The finance snapshot could not be loaded.",
  retry: "Retry",
  billing: "Billing",
  balances: "Official balances by currency",
  revenue: "Revenue",
  expenses: "Expenses",
  shipmentCosts: "Shipment costs",
  dailyExpenses: "Daily expense",
  monthlyExpenses: "Monthly expense",
  net: "Net",
  debts: "Debts",
  collections: "Collections",
  noEntries: "No entries in this scope.",
  ledger: "Ledger",
  ledgerHint:
    "Every row comes from the server with actor, time, office, date, and currency; posted entries cannot be edited.",
  actor: "Actor",
  recordedAt: "Recorded at",
  office: "Office",
  date: "Date",
  currency: "Currency",
  kind: "Kind",
  descriptionLabel: "Description",
  shipmentRevenue: "Shipment revenue",
  invoiceRevenue: "Invoice revenue",
  customerDebt: "Customer debt",
  debtPayment: "Debt payment",
  collection: "Collection",
  shipmentCost: "Shipment cost",
  dailyExpense: "Daily expense",
  monthlyExpense: "Monthly expense",
  addExpense: "Add expense",
  expenseCategory: "Expense category",
  amount: "Amount",
  shipment: "Shipment",
  selectShipment: "Choose a shipment from the same office",
  noShipment: "No shipments are available for this office.",
  saveExpense: "Save expense",
  saving: "Saving…",
  saved: "Expense saved to the pending queue",
  required: "This field is required.",
  invalidAmount:
    "Enter a valid non-negative amount; zero is allowed for shipment costs.",
  shipmentRequired: "Choose a shipment for a shipment cost.",
  sameOfficeHint: "Only shipments owned by the expense office are shown.",
  pendingHint:
    "This draft is local until synced and does not enter official balances.",
  draftsExcluded:
    "Local drafts are excluded from balances until the server accepts them.",
  legacyBalanceHint:
    "Legacy account balances are manual and currency-unspecified; they are not aggregated here.",
  invoices: "Invoices",
};

const zh: OfficeFinanceCopy = {
  title: "办公室财务",
  description: "来自服务器的正式账簿，明确显示办公室和币种",
  noAccess: "只有管理员和会计可以访问财务。",
  loading: "正在加载财务快照…",
  chooseOffice: "选择办公室",
  allOffices: "所有允许的办公室",
  homeOffice: "员工办公室",
  homeOfficeHint: "员工债务归属于员工办公室；本地草稿不是正式余额。",
  officialSnapshot: "仅显示服务器快照中的正式数据",
  pending: "待同步草稿",
  sync: "同步草稿",
  syncing: "正在同步…",
  syncDone: "草稿已同步",
  syncConflicts: "发现冲突；草稿仍保留以供审核",
  syncNoResult: "没有草稿被应用",
  offline: "当前离线。可以查看快照，但不能发送新费用。",
  error: "无法加载财务快照。",
  retry: "重试",
  billing: "账单",
  balances: "按币种的正式余额",
  revenue: "收入",
  expenses: "费用",
  shipmentCosts: "运输成本",
  dailyExpenses: "日常费用",
  monthlyExpenses: "月度费用",
  net: "净额",
  debts: "债务",
  collections: "收款",
  noEntries: "此范围没有账目。",
  ledger: "账簿",
  ledgerHint:
    "每行都来自服务器，包含操作人、时间、办公室、日期和币种；已发布账目不可编辑。",
  actor: "操作人",
  recordedAt: "记录时间",
  office: "办公室",
  date: "日期",
  currency: "币种",
  kind: "类型",
  descriptionLabel: "描述",
  shipmentRevenue: "运输收入",
  invoiceRevenue: "发票收入",
  customerDebt: "客户债务",
  debtPayment: "债务付款",
  collection: "收款",
  shipmentCost: "运输成本",
  dailyExpense: "日常费用",
  monthlyExpense: "月度费用",
  addExpense: "添加费用",
  expenseCategory: "费用分类",
  amount: "金额",
  shipment: "货件",
  selectShipment: "选择同一办公室的货件",
  noShipment: "此办公室没有可用货件。",
  saveExpense: "保存费用",
  saving: "正在保存…",
  saved: "费用已保存到待同步队列",
  required: "此字段为必填项。",
  invalidAmount: "请输入有效的非负金额；运输成本允许为零。",
  shipmentRequired: "运输成本必须选择货件。",
  sameOfficeHint: "只显示所有者办公室与费用办公室相同的货件。",
  pendingHint: "同步前草稿仅在本地，不会计入正式余额。",
  draftsExcluded: "服务器接受前，本地草稿不计入余额。",
  legacyBalanceHint: "旧账户余额是手动且未指定币种；不在此处汇总。",
  invoices: "发票",
};

const tr: OfficeFinanceCopy = {
  title: "Ofis finansı",
  description: "Açık ofis ve para birimiyle sunucunun resmi defteri",
  noAccess: "Finans erişimi yalnızca yöneticiler ve muhasebeciler içindir.",
  loading: "Finans görüntüsü yükleniyor…",
  chooseOffice: "Ofis seç",
  allOffices: "İzin verilen tüm ofisler",
  homeOffice: "Çalışanın ofisi",
  homeOfficeHint:
    "Çalışan borcu çalışanın ofisine atanır; yerel taslaklar resmi bakiye değildir.",
  officialSnapshot: "Yalnızca sunucu görüntüsündeki resmi veriler",
  pending: "Bekleyen taslaklar",
  sync: "Taslakları eşitle",
  syncing: "Eşitleniyor…",
  syncDone: "Taslaklar eşitlendi",
  syncConflicts: "Çakışmalar var; taslaklar inceleme için korundu",
  syncNoResult: "Hiçbir taslak uygulanmadı",
  offline:
    "Çevrimdışısınız. Görüntü okunabilir, ancak yeni gider gönderilemez.",
  error: "Finans görüntüsü yüklenemedi.",
  retry: "Tekrar dene",
  billing: "Faturalama",
  balances: "Para birimine göre resmi bakiyeler",
  revenue: "Gelir",
  expenses: "Giderler",
  shipmentCosts: "Gönderi maliyetleri",
  dailyExpenses: "Günlük gider",
  monthlyExpenses: "Aylık gider",
  net: "Net",
  debts: "Borçlar",
  collections: "Tahsilatlar",
  noEntries: "Bu kapsamda kayıt yok.",
  ledger: "Defter",
  ledgerHint:
    "Her satır sunucudan aktör, zaman, ofis, tarih ve para birimiyle gelir; yayınlanan kayıtlar değiştirilemez.",
  actor: "Aktör",
  recordedAt: "Kayıt zamanı",
  office: "Ofis",
  date: "Tarih",
  currency: "Para birimi",
  kind: "Tür",
  descriptionLabel: "Açıklama",
  shipmentRevenue: "Gönderi geliri",
  invoiceRevenue: "Fatura geliri",
  customerDebt: "Müşteri borcu",
  debtPayment: "Borç ödemesi",
  collection: "Tahsilat",
  shipmentCost: "Gönderi maliyeti",
  dailyExpense: "Günlük gider",
  monthlyExpense: "Aylık gider",
  addExpense: "Gider ekle",
  expenseCategory: "Gider kategorisi",
  amount: "Tutar",
  shipment: "Gönderi",
  selectShipment: "Aynı ofisten bir gönderi seçin",
  noShipment: "Bu ofis için gönderi yok.",
  saveExpense: "Gideri kaydet",
  saving: "Kaydediliyor…",
  saved: "Gider bekleyen kuyruğa kaydedildi",
  required: "Bu alan zorunludur.",
  invalidAmount:
    "Geçerli, negatif olmayan bir tutar girin; gönderi maliyetinde sıfır mümkündür.",
  shipmentRequired: "Gönderi maliyeti için gönderi seçin.",
  sameOfficeHint:
    "Yalnızca gider ofisinin sahibi olduğu gönderiler gösterilir.",
  pendingHint: "Bu taslak eşitlenene kadar yereldir ve resmi bakiyeye girmez.",
  draftsExcluded:
    "Sunucu kabul edene kadar yerel taslaklar bakiyeye dahil edilmez.",
  legacyBalanceHint:
    "Eski hesap bakiyeleri manuel ve para birimsizdir; burada toplanmaz.",
  invoices: "Faturalar",
};

export const officeFinanceCopy: Record<
  OfficeFinanceLanguage,
  OfficeFinanceCopy
> = {
  ar,
  en,
  zh,
  tr,
};

export function officeFinanceCopyFor(language: string): OfficeFinanceCopy {
  return officeFinanceCopy[
    (officeFinanceLanguages as readonly string[]).includes(language)
      ? (language as OfficeFinanceLanguage)
      : "ar"
  ];
}

export function currencyLabel(currency: FinanceCurrency): string {
  return currency;
}
