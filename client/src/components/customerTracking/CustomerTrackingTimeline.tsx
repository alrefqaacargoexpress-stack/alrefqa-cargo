import { MapPin, RefreshCw } from "lucide-react";
import type { CustomerTrackingShipment } from "@shared/customerTracking";
import { trackingCopy, type TrackingLanguage } from "@/lib/trackingCopy";
import type { CustomerTrackingCopy } from "@/lib/customerTrackingCopy";

type Props = {
  shipment: CustomerTrackingShipment;
  copy: CustomerTrackingCopy;
  language: TrackingLanguage;
};

export function formatCustomerTrackingDate(
  value: string | null,
  language: TrackingLanguage,
  fallback: string
) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return fallback;
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function CustomerTrackingTimeline({
  shipment,
  copy,
  language,
}: Props) {
  const labels = trackingCopy[language];
  return (
    <section className="rounded-2xl border border-[#d9e5e4] bg-[#f7fbfa] p-4 sm:p-5">
      <div className="flex items-center gap-2 text-[#092d50]">
        <RefreshCw size={17} aria-hidden="true" />
        <h3 className="font-black">{copy.timeline}</h3>
      </div>
      {shipment.timeline.length === 0 ? (
        <p className="mt-3 text-sm text-[#718088]">{copy.timelineEmpty}</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {shipment.timeline.map((event, index) => {
            const stage = event.stage
              ? labels.stages[event.stage]
              : copy.noLocation;
            const branch = event.branch
              ? labels.branches[event.branch]
              : copy.noLocation;
            return (
              <li
                key={`${event.at}-${event.stage ?? "none"}-${event.branch ?? "none"}-${index}`}
                className="flex items-start gap-3 rounded-xl border border-[#e1e9e8] bg-white p-3"
              >
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-[#e5f0ef] text-[#267b7b]">
                  <MapPin size={15} aria-hidden="true" />
                </span>
                <div className="min-w-0 text-sm">
                  <div className="font-bold text-[#183d4d]">{stage}</div>
                  <div className="mt-1 text-[#5e7479]">
                    {branch} ·{" "}
                    {formatCustomerTrackingDate(
                      event.at,
                      language,
                      copy.noUpdate
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
