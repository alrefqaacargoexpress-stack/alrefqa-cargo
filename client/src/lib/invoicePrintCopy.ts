import type { FinanceLanguage } from "./financeInvoiceCopy";

const ar = {
  action: "طباعة / حفظ PDF",
  title: "معاينة الفاتورة",
  invoice: "فاتورة",
  print: "فتح الطباعة / حفظ PDF",
  help: "للحفظ كملف PDF اختر «حفظ بتنسيق PDF» من قائمة الطابعات، ثم احفظ الملف. للطباعة الورقية اختر طابعتك.",
  close: "إغلاق المعاينة",
  loading: "تجهيز الخطوط والمعاينة…",
  failed: "تعذر فتح الطباعة. حاول من متصفح الجهاز، ثم اختر حفظ PDF.",
  unavailable: "هذه الفاتورة غير متاحة للطباعة النهائية.",
  forbidden: "لا تملك صلاحية عرض فواتير هذا المكتب.",
  not_confirmed: "تتوفر الطباعة النهائية بعد اعتماد الفاتورة على الخادم.",
  pending_invoice:
    "إصدار هذه الفاتورة ما زال معلقًا؛ انتظر اعتماده قبل الطباعة.",
  missing_details:
    "الفاتورة القديمة لا تتضمن تفاصيل مالية وعملة موثقتين للطباعة.",
  invalid_amounts: "تحتاج القيم المالية لهذه الفاتورة إلى مراجعة قبل الطباعة.",
  total_mismatch:
    "الإجمالي المسجل لا يطابق تفاصيل الفاتورة. راجع المحاسب؛ لم نغير المبلغ الأصلي.",
  pendingPayment:
    "يوجد تحصيل محلي معلق. المبالغ أدناه لا تشمل إلا المدفوع المعتمد.",
  offline:
    "نسخة محلية من آخر حالة معتمدة؛ قد لا تتضمن تحديثات أحدث على الخادم.",
  lastRead: "آخر قراءة للبيانات",
  unknownRead: "وقت آخر قراءة غير متاح",
  date: "تاريخ الإصدار",
  paidAmount: "المدفوع المعتمد",
  carton: "الكرتون",
  kg: "كغ",
  version: "نسخة السجل",
  footer:
    "هذه نسخة من الفاتورة المسجلة. الطباعة أو حفظ PDF لا ينشئان تحصيلًا أو قيدًا جديدًا.",
  detailNote:
    "الأوزان والقطع حسب البنود المسجلة. المبالغ إجمالية؛ لا توجد أسعار بنود منفصلة محفوظة في هذه الفاتورة.",
  latestPayment: "آخر وسيلة سداد مسجلة",
};
type InvoicePrintCopy = { [Key in keyof typeof ar]: string };
export const invoicePrintCopy: Record<FinanceLanguage, InvoicePrintCopy> = {
  ar,
  en: {
    action: "Print / save PDF",
    title: "Invoice preview",
    invoice: "Invoice",
    print: "Open print / save PDF",
    help: "To save a PDF, choose ‘Save as PDF’ in the printer list, then save the file. For a paper copy, choose your printer.",
    close: "Close preview",
    loading: "Preparing fonts and preview…",
    failed:
      "Printing could not open. Try your device browser, then choose Save as PDF.",
    unavailable: "This invoice is unavailable for final printing.",
    forbidden: "You do not have invoice access for this office.",
    not_confirmed:
      "Final printing is available after the server confirms this invoice.",
    pending_invoice:
      "Invoice issuance is pending. Wait for confirmation before printing.",
    missing_details:
      "This legacy invoice has no documented financial details and currency for printing.",
    invalid_amounts: "The financial values require review before printing.",
    total_mismatch:
      "The recorded total differs from the invoice details. Ask your accountant; the original total was not changed.",
    pendingPayment:
      "A local payment is pending. Only confirmed payments are included below.",
    offline:
      "Local copy of the last confirmed state; newer server updates may not be included.",
    lastRead: "Data last read",
    unknownRead: "Last-read time unavailable",
    date: "Issued at",
    paidAmount: "Confirmed paid amount",
    carton: "Carton",
    kg: "kg",
    version: "Record version",
    footer:
      "Copy of the recorded invoice. Printing or saving a PDF does not create a payment or a new ledger entry.",
    detailNote:
      "Weights and pieces follow the recorded items. Charges are totals; separate item prices are not stored on this invoice.",
    latestPayment: "Last recorded payment method",
  },
  zh: {
    action: "打印 / 保存 PDF",
    title: "发票预览",
    invoice: "发票",
    print: "打开打印 / 保存 PDF",
    help: "要保存 PDF，请在打印机列表中选择“另存为 PDF”，然后保存。要打印纸质副本，请选择打印机。",
    close: "关闭预览",
    loading: "正在准备字体和预览…",
    failed: "无法打开打印。请使用设备浏览器并选择另存为 PDF。",
    unavailable: "此发票暂不能正式打印。",
    forbidden: "您无权查看此办公室的发票。",
    not_confirmed: "服务器确认此发票后才可正式打印。",
    pending_invoice: "开票仍在等待确认，请确认后打印。",
    missing_details: "此旧发票缺少可用于打印的财务明细和货币记录。",
    invalid_amounts: "打印前需审核此发票的财务数值。",
    total_mismatch: "记录总额与发票明细不符。请联系会计；原始金额未更改。",
    pendingPayment: "有一笔本地收款等待确认。下列金额仅包含已确认付款。",
    offline: "最近确认状态的本地副本，可能不包含服务器上的最新更新。",
    lastRead: "数据上次读取时间",
    unknownRead: "上次读取时间不可用",
    date: "开具时间",
    paidAmount: "已确认付款额",
    carton: "纸箱",
    kg: "公斤",
    version: "记录版本",
    footer: "已记录发票的副本。打印或保存 PDF 不会生成收款或新的账目。",
    detailNote: "重量和件数来自记录明细。金额为总额，此发票未保存各项单价。",
    latestPayment: "最近记录的付款方式",
  },
  tr: {
    action: "Yazdır / PDF kaydet",
    title: "Fatura önizlemesi",
    invoice: "Fatura",
    print: "Yazdırmayı aç / PDF kaydet",
    help: "PDF kaydetmek için yazıcı listesinden ‘PDF olarak kaydet’i seçin ve dosyayı kaydedin. Kağıt kopya için yazıcınızı seçin.",
    close: "Önizlemeyi kapat",
    loading: "Yazı tipleri ve önizleme hazırlanıyor…",
    failed:
      "Yazdırma açılamadı. Cihaz tarayıcısında PDF olarak kaydetmeyi deneyin.",
    unavailable: "Bu fatura son baskı için kullanılamıyor.",
    forbidden: "Bu ofisin faturalarına erişim yetkiniz yok.",
    not_confirmed:
      "Son baskı, sunucu faturayı onayladıktan sonra kullanılabilir.",
    pending_invoice:
      "Fatura düzenlemesi bekliyor. Yazdırmadan önce onayı bekleyin.",
    missing_details:
      "Bu eski faturada yazdırma için kayıtlı mali ayrıntı ve para birimi yok.",
    invalid_amounts: "Yazdırmadan önce mali değerlerin incelenmesi gerekir.",
    total_mismatch:
      "Kayıtlı toplam fatura ayrıntılarıyla uyuşmuyor. Muhasebeciye danışın; asıl tutar değiştirilmedi.",
    pendingPayment:
      "Yerel bir tahsilat bekliyor. Aşağıda yalnızca onaylı ödemeler yer alır.",
    offline:
      "Son onaylı durumun yerel kopyası; sunucunun yeni güncellemelerini içermeyebilir.",
    lastRead: "Veri son okuma",
    unknownRead: "Son okuma zamanı yok",
    date: "Düzenlenme tarihi",
    paidAmount: "Onaylı ödenen tutar",
    carton: "Koli",
    kg: "kg",
    version: "Kayıt sürümü",
    footer:
      "Kayıtlı faturanın kopyasıdır. Yazdırma veya PDF kaydetme bir ödeme ya da yeni muhasebe kaydı oluşturmaz.",
    detailNote:
      "Ağırlık ve adetler kayıtlı kalemlere aittir. Tutarlar toplamdır; bu faturada ayrı kalem fiyatları saklanmaz.",
    latestPayment: "Son kayıtlı ödeme yöntemi",
  },
};
