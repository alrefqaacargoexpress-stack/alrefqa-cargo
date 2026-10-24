import { useEffect, useMemo, useState } from "react";
import type { Account, LocalState, Shipment } from "@shared/operations";
import { financeCurrencies, type FinanceCurrency } from "@shared/finance";
import {
  canReadAnyFinance,
  permissionAllowed,
  type PermissionMap,
  type PermissionSubject,
} from "@shared/permissions";
import {
  isConfirmedArrival,
  type ShipmentSettlementSnapshot,
} from "@shared/shipmentSettlement";
import type { OfficeId } from "@shared/branches";
import { trpc } from "@/lib/trpc";
import {
  PackingField,
  packingInputClass,
  packingPrimaryClass,
  packingSecondaryClass,
} from "@/components/packing/PackingPrimitives";

type Language = "ar" | "en" | "zh" | "tr";
type Workspace = {
  role: PermissionSubject["role"];
  offices: readonly OfficeId[] | null;
  homeOffice?: OfficeId | null;
  permissions?: PermissionMap | null;
  online: boolean;
  userId?: string | null;
  base: { state: LocalState; accessReady: boolean; localOnly: boolean };
  reload: () => Promise<void>;
};

const copy = {
  ar: {
    title: "كشف تصفية الشحنة",
    hint: "استحقاق الشحنة والقبض والمخزون المادي منفصلة؛ لا يوجد تحويل بين العملات.",
    shipment: "الشحنة المحفوظة",
    chooseShipment: "اختر شحنة",
    noShipments: "لا توجد شحنة محفوظة قابلة للعرض.",
    snapshot: "الكشف الرسمي",
    loading: "جارٍ تحميل الكشف…",
    noFinancialAccess: "يلزم تصريح مالي قبل الاتصال بكشف الشحنة.",
    componentTotal: "إجمالي المكونات",
    unbilled: "غير مفوتر",
    customerDebt: "دين العميل",
    paid: "المدفوع",
    settled: "المسوى",
    physical: "المخزون المادي (منفصل عن المال)",
    undeliveredGoods: "بضاعة غير مسلّمة",
    weight: "الوزن غير المسلّم",
    paidUndelivered: "مدفوع لبضاعة غير مسلّمة",
    noBreakdown: "لا توجد مكونات استحقاق في الكشف.",
    registerExport: "اعتماد رسوم المصدر",
    registerHint:
      "يثبت الرسوم التاريخية للشحنة مرة واحدة؛ لا يستخدم السعر الحالي ولا ينشئ فوترة ثانية.",
    trackingConfirm: "اكتب رقم التتبع للتأكيد",
    legacyApproval: "أعتمد صراحة إدراج الشحنة القديمة في النموذج المالي الجديد",
    confirm: "تأكيد",
    approve: "اعتماد وإصدار الرسوم",
    localCost: "تكلفة محلية عند الوصول",
    localHint: "متاحة للمالي في نواكشوط بعد تأكيد الوصول فقط.",
    description: "الوصف",
    currency: "العملة",
    passToCustomer: "تحميل التكلفة على العميل",
    paidInCash: "تم دفع التكلفة نقدًا الآن",
    saveCost: "تسجيل التكلفة المحلية",
    bill: "فوترة مكونات غير مفوترة",
    billHint:
      "اختر مكونات من عملة واحدة وحساب العميل؛ رسوم المصدر لا تفوتر من نواكشوط ثانية.",
    component: "المكوّن",
    kind: "النوع",
    export: "مصدر",
    destinationLocal: "محلي نواكشوط",
    customer: "حساب العميل",
    chooseCustomer: "اختر حساب العميل",
    invoiceId: "رقم الفاتورة",
    invoiceIdHint: "يجب أن يكون رقمًا جديدًا غير مستخدم.",
    payment: "طريقة السداد",
    cash: "نقدي",
    wallet: "محفظة نواكشوط",
    onAccount: "على الحساب (دين)",
    walletMethod: "طريقة المحفظة",
    reference: "مرجع المحفظة (اختياري)",
    referenceManual: "مرجع تكلفة يدوي (اختياري)",
    billSelected: "فوترة المكونات المختارة",
    noneSelected: "اختر مكونًا واحدًا على الأقل.",
    saved: "تم حفظ العملية وتحديث الكشف الرسمي.",
    permission: "لا تملك صلاحية تنفيذ هذه العملية المالية.",
    offline: "يلزم اتصال صالح وجلسة مالية لإرسال العملية.",
    conflict: "تغير إصدار الشحنة؛ أعد تحميل الكشف قبل المحاولة.",
    operationError:
      "تعذر تنفيذ العملية المالية. راجع المدخلات أو صلاحيتك ثم أعد المحاولة.",
    readError: "تعذر تحميل كشف الشحنة؛ أعد المحاولة.",
    arrivalRequired: "تظهر التكلفة المحلية بعد تأكيد وصول الشحنة إلى نواكشوط.",
    closedRequired: "لا يمكن اعتماد رسوم المصدر قبل إغلاق/إرسال الشحنة.",
  },
  en: {
    title: "Shipment settlement",
    hint: "Shipment entitlement, receipts and physical stock stay separate; currencies are not converted.",
    shipment: "Saved shipment",
    chooseShipment: "Choose a shipment",
    noShipments: "No saved shipment is available for this view.",
    snapshot: "Official settlement",
    loading: "Loading settlement…",
    noFinancialAccess:
      "Financial authorization is required before connecting to a shipment settlement.",
    componentTotal: "Component total",
    unbilled: "Unbilled",
    customerDebt: "Customer debt",
    paid: "Paid",
    settled: "Settled",
    physical: "Physical stock (separate from money)",
    undeliveredGoods: "Undelivered goods",
    weight: "Undelivered weight",
    paidUndelivered: "Paid for undelivered goods",
    noBreakdown: "No entitlement components are in this settlement.",
    registerExport: "Approve source charges",
    registerHint:
      "Freezes the shipment's historical source charges once; it does not use the current price or create a second invoice.",
    trackingConfirm: "Type the tracking number to confirm",
    legacyApproval:
      "I explicitly approve enrolling this legacy shipment in the new financial model",
    confirm: "Confirmation",
    approve: "Approve and register charges",
    localCost: "Destination local cost",
    localHint:
      "Available to Nouakchott finance only after arrival is confirmed.",
    description: "Description",
    currency: "Currency",
    passToCustomer: "Pass this cost to the customer",
    paidInCash: "This cost was paid in cash now",
    saveCost: "Record local cost",
    bill: "Bill unbilled components",
    billHint:
      "Choose components in one currency and a customer account; Nouakchott must not bill source charges again.",
    component: "Component",
    kind: "Kind",
    export: "Source",
    destinationLocal: "Nouakchott local",
    customer: "Customer account",
    chooseCustomer: "Choose customer account",
    invoiceId: "Invoice ID",
    invoiceIdHint: "Use a new, unused identifier.",
    payment: "Payment mode",
    cash: "Cash",
    wallet: "Nouakchott wallet",
    onAccount: "On account (debt)",
    walletMethod: "Wallet method",
    reference: "Wallet reference (optional)",
    referenceManual: "Manual cost reference (optional)",
    billSelected: "Bill selected components",
    noneSelected: "Select at least one component.",
    saved: "Operation saved and the official settlement was refreshed.",
    permission: "You do not have permission for this financial operation.",
    offline:
      "A valid connection and financial session are required to submit this operation.",
    conflict:
      "The shipment version changed; reload the settlement before trying again.",
    operationError:
      "The financial operation could not be completed. Review the inputs or your permission and try again.",
    readError: "The shipment settlement could not be loaded; try again.",
    arrivalRequired:
      "Local cost appears only after the shipment arrival is confirmed in Nouakchott.",
    closedRequired:
      "Source charges cannot be approved before the shipment is closed/sent.",
  },
  zh: {
    title: "货件结算清单",
    hint: "货件应收、收款和实物库存分开显示；不进行币种换算。",
    shipment: "已保存货件",
    chooseShipment: "选择货件",
    noShipments: "没有可显示的已保存货件。",
    snapshot: "正式结算",
    loading: "正在加载结算…",
    noFinancialAccess: "连接货件结算前需要财务权限。",
    componentTotal: "组件总额",
    unbilled: "未开票",
    customerDebt: "客户债务",
    paid: "已付款",
    settled: "已结算",
    physical: "实物库存（与资金分开）",
    undeliveredGoods: "未交付商品",
    weight: "未交付重量",
    paidUndelivered: "未交付商品的已付款",
    noBreakdown: "此结算没有应收组件。",
    registerExport: "确认来源费用",
    registerHint:
      "一次性冻结货件历史来源费用；不使用当前价格，也不会创建第二张发票。",
    trackingConfirm: "输入跟踪号以确认",
    legacyApproval: "我明确批准将此旧货件纳入新的财务模型",
    confirm: "确认",
    approve: "确认并登记费用",
    localCost: "目的地本地费用",
    localHint: "仅在确认到达后由努瓦克肖特财务使用。",
    description: "描述",
    currency: "货币",
    passToCustomer: "将费用计入客户",
    paidInCash: "此费用现在已用现金支付",
    saveCost: "登记本地费用",
    bill: "为未开票组件开票",
    billHint:
      "选择同一币种的组件和客户账户；努瓦克肖特不能再次为来源费用开票。",
    component: "组件",
    kind: "类型",
    export: "来源",
    destinationLocal: "努瓦克肖特本地",
    customer: "客户账户",
    chooseCustomer: "选择客户账户",
    invoiceId: "发票号",
    invoiceIdHint: "请输入未使用的新编号。",
    payment: "付款方式",
    cash: "现金",
    wallet: "努瓦克肖特钱包",
    onAccount: "赊账（债务）",
    walletMethod: "钱包方式",
    reference: "钱包参考（可选）",
    referenceManual: "手动成本参考（可选）",
    billSelected: "为所选组件开票",
    noneSelected: "至少选择一个组件。",
    saved: "操作已保存，正式结算已刷新。",
    permission: "您没有执行此财务操作的权限。",
    offline: "提交操作需要有效连接和财务会话。",
    conflict: "货件版本已变化；请重新加载结算。",
    operationError: "财务操作无法完成。请检查输入或权限后重试。",
    readError: "无法加载货件结算；请重试。",
    arrivalRequired: "确认货件抵达努瓦克肖特后才会显示本地费用。",
    closedRequired: "货件关闭/发出前不能确认来源费用。",
  },
  tr: {
    title: "Gönderi mutabakatı",
    hint: "Gönderi alacağı, tahsilat ve fiziksel stok ayrı tutulur; para birimleri çevrilmez.",
    shipment: "Kayıtlı gönderi",
    chooseShipment: "Gönderi seçin",
    noShipments: "Bu görünüm için kayıtlı gönderi yok.",
    snapshot: "Resmi mutabakat",
    loading: "Mutabakat yükleniyor…",
    noFinancialAccess:
      "Gönderi mutabakatına bağlanmadan önce mali yetki gerekir.",
    componentTotal: "Bileşen toplamı",
    unbilled: "Faturalanmamış",
    customerDebt: "Müşteri borcu",
    paid: "Ödenen",
    settled: "Kapatılan",
    physical: "Fiziksel stok (paradan ayrı)",
    undeliveredGoods: "Teslim edilmemiş ürün",
    weight: "Teslim edilmemiş ağırlık",
    paidUndelivered: "Teslim edilmemiş ürün için ödenen",
    noBreakdown: "Bu mutabakatta alacak bileşeni yok.",
    registerExport: "Kaynak ücretlerini onayla",
    registerHint:
      "Gönderinin tarihsel kaynak ücretlerini bir kez sabitler; güncel fiyatı kullanmaz ve ikinci fatura oluşturmaz.",
    trackingConfirm: "Onay için takip numarasını yazın",
    legacyApproval:
      "Bu eski gönderiyi yeni mali modele almayı açıkça onaylıyorum",
    confirm: "Onay",
    approve: "Ücretleri onayla ve kaydet",
    localCost: "Varış yerel maliyeti",
    localHint:
      "Yalnızca varış onaylandıktan sonra Nouakchott maliyesine açıktır.",
    description: "Açıklama",
    currency: "Para birimi",
    passToCustomer: "Bu maliyeti müşteriye yansıt",
    paidInCash: "Bu maliyet şimdi nakit ödendi",
    saveCost: "Yerel maliyeti kaydet",
    bill: "Faturalanmamış bileşenleri faturalandır",
    billHint:
      "Tek para birimindeki bileşenleri ve müşteri hesabını seçin; Nouakchott kaynak ücretini tekrar faturalandıramaz.",
    component: "Bileşen",
    kind: "Tür",
    export: "Kaynak",
    destinationLocal: "Nouakchott yerel",
    customer: "Müşteri hesabı",
    chooseCustomer: "Müşteri hesabı seçin",
    invoiceId: "Fatura no",
    invoiceIdHint: "Yeni ve kullanılmamış bir kimlik kullanın.",
    payment: "Ödeme yöntemi",
    cash: "Nakit",
    wallet: "Nouakchott cüzdanı",
    onAccount: "Vadeli (borç)",
    walletMethod: "Cüzdan yöntemi",
    reference: "Cüzdan referansı (isteğe bağlı)",
    referenceManual: "Manuel maliyet referansı (isteğe bağlı)",
    billSelected: "Seçili bileşenleri faturalandır",
    noneSelected: "En az bir bileşen seçin.",
    saved: "İşlem kaydedildi ve resmi mutabakat yenilendi.",
    permission: "Bu mali işlem için yetkiniz yok.",
    offline: "Göndermek için geçerli bağlantı ve mali oturum gerekir.",
    conflict: "Gönderi sürümü değişti; mutabakatı yenileyin.",
    operationError:
      "Mali işlem tamamlanamadı. Girdileri veya yetkinizi kontrol edip tekrar deneyin.",
    readError: "Gönderi mutabakatı yüklenemedi; tekrar deneyin.",
    arrivalRequired:
      "Yerel maliyet yalnızca Nouakchott varışı onaylandıktan sonra görünür.",
    closedRequired:
      "Gönderi kapanmadan/gönderilmeden kaynak ücretleri onaylanamaz.",
  },
} as const;

type Copy = (typeof copy)[Language];
function textFor(language: string): Copy {
  return copy[
    (Object.keys(copy) as Language[]).includes(language as Language)
      ? (language as Language)
      : "en"
  ];
}
function requestId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`.slice(
    0,
    128
  );
}
function friendlyError(error: unknown, c: Copy) {
  const code =
    error && typeof error === "object" && "data" in error
      ? (error as { data?: { code?: string } }).data?.code
      : undefined;
  if (code === "FORBIDDEN" || code === "UNAUTHORIZED") return c.permission;
  if (code === "CONFLICT") return c.conflict;
  return c.operationError;
}
function money(value: number, currency: FinanceCurrency, language: string) {
  return `${new Intl.NumberFormat(language === "ar" ? "ar-MR-u-nu-latn" : `${language}-u-nu-latn`, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${currency}`;
}
function subjectOf(workspace: Workspace): PermissionSubject {
  return {
    role: workspace.role,
    offices: workspace.offices,
    homeOffice: workspace.homeOffice,
    permissions: workspace.permissions,
  };
}
function officeOf(shipment: Shipment): OfficeId | undefined {
  return (
    shipment.officeId ?? (shipment.packing?.source as OfficeId | undefined)
  );
}

export default function ShipmentSettlementPanel({
  workspace,
  language,
  selectedOffice,
}: {
  workspace: Workspace;
  language: string;
  selectedOffice: OfficeId | "all";
}) {
  const c = textFor(language);
  const subject = subjectOf(workspace);
  const canRead = canReadAnyFinance(subject);
  const canRegister = permissionAllowed(subject, "shipment_prices", "manage");
  const canLocalCost =
    permissionAllowed(subject, "arrival_cost", "manage") &&
    (selectedOffice === "all" || selectedOffice === "nouakchott");
  const canBill = permissionAllowed(subject, "invoices", "manage");
  const shipments = useMemo(
    () =>
      workspace.base.state.shipments.filter(shipment => {
        if (shipment.deleted || !shipment.packing) return false;
        if (selectedOffice === "all") return true;
        return (
          officeOf(shipment) === selectedOffice ||
          (selectedOffice === "nouakchott" && isConfirmedArrival(shipment))
        );
      }),
    [selectedOffice, workspace.base.state.shipments]
  );
  const [shipmentId, setShipmentId] = useState("");
  const [tracking, setTracking] = useState("");
  const [legacyApproval, setLegacyApproval] = useState(false);
  const [localAmount, setLocalAmount] = useState("");
  const [localCurrency, setLocalCurrency] = useState<FinanceCurrency>("MRU");
  const [localDescription, setLocalDescription] = useState("");
  const [localReference, setLocalReference] = useState("");
  const [passedToCustomer, setPassedToCustomer] = useState(false);
  const [paidInCash, setPaidInCash] = useState(false);
  const [componentIds, setComponentIds] = useState<string[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [paymentMode, setPaymentMode] = useState<
    "cash" | "wallet" | "on_account"
  >("cash");
  const [walletMethod, setWalletMethod] = useState("");
  const [walletReference, setWalletReference] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!shipments.some(shipment => shipment.id === shipmentId))
      setShipmentId(shipments[0]?.id ?? "");
  }, [shipmentId, shipments]);
  const selectedShipment = shipments.find(
    shipment => shipment.id === shipmentId
  );
  useEffect(() => {
    setTracking("");
    setLegacyApproval(false);
    setComponentIds([]);
    setCustomerId("");
    setInvoiceId("");
    if (selectedShipment) setLocalCurrency("MRU");
  }, [selectedShipment?.id]);
  useEffect(() => {
    if (selectedShipment && !tracking) setTracking(selectedShipment.tracking);
  }, [selectedShipment, tracking]);
  const snapshotQuery = trpc.shipmentSettlement.snapshot.useQuery(
    { shipmentId: shipmentId || "not-selected" },
    {
      enabled: Boolean(
        canRead &&
          shipmentId &&
          workspace.online &&
          !workspace.base.localOnly &&
          workspace.userId &&
          workspace.base.accessReady
      ),
      retry: false,
      refetchOnWindowFocus: false,
    }
  );
  const registerExport = trpc.shipmentSettlement.registerExport.useMutation();
  const localCost = trpc.shipmentSettlement.localCost.useMutation();
  const billComponents = trpc.shipmentSettlement.billComponents.useMutation();
  const utils = trpc.useUtils();
  const snapshot = snapshotQuery.data as ShipmentSettlementSnapshot | undefined;
  const issuingOffice =
    selectedOffice === "all"
      ? (snapshot?.visibleOffice ?? workspace.homeOffice ?? undefined)
      : selectedOffice;
  const walletSettings = trpc.office.get.useQuery(
    issuingOffice ? { officeId: issuingOffice } : undefined,
    {
      enabled: Boolean(
        canBill && paymentMode === "wallet" && issuingOffice && workspace.online && workspace.userId
      ),
      retry: false,
      refetchOnWindowFocus: false,
    }
  );
  const walletMethods = (walletSettings.data?.methods ?? []).filter(
    method => method.id !== "cash"
  );
  const billable = useMemo(
    () =>
      (snapshot?.components ?? []).filter(
        component =>
          component.unbilled > 0 &&
          (component.kind !== "destination_local" ||
            component.data === undefined ||
            component.data.passedToCustomer === true)
      ),
    [snapshot]
  );
  const selectedComponents = billable.filter(component =>
    componentIds.includes(component.id)
  );
  const billCurrency = selectedComponents[0]?.currency;
  const accounts: Account[] = workspace.base.state.accounts;
  const busy =
    registerExport.isPending || localCost.isPending || billComponents.isPending;
  const refresh = async () => {
    await Promise.allSettled([
      workspace.reload(),
      utils.finance.snapshot.invalidate(),
      utils.operations.snapshot.invalidate(),
    ]);
    await snapshotQuery.refetch();
  };
  const submit = async (operation: "register" | "local" | "bill") => {
    setError("");
    setMessage("");
    if (!workspace.online || workspace.base.localOnly || !workspace.userId) {
      setError(c.offline);
      return;
    }
    if (
      !selectedShipment ||
      !snapshot ||
      tracking.trim() !== selectedShipment.tracking.trim()
    ) {
      setError(c.operationError);
      return;
    }
    try {
      if (operation === "register") {
        if (
          !canRegister ||
          (!selectedShipment.accountingModelVersion && !legacyApproval)
        ) {
          setError(c.permission);
          return;
        }
        await registerExport.mutateAsync({
          id: requestId("export"),
          shipmentId: selectedShipment.id,
          expectedVersion: snapshot.shipmentVersion,
          confirmation: { trackingNumber: tracking.trim() },
          includeLegacyApproval: legacyApproval,
        });
      } else if (operation === "local") {
        if (
          !canLocalCost ||
          !isConfirmedArrival(selectedShipment) ||
          !localDescription.trim() ||
          !Number.isFinite(Number(localAmount)) ||
          Number(localAmount) <= 0
        ) {
          setError(
            !isConfirmedArrival(selectedShipment)
              ? c.arrivalRequired
              : c.operationError
          );
          return;
        }
        await localCost.mutateAsync({
          id: requestId("local-cost"),
          shipmentId: selectedShipment.id,
          expectedVersion: snapshot.shipmentVersion,
          amount: Number(localAmount),
          currency: localCurrency,
          description: localDescription.trim(),
          passedToCustomer,
          paidInCash,
          ...(localReference.trim()
            ? {
                referenceKey: localReference.trim(),
                costReference: localReference.trim(),
              }
            : {}),
          confirmation: { trackingNumber: tracking.trim() },
        });
        setLocalAmount("");
        setLocalDescription("");
        setLocalReference("");
      } else {
        if (
          !canBill ||
          !customerId ||
          !invoiceId.trim() ||
          !selectedComponents.length ||
          !billCurrency
        ) {
          setError(
            !selectedComponents.length ? c.noneSelected : c.operationError
          );
          return;
        }
        if (paymentMode === "wallet" && (!walletMethod || !issuingOffice)) {
          setError(c.operationError);
          return;
        }
        await billComponents.mutateAsync({
          id: requestId("bill-components"),
          invoiceId: invoiceId.trim(),
          customerId,
          componentIds: selectedComponents.map(component => component.id),
          currency: billCurrency,
          paymentMode,
          ...(issuingOffice
            ? { issuingOfficeId: issuingOffice }
            : {}),
          ...(paymentMode === "wallet"
            ? {
                payment: {
                  office: issuingOffice as OfficeId,
                  methodId: walletMethod,
                  methodLabel:
                    walletMethods.find(method => method.id === walletMethod)
                      ?.label ?? walletMethod,
                  ...(walletReference.trim()
                    ? { reference: walletReference.trim() }
                    : {}),
                },
              }
            : {}),
          expectedShipmentVersion: snapshot.shipmentVersion,
        });
        setComponentIds([]);
        setInvoiceId("");
      }
      setMessage(c.saved);
      await refresh();
    } catch (operationError) {
      setError(friendlyError(operationError, c));
    }
  };
  if (!canRead)
    return (
      <section className="rounded-2xl border border-[#dce4e7] bg-white p-5 shadow-sm">
        <p className="text-sm font-bold text-[#52636e]">
          {c.noFinancialAccess}
        </p>
      </section>
    );
  return (
    <section className="rounded-2xl border border-[#dce4e7] bg-white p-5 shadow-sm">
      <div className="border-b border-[#edf1f1] pb-4">
        <h2 className="text-lg font-black text-[#092d50]">{c.title}</h2>
        <p className="mt-1 text-sm text-[#718088]">{c.hint}</p>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <PackingField label={c.shipment} required>
          <select
            className={packingInputClass}
            value={shipmentId}
            disabled={!shipments.length || busy}
            onChange={event => setShipmentId(event.target.value)}
          >
            {!shipments.length && <option value="">{c.noShipments}</option>}
            {shipments.map(shipment => (
              <option key={shipment.id} value={shipment.id}>
                {shipment.tracking} · {shipment.id}
              </option>
            ))}
          </select>
        </PackingField>
        <PackingField label={c.trackingConfirm} required>
          <input
            className={packingInputClass}
            value={tracking}
            disabled={!selectedShipment || busy}
            onChange={event => setTracking(event.target.value)}
            placeholder={c.confirm}
          />
        </PackingField>
      </div>
      {snapshotQuery.isLoading && (
        <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-[#52636e]">
          {c.loading}
        </p>
      )}
      {snapshotQuery.error && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-900"
        >
          {c.readError}
        </p>
      )}
      {snapshot && (
        <>
          <div className="mt-4 rounded-xl bg-[#f7f9f8] p-4">
            <h3 className="font-black text-[#092d50]">{c.snapshot}</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {snapshot.breakdown.map(row => (
                <article key={row.currency} className="rounded-xl bg-white p-3">
                  <div className="flex items-center justify-between">
                    <strong>{row.currency}</strong>
                    <span className="text-xs text-[#718088]">
                      {snapshot.tracking}
                    </span>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <Metric
                      label={c.componentTotal}
                      value={money(row.componentTotal, row.currency, language)}
                    />
                    <Metric
                      label={c.unbilled}
                      value={money(row.unbilled, row.currency, language)}
                    />
                    <Metric
                      label={c.customerDebt}
                      value={money(row.customerDebt, row.currency, language)}
                    />
                    <Metric
                      label={c.paid}
                      value={money(row.paid, row.currency, language)}
                    />
                    <Metric
                      label={c.settled}
                      value={money(row.settled, row.currency, language)}
                    />
                  </dl>
                </article>
              ))}
            </div>
            {!snapshot.breakdown.length && (
              <p className="mt-3 text-sm text-[#718088]">{c.noBreakdown}</p>
            )}
          </div>
          <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50 p-4 text-sm text-sky-950">
            <h3 className="font-black">{c.physical}</h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Metric
                label={c.undeliveredGoods}
                value={String(snapshot.physical.undeliveredGoodsIds.length)}
              />
              <Metric
                label={c.weight}
                value={`${snapshot.physical.undeliveredWeight} kg`}
              />
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {snapshot.physical.paidUndeliveredByCurrency.map(row => (
                <Metric
                  key={row.currency}
                  label={`${c.paidUndelivered} · ${row.currency}`}
                  value={money(row.amount, row.currency, language)}
                />
              ))}
              {!snapshot.physical.paidUndeliveredByCurrency.length && (
                <Metric label={c.paidUndelivered} value="—" />
              )}
            </div>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {canRegister && (
              <div className="rounded-xl border border-[#edf1f1] p-4">
                <h3 className="font-black text-[#092d50]">
                  {c.registerExport}
                </h3>
                <p className="mt-1 text-xs text-[#718088]">{c.registerHint}</p>
                {!selectedShipment?.accountingModelVersion && (
                  <label className="mt-3 flex gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={legacyApproval}
                      disabled={busy}
                      onChange={event =>
                        setLegacyApproval(event.target.checked)
                      }
                    />{" "}
                    <span>{c.legacyApproval}</span>
                  </label>
                )}
                <button
                  type="button"
                  className={`${packingPrimaryClass} mt-3 w-full`}
                  disabled={busy || !selectedShipment}
                  onClick={() => void submit("register")}
                >
                  {c.approve}
                </button>
              </div>
            )}
            {canLocalCost && (
              <div className="rounded-xl border border-[#edf1f1] p-4">
                <h3 className="font-black text-[#092d50]">{c.localCost}</h3>
                <p className="mt-1 text-xs text-[#718088]">{c.localHint}</p>
                <div className="mt-3 grid gap-3">
                  <PackingField label={c.description} required>
                    <input
                      className={packingInputClass}
                      maxLength={500}
                      value={localDescription}
                      disabled={busy}
                      onChange={event =>
                        setLocalDescription(event.target.value)
                      }
                    />
                  </PackingField>
                  <div className="grid grid-cols-2 gap-2">
                    <PackingField label={c.componentTotal} required>
                      <input
                        className={packingInputClass}
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={localAmount}
                        disabled={busy}
                        onChange={event => setLocalAmount(event.target.value)}
                      />
                    </PackingField>
                    <PackingField label={c.currency} required>
                      <select
                        className={packingInputClass}
                        value={localCurrency}
                        disabled={busy}
                        onChange={event =>
                          setLocalCurrency(
                            event.target.value as FinanceCurrency
                          )
                        }
                      >
                        {financeCurrencies.map(currency => (
                          <option key={currency} value={currency}>
                            {currency}
                          </option>
                        ))}
                      </select>
                    </PackingField>
                  </div>
                  <details className="rounded-xl border border-[#edf1f1] bg-[#fbfcfb] p-3">
                    <summary className="cursor-pointer text-sm font-bold text-[#52636e]">
                      {c.reference}
                    </summary>
                    <p className="mt-2 text-xs text-[#718088]">
                      {c.referenceManual}
                    </p>
                    <input
                      className={`${packingInputClass} mt-3`}
                      maxLength={128}
                      value={localReference}
                      disabled={busy}
                      onChange={event => setLocalReference(event.target.value)}
                      placeholder={c.referenceManual}
                    />
                  </details>
                  <label className="flex gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={passedToCustomer}
                      disabled={busy}
                      onChange={event =>
                        setPassedToCustomer(event.target.checked)
                      }
                    />{" "}
                    <span>{c.passToCustomer}</span>
                  </label>
                  <label className="flex gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={paidInCash}
                      disabled={busy}
                      onChange={event => setPaidInCash(event.target.checked)}
                    />{" "}
                    <span>{c.paidInCash}</span>
                  </label>
                  <button
                    type="button"
                    className={packingSecondaryClass}
                    disabled={
                      busy ||
                      !selectedShipment ||
                      !isConfirmedArrival(selectedShipment)
                    }
                    onClick={() => void submit("local")}
                  >
                    {c.saveCost}
                  </button>
                </div>
              </div>
            )}
            {canBill && (
              <div className="rounded-xl border border-[#edf1f1] p-4 lg:col-span-1">
                <h3 className="font-black text-[#092d50]">{c.bill}</h3>
                <p className="mt-1 text-xs text-[#718088]">{c.billHint}</p>
                <div className="mt-3 max-h-48 space-y-2 overflow-auto">
                  {!billable.length && (
                    <p className="text-sm text-[#718088]">{c.noBreakdown}</p>
                  )}
                  {billable.map(component => {
                    const incompatible = Boolean(
                      billCurrency && component.currency !== billCurrency
                    );
                    return (
                      <label
                        key={component.id}
                        className={`flex gap-2 rounded-lg p-2 text-xs ${incompatible ? "bg-slate-50 text-[#9aa6ac]" : "bg-[#f7f9f8]"}`}
                      >
                        <input
                          type="checkbox"
                          checked={componentIds.includes(component.id)}
                          disabled={busy || incompatible}
                          onChange={event =>
                            setComponentIds(current =>
                              event.target.checked
                                ? [...current, component.id]
                                : current.filter(id => id !== component.id)
                            )
                          }
                        />
                        <span className="min-w-0">
                          <b>
                            {component.kind === "export"
                              ? c.export
                              : c.destinationLocal}
                          </b>{" "}
                          ·{" "}
                          {money(
                            component.amount,
                            component.currency,
                            language
                          )}
                          <span className="block truncate text-[#718088]">
                            {component.goodsId}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <div className="mt-3 grid gap-3">
                  <PackingField label={c.customer} required>
                    <select
                      className={packingInputClass}
                      value={customerId}
                      disabled={busy}
                      onChange={event => setCustomerId(event.target.value)}
                    >
                      <option value="">{c.chooseCustomer}</option>
                      {accounts.map(account => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                          {account.phone ? ` · ${account.phone}` : ""}
                        </option>
                      ))}
                    </select>
                  </PackingField>
                  <PackingField label={c.invoiceId} required>
                    <input
                      className={packingInputClass}
                      maxLength={128}
                      value={invoiceId}
                      disabled={busy}
                      onChange={event => setInvoiceId(event.target.value)}
                      placeholder={c.invoiceIdHint}
                    />
                  </PackingField>
                  <PackingField label={c.payment} required>
                    <select
                      className={packingInputClass}
                      value={paymentMode}
                      disabled={busy}
                      onChange={event =>
                        setPaymentMode(event.target.value as typeof paymentMode)
                      }
                    >
                      <option value="cash">{c.cash}</option>
                      <option value="on_account">{c.onAccount}</option>
                      {issuingOffice && walletMethods.length > 0 && (
                        <option value="wallet">{c.wallet}</option>
                      )}
                    </select>
                  </PackingField>
                  {paymentMode === "wallet" && (
                    <>
                      <PackingField label={c.walletMethod} required>
                        <select
                          className={packingInputClass}
                          value={walletMethod}
                          disabled={busy}
                          onChange={event =>
                            setWalletMethod(event.target.value)
                          }
                        >
                          <option value="">{c.walletMethod}</option>
                          {walletMethods.map(method => (
                            <option key={method.id} value={method.id}>
                              {method.label}
                            </option>
                          ))}
                        </select>
                      </PackingField>
                      <PackingField label={c.reference}>
                        <input
                          className={packingInputClass}
                          maxLength={240}
                          value={walletReference}
                          disabled={busy}
                          onChange={event =>
                            setWalletReference(event.target.value)
                          }
                        />
                      </PackingField>
                    </>
                  )}
                  <button
                    type="button"
                    className={packingSecondaryClass}
                    disabled={
                      busy ||
                      !selectedComponents.length ||
                      !customerId ||
                      !invoiceId.trim()
                    }
                    onClick={() => void submit("bill")}
                  >
                    {c.billSelected}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-900"
        >
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-900"
        >
          {message}
        </p>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <dt className="text-xs text-[#718088]">{label}</dt>
      <dd className="mt-1 font-black" dir="ltr">
        {value}
      </dd>
    </div>
  );
}
