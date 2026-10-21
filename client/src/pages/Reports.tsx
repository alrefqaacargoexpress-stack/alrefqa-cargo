import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Package,
  Truck,
} from "lucide-react";
import PackingLayout from "@/components/packing/PackingLayout";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOperationsWorkspace } from "@/hooks/useOperationsWorkspace";
import {
  isPackedShipment,
  packingTotals,
  shipmentReports,
} from "@shared/packing";
import type { Shipment } from "@shared/operations";
import { copyFor } from "@/lib/packingCopy";
import {
  PackingScopeBadge,
  PackingStatusBadge,
} from "@/components/packing/PackingPrimitives";

const copy = {
  ar: {
    title: "التقارير",
    description: "تقارير الشحنات من البيانات المحفوظة فعليًا.",
    all: "الكل",
    today: "اليوم",
    inTransit: "في الطريق",
    delivered: "مسلّمة",
    open: "قيد التجهيز",
    unknownDate: "بدون تاريخ إنشاء",
    shared: "مشترك",
    local: "محلي",
    total: "الإجمالي",
    source: "المصدر",
    shipments: "الشحنات",
    noRows: "لا توجد شحنات فعلية ضمن هذا التقرير.",
    created: "تاريخ الإنشاء",
    weight: "الوزن (كجم)",
    status: "الحالة",
    details: "فتح الشحنة",
    operations: "فتح مركز العمليات",
    sharedOnly: "المشترك فقط",
    allSources: "كل المصادر",
    savedLocal: "تشمل المسودات المحلية المحفوظة.",
    loading: "جارٍ تحميل التقارير…",
    error: "تعذر تحميل التقارير.",
  },
  en: {
    title: "Reports",
    description: "Shipment reports from actual saved data.",
    all: "All",
    today: "Today",
    inTransit: "In transit",
    delivered: "Delivered",
    open: "Preparing",
    unknownDate: "No creation date",
    shared: "Shared",
    local: "Local",
    total: "Total",
    source: "Source",
    shipments: "shipments",
    noRows: "No actual shipments are in this report.",
    created: "Created",
    weight: "Weight (kg)",
    status: "Status",
    details: "Open shipment",
    operations: "Open operations",
    sharedOnly: "Shared only",
    allSources: "All sources",
    savedLocal: "Includes saved local drafts.",
    loading: "Loading reports…",
    error: "Could not load reports.",
  },
  zh: {
    title: "报告",
    description: "来自实际保存数据的货运报告。",
    all: "全部",
    today: "今天",
    inTransit: "运输中",
    delivered: "已交付",
    open: "准备中",
    unknownDate: "无创建日期",
    shared: "共享",
    local: "本地",
    total: "总计",
    source: "来源",
    shipments: "货运",
    noRows: "此报告中没有实际货运。",
    created: "创建时间",
    weight: "重量（千克）",
    status: "状态",
    details: "打开货运",
    operations: "打开运营中心",
    sharedOnly: "仅共享",
    allSources: "所有来源",
    savedLocal: "包含已保存的本地草稿。",
    loading: "正在加载报告…",
    error: "无法加载报告。",
  },
  tr: {
    title: "Raporlar",
    description: "Gerçek kayıtlı verilerden gönderi raporları.",
    all: "Tümü",
    today: "Bugün",
    inTransit: "Yolda",
    delivered: "Teslim edildi",
    open: "Hazırlanıyor",
    unknownDate: "Oluşturma tarihi yok",
    shared: "Paylaşılan",
    local: "Yerel",
    total: "Toplam",
    source: "Kaynak",
    shipments: "gönderi",
    noRows: "Bu raporda gerçek gönderi yok.",
    created: "Oluşturulma",
    weight: "Ağırlık (kg)",
    status: "Durum",
    details: "Gönderiyi aç",
    operations: "Operasyonları aç",
    sharedOnly: "Yalnızca paylaşılan",
    allSources: "Tüm kaynaklar",
    savedLocal: "Kaydedilmiş yerel taslaklar dahildir.",
    loading: "Raporlar yükleniyor…",
    error: "Raporlar yüklenemedi.",
  },
} as const;
type Language = keyof typeof copy;
type ReportFilter = "all" | "today" | "inTransit" | "delivered";
const numberText = (value: number, maximumFractionDigits = 0) =>
  new Intl.NumberFormat("en-US", {
    useGrouping: false,
    maximumFractionDigits,
  }).format(value);

export default function Reports() {
  const { language, dir } = useLanguage();
  const t = copy[(language in copy ? language : "ar") as Language];
  const workspace = useOperationsWorkspace();
  const [filter, setFilter] = useState<ReportFilter>("all");
  const [scope, setScope] = useState<"all" | "shared">("all");
  const state = workspace.state;
  const now = useMemo(() => new Date(), []);
  const scopedShipments = useMemo(
    () =>
      scope === "shared"
        ? state.shipments.filter(shipment => shipment.scope === "shared")
        : state.shipments,
    [scope, state.shipments]
  );
  const report = useMemo(
    () => shipmentReports(scopedShipments, now),
    [scopedShipments, now]
  );
  const rows = useMemo(
    () =>
      scopedShipments.filter(shipment => {
        if (filter === "inTransit") return shipment.status === "في الطريق";
        if (filter === "delivered") return shipment.status === "مسلّمة";
        if (filter === "today")
          return (
            isPackedShipment(shipment) &&
            !Number.isNaN(new Date(shipment.packing.createdAt).valueOf()) &&
            new Date(shipment.packing.createdAt).getFullYear() ===
              now.getFullYear() &&
            new Date(shipment.packing.createdAt).getMonth() ===
              now.getMonth() &&
            new Date(shipment.packing.createdAt).getDate() === now.getDate()
          );
        return true;
      }),
    [filter, now, scopedShipments]
  );
  const metrics = [
    { id: "all" as const, label: t.all, value: report.total, icon: Package },
    {
      id: "today" as const,
      label: t.today,
      value: report.today,
      icon: CalendarDays,
    },
    {
      id: "inTransit" as const,
      label: t.inTransit,
      value: report.inTransit,
      icon: Truck,
    },
    {
      id: "delivered" as const,
      label: t.delivered,
      value: report.delivered,
      icon: CheckCircle2,
    },
  ];
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
          <p className="text-sm text-slate-500">{t.savedLocal}</p>
          <div className="flex rounded-xl border border-slate-200 bg-white p-1 text-sm">
            <button
              onClick={() => setScope("all")}
              className={`rounded-lg px-3 py-2 font-semibold ${scope === "all" ? "bg-sky-950 text-white" : "text-slate-600"}`}
            >
              {t.allSources}
            </button>
            <button
              onClick={() => setScope("shared")}
              className={`rounded-lg px-3 py-2 font-semibold ${scope === "shared" ? "bg-sky-950 text-white" : "text-slate-600"}`}
            >
              {t.sharedOnly}
            </button>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(metric => (
            <button
              key={metric.id}
              onClick={() => setFilter(metric.id)}
              className={`rounded-2xl border bg-white p-5 text-start transition hover:border-sky-300 ${filter === metric.id ? "border-sky-700 ring-2 ring-sky-100" : "border-slate-200"}`}
            >
              <metric.icon size={19} className="text-sky-800" />
              <div className="mt-4 text-xs text-slate-500">{metric.label}</div>
              <div className="mt-1 text-2xl font-bold">
                {numberText(metric.value)}
              </div>
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label={t.open} value={report.open} />
          <Stat label={t.unknownDate} value={report.unknownDate} />
          <Stat label={copyFor(language).pending} value={report.pending} />
          <Stat
            label={`${t.shared} / ${t.local}`}
            value={`${numberText(report.shared)} / ${numberText(report.local)}`}
          />
        </div>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-bold">
                {filter === "all"
                  ? t.all
                  : metrics.find(metric => metric.id === filter)?.label}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {numberText(rows.length)} {t.shipments}
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">
              {scope === "shared" ? t.shared : t.allSources}
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {rows.map(shipment => (
              <ReportRow
                key={shipment.id}
                shipment={shipment}
                t={t}
                language={language}
              />
            ))}
            {rows.length === 0 && (
              <div className="p-10 text-center text-sm text-slate-500">
                {t.noRows}
              </div>
            )}
          </div>
        </section>
      </div>
    </PackingLayout>
  );
}

function ReportRow({
  shipment,
  t,
  language,
}: {
  shipment: Shipment;
  t: (typeof copy)[Language];
  language: string;
}) {
  const packed = isPackedShipment(shipment);
  const weight = packed ? packingTotals(shipment.packing).weight : null;
  const status =
    shipment.status === "في الطريق"
      ? t.inTransit
      : shipment.status === "مسلّمة"
        ? t.delivered
        : shipment.status === "قيد التجهيز"
          ? t.open
          : shipment.status;
  const created = packed ? new Date(shipment.packing.createdAt) : null;
  const date =
    created && !Number.isNaN(created.valueOf())
      ? created.toLocaleDateString(
          language === "ar" ? "ar-MR-u-nu-latn" : `${language}-u-nu-latn`
        )
      : "—";
  return (
    <div className="flex flex-wrap items-center gap-4 px-5 py-4">
      <div className="rounded-xl bg-slate-100 p-2 text-sky-800">
        <Clock3 size={17} />
      </div>
      <div className="min-w-[180px] flex-1">
        <div className="font-bold">
          {shipment.tracking || shipment.id}{" "}
          <PackingScopeBadge scope={shipment.scope} c={copyFor(language)} />
        </div>
        <div className="mt-1 text-xs text-slate-500">
          {shipment.route} · {date}
        </div>
      </div>
      <div className="text-sm">
        <div className="text-xs text-slate-500">{t.status}</div>
        <PackingStatusBadge status={shipment.status} c={copyFor(language)} />
      </div>
      <div className="text-sm">
        <div className="text-xs text-slate-500">{t.weight}</div>
        <div className="font-semibold">
          {weight === null ? "—" : numberText(weight, 3)}
        </div>
      </div>
      <Link
        href={
          packed
            ? `/operations/shipments/${encodeURIComponent(shipment.id)}`
            : "/operations"
        }
        className="font-bold text-sky-800"
      >
        {packed ? t.details : t.operations}
      </Link>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-bold">
        {typeof value === "number" ? numberText(value) : value}
      </div>
    </div>
  );
}
