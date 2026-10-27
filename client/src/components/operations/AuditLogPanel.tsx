import { useEffect, useRef, useState } from "react";
import type { PermissionSubject } from "@shared/permissions";
import { permissionAllowed } from "@shared/permissions";
import { trpc } from "@/lib/trpc";

const copy = {
  ar: {
    title: "سجل التدقيق",
    hint: "قراءة فقط من السجل المعتمد على الخادم.",
    loading: "جارٍ تحميل سجل التدقيق…",
    error: "تعذر تحميل سجل التدقيق. تحقق من الشحنة والصلاحية وحاول مرة أخرى.",
    empty: "لا توجد أحداث تدقيق محفوظة.",
    noAccess: "لا تملك الصلاحية المطلوبة لعرض سجل التدقيق.",
    shipmentOnly: "اختر شحنة من نطاق مكتبك؛ لا تسمح صلاحيتك بالسجل العام.",
    shipment: "الشحنة",
    choose: "اختر شحنة لعرض سجلها",
    shipmentId: "معرّف الشحنة",
    open: "عرض السجل",
    all: "السجل العام",
    actor: "المنفذ",
    action: "الإجراء",
    entity: "الكيان",
    record: "السجل",
    time: "الوقت",
    more: "تحميل المزيد",
    loadingMore: "جارٍ التحميل…",
    end: "نهاية السجل",
    retry: "إعادة المحاولة",
    offline: "يتطلب عرض السجل اتصالًا بالخادم.",
  },
  en: {
    title: "Audit log",
    hint: "Read-only events from the server-authoritative log.",
    loading: "Loading audit log…",
    error:
      "Could not load the audit log. Check the shipment and access, then try again.",
    empty: "No audit events are recorded.",
    noAccess: "You do not have the required audit access.",
    shipmentOnly:
      "Select a shipment within your office scope. Your access excludes the global log.",
    shipment: "Shipment",
    choose: "Select a shipment to view its log",
    shipmentId: "Shipment ID",
    open: "View log",
    all: "Global log",
    actor: "Actor",
    action: "Action",
    entity: "Entity",
    record: "Record",
    time: "Time",
    more: "Load more",
    loadingMore: "Loading…",
    end: "End of log",
    retry: "Try again",
    offline: "Viewing the log requires a server connection.",
  },
  zh: {
    title: "审计日志",
    hint: "来自服务器权威日志的只读事件。",
    loading: "正在加载审计日志…",
    error: "无法加载审计日志，请检查货运与权限后重试。",
    empty: "没有已记录的审计事件。",
    noAccess: "您没有所需的审计权限。",
    shipmentOnly: "请选择办公室范围内的货运。您的权限不包括全局日志。",
    shipment: "货运",
    choose: "选择货运以查看日志",
    shipmentId: "货运编号",
    open: "查看日志",
    all: "全局日志",
    actor: "执行者",
    action: "操作",
    entity: "实体",
    record: "记录",
    time: "时间",
    more: "加载更多",
    loadingMore: "正在加载…",
    end: "日志结束",
    retry: "重试",
    offline: "查看日志需要服务器连接。",
  },
  tr: {
    title: "Denetim kaydı",
    hint: "Sunucu kaynaklı kayıttan salt okunur olaylar.",
    loading: "Denetim kaydı yükleniyor…",
    error:
      "Kayıt yüklenemedi. Gönderi ve yetkinizi kontrol edip tekrar deneyin.",
    empty: "Kayıtlı denetim olayı yok.",
    noAccess: "Gerekli denetim yetkiniz yok.",
    shipmentOnly:
      "Ofis kapsamınızdan bir gönderi seçin. Genel kayıt yetkiniz yok.",
    shipment: "Gönderi",
    choose: "Kaydını görmek için bir gönderi seçin",
    shipmentId: "Gönderi kimliği",
    open: "Kaydı görüntüle",
    all: "Genel kayıt",
    actor: "Uygulayan",
    action: "İşlem",
    entity: "Varlık",
    record: "Kayıt",
    time: "Zaman",
    more: "Daha fazla yükle",
    loadingMore: "Yükleniyor…",
    end: "Kaydın sonu",
    retry: "Tekrar dene",
    offline: "Kaydı görüntülemek için sunucu bağlantısı gerekir.",
  },
} as const;
type AuditItem = {
  id: number;
  actorName: string;
  action: string;
  entity: string;
  recordId: string;
  createdAt: Date | string;
};
type AuditShipment = { id: string; tracking: string };
function textFor(language: string) {
  return copy[(language in copy ? language : "ar") as keyof typeof copy];
}
function formatDate(value: Date | string, language: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "—"
    : new Intl.DateTimeFormat(
        language === "ar" ? "ar-MR" : `${language}-u-nu-latn`,
        { dateStyle: "medium", timeStyle: "short" }
      ).format(date);
}
export function auditQueryEnabled(
  subject: PermissionSubject,
  shipmentId?: string
) {
  return (
    permissionAllowed(subject, "audit", "view") &&
    (subject.role === "admin" ||
      (Boolean(shipmentId?.trim()) &&
        permissionAllowed(subject, "tracking", "view")))
  );
}
export default function AuditLogPanel({
  language,
  subject,
  online,
  accessReady,
  userId,
  localOnly,
  shipments = [],
  initialShipmentId = "",
}: {
  language: string;
  subject: PermissionSubject;
  online: boolean;
  accessReady: boolean;
  userId?: string | null;
  localOnly: boolean;
  shipments?: AuditShipment[];
  initialShipmentId?: string;
}) {
  const c = textFor(language);
  const [shipmentId, setShipmentId] = useState(initialShipmentId);
  const [draftId, setDraftId] = useState("");
  const globalReader = subject.role === "admin";
  const canView =
    permissionAllowed(subject, "audit", "view") &&
    (globalReader || permissionAllowed(subject, "tracking", "view"));
  const sessionReady = Boolean(online && accessReady && userId && !localOnly);
  const enabled = sessionReady && auditQueryEnabled(subject, shipmentId);
  const scopeKey = `${userId}:${subject.role}:${subject.offices?.join(",")}:${JSON.stringify(subject.permissions)}:${shipmentId}`;
  return (
    <section
      id="audit-panel"
      className="rounded-2xl border border-[#dce4e7] bg-white p-4 shadow-sm sm:p-5"
      aria-labelledby="audit-panel-title"
    >
      <h2 id="audit-panel-title" className="text-lg font-black text-[#092d50]">
        {c.title}
      </h2>
      <p className="mt-1 text-xs text-[#718088]">{c.hint}</p>
      {!canView ? (
        <p className="mt-4 text-sm text-[#52636e]">{c.noAccess}</p>
      ) : (
        <>
          {!globalReader && (
            <p className="mt-3 text-xs text-[#52636e]">{c.shipmentOnly}</p>
          )}
          <label className="mt-4 grid gap-1.5 text-sm font-semibold text-[#243f52]">
            <span>{c.shipment}</span>
            <select
              className="min-h-11 min-w-0 max-w-xl rounded-xl border border-[#cbd9de] bg-white px-3 py-2"
              value={shipmentId}
              onChange={event => setShipmentId(event.target.value)}
              disabled={!sessionReady}
            >
              <option value="">{globalReader ? c.all : c.choose}</option>
              {shipments.map(shipment => (
                <option key={shipment.id} value={shipment.id}>
                  {shipment.tracking || shipment.id}
                </option>
              ))}
              {shipmentId &&
                !shipments.some(shipment => shipment.id === shipmentId) && (
                  <option value={shipmentId}>{shipmentId}</option>
                )}
            </select>
          </label>
          {!globalReader && (
            <form
              className="mt-3 flex max-w-xl flex-wrap items-end gap-2"
              onSubmit={event => {
                event.preventDefault();
                setShipmentId(draftId.trim());
              }}
            >
              <label className="grid min-w-0 flex-1 gap-1 text-xs text-[#718088]">
                <span>{c.shipmentId}</span>
                <input
                  maxLength={128}
                  value={draftId}
                  onChange={event => setDraftId(event.target.value)}
                  className="min-h-11 min-w-0 rounded-xl border border-[#cbd9de] px-3"
                  disabled={!sessionReady}
                />
              </label>
              <button
                type="submit"
                className="min-h-11 rounded-xl bg-[#092d50] px-4 text-xs font-bold text-white disabled:opacity-50"
                disabled={!sessionReady || !draftId.trim()}
              >
                {c.open}
              </button>
            </form>
          )}
          {!sessionReady && (
            <p className="mt-4 text-xs text-[#718088]">{c.offline}</p>
          )}
          {enabled && (
            <AuditRows
              key={scopeKey}
              language={language}
              shipmentId={shipmentId || undefined}
            />
          )}
        </>
      )}
    </section>
  );
}
function AuditRows({
  language,
  shipmentId,
}: {
  language: string;
  shipmentId?: string;
}) {
  const c = textFor(language);
  const [afterId, setAfterId] = useState<number | undefined>();
  const [items, setItems] = useState<AuditItem[]>([]);
  const loadedCursor = useRef<number | undefined | null>(null);
  const query = trpc.audit.list.useQuery(
    {
      ...(shipmentId ? { shipmentId } : {}),
      ...(afterId === undefined ? {} : { afterId }),
    },
    { retry: false, refetchOnWindowFocus: false, refetchOnMount: "always" }
  );
  useEffect(() => {
    // Never show a cached page from an earlier authenticated scope before a new read.
    if (
      query.isFetching ||
      !query.isFetchedAfterMount ||
      !query.data ||
      loadedCursor.current === afterId
    )
      return;
    loadedCursor.current = afterId;
    const page = query.data as {
      items: AuditItem[];
      nextCursor: number | null;
    };
    setItems(previous =>
      afterId === undefined ? page.items : [...previous, ...page.items]
    );
  }, [afterId, query.data, query.isFetching, query.isFetchedAfterMount]);
  const loadMore = () => {
    if (query.data?.nextCursor != null && !query.isFetching)
      setAfterId(query.data.nextCursor);
  };
  if (query.error)
    return (
      <div
        role="alert"
        className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-900"
      >
        {c.error}
        <button
          type="button"
          className="ms-2 underline"
          onClick={() => void query.refetch()}
        >
          {c.retry}
        </button>
      </div>
    );
  if (query.isLoading || !query.isFetchedAfterMount)
    return <p className="mt-4 text-sm text-[#718088]">{c.loading}</p>;
  return (
    <div className="mt-4">
      {!items.length && (
        <p className="rounded-xl bg-[#f7f8f5] p-3 text-sm text-[#718088]">
          {c.empty}
        </p>
      )}
      <ol className="space-y-2">
        {items.map(item => (
          <li
            key={item.id}
            className="rounded-xl border border-[#e6ecec] p-3 text-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-sm text-[#243f52]">
                {item.actorName || "—"}
              </strong>
              <time className="text-[#718088]">
                {formatDate(item.createdAt, language)}
              </time>
            </div>
            <dl className="mt-2 grid min-w-0 gap-2 sm:grid-cols-3">
              {[
                [c.action, item.action],
                [c.entity, item.entity],
                [c.record, item.recordId],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-[#718088]">{label}</dt>
                  <dd className="mt-1 break-all font-semibold text-[#243f52]">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ol>
      {items.length > 0 && (
        <div className="mt-4 text-center">
          {query.data?.nextCursor != null ? (
            <button
              type="button"
              className="min-h-11 rounded-xl border border-[#cbd9de] px-4 text-sm font-bold text-[#092d50] disabled:opacity-50"
              disabled={query.isFetching}
              onClick={loadMore}
            >
              {query.isFetching ? c.loadingMore : c.more}
            </button>
          ) : (
            <span className="text-xs text-[#718088]">{c.end}</span>
          )}
        </div>
      )}
    </div>
  );
}
