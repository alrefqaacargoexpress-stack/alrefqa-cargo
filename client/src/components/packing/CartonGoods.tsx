import { Trash2, RotateCcw } from "lucide-react";
import type { PackingGoods, PackingTotals } from "@shared/packing";
import type { PackingCopy } from "@/lib/packingCopy";
import {
  formatLocalNumber,
  packingSecondaryClass,
} from "@/components/packing/PackingPrimitives";

export type CartonGoodsGroup = PackingTotals & {
  key: string;
  name: string;
  phones: string[];
  entries: PackingGoods[];
  repetitions: number;
};

export default function CartonGoods({
  group,
  cartonNumber,
  c,
  language,
  showFinance,
  sourceCurrency,
  canEdit,
  onDelete,
  onRestore,
}: {
  group: CartonGoodsGroup;
  cartonNumber: number;
  c: PackingCopy;
  language: string;
  showFinance: boolean;
  sourceCurrency: string;
  canEdit: boolean;
  onDelete: (entry: PackingGoods) => void;
  onRestore: (entry: PackingGoods) => void;
}) {
  const activeEntries = group.entries.filter(entry => !entry.deleted);
  const deletedOnly = activeEntries.length === 0;
  return (
    <details
      className="rounded-xl border border-slate-100 bg-slate-50/60"
      data-testid="carton-group"
      data-group-key={group.key}
    >
      <summary className="cursor-pointer list-none px-3 py-3 [&::-webkit-details-marker]:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="min-w-0">
            <b className="text-[#092d50]">{group.name}</b>
            {deletedOnly && (
              <span className="ms-2 rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">
                {c.deleted}
              </span>
            )}
            {group.phones.length > 0 && (
              <span className="ms-2 text-xs text-[#718088]" dir="ltr">
                {group.phones.join(" · ")}
              </span>
            )}
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#718088]">
              <span>
                {c.itemCount}: {formatLocalNumber(1, language)}
              </span>
              <span>
                {c.actualPieces}: {formatLocalNumber(group.pieces, language)}
              </span>
              <span>
                {c.repetitions}:{" "}
                {formatLocalNumber(group.repetitions, language)}
              </span>
            </div>
          </div>
          <div className="text-end text-xs text-[#718088]">
            <div>{formatLocalNumber(group.weight, language, 3)} kg</div>
            <div className="font-bold text-[#092d50]">
              {showFinance
                ? `${formatLocalNumber(group.amount, language, 2)} ${sourceCurrency}`
                : c.amountHidden}
            </div>
          </div>
        </div>
      </summary>
      <div className="border-t border-slate-200 px-3 py-2">
        <ul className="grid gap-2">
          {group.entries.map(entry => (
            <li
              key={entry.id}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2 text-xs ${entry.deleted ? "border-red-100 opacity-70" : "border-slate-100"}`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    className={entry.deleted ? "line-through" : "font-semibold"}
                  >
                    {entry.name}
                  </span>
                  {entry.phone && (
                    <span className="text-[#718088]" dir="ltr">
                      {entry.phone}
                    </span>
                  )}
                  {entry.deleted && (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700">
                      {c.deleted}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[#718088]">
                  {formatLocalNumber(entry.pieces, language)} {c.pieces} ·{" "}
                  {formatLocalNumber(entry.unitWeight, language, 3)} kg{" "}
                  {c.unitWeight} ·{" "}
                  {formatLocalNumber(
                    entry.unitWeight * entry.pieces,
                    language,
                    3
                  )}{" "}
                  kg {c.totalWeight}
                </div>
                {entry.deleted?.reason && (
                  <div className="mt-1 text-red-700">
                    {entry.deleted.reason}
                  </div>
                )}
              </div>
              {canEdit &&
                (entry.deleted ? (
                  <button
                    type="button"
                    className={`${packingSecondaryClass} min-h-9 gap-1 px-2 text-xs`}
                    onClick={() => onRestore(entry)}
                  >
                    <RotateCcw size={13} />
                    {c.restore}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`${packingSecondaryClass} min-h-9 gap-1 border-red-200 px-2 text-xs text-red-700 hover:border-red-300 hover:bg-red-50`}
                    onClick={() => onDelete(entry)}
                  >
                    <Trash2 size={13} />
                    {c.delete}
                  </button>
                ))}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
