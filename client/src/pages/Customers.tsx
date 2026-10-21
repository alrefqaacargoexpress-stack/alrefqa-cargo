import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Phone,
  Search,
  UserRound,
} from "lucide-react";
import PackingLayout from "@/components/packing/PackingLayout";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOperationsWorkspace } from "@/hooks/useOperationsWorkspace";
import {
  customerDirectory,
  isPackedShipment,
  type CustomerDirectoryEntry,
} from "@shared/packing";

const copy = {
  ar: {
    title: "إدارة العملاء",
    description: "دليل العملاء من الحسابات والشحنات المحفوظة فعليًا.",
    search: "ابحث بالاسم أو الهاتف",
    customers: "العملاء",
    empty: "لا توجد نتائج فعلية مطابقة للبحث.",
    noCustomers: "لا توجد حسابات أو بيانات عملاء محفوظة بعد.",
    phone: "الهاتف",
    noPhone: "—",
    pieces: "القطع",
    weight: "الوزن (كجم)",
    shipments: "الشحنات",
    accounts: "الحسابات",
    details: "تفاصيل العميل",
    accountRef: "مرجع الحساب",
    shipmentRef: "مرجع الشحنة",
    openAccount: "فتح الحسابات",
    openShipment: "فتح الشحنة",
    oldShipment: "فتح مركز العمليات",
    back: "رجوع",
    loading: "جارٍ تحميل بيانات العملاء…",
    error: "تعذر تحميل بيانات العملاء.",
    local: "تتضمن البيانات المحفوظة محليًا.",
    accountPlural: "حساب",
    shipmentPlural: "شحنة",
  },
  en: {
    title: "Customers",
    description:
      "Customer directory from the actual saved accounts and shipments.",
    search: "Search by name or phone",
    customers: "customers",
    empty: "No actual customers match this search.",
    noCustomers: "No saved accounts or customer data yet.",
    phone: "Phone",
    noPhone: "—",
    pieces: "Pieces",
    weight: "Weight (kg)",
    shipments: "Shipments",
    accounts: "Accounts",
    details: "Customer details",
    accountRef: "Account reference",
    shipmentRef: "Shipment reference",
    openAccount: "Open accounts",
    openShipment: "Open shipment",
    oldShipment: "Open operations",
    back: "Back",
    loading: "Loading customer data…",
    error: "Could not load customer data.",
    local: "Includes locally saved data.",
    accountPlural: "account",
    shipmentPlural: "shipment",
  },
  zh: {
    title: "客户管理",
    description: "来自实际保存账户和货运记录的客户目录。",
    search: "按姓名或电话搜索",
    customers: "客户",
    empty: "没有匹配此搜索的实际客户。",
    noCustomers: "尚无保存的账户或客户数据。",
    phone: "电话",
    noPhone: "—",
    pieces: "件数",
    weight: "重量（千克）",
    shipments: "货运",
    accounts: "账户",
    details: "客户详情",
    accountRef: "账户引用",
    shipmentRef: "货运引用",
    openAccount: "打开账户",
    openShipment: "打开货运",
    oldShipment: "打开运营中心",
    back: "返回",
    loading: "正在加载客户数据…",
    error: "无法加载客户数据。",
    local: "包含本地保存的数据。",
    accountPlural: "账户",
    shipmentPlural: "货运",
  },
  tr: {
    title: "Müşteri Yönetimi",
    description:
      "Gerçek kayıtlı hesap ve gönderilerden oluşturulan müşteri dizini.",
    search: "Ad veya telefonla ara",
    customers: "müşteri",
    empty: "Bu aramayla eşleşen gerçek müşteri yok.",
    noCustomers: "Henüz kayıtlı hesap veya müşteri verisi yok.",
    phone: "Telefon",
    noPhone: "—",
    pieces: "Parça",
    weight: "Ağırlık (kg)",
    shipments: "Gönderiler",
    accounts: "Hesaplar",
    details: "Müşteri ayrıntıları",
    accountRef: "Hesap referansı",
    shipmentRef: "Gönderi referansı",
    openAccount: "Hesapları aç",
    openShipment: "Gönderiyi aç",
    oldShipment: "Operasyonları aç",
    back: "Geri",
    loading: "Müşteri verileri yükleniyor…",
    error: "Müşteri verileri yüklenemedi.",
    local: "Yerel kaydedilmiş veriler dahildir.",
    accountPlural: "hesap",
    shipmentPlural: "gönderi",
  },
} as const;

type Language = keyof typeof copy;
const numberText = (value: number, maximumFractionDigits = 0) =>
  new Intl.NumberFormat("en-US", {
    useGrouping: false,
    maximumFractionDigits,
  }).format(value);

export default function Customers() {
  const { language, dir } = useLanguage();
  const t = copy[(language in copy ? language : "ar") as Language];
  const workspace = useOperationsWorkspace();
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const state = workspace.state;
  const directory = useMemo(
    () => customerDirectory(state.accounts, state.shipments),
    [state.accounts, state.shipments]
  );
  const query = search.trim().toLocaleLowerCase();
  const filtered = directory.filter(
    customer =>
      !query ||
      [
        customer.name,
        ...customer.phones,
        ...customer.accountIds,
        ...customer.shipmentIds,
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query)
  );
  const selected =
    directory.find(customer => customer.key === selectedKey) ?? null;
  const selectedShipments = selected
    ? state.shipments.filter(
        shipment =>
          !shipment.deleted && selected.shipmentIds.includes(shipment.id)
      )
    : [];
  const selectedAccounts = selected
    ? state.accounts.filter(account => selected.accountIds.includes(account.id))
    : [];

  return (
    <PackingLayout
      title={t.title}
      description={t.description}
      workspace={workspace}
    >
      <div dir={dir} className="space-y-6">
        {workspace.loading && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            {t.loading}
          </div>
        )}
        {workspace.error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
            {t.error} {workspace.error}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-500">
            {numberText(directory.length)} {t.customers} · {t.local}
          </div>
          <label className="flex min-w-[260px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
            <Search size={16} className="text-slate-400" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder={t.search}
              className="w-full bg-transparent outline-none"
              aria-label={t.search}
            />
          </label>
        </div>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)]">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-4 font-bold">
              {t.customers}
            </div>
            {filtered.map(customer => (
              <CustomerRow
                key={customer.key}
                customer={customer}
                selected={customer.key === selectedKey}
                onSelect={() => setSelectedKey(customer.key)}
                t={t}
              />
            ))}
            {filtered.length === 0 && (
              <div className="p-10 text-center text-sm text-slate-500">
                {directory.length ? t.empty : t.noCustomers}
              </div>
            )}
          </section>
          <CustomerDetail
            customer={selected}
            shipments={selectedShipments}
            accounts={selectedAccounts}
            t={t}
          />
        </div>
      </div>
    </PackingLayout>
  );
}

function CustomerRow({
  customer,
  selected,
  onSelect,
  t,
}: {
  customer: CustomerDirectoryEntry;
  selected: boolean;
  onSelect: () => void;
  t: (typeof copy)[Language];
}) {
  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-center gap-3 border-b border-slate-100 px-5 py-4 text-start last:border-0 ${selected ? "bg-sky-50" : "hover:bg-slate-50"}`}
    >
      <span className="rounded-xl bg-sky-100 p-2 text-sky-800">
        <UserRound size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{customer.name || "—"}</span>
        <span className="mt-1 block truncate text-xs text-slate-500">
          {customer.phones.length ? customer.phones.join(" · ") : t.noPhone}
        </span>
      </span>
      <span className="text-end text-xs text-slate-500">
        <span className="block">
          {numberText(customer.pieces)} {t.pieces}
        </span>
        <span className="mt-1 block">{numberText(customer.weight, 3)} kg</span>
      </span>
      {selected ? (
        <ChevronUp size={16} className="text-sky-800" />
      ) : (
        <ChevronDown size={16} className="text-slate-400" />
      )}
    </button>
  );
}

function CustomerDetail({
  customer,
  shipments,
  accounts,
  t,
}: {
  customer: CustomerDirectoryEntry | null;
  shipments: ReturnType<typeof useOperationsWorkspace>["state"]["shipments"];
  accounts: ReturnType<typeof useOperationsWorkspace>["state"]["accounts"];
  t: (typeof copy)[Language];
}) {
  if (!customer)
    return (
      <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500">
        {t.details}
      </section>
    );
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{customer.name || "—"}</h2>
          <p className="mt-2 text-sm text-slate-500">
            {customer.phones.length ? customer.phones.join(" · ") : t.noPhone}
          </p>
        </div>
        <Phone size={19} className="text-sky-800" />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Metric label={t.pieces} value={numberText(customer.pieces)} />
        <Metric label={t.weight} value={numberText(customer.weight, 3)} />
      </div>
      <div className="mt-6">
        <h3 className="font-bold">{t.accounts}</h3>
        <div className="mt-2 space-y-2">
          {accounts.length ? (
            accounts.map(account => (
              <Link
                key={account.id}
                href={`/operations?tab=accounts&account=${encodeURIComponent(account.id)}`}
                className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm hover:bg-sky-50"
              >
                <span>{account.name || "—"}</span>
                <span className="text-xs text-sky-800">{account.id}</span>
              </Link>
            ))
          ) : (
            <p className="text-sm text-slate-500">{t.noCustomers}</p>
          )}
        </div>
      </div>
      <div className="mt-6">
        <h3 className="font-bold">{t.shipments}</h3>
        <div className="mt-2 space-y-2">
          {shipments.length ? (
            shipments.map(shipment => (
              <Link
                key={shipment.id}
                href={
                  isPackedShipment(shipment)
                    ? `/operations/shipments/${encodeURIComponent(shipment.id)}`
                    : "/operations"
                }
                className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm hover:bg-sky-50"
              >
                <span>{shipment.tracking || shipment.id}</span>
                <span className="text-xs text-sky-800">
                  {isPackedShipment(shipment) ? t.openShipment : t.oldShipment}
                </span>
              </Link>
            ))
          ) : (
            <p className="text-sm text-slate-500">{t.noCustomers}</p>
          )}
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-bold">{value}</div>
    </div>
  );
}
