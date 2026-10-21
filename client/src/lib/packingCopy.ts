import { useLanguage } from "@/contexts/LanguageContext";
import type { Language } from "@/lib/publicCopy";

export type PackingLanguage = "ar" | "en" | "zh" | "tr";

export interface PackingCopy extends Record<string, string> {
  title: string;
  shipments: string;
  newShipment: string;
  shipmentNumber: string;
  source: string;
  pricePerKg: string;
  dubai: string;
  turkey: string;
  china: string;
  createShipment: string;
  carton: string;
  openCarton: string;
  closedCarton: string;
  name: string;
  nameOrBrand: string;
  phone: string;
  optional: string;
  unitWeight: string;
  pieces: string;
  addGoods: string;
  closeCarton: string;
  totalPieces: string;
  totalWeight: string;
  totalCost: string;
  customerSummary: string;
  saveStatus: string;
  local: string;
  pending: string;
  shared: string;
  open: string;
  inTransit: string;
  delivered: string;
  sendShipment: string;
  markDelivered: string;
  customers: string;
  reports: string;
  operations: string;
  search: string;
  noResults: string;
  noShipments: string;
  noGoods: string;
  loading: string;
  login: string;
  loginRequired: string;
  noAccess: string;
  retry: string;
  offline: string;
  online: string;
  sync: string;
  reviewSync: string;
  localHint: string;
  sharedHint: string;
  rateRestricted: string;
  legacyShipment: string;
  returnToList: string;
  error: string;
  invalidTracking: string;
  invalidWeight: string;
  invalidPieces: string;
  cartonEmpty: string;
  conflicts: string;
  useServer: string;
  keepLocal: string;
  confirmDelivered: string;
  confirmSend: string;
  description: string;
  chooseSource: string;
  priceHelp: string;
  createHelp: string;
  created: string;
  shipmentDetails: string;
  goodsName: string;
  phoneOptional: string;
  weightKg: string;
  add: string;
  close: string;
  sourceCurrency: string;
  sourceInfo: string;
  empty: string;
  status: string;
  route: string;
  currentCarton: string;
  cartonNumber: string;
  cartons: string;
  total: string;
  amountHidden: string;
  readOnly: string;
  accessStorage: string;
  openLocal: string;
  noSession: string;
  snapshotError: string;
  retrySnapshot: string;
  pendingChanges: string;
  syncSuccess: string;
  syncNoSuccess: string;
  applied: string;
  queued: string;
  onlinePending: string;
  localOnly: string;
  canNotEdit: string;
  legacySummary: string;
  viewOperations: string;
  noPermission: string;
  saveError: string;
  all: string;
  sharedOnly: string;
  scopeFilter: string;
  counts: string;
  today: string;
  totalShipments: string;
  unknownDate: string;
  clientPhone: string;
  accountLink: string;
}

const common: PackingCopy = {
  title: "",
  shipments: "",
  newShipment: "",
  shipmentNumber: "",
  source: "",
  pricePerKg: "",
  dubai: "",
  turkey: "",
  china: "",
  createShipment: "",
  carton: "",
  openCarton: "",
  closedCarton: "",
  name: "",
  nameOrBrand: "",
  phone: "",
  optional: "",
  unitWeight: "",
  pieces: "",
  addGoods: "",
  closeCarton: "",
  totalPieces: "",
  totalWeight: "",
  totalCost: "",
  customerSummary: "",
  saveStatus: "",
  local: "",
  pending: "",
  shared: "",
  open: "",
  inTransit: "",
  delivered: "",
  sendShipment: "",
  markDelivered: "",
  customers: "",
  reports: "",
  operations: "",
  search: "",
  noResults: "",
  noShipments: "",
  noGoods: "",
  loading: "",
  login: "",
  loginRequired: "",
  noAccess: "",
  retry: "",
  offline: "",
  online: "",
  sync: "",
  reviewSync: "",
  localHint: "",
  sharedHint: "",
  rateRestricted: "",
  legacyShipment: "",
  returnToList: "",
  error: "",
  invalidTracking: "",
  invalidWeight: "",
  invalidPieces: "",
  cartonEmpty: "",
  conflicts: "",
  useServer: "",
  keepLocal: "",
  confirmDelivered: "",
  confirmSend: "",
  description: "",
  chooseSource: "",
  priceHelp: "",
  createHelp: "",
  created: "",
  shipmentDetails: "",
  goodsName: "",
  phoneOptional: "",
  weightKg: "",
  add: "",
  close: "",
  sourceCurrency: "",
  sourceInfo: "",
  empty: "",
  status: "",
  route: "",
  currentCarton: "",
  cartonNumber: "",
  cartons: "",
  total: "",
  amountHidden: "",
  readOnly: "",
  accessStorage: "",
  openLocal: "",
  noSession: "",
  snapshotError: "",
  retrySnapshot: "",
  pendingChanges: "",
  syncSuccess: "",
  syncNoSuccess: "",
  applied: "",
  queued: "",
  onlinePending: "",
  localOnly: "",
  canNotEdit: "",
  legacySummary: "",
  viewOperations: "",
  noPermission: "",
  saveError: "",
  all: "",
  sharedOnly: "",
  scopeFilter: "",
  counts: "",
  today: "",
  totalShipments: "",
  unknownDate: "",
  clientPhone: "",
  accountLink: "",
};

export const packingCopy: Record<PackingLanguage, PackingCopy> = {
  ar: {
    ...common,
    title: "تجميع الشحنات",
    shipments: "الشحنات",
    newShipment: "شحنة تجميع جديدة",
    shipmentNumber: "رقم الشحنة",
    source: "المصدر",
    pricePerKg: "السعر لكل كغ",
    dubai: "دبي",
    turkey: "تركيا",
    china: "الصين",
    createShipment: "إنشاء الشحنة",
    carton: "الكرتون",
    openCarton: "مفتوح",
    closedCarton: "مغلق",
    name: "الاسم",
    nameOrBrand: "اسم العميل أو العلامة",
    phone: "الهاتف",
    optional: "اختياري",
    unitWeight: "وزن الوحدة بالكيلو",
    pieces: "القطع",
    addGoods: "إضافة البضاعة",
    closeCarton: "إغلاق الكرتون وفتح التالي",
    totalPieces: "إجمالي القطع",
    totalWeight: "إجمالي الوزن",
    totalCost: "الإجمالي",
    customerSummary: "ملخص العملاء",
    saveStatus: "حالة الحفظ",
    local: "محلية",
    pending: "بانتظار المزامنة",
    shared: "مشتركة",
    open: "قيد التجهيز",
    inTransit: "في الطريق",
    delivered: "مسلّمة",
    sendShipment: "إرسال الشحنة",
    markDelivered: "تسجيل التسليم",
    customers: "العملاء",
    reports: "التقارير",
    operations: "العمليات",
    search: "بحث",
    noResults: "لا توجد نتائج مطابقة",
    noShipments: "لا توجد شحنات تجميع بعد",
    noGoods: "لم تُضف بضاعة إلى هذا الكرتون",
    loading: "جارٍ التحميل…",
    login: "تسجيل الدخول",
    loginRequired: "يلزم تسجيل الدخول للوصول إلى هذه المساحة",
    noAccess: "لا تملك صلاحية الوصول",
    retry: "إعادة المحاولة",
    offline: "دون اتصال",
    online: "متصل",
    sync: "مزامنة التغييرات",
    reviewSync: "مراجعة التغييرات",
    localHint: "هذه المسودة محفوظة محليًا لهذا المستخدم.",
    sharedHint: "هذه البيانات المشتركة من مساحة العمل.",
    rateRestricted:
      "لا يمكن لدورك تحديد السعر؛ سيُحفظ السعر 0 وتُعرض القيم المالية فقط لصاحب الصلاحية.",
    legacyShipment: "شحنة قديمة غير مسجلة كتجميع",
    returnToList: "العودة إلى قائمة الشحنات",
    error: "حدث خطأ",
    invalidTracking: "أدخل رقم شحنة صالحًا",
    invalidWeight: "أدخل وزنًا موجبًا حتى 3 منازل عشرية",
    invalidPieces: "أدخل عدد قطع صحيحًا موجبًا",
    cartonEmpty: "أضف بضاعة قبل إغلاق الكرتون",
    conflicts: "تعارضات تحتاج قرارًا",
    useServer: "استخدام نسخة الخادم",
    keepLocal: "الإبقاء على المحلي",
    confirmDelivered: "هل تؤكد تسجيل الشحنة كمسلّمة؟",
    confirmSend: "هل تؤكد إرسال الشحنة؟",
    description: "أنشئ رقمًا ومصدرًا وسعر الكيلو ثم أضف البضاعة داخل الكراتين.",
    chooseSource: "اختر مصدر الشحنة",
    priceHelp: "العملة تتبع المصدر: AED أو TRY أو CNY.",
    createHelp:
      "يمكنك العودة إلى الشحنة لاحقًا؛ الحفظ يستخدم مساحة العمل الفعلية.",
    created: "تم حفظ الشحنة محليًا",
    shipmentDetails: "تفاصيل الشحنة",
    goodsName: "اسم البضاعة أو العلامة",
    phoneOptional: "الهاتف (اختياري)",
    weightKg: "وزن الوحدة بالكيلو",
    add: "إضافة",
    close: "إغلاق",
    sourceCurrency: "العملة",
    sourceInfo: "المبلغ = الوزن بالكيلو × السعر.",
    empty: "فارغ",
    status: "الحالة",
    route: "المسار",
    currentCarton: "الكرتون الحالي",
    cartonNumber: "رقم الكرتون",
    cartons: "الكراتين",
    total: "الإجمالي",
    amountHidden: "المبلغ مخفي حسب صلاحيتك",
    readOnly: "قراءة فقط",
    accessStorage: "تعذر الوصول إلى التخزين المحلي.",
    openLocal: "فتح المساحة المحلية",
    noSession: "لا توجد جلسة متاحة",
    snapshotError: "تعذر تحميل بيانات الخادم",
    retrySnapshot: "إعادة تحميل البيانات",
    pendingChanges: "تغييرات معلقة",
    syncSuccess: "تمت مزامنة التغييرات المقبولة",
    syncNoSuccess:
      "لم تُقبل أي تغييرات؛ راجع الإيصال قبل اعتبار المزامنة ناجحة.",
    applied: "مطبقة",
    queued: "معلقة",
    onlinePending: "متصل — تغييرات تنتظر المراجعة",
    localOnly: "محلي فقط",
    canNotEdit: "لا تملك صلاحية تعديل الشحنات",
    legacySummary: "ملخص قديم للقراءة فقط",
    viewOperations: "عرضها في العمليات",
    noPermission: "لا توجد صلاحية كافية",
    saveError: "تعذر حفظ التغيير",
    all: "الكل",
    sharedOnly: "المشتركة فقط",
    scopeFilter: "نطاق البيانات",
    counts: "الإحصاءات من البيانات الحالية",
    today: "اليوم",
    totalShipments: "إجمالي الشحنات",
    unknownDate: "تاريخ غير معروف",
    clientPhone: "هاتف العميل",
    accountLink: "رابط الحساب",
  },
  en: {
    ...common,
    title: "Packing hub",
    shipments: "Shipments",
    newShipment: "New packing shipment",
    shipmentNumber: "Shipment number",
    source: "Source",
    pricePerKg: "Price per kg",
    dubai: "Dubai",
    turkey: "Turkey",
    china: "China",
    createShipment: "Create shipment",
    carton: "Carton",
    openCarton: "Open",
    closedCarton: "Closed",
    name: "Name",
    nameOrBrand: "Customer or brand name",
    phone: "Phone",
    optional: "Optional",
    unitWeight: "Unit weight (kg)",
    pieces: "Pieces",
    addGoods: "Add goods",
    closeCarton: "Close carton and open next",
    totalPieces: "Total pieces",
    totalWeight: "Total weight",
    totalCost: "Total cost",
    customerSummary: "Customer summary",
    saveStatus: "Save status",
    local: "Local",
    pending: "Pending sync",
    shared: "Shared",
    open: "Packing",
    inTransit: "In transit",
    delivered: "Delivered",
    sendShipment: "Send shipment",
    markDelivered: "Mark delivered",
    customers: "Customers",
    reports: "Reports",
    operations: "Operations",
    search: "Search",
    noResults: "No matching results",
    noShipments: "No packing shipments yet",
    noGoods: "No goods in this carton",
    loading: "Loading…",
    login: "Sign in",
    loginRequired: "Sign in is required for this workspace",
    noAccess: "You do not have access",
    retry: "Retry",
    offline: "Offline",
    online: "Online",
    sync: "Sync changes",
    reviewSync: "Review changes",
    localHint: "This draft is saved locally for this user.",
    sharedHint: "This data is shared from the workspace.",
    rateRestricted:
      "Your role cannot set the rate; the saved rate is 0 and finance values are shown only to authorized roles.",
    legacyShipment: "Legacy shipment not recorded as packing",
    returnToList: "Back to shipments",
    error: "Something went wrong",
    invalidTracking: "Enter a valid shipment number",
    invalidWeight: "Enter a positive weight with up to 3 decimals",
    invalidPieces: "Enter a positive whole number of pieces",
    cartonEmpty: "Add goods before closing the carton",
    conflicts: "Conflicts need a decision",
    useServer: "Use server version",
    keepLocal: "Keep local",
    confirmDelivered: "Confirm this shipment as delivered?",
    confirmSend: "Confirm sending this shipment?",
    description:
      "Create a number, source and rate, then add goods inside cartons.",
    chooseSource: "Choose shipment source",
    priceHelp: "Currency follows the source: AED, TRY or CNY.",
    createHelp: "Return to this shipment later; saves use the real workspace.",
    created: "Shipment saved locally",
    shipmentDetails: "Shipment details",
    goodsName: "Goods or brand name",
    phoneOptional: "Phone (optional)",
    weightKg: "Unit weight (kg)",
    add: "Add",
    close: "Close",
    sourceCurrency: "Currency",
    sourceInfo: "Amount = kilograms × rate.",
    empty: "Empty",
    status: "Status",
    route: "Route",
    currentCarton: "Current carton",
    cartonNumber: "Carton number",
    cartons: "Cartons",
    total: "Total",
    amountHidden: "Amount hidden for your role",
    readOnly: "Read only",
    accessStorage: "Local storage is unavailable.",
    openLocal: "Open local workspace",
    noSession: "No active session",
    snapshotError: "Could not load server data",
    retrySnapshot: "Reload data",
    pendingChanges: "Pending changes",
    syncSuccess: "Accepted changes were synchronized",
    syncNoSuccess:
      "No changes were accepted; review the receipt before treating sync as successful.",
    applied: "applied",
    queued: "queued",
    onlinePending: "Online — changes await review",
    localOnly: "Local only",
    canNotEdit: "You cannot edit shipments",
    legacySummary: "Read-only legacy summary",
    viewOperations: "View in Operations",
    noPermission: "Insufficient permission",
    saveError: "Could not save the change",
    all: "All",
    sharedOnly: "Shared only",
    scopeFilter: "Data scope",
    counts: "Statistics use current data",
    today: "Today",
    totalShipments: "Total shipments",
    unknownDate: "Unknown date",
    clientPhone: "Customer phone",
    accountLink: "Account link",
  },
  zh: {
    ...common,
    title: "打包中心",
    shipments: "货运",
    newShipment: "新建打包货运",
    shipmentNumber: "货运编号",
    source: "来源",
    pricePerKg: "每公斤价格",
    dubai: "迪拜",
    turkey: "土耳其",
    china: "中国",
    createShipment: "创建货运",
    carton: "纸箱",
    openCarton: "打开",
    closedCarton: "已关闭",
    name: "姓名",
    nameOrBrand: "客户或品牌名称",
    phone: "电话",
    optional: "可选",
    unitWeight: "单位重量（公斤）",
    pieces: "件数",
    addGoods: "添加货物",
    closeCarton: "关闭纸箱并打开下一个",
    totalPieces: "总件数",
    totalWeight: "总重量",
    totalCost: "总金额",
    customerSummary: "客户摘要",
    saveStatus: "保存状态",
    local: "本地",
    pending: "待同步",
    shared: "共享",
    open: "打包中",
    inTransit: "运输中",
    delivered: "已交付",
    sendShipment: "发送货运",
    markDelivered: "标记已交付",
    customers: "客户",
    reports: "报告",
    operations: "运营",
    search: "搜索",
    noResults: "没有匹配结果",
    noShipments: "暂无打包货运",
    noGoods: "此纸箱暂无货物",
    loading: "加载中…",
    login: "登录",
    loginRequired: "需要登录访问此工作区",
    noAccess: "无权访问",
    retry: "重试",
    offline: "离线",
    online: "在线",
    sync: "同步更改",
    reviewSync: "审核更改",
    localHint: "此草稿已为当前用户保存在本地。",
    sharedHint: "此数据来自共享工作区。",
    rateRestricted:
      "您的角色不能设置费率；保存费率为 0，财务数值仅向授权角色显示。",
    legacyShipment: "未记录为打包的旧货运",
    returnToList: "返回货运列表",
    error: "发生错误",
    invalidTracking: "请输入有效的货运编号",
    invalidWeight: "请输入正数重量（最多三位小数）",
    invalidPieces: "请输入正整数件数",
    cartonEmpty: "关闭纸箱前请添加货物",
    conflicts: "冲突需要处理",
    useServer: "使用服务器版本",
    keepLocal: "保留本地版本",
    confirmDelivered: "确认将此货运标记为已交付？",
    confirmSend: "确认发送此货运？",
    description: "创建编号、来源和费率，然后在纸箱中添加货物。",
    chooseSource: "选择货运来源",
    priceHelp: "货币随来源变化：AED、TRY 或 CNY。",
    createHelp: "之后仍可返回货运；保存使用实际工作区。",
    created: "货运已保存在本地",
    shipmentDetails: "货运详情",
    goodsName: "货物或品牌名称",
    phoneOptional: "电话（可选）",
    weightKg: "单位重量（公斤）",
    add: "添加",
    close: "关闭",
    sourceCurrency: "货币",
    sourceInfo: "金额 = 公斤 × 费率。",
    empty: "空",
    status: "状态",
    route: "路线",
    currentCarton: "当前纸箱",
    cartonNumber: "纸箱编号",
    cartons: "纸箱",
    total: "总计",
    amountHidden: "金额受权限限制",
    readOnly: "只读",
    accessStorage: "本地存储不可用。",
    openLocal: "打开本地工作区",
    noSession: "没有活动会话",
    snapshotError: "无法加载服务器数据",
    retrySnapshot: "重新加载数据",
    pendingChanges: "待处理更改",
    syncSuccess: "已同步接受的更改",
    syncNoSuccess: "没有更改被接受；查看回执后再判断同步成功。",
    applied: "已应用",
    queued: "排队中",
    onlinePending: "在线 — 更改等待审核",
    localOnly: "仅本地",
    canNotEdit: "您不能编辑货运",
    legacySummary: "只读旧摘要",
    viewOperations: "在运营中心查看",
    noPermission: "权限不足",
    saveError: "无法保存更改",
    all: "全部",
    sharedOnly: "仅共享",
    scopeFilter: "数据范围",
    counts: "统计使用当前数据",
    today: "今天",
    totalShipments: "货运总数",
    unknownDate: "日期未知",
    clientPhone: "客户电话",
    accountLink: "账户链接",
  },
  tr: {
    ...common,
    title: "Paketleme merkezi",
    shipments: "Gönderiler",
    newShipment: "Yeni paketleme gönderisi",
    shipmentNumber: "Gönderi numarası",
    source: "Kaynak",
    pricePerKg: "Kg başına fiyat",
    dubai: "Dubai",
    turkey: "Türkiye",
    china: "Çin",
    createShipment: "Gönderi oluştur",
    carton: "Koli",
    openCarton: "Açık",
    closedCarton: "Kapalı",
    name: "Ad",
    nameOrBrand: "Müşteri veya marka adı",
    phone: "Telefon",
    optional: "İsteğe bağlı",
    unitWeight: "Birim ağırlık (kg)",
    pieces: "Adet",
    addGoods: "Ürün ekle",
    closeCarton: "Koliyi kapat ve sonrakini aç",
    totalPieces: "Toplam adet",
    totalWeight: "Toplam ağırlık",
    totalCost: "Toplam tutar",
    customerSummary: "Müşteri özeti",
    saveStatus: "Kayıt durumu",
    local: "Yerel",
    pending: "Senkronizasyon bekliyor",
    shared: "Paylaşılan",
    open: "Paketleniyor",
    inTransit: "Yolda",
    delivered: "Teslim edildi",
    sendShipment: "Gönderiyi gönder",
    markDelivered: "Teslim edildi işaretle",
    customers: "Müşteriler",
    reports: "Raporlar",
    operations: "Operasyonlar",
    search: "Ara",
    noResults: "Eşleşen sonuç yok",
    noShipments: "Henüz paketleme gönderisi yok",
    noGoods: "Bu kolide ürün yok",
    loading: "Yükleniyor…",
    login: "Giriş yap",
    loginRequired: "Bu çalışma alanı için giriş gerekir",
    noAccess: "Erişim yetkiniz yok",
    retry: "Tekrar dene",
    offline: "Çevrimdışı",
    online: "Çevrimiçi",
    sync: "Değişiklikleri senkronize et",
    reviewSync: "Değişiklikleri incele",
    localHint: "Bu taslak bu kullanıcı için yerel kaydedildi.",
    sharedHint: "Bu veri paylaşılan çalışma alanından geliyor.",
    rateRestricted:
      "Rolünüz oran belirleyemez; kayıt oranı 0'dır ve finans değerleri yalnızca yetkili rollere gösterilir.",
    legacyShipment: "Paketleme olarak kaydedilmemiş eski gönderi",
    returnToList: "Gönderilere dön",
    error: "Bir hata oluştu",
    invalidTracking: "Geçerli bir gönderi numarası girin",
    invalidWeight: "En fazla 3 ondalıkla pozitif ağırlık girin",
    invalidPieces: "Pozitif tam adet girin",
    cartonEmpty: "Koliyi kapatmadan önce ürün ekleyin",
    conflicts: "Çakışmalar karar bekliyor",
    useServer: "Sunucu sürümünü kullan",
    keepLocal: "Yereli koru",
    confirmDelivered: "Bu gönderiyi teslim edildi olarak işaretle?",
    confirmSend: "Bu gönderiyi göndermek istediğinizi onaylıyor musunuz?",
    description:
      "Bir numara, kaynak ve oran oluşturun; sonra kolilere ürün ekleyin.",
    chooseSource: "Gönderi kaynağını seçin",
    priceHelp: "Para birimi kaynağa göre değişir: AED, TRY veya CNY.",
    createHelp:
      "Daha sonra gönderiye dönebilirsiniz; kayıt gerçek çalışma alanını kullanır.",
    created: "Gönderi yerel kaydedildi",
    shipmentDetails: "Gönderi ayrıntıları",
    goodsName: "Ürün veya marka adı",
    phoneOptional: "Telefon (isteğe bağlı)",
    weightKg: "Birim ağırlık (kg)",
    add: "Ekle",
    close: "Kapat",
    sourceCurrency: "Para birimi",
    sourceInfo: "Tutar = kilogram × oran.",
    empty: "Boş",
    status: "Durum",
    route: "Rota",
    currentCarton: "Geçerli koli",
    cartonNumber: "Koli numarası",
    cartons: "Koliler",
    total: "Toplam",
    amountHidden: "Tutar rolünüz için gizli",
    readOnly: "Salt okunur",
    accessStorage: "Yerel depolama kullanılamıyor.",
    openLocal: "Yerel çalışma alanını aç",
    noSession: "Etkin oturum yok",
    snapshotError: "Sunucu verileri yüklenemedi",
    retrySnapshot: "Verileri yeniden yükle",
    pendingChanges: "Bekleyen değişiklikler",
    syncSuccess: "Kabul edilen değişiklikler senkronize edildi",
    syncNoSuccess:
      "Hiçbir değişiklik kabul edilmedi; başarılı saymadan önce makbuzu inceleyin.",
    applied: "uygulandı",
    queued: "sırada",
    onlinePending: "Çevrimiçi — değişiklikler inceleme bekliyor",
    localOnly: "Yalnızca yerel",
    canNotEdit: "Gönderileri düzenleyemezsiniz",
    legacySummary: "Salt okunur eski özet",
    viewOperations: "Operasyonlarda görüntüle",
    noPermission: "Yetersiz izin",
    saveError: "Değişiklik kaydedilemedi",
    all: "Tümü",
    sharedOnly: "Yalnızca paylaşılan",
    scopeFilter: "Veri kapsamı",
    counts: "İstatistikler mevcut verileri kullanır",
    today: "Bugün",
    totalShipments: "Toplam gönderi",
    unknownDate: "Bilinmeyen tarih",
    clientPhone: "Müşteri telefonu",
    accountLink: "Hesap bağlantısı",
  },
};

export function copyFor(language: string): PackingCopy {
  return packingCopy[
    (language as PackingLanguage) in packingCopy
      ? (language as PackingLanguage)
      : "ar"
  ];
}

export function usePackingCopy(): PackingCopy {
  const { language } = useLanguage();
  return copyFor(language as Language);
}
