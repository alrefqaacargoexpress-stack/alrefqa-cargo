import { MapPin, Package, RefreshCw } from "lucide-react";
import type { PublicTrackingCopy } from "@/lib/publicTrackingCopy";
import { trackingCopy } from "@/lib/trackingCopy";
import { stageIds } from "@shared/tracking";
import type { PublicTrackingShipment } from "@shared/publicTracking";
import type { TrackingLanguage } from "@/lib/trackingCopy";

type Props = {
  copy: PublicTrackingCopy;
  language: TrackingLanguage;
  shipment: PublicTrackingShipment;
};

function formatNumber(value: number, language: TrackingLanguage) {
  return new Intl.NumberFormat(language === "zh" ? "zh-CN" : language).format(
    value
  );
}

function formatDate(
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

export default function PublicTrackingResult({
  copy,
  language,
  shipment,
}: Props) {
  const existingCopy = trackingCopy[language];
  const stageLabel = shipment.stage
    ? existingCopy.stages[shipment.stage]
    : null;
  const branchLabel = shipment.branch
    ? existingCopy.branches[shipment.branch]
    : copy.noLocation;
  const sourceLabel = shipment.source
    ? existingCopy.branches[shipment.source]
    : copy.noLocation;

  return (
    <section
      aria-labelledby="public-tracking-result-title"
      className="space-y-5"
    >
      <div className="flex flex-col gap-4 rounded-3xl bg-[#092d50] p-6 text-white shadow-[0_18px_45px_rgba(9,45,80,0.16)] sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[#a7c5c5]">
              {copy.status}
            </p>
            <h2
              id="public-tracking-result-title"
              className="mt-2 text-2xl font-bold sm:text-3xl"
            >
              {copy.statusLabels[shipment.status]}
            </h2>
          </div>
          <span
            className="rounded-full border border-[#d9a441]/50 bg-[#d9a441]/15 px-3 py-1.5 text-sm font-bold text-[#f3cf7c]"
            dir="ltr"
          >
            {shipment.tracking}
          </span>
        </div>
        <div className="grid gap-3 border-t border-white/15 pt-4 sm:grid-cols-2">
          <div className="flex items-start gap-3">
            <MapPin
              className="mt-0.5 shrink-0 text-[#d9a441]"
              size={19}
              aria-hidden="true"
            />
            <div>
              <div className="text-xs text-white/60">{copy.branch}</div>
              <div className="mt-1 font-semibold">{branchLabel}</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <RefreshCw
              className="mt-0.5 shrink-0 text-[#d9a441]"
              size={18}
              aria-hidden="true"
            />
            <div>
              <div className="text-xs text-white/60">{copy.lastUpdated}</div>
              <div className="mt-1 font-semibold">
                {formatDate(shipment.updatedAt, language, copy.noUpdate)}
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-white/15 pt-4 text-sm text-white/75">
          <span>
            {copy.source}: <strong className="text-white">{sourceLabel}</strong>
          </span>
          <span>
            {copy.trackingNumber}:{" "}
            <strong className="text-white" dir="ltr">
              {shipment.tracking}
            </strong>
          </span>
        </div>
      </div>

      <div className="rounded-3xl border border-[#d9e5e4] bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#e5f0ef] text-[#267b7b]">
            <Package size={20} aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-xl font-bold text-[#092d50]">
              {copy.goodsTitle}
            </h3>
            <p className="mt-1 text-sm text-[#6b7e82]">
              {formatNumber(shipment.totalPieces, language)} {copy.pieceUnit} ·{" "}
              {formatNumber(shipment.totalWeight, language)} {copy.weightUnit}
            </p>
          </div>
        </div>
        <div className="mt-5 overflow-x-auto rounded-2xl border border-[#e1e9e8]">
          <table className="min-w-[640px] w-full text-start text-sm">
            <thead className="bg-[#f1f7f6] text-[#506a70]">
              <tr>
                <th className="px-4 py-3 font-bold">{copy.cartonNumber}</th>
                <th className="px-4 py-3 font-bold">{copy.name}</th>
                <th className="px-4 py-3 font-bold">{copy.pieces}</th>
                <th className="px-4 py-3 font-bold">{copy.unitWeight}</th>
                <th className="px-4 py-3 font-bold">{copy.weight}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8efee] text-[#183d4d]">
              {shipment.goods.map((good, index) => (
                <tr key={`${good.cartonNumber}-${good.name}-${index}`}>
                  <td className="whitespace-nowrap px-4 py-3" dir="ltr">
                    {good.cartonNumber}
                  </td>
                  <td className="min-w-40 px-4 py-3 font-semibold">
                    {good.name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {formatNumber(good.pieces, language)} {copy.pieceUnit}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3" dir="ltr">
                    {formatNumber(good.unitWeight, language)} {copy.weightUnit}
                  </td>
                  <td
                    className="whitespace-nowrap px-4 py-3 font-semibold"
                    dir="ltr"
                  >
                    {formatNumber(good.weight, language)} {copy.weightUnit}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-[#fbfcfb] font-bold text-[#092d50]">
              <tr>
                <td className="px-4 py-3" colSpan={2}>
                  {copy.total}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {formatNumber(shipment.totalPieces, language)}{" "}
                  {copy.pieceUnit}
                </td>
                <td className="px-4 py-3">—</td>
                <td className="whitespace-nowrap px-4 py-3" dir="ltr">
                  {formatNumber(shipment.totalWeight, language)}{" "}
                  {copy.weightUnit}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="rounded-3xl border border-[#d9e5e4] bg-[#f7fbfa] p-5 sm:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-xl font-bold text-[#092d50]">
            {copy.journeyTitle}
          </h3>
          <p className="text-xs text-[#6b7e82]">{copy.journeyHint}</p>
        </div>
        <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stageIds.map((stage, index) => {
            const selected = shipment.stage === stage;
            return (
              <li
                key={stage}
                aria-current={selected ? "step" : undefined}
                className={`relative rounded-2xl border p-4 ${
                  selected
                    ? "border-[#267b7b] bg-[#e2f0ef] shadow-sm"
                    : "border-[#dfe9e8] bg-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${selected ? "bg-[#267b7b] text-white" : "bg-[#e9efef] text-[#6a7d81]"}`}
                  >
                    {index + 1}
                  </span>
                  <span
                    className={`text-sm font-bold ${selected ? "text-[#125c5c]" : "text-[#52686e]"}`}
                  >
                    {existingCopy.stages[stage]}
                  </span>
                </div>
                {selected && (
                  <span className="mt-3 block text-xs font-bold text-[#267b7b]">
                    {copy.status}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
