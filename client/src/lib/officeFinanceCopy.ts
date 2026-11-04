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
  withdrawals: string;
  retainedNet: string;
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
  customerCredit: string;
  customerDebit: string;
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
  openingBalance: string;
  shipmentPrice: string;
  shipmentPriceHint: string;
  saveShipmentPrice: string;
  readOnlyFinance: string;
  totalGross: string;
  sold: string;
  remaining: string;
  unpriced: string;
  cashBalance: string;
  availableProfitWithdrawal: string;
  availableProfitWithdrawalHint: string;
  profitWithdrawal: string;
  profitWithdrawalHint: string;
  withdrawalReason: string;
  saveWithdrawal: string;
  withdrawalSaved: string;
  withdrawalRequired: string;
  withdrawalInvalidAmount: string;
  withdrawalAlreadyPending: string;
  withdrawalExceedsAvailable: string;
  withdrawalUnavailable: string;
  withdrawalNotPosted: string;
  sourceReceivables: string;
  sourceReceivablesHint: string;
  noSourceReceivables: string;
  addOpeningBalance: string;
  openingOnceHint: string;
  openingDirection: string;
  debit: string;
  credit: string;
  note: string;
  saveOpening: string;
  openingSaved: string;
  openingAlreadyExists: string;
  openingRequired: string;
  setShipmentPrice: string;
  pricePerKg: string;
  pricePerKgMRU: string;
  expectedVersion: string;
  priceSaved: string;
  priceAlreadyPending: string;
  priceRequired: string;
  noPriceableShipments: string;
  costReference?: string;
  costReferenceHint?: string;
  costReferenceManual?: string;
  currencyMismatch?: string;
  permissionDenied?: string;
};

const ar: OfficeFinanceCopy = {
  customerCredit: "قبض لصالح العميل",
  customerDebit: "صرف للعميل",
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
  withdrawals: "السحوبات",
  retainedNet: "صافي الربح المحتفظ به",
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
  costReference: "مرجع تكلفة إضافية",
  costReferenceHint: "اختياري؛ أدخل مرجعًا يدويًا فقط. يترك فارغًا للتكلفة الأساسية.",
  costReferenceManual: "مرجع يدوي (اختياري)",
  currencyMismatch: "اختر عملة المصدر نفسها للشحنة.",
  permissionDenied: "لا تملك صلاحية تسجيل هذا النوع من المصروف.",
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
  openingBalance: "الرصيد الافتتاحي (محاسبة)",
  shipmentPrice: "سعر الشحن",
  shipmentPriceHint:
    "يحدده المحاسب في مكتب مصدر الشحنة، ولا يغير بضائع الشحنة.",
  saveShipmentPrice: "حفظ السعر",
  readOnlyFinance:
    "هذه الصفحة للقراءة والإشراف؛ الكتابة للمحاسب المعين في مكتبه فقط.",
  totalGross: "الإجمالي قبل الفواتير",
  sold: "المباع بالفواتير",
  remaining: "المتبقي غير المباع",
  unpriced: "غير مسعّر",
  cashBalance: "الرصيد النقدي",
  availableProfitWithdrawal: "المتاح لسحب الربح",
  availableProfitWithdrawalHint:
    "الحد الأدنى بين النقد الفعلي وصافي الربح الدفتري المحتفظ به؛ ليس ربحًا قانونيًا مدققًا.",
  profitWithdrawal: "سحب ربح",
  profitWithdrawalHint:
    "مسودة سحب محلية للمراجعة. لا تُنقص الأرصدة الرسمية حتى يؤكدها الخادم.",
  withdrawalReason: "سبب السحب",
  saveWithdrawal: "حفظ مسودة السحب",
  withdrawalSaved: "حُفظت مسودة سحب الربح محليًا؛ لم تُسجل كقيد منشور.",
  withdrawalRequired: "أدخل التاريخ وسبب السحب.",
  withdrawalInvalidAmount: "أدخل مبلغًا موجبًا بدقة منزلتين عشريتين.",
  withdrawalAlreadyPending: "توجد مسودة سحب معلقة لهذا المكتب والعملة.",
  withdrawalExceedsAvailable: "لا يمكن أن يتجاوز السحب المتاح النقد والربح الدفتري.",
  withdrawalUnavailable: "سحب الأرباح غير متاح في نطاقك المالي الحالي.",
  withdrawalNotPosted: "يتطلب اتصالًا وبيانات حديثة وصلاحية إدارة فعلية؛ الحفظ مسودة فقط.",
  sourceReceivables: "مستحقات المصدر حسب الشحنة",
  sourceReceivablesHint:
    "من مكتب المصدر وبعملة المصدر؛ تخفّض الفواتير قيمة غير المباع عند إصدارها، ويبقى الدين دينَ العميل. لا يوجد تحويل تلقائي إلى MRU.",
  noSourceReceivables: "لا توجد مستحقات مصدر في هذا النطاق.",
  addOpeningBalance: "إضافة رصيد افتتاحي",
  openingOnceHint:
    "يسجل المحاسب رصيداً افتتاحياً مرة واحدة لكل مكتب وعملة؛ لا يمكن إعادة تشغيله أو استبداله.",
  openingDirection: "اتجاه الرصيد",
  debit: "مدين",
  credit: "دائن",
  note: "الملاحظة",
  saveOpening: "حفظ الرصيد الافتتاحي",
  openingSaved: "حُفظ الرصيد الافتتاحي كمسودة محلية للمراجعة.",
  openingAlreadyExists: "يوجد رصيد افتتاحي لهذه العملة؛ مُنع التكرار.",
  openingRequired: "أدخل المكتب والعملة والاتجاه والتاريخ والمبلغ والملاحظة.",
  setShipmentPrice: "تسعير شحنة من المصدر",
  pricePerKg: "سعر الكيلو",
  pricePerKgMRU: "سعر الكيلو بعملة MRU (اختياري)",
  expectedVersion: "نسخة الشحنة المتوقعة",
  priceSaved: "حُفظ سعر الشحنة كمسودة محلية للمراجعة.",
  priceAlreadyPending: "يوجد تسعير معلق لهذه الشحنة؛ مُنع التكرار.",
  priceRequired: "اختر شحنة وأدخل سعراً صالحاً غير سالب.",
  noPriceableShipments: "لا توجد شحنات مصدر قابلة للتسعير.",
};

const en: OfficeFinanceCopy = {
  customerCredit: "Customer deposit",
  customerDebit: "Customer payout",
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
  withdrawals: "Withdrawals",
  retainedNet: "Retained net",
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
  costReference: "Additional cost reference",
  costReferenceHint: "Optional; enter a manual reference only. Leave blank for the primary cost.",
  costReferenceManual: "Manual reference (optional)",
  currencyMismatch: "Choose the shipment source currency.",
  permissionDenied: "You do not have permission to record this expense type.",
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
  openingBalance: "Opening balance (accounting)",
  shipmentPrice: "Shipment price",
  shipmentPriceHint:
    "Set by the accountant in the shipment source office; goods are not changed.",
  saveShipmentPrice: "Save price",
  readOnlyFinance:
    "This page is read-only for oversight; only the assigned accountant can post in the home office.",
  totalGross: "Gross shipment value",
  sold: "Sold on invoices",
  remaining: "Remaining unsold",
  unpriced: "Unpriced",
  cashBalance: "Cash balance",
  availableProfitWithdrawal: "Available profit withdrawal",
  availableProfitWithdrawalHint:
    "The lower of actual cash and booked retained net; this is not audited legal profit.",
  profitWithdrawal: "Profit withdrawal",
  profitWithdrawalHint:
    "Local withdrawal draft for review. Official balances change only after server acknowledgement.",
  withdrawalReason: "Withdrawal reason",
  saveWithdrawal: "Save withdrawal draft",
  withdrawalSaved: "Profit-withdrawal draft saved locally; no posted entry was created.",
  withdrawalRequired: "Enter a date and withdrawal reason.",
  withdrawalInvalidAmount: "Enter a positive amount with at most two decimal places.",
  withdrawalAlreadyPending: "A withdrawal draft is already pending for this office and currency.",
  withdrawalExceedsAvailable: "The withdrawal cannot exceed actual cash and booked retained net.",
  withdrawalUnavailable: "Profit withdrawal is unavailable in your current finance scope.",
  withdrawalNotPosted: "Requires online, fresh data, and actual manage permission; saving creates a draft only.",
  sourceReceivables: "Source receivables by shipment",
  sourceReceivablesHint:
    "From the source office in its source currency; issued invoices reduce unsold value, while the debt remains customer debt. No automatic MRU conversion.",
  noSourceReceivables: "No source receivables in this scope.",
  addOpeningBalance: "Add opening balance",
  openingOnceHint:
    "The accountant records one opening balance per office and currency; replay or replacement is blocked.",
  openingDirection: "Balance direction",
  debit: "Debit",
  credit: "Credit",
  note: "Note",
  saveOpening: "Save opening balance",
  openingSaved: "Opening balance saved as a local draft for review.",
  openingAlreadyExists:
    "An opening balance already exists for this currency; duplicate blocked.",
  openingRequired: "Enter office, currency, direction, date, amount, and note.",
  setShipmentPrice: "Price a source shipment",
  pricePerKg: "Price per kg",
  pricePerKgMRU: "Price per kg in MRU (optional)",
  expectedVersion: "Expected shipment version",
  priceSaved: "Shipment price saved as a local draft for review.",
  priceAlreadyPending:
    "A price draft already exists for this shipment; duplicate blocked.",
  priceRequired: "Choose a shipment and enter a valid non-negative price.",
  noPriceableShipments: "No source shipments are available for pricing.",
};

const zh: OfficeFinanceCopy = {
  customerCredit: "客户存入款项",
  customerDebit: "向客户付款",
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
  withdrawals: "提取",
  retainedNet: "留存净额",
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
  costReference: "额外成本参考",
  costReferenceHint: "可选；仅输入手动参考。留空表示主要成本。",
  costReferenceManual: "手动参考（可选）",
  currencyMismatch: "请选择货件来源币种。",
  permissionDenied: "您无权记录此费用类型。",
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
  openingBalance: "期初余额（会计）",
  shipmentPrice: "运输价格",
  shipmentPriceHint: "由货件来源办公室的会计设置，不修改货物。",
  saveShipmentPrice: "保存价格",
  readOnlyFinance: "此页面仅供读取和监督；只有指定会计可在其办公室登记。",
  totalGross: "发货总值",
  sold: "发票已售",
  remaining: "未售剩余",
  unpriced: "未定价",
  cashBalance: "现金余额",
  availableProfitWithdrawal: "可提取利润",
  availableProfitWithdrawalHint:
    "取实际现金与账面留存净额的较小值；这不是经审计的法律利润。",
  profitWithdrawal: "利润提取",
  profitWithdrawalHint: "用于审核的本地提取草稿。服务器确认前不会改变正式余额。",
  withdrawalReason: "提取原因",
  saveWithdrawal: "保存提取草稿",
  withdrawalSaved: "利润提取草稿已保存在本地；未创建已登记账目。",
  withdrawalRequired: "请输入日期和提取原因。",
  withdrawalInvalidAmount: "请输入最多两位小数的正数金额。",
  withdrawalAlreadyPending: "该办公室和币种已有待处理的提取草稿。",
  withdrawalExceedsAvailable: "提取金额不能超过实际现金和账面留存净额。",
  withdrawalUnavailable: "当前财务范围不支持利润提取。",
  withdrawalNotPosted: "需要联网、最新数据和实际管理权限；保存仅创建草稿。",
  sourceReceivables: "按货件的来源地应收款",
  sourceReceivablesHint:
    "来自来源办公室并使用来源币种；开具发票时会减少未售价值，债务仍属于客户债务。不自动换算为 MRU。",
  noSourceReceivables: "此范围没有来源地应收款。",
  addOpeningBalance: "添加期初余额",
  openingOnceHint: "会计每个办公室和币种只登记一次期初余额；禁止重放或替换。",
  openingDirection: "余额方向",
  debit: "借方",
  credit: "贷方",
  note: "备注",
  saveOpening: "保存期初余额",
  openingSaved: "期初余额已保存为本地草稿以供审核。",
  openingAlreadyExists: "该币种已有期初余额；已阻止重复。",
  openingRequired: "请输入办公室、币种、方向、日期、金额和备注。",
  setShipmentPrice: "设置来源货件价格",
  pricePerKg: "每公斤价格",
  pricePerKgMRU: "MRU 每公斤价格（可选）",
  expectedVersion: "货件预期版本",
  priceSaved: "货件价格已保存为本地草稿以供审核。",
  priceAlreadyPending: "该货件已有待处理价格草稿；已阻止重复。",
  priceRequired: "请选择货件并输入有效的非负价格。",
  noPriceableShipments: "没有可定价的来源货件。",
};

const tr: OfficeFinanceCopy = {
  customerCredit: "Müşteri yatırımı",
  customerDebit: "Müşteriye ödeme",
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
  withdrawals: "Çekimler",
  retainedNet: "Elde tutulan net",
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
  costReference: "Ek maliyet referansı",
  costReferenceHint: "İsteğe bağlı; yalnızca manuel bir referans girin. Birincil maliyet için boş bırakın.",
  costReferenceManual: "Manuel referans (isteğe bağlı)",
  currencyMismatch: "Gönderinin kaynak para birimini seçin.",
  permissionDenied: "Bu gider türünü kaydetme yetkiniz yok.",
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
  openingBalance: "Açılış bakiyesi (muhasebe)",
  shipmentPrice: "Gönderi fiyatı",
  shipmentPriceHint:
    "Gönderinin kaynak ofisindeki muhasebeci belirler; malları değiştirmez.",
  saveShipmentPrice: "Fiyatı kaydet",
  readOnlyFinance:
    "Bu sayfa denetim için salt okunurdur; yalnızca atanmış muhasebeci kendi ofisinde kayıt yapabilir.",
  totalGross: "Brüt gönderi değeri",
  sold: "Faturalarda satılan",
  remaining: "Kalan satılmamış",
  unpriced: "Fiyatlandırılmamış",
  cashBalance: "Nakit bakiyesi",
  availableProfitWithdrawal: "Kullanılabilir kâr çekimi",
  availableProfitWithdrawalHint:
    "Gerçek nakit ile kayıtlı elde tutulan netin düşük olanı; denetlenmiş yasal kâr değildir.",
  profitWithdrawal: "Kâr çekimi",
  profitWithdrawalHint:
    "İnceleme için yerel çekim taslağı. Resmi bakiyeler yalnızca sunucu onayından sonra değişir.",
  withdrawalReason: "Çekim nedeni",
  saveWithdrawal: "Çekim taslağını kaydet",
  withdrawalSaved: "Kâr çekimi taslağı yerelde kaydedildi; yayınlanmış kayıt oluşturulmadı.",
  withdrawalRequired: "Tarih ve çekim nedeni girin.",
  withdrawalInvalidAmount: "En fazla iki ondalık basamaklı pozitif bir tutar girin.",
  withdrawalAlreadyPending: "Bu ofis ve para birimi için zaten bekleyen çekim taslağı var.",
  withdrawalExceedsAvailable: "Çekim gerçek nakit ve kayıtlı elde tutulan neti aşamaz.",
  withdrawalUnavailable: "Mevcut mali kapsamınızda kâr çekimi kullanılamıyor.",
  withdrawalNotPosted: "Çevrimiçi, güncel veri ve gerçek yönetme izni gerekir; kayıt yalnızca taslaktır.",
  sourceReceivables: "Gönderiye göre kaynak alacakları",
  sourceReceivablesHint:
    "Kaynak ofisten ve kaynak para biriminde gösterilir; fatura kesilince satılmamış değer azalır, borç müşteri borcu olarak kalır. MRU'ya otomatik dönüşüm yoktur.",
  noSourceReceivables: "Bu kapsamda kaynak alacağı yok.",
  addOpeningBalance: "Açılış bakiyesi ekle",
  openingOnceHint:
    "Muhasebeci ofis ve para birimi başına bir kez açılış bakiyesi kaydeder; tekrar ve değiştirme engellenir.",
  openingDirection: "Bakiye yönü",
  debit: "Borç",
  credit: "Alacak",
  note: "Not",
  saveOpening: "Açılış bakiyesini kaydet",
  openingSaved: "Açılış bakiyesi inceleme için yerel taslak olarak kaydedildi.",
  openingAlreadyExists:
    "Bu para birimi için açılış bakiyesi zaten var; tekrar engellendi.",
  openingRequired: "Ofis, para birimi, yön, tarih, tutar ve not girin.",
  setShipmentPrice: "Kaynak gönderisine fiyat ver",
  pricePerKg: "Kg başına fiyat",
  pricePerKgMRU: "MRU kg fiyatı (isteğe bağlı)",
  expectedVersion: "Beklenen gönderi sürümü",
  priceSaved: "Gönderi fiyatı inceleme için yerel taslak olarak kaydedildi.",
  priceAlreadyPending:
    "Bu gönderi için zaten bekleyen fiyat taslağı var; tekrar engellendi.",
  priceRequired: "Bir gönderi seçin ve geçerli, negatif olmayan fiyat girin.",
  noPriceableShipments: "Fiyatlandırılabilir kaynak gönderisi yok.",
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
