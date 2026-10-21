import type { ReactNode } from "react";
import type { PackingSource } from "@shared/packing";
import type { PackingCopy } from "@/lib/packingCopy";
import { useLanguage } from "@/contexts/LanguageContext";

export const packingInputClass =
  "min-h-11 w-full rounded-xl border border-[#dce4e7] bg-white px-3 text-sm text-[#112c43] outline-none transition focus:border-[#2d6380] focus:ring-4 focus:ring-[#2d6380]/10 disabled:bg-slate-50 disabled:text-slate-500";
export const packingPrimaryClass =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-[#092d50] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#123f66] disabled:cursor-not-allowed disabled:opacity-45";
export const packingSecondaryClass =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-[#cbd9dd] bg-white px-4 py-2 text-sm font-bold text-[#23445d] transition hover:border-[#2d6380] hover:bg-[#f1f5f4] disabled:cursor-not-allowed disabled:opacity-45";

export function PackingField({
  label,
  children,
  required = false,
  hint,
}: {
  label: string;
  children: ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold text-[#243f52]">
      <span>
        {label}
        {required && (
          <span className="ms-1 text-red-600" aria-hidden="true">
            *
          </span>
        )}
      </span>
      {children}
      {hint && (
        <span className="text-xs font-normal text-[#718088]">{hint}</span>
      )}
    </label>
  );
}

export function SourceBadge({
  source,
  c,
}: {
  source: PackingSource;
  c: PackingCopy;
}) {
  const labels: Record<PackingSource, string> = {
    dubai: c.dubai,
    turkey: c.turkey,
    china: c.china,
  };
  const tones: Record<PackingSource, string> = {
    dubai: "bg-amber-50 text-amber-800",
    turkey: "bg-red-50 text-red-700",
    china: "bg-sky-50 text-sky-800",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${tones[source]}`}
    >
      {labels[source]}
    </span>
  );
}

export function PackingScopeBadge({
  scope,
  c,
}: {
  scope?: string;
  c: PackingCopy;
}) {
  const key =
    scope === "pending" ? "pending" : scope === "local" ? "local" : "shared";
  const styles =
    key === "pending"
      ? "bg-amber-50 text-amber-800"
      : key === "local"
        ? "bg-blue-50 text-blue-800"
        : "bg-emerald-50 text-emerald-800";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${styles}`}
    >
      {c[key]}
    </span>
  );
}

export function PackingStatusBadge({
  status,
  c,
}: {
  status: string;
  c: PackingCopy;
}) {
  const { language } = useLanguage();
  const old = {
    ar: {
      arrived: "وصلت للمكتب",
      ready: "جاهزة للتسليم",
      awaitingPayment: "بانتظار الدفع",
    },
    en: {
      arrived: "Arrived at office",
      ready: "Ready for delivery",
      awaitingPayment: "Awaiting payment",
    },
    zh: {
      arrived: "已到达办公室",
      ready: "可交付",
      awaitingPayment: "等待付款",
    },
    tr: {
      arrived: "Ofise ulaştı",
      ready: "Teslime hazır",
      awaitingPayment: "Ödeme bekliyor",
    },
  }[language];
  const label =
    status === "في الطريق"
      ? c.inTransit
      : status === "مسلّمة"
        ? c.delivered
        : status === "وصلت للمكتب"
          ? old.arrived
          : status === "جاهزة للتسليم"
            ? old.ready
            : status === "بانتظار الدفع"
              ? old.awaitingPayment
              : c.open;
  const styles =
    status === "في الطريق"
      ? "bg-blue-50 text-blue-800"
      : status === "مسلّمة"
        ? "bg-emerald-50 text-emerald-800"
        : "bg-amber-50 text-amber-800";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${styles}`}
    >
      {label}
    </span>
  );
}

export function formatLocalNumber(
  value: number,
  language: string,
  maximumFractionDigits = 0
) {
  const locale =
    language === "ar" ? "ar-MR-u-nu-latn" : `${language}-u-nu-latn`;
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits,
    minimumFractionDigits: maximumFractionDigits === 2 ? 2 : 0,
  }).format(value);
}

export function TrackingNumber({ value }: { value: string }) {
  return (
    <b
      dir="ltr"
      style={{ unicodeBidi: "isolate" }}
      className="font-mono tracking-wide"
    >
      {value}
    </b>
  );
}
