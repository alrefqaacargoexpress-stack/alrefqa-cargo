import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, CloudOff, Package, RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/contexts/LanguageContext";
import { customerTrackingCopy } from "@/lib/customerTrackingCopy";
import CustomerTrackingTimeline, {
  formatCustomerTrackingDate,
} from "@/components/customerTracking/CustomerTrackingTimeline";
import { trpc } from "@/lib/trpc";
import type { CustomerTrackingShipment } from "@shared/customerTracking";
import { trackingCopy, type TrackingLanguage } from "@/lib/trackingCopy";

export function formatMyShipmentsTimestamp(
  value: string | null,
  language: TrackingLanguage,
  fallback: string
) {
  return formatCustomerTrackingDate(value, language, fallback);
}

function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function localizedTrackingError(
  error: unknown,
  copy: (typeof customerTrackingCopy)["ar"]
) {
  const code = (error as { data?: { code?: string } } | null)?.data?.code;
  if (code === "FORBIDDEN" || code === "UNAUTHORIZED")
    return copy.loginRequired;
  return copy.error;
}

export default function MyShipments() {
  const { language, dir } = useLanguage();
  const copy = customerTrackingCopy[language];
  const me = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const userId = me.data?.id == null ? null : String(me.data.id);
  const isCustomer = me.data?.accountType === "customer";
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const previousUser = useRef<string | null>(null);
  const [offline, setOffline] = useState(isOffline);
  const tracking = useQuery({
    queryKey: ["customer-mine", userId] as const,
    enabled: Boolean(userId && isCustomer),
    queryFn: ({ signal }) =>
      utils.client.customerTracking.mine.query({}, { signal }),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 0,
    gcTime: 0,
  });

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (previousUser.current !== null && previousUser.current !== userId) {
      const previousKey = ["customer-mine", previousUser.current] as const;
      void queryClient.cancelQueries({ queryKey: previousKey, exact: true });
      queryClient.removeQueries({ queryKey: previousKey, exact: true });
    }
    if (userId && !isCustomer) {
      const currentKey = ["customer-mine", userId] as const;
      void queryClient.cancelQueries({ queryKey: currentKey, exact: true });
      queryClient.removeQueries({ queryKey: currentKey, exact: true });
    }
    previousUser.current = userId;
  }, [queryClient, userId, isCustomer]);

  const retry = () => {
    void me.refetch();
    if (isCustomer) void tracking.refetch();
  };

  if (me.isLoading) return <PageState dir={dir} text={copy.loading} />;

  if (!me.data) {
    return (
      <PageShell dir={dir} copy={copy}>
        <StateCard
          icon={<AlertTriangle size={25} />}
          title={copy.loginRequired}
        >
          <Link
            href="/auth"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#092d50] px-5 text-sm font-bold text-white"
          >
            {copy.signIn}
          </Link>
        </StateCard>
      </PageShell>
    );
  }

  if (!isCustomer) {
    return (
      <PageShell dir={dir} copy={copy}>
        <StateCard icon={<AlertTriangle size={25} />} title={copy.employeeOnly}>
          <Link
            href="/operations"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#092d50] px-5 text-sm font-bold text-white"
          >
            {copy.operations}
          </Link>
        </StateCard>
      </PageShell>
    );
  }

  return (
    <PageShell dir={dir} copy={copy}>
      {offline && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <CloudOff size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{copy.offline}</span>
        </div>
      )}
      {tracking.isLoading ? (
        <StateCard icon={<RefreshCw size={25} />} title={copy.loading}>
          <p className="text-sm text-[#718088]">{copy.loadingHint}</p>
        </StateCard>
      ) : tracking.error ? (
        <StateCard
          icon={<AlertTriangle size={25} />}
          title={localizedTrackingError(tracking.error, copy)}
        >
          <button
            type="button"
            onClick={retry}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#092d50] px-5 text-sm font-bold text-white"
          >
            <RefreshCw size={16} aria-hidden="true" />
            {copy.retry}
          </button>
        </StateCard>
      ) : !tracking.data?.shipments.length ? (
        <StateCard icon={<Package size={25} />} title={copy.empty}>
          <p className="text-sm text-[#718088]">{copy.emptyHint}</p>
        </StateCard>
      ) : (
        <div className="space-y-5">
          {tracking.data.shipments.map(shipment => (
            <ShipmentCard
              key={shipment.tracking}
              shipment={shipment}
              language={language}
              copy={copy}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}

function PageShell({
  children,
  dir,
  copy,
}: {
  children: React.ReactNode;
  dir: "rtl" | "ltr";
  copy: (typeof customerTrackingCopy)["ar"];
}) {
  return (
    <main
      dir={dir}
      className="min-h-screen bg-[#f7f8f5] px-4 py-8 text-[#112c43] sm:px-6"
    >
      <div className="mx-auto max-w-5xl">
        <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-[#092d50] text-[#e0af4e]">
              <Package size={22} aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-2xl font-black text-[#092d50]">
                {copy.title}
              </h1>
              <p className="mt-1 text-sm text-[#718088]">{copy.subtitle}</p>
            </div>
          </div>
          <Link href="/" className="text-sm font-bold text-[#2d6380]">
            {copy.operations === "لوحة المكتب"
              ? "الرئيسية"
              : copy.operations === "Office dashboard"
                ? "Home"
                : copy.operations === "办公室面板"
                  ? "首页"
                  : "Ana sayfa"}
          </Link>
        </header>
        {children}
      </div>
    </main>
  );
}

function PageState({ dir, text }: { dir: "rtl" | "ltr"; text: string }) {
  return (
    <main
      dir={dir}
      className="grid min-h-screen place-items-center bg-[#f7f8f5] p-6 text-[#092d50]"
    >
      <p className="rounded-2xl border border-[#dce4e7] bg-white px-6 py-5 text-sm font-bold shadow-sm">
        {text}
      </p>
    </main>
  );
}

function StateCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-3 rounded-3xl border border-[#dce4e7] bg-white p-7 text-center shadow-sm">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#e8eff1] text-[#2d6380]">
        {icon}
      </span>
      <h2 className="text-xl font-black text-[#092d50]">{title}</h2>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {children}
      </div>
    </section>
  );
}

function ShipmentCard({
  shipment,
  language,
  copy,
}: {
  shipment: CustomerTrackingShipment;
  language: TrackingLanguage;
  copy: (typeof customerTrackingCopy)["ar"];
}) {
  const labels = trackingCopy[language];
  const stage = shipment.stage
    ? labels.stages[shipment.stage]
    : copy.noLocation;
  const branch = shipment.branch
    ? labels.branches[shipment.branch]
    : copy.noLocation;
  return (
    <article className="rounded-3xl border border-[#dce4e7] bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e8efee] pb-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#718088]">
            {copy.shipment}
          </p>
          <h2 className="mt-2 text-2xl font-black text-[#092d50]" dir="ltr">
            {shipment.tracking}
          </h2>
        </div>
        <span className="rounded-full bg-[#e8eff1] px-3 py-1.5 text-sm font-bold text-[#092d50]">
          {copy.statusLabels[shipment.status]}
        </span>
      </div>
      <div className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
        <Info label={copy.currentStage} value={stage} />
        <Info label={copy.branch} value={branch} />
        <Info
          label={copy.lastUpdated}
          value={formatMyShipmentsTimestamp(
            shipment.updatedAt,
            language,
            copy.noUpdate
          )}
        />
      </div>
      <div className="mt-5 rounded-2xl bg-[#f7fbfa] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-black text-[#092d50]">{copy.goods}</h3>
          <span className="text-sm text-[#5e7479]">
            {shipment.totalPieces} {copy.pieces} · {shipment.totalWeight}{" "}
            {copy.weight}
          </span>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {shipment.goods.map((good, index) => (
            <div
              key={`${good.name}-${index}`}
              className="rounded-xl border border-[#e1e9e8] bg-white p-3 text-sm"
            >
              <div className="font-bold text-[#183d4d]">{good.name}</div>
              <div className="mt-1 text-[#5e7479]">
                {good.pieces} {copy.pieces} · {good.weight} {copy.weight}
              </div>
              <div className="mt-2 text-xs font-semibold text-[#267b7b]">
                {good.delivery.status === "delivered"
                  ? `${copy.delivered} · ${formatMyShipmentsTimestamp(good.delivery.deliveredAt, language, copy.noUpdate)}`
                  : copy.pending}
              </div>
              <div className="mt-1 text-xs text-[#718088]">
                {copy.location}: {good.location?.officeLabel ?? copy.noLocation}
                {good.location?.warehouseLabel
                  ? ` · ${good.location.warehouseLabel}`
                  : ""}
                {good.location?.placeLabel
                  ? ` · ${good.location.placeLabel}`
                  : ""}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-5">
        <CustomerTrackingTimeline
          shipment={shipment}
          copy={copy}
          language={language}
        />
      </div>
    </article>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#e1e9e8] bg-[#fbfcfb] p-3">
      <div className="text-xs text-[#718088]">{label}</div>
      <div className="mt-1 font-bold text-[#183d4d]">{value}</div>
    </div>
  );
}
