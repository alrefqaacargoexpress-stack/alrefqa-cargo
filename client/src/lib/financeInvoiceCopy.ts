import type { Language } from "@/lib/publicCopy";
import { searchableInvoiceGoods as sharedSearchableInvoiceGoods } from "@shared/finance";
import type { Invoice, Shipment } from "@shared/operations";

export type FinanceLanguage = "ar" | "en" | "zh" | "tr";
export type InvoicePaymentOption =
  | "on_account"
  | "shipping_fee"
  | "cash"
  | "wallet";

export type FinanceInvoiceCopy = {
  title: string;
  description: string;
  newInvoice: string;
  customer: string;
  searchCustomer: string;
  accountRequired: string;
  paymentMode: string;
  onAccount: string;
  shippingFee: string;
  cash: string;
  wallet: string;
  chargeKind: string;
  shipping: string;
  general: string;
  shipment: string;
  searchGoods: string;
  chooseGoods: string;
  selectedGoods: string;
  confirmGoods: string;
  goodsName: string;
  weight: string;
  pieces: string;
  noGoods: string;
  deletedOrBilled: string;
  currency: string;
  manualAmount: string;
  adjustment: string;
  increase: string;
  decrease: string;
  total: string;
  rateMissing: string;
  issuingOffice: string;
  financialOffice: string;
  employeeOffice: string;
  employeeOfficeHelp: string;
  knownHomeOffice: string;
  officeRequired: string;
  walletMethod: string;
  reference: string;
  saveDraft: string;
  saving: string;
  saveError: string;
  savedOffline: string;
  noPermission: string;
  loading: string;
  invoiceId: string;
  status: string;
  debt: string;
  paid: string;
  waiting: string;
  office: string;
  payment: string;
  actor: string;
  draft: string;
  shared: string;
  partialSettlement: string;
  amount: string;
  remaining: string;
  readonly: string;
  oldInvoice: string;
  noInvoices: string;
  syncPending: string;
  conflict: string;
  currencyHelp: string;
  chooseAccount: string;
  noCustomers: string;
  invalidTotal: string;
  selectedGoodsRequired: string;
  paymentReference: string;
};

const base: FinanceInvoiceCopy = {
  title: "",
  description: "",
  newInvoice: "",
  customer: "",
  searchCustomer: "",
  accountRequired: "",
  paymentMode: "",
  onAccount: "",
  shippingFee: "",
  cash: "",
  wallet: "",
  chargeKind: "",
  shipping: "",
  general: "",
  shipment: "",
  searchGoods: "",
  chooseGoods: "",
  selectedGoods: "",
  confirmGoods: "",
  goodsName: "",
  weight: "",
  pieces: "",
  noGoods: "",
  deletedOrBilled: "",
  currency: "",
  manualAmount: "",
  adjustment: "",
  increase: "",
  decrease: "",
  total: "",
  rateMissing: "",
  issuingOffice: "",
  financialOffice: "",
  employeeOffice: "",
  employeeOfficeHelp: "",
  knownHomeOffice: "",
  officeRequired: "",
  walletMethod: "",
  reference: "",
  saveDraft: "",
  saving: "",
  saveError: "",
  savedOffline: "",
  noPermission: "",
  loading: "",
  invoiceId: "",
  status: "",
  debt: "",
  paid: "",
  waiting: "",
  office: "",
  payment: "",
  actor: "",
  draft: "",
  shared: "",
  partialSettlement: "",
  amount: "",
  remaining: "",
  readonly: "",
  oldInvoice: "",
  noInvoices: "",
  syncPending: "",
  conflict: "",
  currencyHelp: "",
  chooseAccount: "",
  noCustomers: "",
  invalidTotal: "",
  selectedGoodsRequired: "",
  paymentReference: "",
};

export const financeInvoiceCopy: Record<FinanceLanguage, FinanceInvoiceCopy> = {
  ar: {
    ...base,
    title: "الفواتير المالية",
    description: "إصدار ومراجعة الفواتير ضمن مكتبك المالي",
    newInvoice: "فاتورة جديدة",
    customer: "حساب العميل",
    searchCustomer: "ابحث بالاسم أو الهاتف",
    accountRequired: "اختر حساب عميل حقيقي للبيع الآجل",
    paymentMode: "طريقة السداد",
    onAccount: "بيع على الحساب (دين)",
    shippingFee: "رسوم الشحن",
    cash: "نقدي",
    wallet: "محفظة",
    chargeKind: "نوع الرسم",
    shipping: "من الشحنة",
    general: "مبلغ عام",
    shipment: "الشحنة",
    searchGoods: "ابحث باسم البضاعة أو وزنها",
    chooseGoods: "اختر البضائع",
    selectedGoods: "البضائع المؤكدة",
    confirmGoods: "أؤكد اختيار هذه البضاعة",
    goodsName: "البضاعة",
    weight: "الوزن",
    pieces: "القطع",
    noGoods: "لا توجد بضاعة متاحة",
    deletedOrBilled: "استُبعدت المحذوفة والمفوترة سابقًا",
    currency: "العملة",
    manualAmount: "المبلغ",
    adjustment: "تصحيح صغير",
    increase: "زيادة +",
    decrease: "إنقاص −",
    total: "الإجمالي",
    rateMissing:
      "لا يوجد سعر شحن بهذه العملة. اطلب من المدير إضافة السعر؛ لن يتم التحويل تلقائيًا.",
    issuingOffice: "مكتب الإصدار",
    financialOffice: "المكتب المالي",
    employeeOffice: "مكتب الموظف",
    employeeOfficeHelp:
      "اختر مكتبًا صريحًا للموظف غير المصنف أو متعدد المكاتب.",
    knownHomeOffice: "مكتبك الأساسي المعروف",
    officeRequired: "اختر مكتبًا ماليًا",
    walletMethod: "طريقة المحفظة",
    reference: "مرجع السداد (اختياري)",
    saveDraft: "حفظ المسودة",
    saving: "جارٍ الحفظ…",
    saveError: "تعذر حفظ المسودة؛ بقيت البيانات كما هي.",
    savedOffline: "حُفظت المسودة محليًا وستبقى حتى المزامنة الصريحة.",
    noPermission: "الوصول المالي متاح للمدير والمحاسب فقط.",
    loading: "جارٍ تحميل البيانات المالية…",
    invoiceId: "رقم الفاتورة",
    status: "الحالة",
    debt: "دين",
    paid: "مدفوعة",
    waiting: "بانتظار الدفع",
    office: "المكتب",
    payment: "السداد",
    actor: "سجلها",
    draft: "مسودة محلية",
    shared: "مؤكدة على الخادم",
    partialSettlement: "تسجيل سداد",
    amount: "المبلغ",
    remaining: "المتبقي",
    readonly: "للقراءة فقط",
    oldInvoice: "فاتورة قديمة",
    noInvoices: "لا توجد فواتير مؤكدة",
    syncPending: "تنتظر المزامنة",
    conflict: "تعارض: راجع المسودة ولم تُحذف",
    currencyHelp: "الأسعار تعرض بالعملة المصدر أو MRU فقط؛ لا تحويل تلقائي.",
    chooseAccount: "اختر حسابًا",
    noCustomers: "لا يوجد حساب مطابق",
    invalidTotal: "لا يمكن أن يكون الإجمالي سالبًا",
    selectedGoodsRequired: "أكد اختيار بضاعة واحدة على الأقل",
    paymentReference: "مرجع",
  },
  en: {
    ...base,
    title: "Finance invoices",
    description: "Issue and review invoices within your financial scope",
    newInvoice: "New invoice",
    customer: "Customer account",
    searchCustomer: "Search by name or phone",
    accountRequired: "Choose a real customer account for on-account sales",
    paymentMode: "Payment method",
    onAccount: "On account (debt)",
    shippingFee: "Shipping fee",
    cash: "Cash",
    wallet: "Wallet",
    chargeKind: "Charge kind",
    shipping: "From shipment",
    general: "General amount",
    shipment: "Shipment",
    searchGoods: "Search goods by name or weight",
    chooseGoods: "Choose goods",
    selectedGoods: "Confirmed goods",
    confirmGoods: "I confirm this goods selection",
    goodsName: "Goods",
    weight: "Weight",
    pieces: "Pieces",
    noGoods: "No available goods",
    deletedOrBilled: "Deleted and already billed goods are excluded",
    currency: "Currency",
    manualAmount: "Amount",
    adjustment: "Small adjustment",
    increase: "Increase +",
    decrease: "Decrease −",
    total: "Total",
    rateMissing:
      "No shipping rate exists in this currency. Ask an administrator; no conversion is applied.",
    issuingOffice: "Issuing office",
    financialOffice: "Financial office",
    employeeOffice: "Employee office",
    employeeOfficeHelp:
      "Choose explicitly for an unclassified or multi-office employee.",
    knownHomeOffice: "Known home office",
    officeRequired: "Choose a financial office",
    walletMethod: "Wallet method",
    reference: "Payment reference (optional)",
    saveDraft: "Save draft",
    saving: "Saving…",
    saveError: "Could not save the draft; your input is preserved.",
    savedOffline: "Draft saved locally and will remain until explicit sync.",
    noPermission: "Finance access is limited to admins and accountants.",
    loading: "Loading financial data…",
    invoiceId: "Invoice",
    status: "Status",
    debt: "Debt",
    paid: "Paid",
    waiting: "Awaiting payment",
    office: "Office",
    payment: "Payment",
    actor: "Recorded by",
    draft: "Local draft",
    shared: "Server-confirmed",
    partialSettlement: "Record payment",
    amount: "Amount",
    remaining: "Remaining",
    readonly: "Read only",
    oldInvoice: "Legacy invoice",
    noInvoices: "No confirmed invoices",
    syncPending: "Awaiting sync",
    conflict: "Conflict: review; draft was retained",
    currencyHelp:
      "Rates are shown in source currency or MRU only; no automatic conversion.",
    chooseAccount: "Choose an account",
    noCustomers: "No matching account",
    invalidTotal: "Total cannot be negative",
    selectedGoodsRequired: "Confirm at least one goods item",
    paymentReference: "Reference",
  },
  zh: {
    ...base,
    title: "财务发票",
    description: "在授权财务范围内开具和审核发票",
    newInvoice: "新发票",
    customer: "客户账户",
    searchCustomer: "按姓名或电话搜索",
    accountRequired: "赊账销售必须选择真实客户账户",
    paymentMode: "付款方式",
    onAccount: "赊账（债务）",
    shippingFee: "运费",
    cash: "现金",
    wallet: "钱包",
    chargeKind: "收费类型",
    shipping: "来自货运",
    general: "一般金额",
    shipment: "货运",
    searchGoods: "按名称或重量搜索商品",
    chooseGoods: "选择商品",
    selectedGoods: "已确认商品",
    confirmGoods: "我确认这些商品",
    goodsName: "商品",
    weight: "重量",
    pieces: "件数",
    noGoods: "没有可用商品",
    deletedOrBilled: "已删除或已开票商品已排除",
    currency: "货币",
    manualAmount: "金额",
    adjustment: "小额调整",
    increase: "增加 +",
    decrease: "减少 −",
    total: "总计",
    rateMissing: "该货币没有运费率。请联系管理员；不会自动换算。",
    issuingOffice: "开票办公室",
    financialOffice: "财务办公室",
    employeeOffice: "员工办公室",
    employeeOfficeHelp: "未分类或多办公室员工必须明确选择。",
    knownHomeOffice: "已知主办公室",
    officeRequired: "选择财务办公室",
    walletMethod: "钱包方式",
    reference: "付款参考（可选）",
    saveDraft: "保存草稿",
    saving: "保存中…",
    saveError: "无法保存草稿；输入已保留。",
    savedOffline: "草稿已本地保存，直到明确同步。",
    noPermission: "只有管理员和会计可访问财务。",
    loading: "正在加载财务数据…",
    invoiceId: "发票",
    status: "状态",
    debt: "债务",
    paid: "已付款",
    waiting: "等待付款",
    office: "办公室",
    payment: "付款",
    actor: "记录人",
    draft: "本地草稿",
    shared: "服务器已确认",
    partialSettlement: "记录付款",
    amount: "金额",
    remaining: "剩余",
    readonly: "只读",
    oldInvoice: "旧发票",
    noInvoices: "没有已确认发票",
    syncPending: "等待同步",
    conflict: "冲突：请审核；草稿已保留",
    currencyHelp: "价格仅显示源货币或 MRU；不自动换算。",
    chooseAccount: "选择账户",
    noCustomers: "没有匹配账户",
    invalidTotal: "总额不能为负",
    selectedGoodsRequired: "请确认至少一件商品",
    paymentReference: "参考",
  },
  tr: {
    ...base,
    title: "Finans faturaları",
    description: "Yetkili mali kapsamınızda fatura düzenleyin ve inceleyin",
    newInvoice: "Yeni fatura",
    customer: "Müşteri hesabı",
    searchCustomer: "Ad veya telefonla ara",
    accountRequired: "Vadeli satış için gerçek müşteri hesabı seçin",
    paymentMode: "Ödeme yöntemi",
    onAccount: "Vadeli (borç)",
    shippingFee: "Gönderi ücreti",
    cash: "Nakit",
    wallet: "Cüzdan",
    chargeKind: "Ücret türü",
    shipping: "Gönderiden",
    general: "Genel tutar",
    shipment: "Gönderi",
    searchGoods: "Ürünü ad veya ağırlıkla ara",
    chooseGoods: "Ürün seç",
    selectedGoods: "Onaylanan ürünler",
    confirmGoods: "Bu ürün seçimini onaylıyorum",
    goodsName: "Ürün",
    weight: "Ağırlık",
    pieces: "Adet",
    noGoods: "Kullanılabilir ürün yok",
    deletedOrBilled: "Silinen ve daha önce faturalandırılanlar hariç",
    currency: "Para birimi",
    manualAmount: "Tutar",
    adjustment: "Küçük düzeltme",
    increase: "Artır +",
    decrease: "Azalt −",
    total: "Toplam",
    rateMissing:
      "Bu para biriminde gönderi ücreti yok. Yöneticiye başvurun; otomatik dönüşüm yok.",
    issuingOffice: "Düzenleyen ofis",
    financialOffice: "Mali ofis",
    employeeOffice: "Çalışan ofisi",
    employeeOfficeHelp:
      "Sınıflandırılmamış veya çok ofisli çalışan açıkça seçmelidir.",
    knownHomeOffice: "Bilinen ana ofis",
    officeRequired: "Mali ofis seçin",
    walletMethod: "Cüzdan yöntemi",
    reference: "Ödeme referansı (isteğe bağlı)",
    saveDraft: "Taslağı kaydet",
    saving: "Kaydediliyor…",
    saveError: "Taslak kaydedilemedi; giriş korunuyor.",
    savedOffline:
      "Taslak yerel olarak kaydedildi; açık senkronizasyona kadar korunur.",
    noPermission: "Finansa yalnızca yöneticiler ve muhasebeciler erişebilir.",
    loading: "Mali veriler yükleniyor…",
    invoiceId: "Fatura",
    status: "Durum",
    debt: "Borç",
    paid: "Ödendi",
    waiting: "Ödeme bekliyor",
    office: "Ofis",
    payment: "Ödeme",
    actor: "Kaydeden",
    draft: "Yerel taslak",
    shared: "Sunucu onaylı",
    partialSettlement: "Ödeme kaydet",
    amount: "Tutar",
    remaining: "Kalan",
    readonly: "Salt okunur",
    oldInvoice: "Eski fatura",
    noInvoices: "Onaylı fatura yok",
    syncPending: "Senkronizasyon bekliyor",
    conflict: "Çakışma: inceleyin; taslak korundu",
    currencyHelp:
      "Fiyatlar kaynak para birimi veya MRU ile gösterilir; otomatik dönüşüm yok.",
    chooseAccount: "Hesap seçin",
    noCustomers: "Eşleşen hesap yok",
    invalidTotal: "Toplam negatif olamaz",
    selectedGoodsRequired: "En az bir ürün onaylayın",
    paymentReference: "Referans",
  },
};

export function invoiceCopyFor(language: Language): FinanceInvoiceCopy {
  return (
    financeInvoiceCopy[language as FinanceLanguage] ?? financeInvoiceCopy.en
  );
}

export function invoicePaymentOptions(copy: FinanceInvoiceCopy) {
  return [
    ["on_account", copy.onAccount],
    ["shipping_fee", copy.shippingFee],
    ["cash", copy.cash],
    ["wallet", copy.wallet],
  ] as const;
}

export function searchableInvoiceGoods(
  shipments: readonly Shipment[],
  query = "",
  invoices: readonly Invoice[] = []
) {
  const billed = new Set(
    invoices.flatMap(
      invoice => invoice.finance?.goods?.map(goods => goods.goodsId) ?? []
    )
  );
  return sharedSearchableInvoiceGoods(shipments, query).filter(
    goods => !billed.has(goods.goodsId)
  );
}

export function adjustmentTotal(
  baseAmount: number,
  direction: "increase" | "decrease",
  amount: number
) {
  const cents =
    Math.round(baseAmount * 100) +
    (direction === "increase" ? 1 : -1) * Math.round(amount * 100);
  return cents < 0 ? 0 : cents / 100;
}

export function money(value: number, currency: string) {
  return (
    new Intl.NumberFormat("en", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(value) + ` ${currency}`
  );
}
