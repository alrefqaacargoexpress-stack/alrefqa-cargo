import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  CheckCircle2,
  Clock3,
  CreditCard,
  MapPin,
  PackageSearch,
  Phone,
  Search,
  Truck,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";

type MarketStage =
  | "registered"
  | "in_transit"
  | "arrived_destination"
  | "ready_for_pickup"
  | "delivered";
type PaymentStatus = "paid" | "outstanding" | "no_invoice";
type MarketItem = {
  id: string;
  tracking: string;
  customerName: string;
  phoneNumbers: string[];
  route: string;
  service: string;
  status: string;
  currentStage: MarketStage;
  paymentStatus: PaymentStatus;
  officeId: string | null;
  goods: Array<{
    id: string;
    cartonNumber: number;
    name: string;
    phone: string;
    weight: number;
    pieces: number;
  }>;
  timeline: Array<{
    id: string;
    stage: MarketStage;
    status: string;
    actorName: string;
    actorRole: string;
    officeId: string | null;
    reason: string | null;
    createdAt: string;
  }>;
  timelineAvailable: boolean;
};
type MarketResponse = {
  items: MarketItem[];
  total: number;
  nextCursor: number | null;
};

const cacheKeyPrefix = "alrefqaa-market-warehouse-v1:";
function cacheKeyFor(search: string) {
  return `${cacheKeyPrefix}${search.trim().toLocaleLowerCase("ar")}`;
}

const copy = {
  ar: {
    title: "مستودع الماركت",
    subtitle: "استعلام موحد عن البضاعة من التسجيل حتى التسليم.",
    search: "ابحث برقم الشحنة أو الباركود أو الاسم أو الهاتف",
    searchHint: "يمكنك كتابة جزء من الرقم أو الاسم.",
    results: "نتائج الاستعلام",
    shipment: "الشحنة",
    customer: "الزبون",
    goods: "البضاعة المسجلة",
    route: "المسار",
    service: "الخدمة",
    payment: "حالة الدفع",
    paid: "مدفوع بالكامل",
    outstanding: "متبقي / آجل",
    noInvoice: "لا توجد فاتورة مرتبطة",
    current: "المرحلة الحالية",
    timeline: "خط المراحل",
    noTimeline: "لا يوجد سجل تاريخي لهذه الشحنة قبل تفعيل مستودع الماركت.",
    actor: "نفّذها",
    offline: "دون اتصال — تعرض آخر نتائج محفوظة لهذا الجهاز.",
    online: "متصل",
    login: "تسجيل الدخول مطلوب",
    loginHint: "سجّل الدخول بحساب موظف مصرح له بالاستعلام.",
    denied: "لا تملك صلاحية مستودع الماركت.",
    empty: "لا توجد شحنات مطابقة.",
    loading: "جارٍ البحث…",
    pieces: "قطعة",
    kg: "كغ",
    more: "تحميل المزيد",
    back: "لوحة العمل",
    stages: {
      registered: "تم التسجيل بالمستودع",
      in_transit: "في طريقها للشحن",
      arrived_destination: "وصلت الفرع الوجهة",
      ready_for_pickup: "جاهزة للاستلام",
      delivered: "تم التسليم",
    } as Record<MarketStage, string>,
  },
  en: {
    title: "Market warehouse",
    subtitle: "One inquiry view from registration to delivery.",
    search: "Search by shipment, barcode, name or phone",
    searchHint: "A partial number or name is enough.",
    results: "Inquiry results",
    shipment: "Shipment",
    customer: "Customer",
    goods: "Registered goods",
    route: "Route",
    service: "Service",
    payment: "Payment status",
    paid: "Paid in full",
    outstanding: "Outstanding / on account",
    noInvoice: "No linked invoice",
    current: "Current stage",
    timeline: "Stage timeline",
    noTimeline: "No historical timeline exists for this shipment yet.",
    actor: "Recorded by",
    offline:
      "Offline — showing the last permitted results saved on this device.",
    online: "Online",
    login: "Sign-in required",
    loginHint: "Sign in with an employee account allowed to inquire.",
    denied: "You do not have Market Warehouse access.",
    empty: "No matching shipments.",
    loading: "Searching…",
    pieces: "pieces",
    kg: "kg",
    more: "Load more",
    back: "Workspace",
    stages: {
      registered: "Registered at warehouse",
      in_transit: "In transit",
      arrived_destination: "Arrived at destination branch",
      ready_for_pickup: "Ready for pickup",
      delivered: "Delivered",
    } as Record<MarketStage, string>,
  },
  zh: {
    title: "市场仓查询",
    subtitle: "从登记到交付的一站式货物查询。",
    search: "按货运、条码、姓名或电话搜索",
    searchHint: "输入部分编号或姓名即可。",
    results: "查询结果",
    shipment: "货运",
    customer: "客户",
    goods: "已登记货物",
    route: "路线",
    service: "服务",
    payment: "付款状态",
    paid: "已全额付款",
    outstanding: "有余额 / 赊账",
    noInvoice: "没有关联发票",
    current: "当前阶段",
    timeline: "阶段时间线",
    noTimeline: "该货运暂时没有历史时间线。",
    actor: "记录人",
    offline: "离线 — 显示本设备保存的最后授权结果。",
    online: "在线",
    login: "需要登录",
    loginHint: "请使用有查询权限的员工账户登录。",
    denied: "您没有市场仓查询权限。",
    empty: "没有匹配的货运。",
    loading: "搜索中…",
    pieces: "件",
    kg: "公斤",
    more: "加载更多",
    back: "工作台",
    stages: {
      registered: "仓库已登记",
      in_transit: "运输中",
      arrived_destination: "已到达目的分部",
      ready_for_pickup: "可取货",
      delivered: "已交付",
    } as Record<MarketStage, string>,
  },
  tr: {
    title: "Market depo sorgusu",
    subtitle: "Kayıttan teslimata tek sorgu ekranı.",
    search: "Gönderi, barkod, ad veya telefonla ara",
    searchHint: "Numaranın veya adın bir kısmı yeterlidir.",
    results: "Sorgu sonuçları",
    shipment: "Gönderi",
    customer: "Müşteri",
    goods: "Kayıtlı ürünler",
    route: "Rota",
    service: "Hizmet",
    payment: "Ödeme durumu",
    paid: "Tam ödendi",
    outstanding: "Kalan / vadeli",
    noInvoice: "Bağlı fatura yok",
    current: "Mevcut aşama",
    timeline: "Aşama zaman çizelgesi",
    noTimeline: "Bu gönderi için henüz tarihsel zaman çizelgesi yok.",
    actor: "Kaydeden",
    offline: "Çevrimdışı — cihazda saklanan son yetkili sonuçlar gösteriliyor.",
    online: "Çevrimiçi",
    login: "Giriş gerekli",
    loginHint: "Sorgu yetkili bir çalışan hesabıyla giriş yapın.",
    denied: "Market depo erişiminiz yok.",
    empty: "Eşleşen gönderi yok.",
    loading: "Aranıyor…",
    pieces: "parça",
    kg: "kg",
    more: "Daha fazla yükle",
    back: "Çalışma alanı",
    stages: {
      registered: "Depoda kaydedildi",
      in_transit: "Taşımada",
      arrived_destination: "Hedef şubeye ulaştı",
      ready_for_pickup: "Teslim almaya hazır",
      delivered: "Teslim edildi",
    } as Record<MarketStage, string>,
  },
} as const;

function stageIcon(stage: MarketStage) {
  return stage === "delivered" || stage === "ready_for_pickup" ? (
    <CheckCircle2 size={17} />
  ) : stage === "in_transit" ? (
    <Truck size={17} />
  ) : (
    <Clock3 size={17} />
  );
}

export default function MarketWarehouse() {
  const { language } = useLanguage();
  const c = copy[language];
  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const [search, setSearch] = useState("");
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine
  );
  const [cursor, setCursor] = useState(0);
  const [items, setItems] = useState<MarketItem[]>([]);
  const [total, setTotal] = useState(0);
  const [cached, setCached] = useState<MarketResponse | null>(null);
  const query = trpc.marketWarehouse.search.useQuery(
    { search: search.trim() || undefined, limit: 50, cursor },
    {
      enabled: Boolean(me.data && online),
      retry: false,
      refetchOnWindowFocus: false,
    }
  );

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    addEventListener("online", on);
    addEventListener("offline", off);
    return () => {
      removeEventListener("online", on);
      removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    try {
      const parsed = JSON.parse(
        localStorage.getItem(cacheKeyFor(search)) ?? "null"
      );
      setCached(parsed && Array.isArray(parsed.items) ? parsed : null);
    } catch {
      setCached(null);
    }
  }, [search]);

  useEffect(() => {
    if (!query.data) return;
    const next = query.data as MarketResponse;
    setItems(previous =>
      cursor === 0 ? next.items : [...previous, ...next.items]
    );
    setTotal(next.total);
    try {
      localStorage.setItem(cacheKeyFor(search), JSON.stringify(next));
    } catch {
      // Local storage is an optional read cache, never an authorization source.
    }
  }, [query.data, cursor]);

  const visibleItems = online ? items : (cached?.items ?? []);
  const hasMore = online && Boolean(query.data?.nextCursor !== null);
  const errorMessage = query.error ? c.denied : null;
  const statusLabel = useMemo(
    () => (online ? c.online : c.offline),
    [online, c]
  );

  if (!me.isLoading && !me.data)
    return (
      <main className="min-h-screen bg-[#f7f8f5] p-5 text-[#092d50] md:p-8">
        <div className="mx-auto max-w-3xl rounded-[2rem] bg-white p-8 text-center shadow-sm">
          <PackageSearch className="mx-auto mb-4" size={42} />
          <h1 className="text-2xl font-black">{c.login}</h1>
          <p className="mt-2 text-[#718088]">{c.loginHint}</p>
          <Link
            href="/auth"
            className="mt-6 inline-flex rounded-full bg-[#092d50] px-6 py-3 font-bold text-white"
          >
            {language === "ar" ? "تسجيل الدخول" : "Sign in"}
          </Link>
        </div>
      </main>
    );

  return (
    <main className="min-h-screen bg-[#f7f8f5] pb-24 text-[#092d50]">
      <header className="border-b border-[#dce4e7] bg-white px-5 py-6 md:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Link
                className="text-sm font-bold text-[#718088]"
                href="/operations"
              >
                ← {c.back}
              </Link>
              <h1 className="mt-4 flex items-center gap-3 text-3xl font-black">
                <span className="grid size-12 place-items-center rounded-2xl bg-[#e8eff1] text-[#092d50]">
                  <PackageSearch size={25} />
                </span>
                {c.title}
              </h1>
              <p className="mt-2 text-[#718088]">{c.subtitle}</p>
            </div>
            <span
              className={`rounded-full px-4 py-2 text-sm font-bold ${online ? "bg-[#e7f8ef] text-[#147a4b]" : "bg-[#fff3dc] text-[#986512]"}`}
            >
              {statusLabel}
            </span>
          </div>
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-[#dce4e7] bg-[#fbfcfa] px-4 py-3 shadow-sm">
            <Search className="shrink-0 text-[#718088]" size={21} />
            <input
              value={search}
              onChange={event => {
                setSearch(event.target.value);
                setCursor(0);
                setItems([]);
              }}
              className="min-w-0 flex-1 bg-transparent outline-none"
              placeholder={c.search}
              aria-label={c.search}
            />
          </div>
          <p className="mt-2 text-xs text-[#718088]">{c.searchHint}</p>
        </div>
      </header>

      <section className="mx-auto max-w-6xl space-y-4 p-5 md:p-8">
        {errorMessage && !visibleItems.length ? (
          <div className="rounded-2xl border border-[#f0caca] bg-[#fff7f7] p-5 text-[#9b3d3d]">
            {errorMessage}
          </div>
        ) : null}
        {!errorMessage && !query.isLoading && !visibleItems.length ? (
          <div className="rounded-2xl bg-white p-10 text-center text-[#718088] shadow-sm">
            {c.empty}
          </div>
        ) : null}
        {query.isLoading && cursor === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center text-[#718088]">
            {c.loading}
          </div>
        ) : null}
        {visibleItems.map(item => (
          <article
            key={item.id}
            className="overflow-hidden rounded-[1.5rem] border border-[#dce4e7] bg-white shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#edf1f0] p-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#718088]">
                  {c.shipment}
                </p>
                <h2 className="mt-1 text-xl font-black">{item.tracking}</h2>
                <p className="mt-1 text-sm text-[#718088]">{item.id}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-[#e8eff1] px-3 py-1 text-sm font-bold">
                  {c.stages[item.currentStage]}
                </span>
                <span
                  className={`flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold ${item.paymentStatus === "paid" ? "bg-[#e7f8ef] text-[#147a4b]" : item.paymentStatus === "outstanding" ? "bg-[#fff3dc] text-[#986512]" : "bg-[#f0f2f2] text-[#718088]"}`}
                >
                  <CreditCard size={15} />
                  {item.paymentStatus === "paid"
                    ? c.paid
                    : item.paymentStatus === "outstanding"
                      ? c.outstanding
                      : c.noInvoice}
                </span>
              </div>
            </div>
            <div className="grid gap-5 p-5 lg:grid-cols-[1.05fr_1fr]">
              <div className="space-y-4">
                <div className="rounded-2xl bg-[#f7f8f5] p-4">
                  <p className="text-xs font-bold text-[#718088]">
                    {c.customer}
                  </p>
                  <p className="mt-1 text-lg font-black">
                    {item.customerName || "—"}
                  </p>
                  {item.phoneNumbers.length ? (
                    <p className="mt-2 flex items-center gap-2 text-sm text-[#52636e]">
                      <Phone size={15} /> {item.phoneNumbers.join(" · ")}
                    </p>
                  ) : null}
                  <p className="mt-2 flex items-center gap-2 text-sm text-[#52636e]">
                    <MapPin size={15} /> {item.route || "—"}
                  </p>
                  <p className="mt-1 text-sm text-[#718088]">
                    {c.service}: {item.service}
                  </p>
                </div>
                <div>
                  <h3 className="mb-2 font-black">{c.goods}</h3>
                  <div className="space-y-2">
                    {item.goods.map(good => (
                      <div
                        key={good.id}
                        className="rounded-xl border border-[#edf1f0] px-3 py-2 text-sm"
                      >
                        <div className="flex justify-between gap-3 font-bold">
                          <span>{good.name}</span>
                          <span>
                            {good.pieces} {c.pieces}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-[#718088]">
                          #{good.id} · {good.weight} {c.kg} ·{" "}
                          {good.phone || "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <h3 className="mb-3 font-black">{c.timeline}</h3>
                {item.timelineAvailable ? (
                  <ol className="space-y-3">
                    {item.timeline.map(event => (
                      <li
                        key={event.id}
                        className="flex gap-3 rounded-xl border border-[#edf1f0] p-3"
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#e8eff1] text-[#092d50]">
                          {stageIcon(event.stage)}
                        </span>
                        <div className="min-w-0">
                          <p className="font-bold">{c.stages[event.stage]}</p>
                          <p className="text-sm text-[#52636e]">
                            {event.status}
                          </p>
                          <p className="mt-1 text-xs text-[#718088]">
                            {event.actorName} ·{" "}
                            {new Date(event.createdAt).toLocaleString(
                              language === "ar" ? "ar-MR" : language
                            )}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="rounded-2xl bg-[#f7f8f5] p-4 text-sm text-[#718088]">
                    {c.noTimeline}
                  </div>
                )}
              </div>
            </div>
          </article>
        ))}
        {hasMore ? (
          <button
            type="button"
            onClick={() => setCursor(query.data?.nextCursor ?? cursor)}
            className="mx-auto block rounded-full bg-[#092d50] px-6 py-3 font-bold text-white"
          >
            {c.more} ({Math.max(total - visibleItems.length, 0)})
          </button>
        ) : null}
        {!online && cached?.items.length ? (
          <p className="rounded-2xl bg-[#fff3dc] p-4 text-sm text-[#986512]">
            {c.offline}
          </p>
        ) : null}
      </section>
    </main>
  );
}
