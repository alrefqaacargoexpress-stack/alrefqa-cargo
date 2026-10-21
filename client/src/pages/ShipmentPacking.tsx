import { useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, ArrowRight, Check, Lock, Plus, Send } from "lucide-react";
import PackingLayout from "@/components/packing/PackingLayout";
import {
  PackingField,
  PackingScopeBadge,
  PackingStatusBadge,
  SourceBadge,
  TrackingNumber,
  formatLocalNumber,
  packingPrimaryClass,
  packingSecondaryClass,
  packingInputClass,
} from "@/components/packing/PackingPrimitives";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOperationsWorkspace } from "@/hooks/useOperationsWorkspace";
import { copyFor } from "@/lib/packingCopy";
import {
  addPackingGoods,
  changePackingStatus,
  closePackingCarton,
  goodsTotals,
  isPackedShipment,
  packingCustomers,
  packingTotals,
  sourceCurrency,
  type PackedShipment,
} from "@shared/packing";

export default function ShipmentPacking() {
  const workspace = useOperationsWorkspace();
  const { language } = useLanguage();
  const c = copyFor(language);
  const params = useParams<{ id: string }>();
  const sourceShipment = workspace.state.shipments.find(
    item => item.id === params.id
  );
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [unitWeight, setUnitWeight] = useState("");
  const [pieces, setPieces] = useState("1");
  const packed =
    sourceShipment && isPackedShipment(sourceShipment) ? sourceShipment : null;

  if (!packed)
    return (
      <PackingLayout workspace={workspace} title={c.shipmentDetails}>
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-black text-[#092d50]">
            {sourceShipment ? c.legacyShipment : c.noResults}
          </h2>
          {sourceShipment && (
            <p className="mt-2 text-sm text-[#718088]">{c.legacySummary}</p>
          )}
          <Link
            href={sourceShipment ? "/operations" : "/operations/shipments"}
            className={`${packingSecondaryClass} mt-5`}
          >
            {sourceShipment ? c.viewOperations : c.returnToList}
          </Link>
        </section>
      </PackingLayout>
    );

  const totals = packingTotals(packed.packing);
  const canEdit = workspace.canEditShipments && packed.status === "قيد التجهيز";
  const errorText = (value: unknown) => {
    const code = value instanceof Error ? value.message : "";
    if (code === "carton_empty" || code === "carton_closed")
      return c.cartonEmpty;
    if (code === "close_carton_first") return c.closeCarton;
    if (code === "invalid_weight") return c.invalidWeight;
    if (code === "invalid_pieces") return c.invalidPieces;
    return c.error;
  };
  const save = async (next: PackedShipment, label: string) => {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    try {
      const ok = await workspace.saveShipment(next, label);
      if (ok) setError(null);
      else setError(workspace.error ?? c.saveError);
      return ok;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const addGoods = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!canEdit) {
      setError(c.canNotEdit);
      return;
    }
    const weight = Number(unitWeight);
    const count = Number(pieces);
    if (!name.trim()) {
      setError(c.invalidTracking);
      return;
    }
    if (
      !Number.isFinite(weight) ||
      weight <= 0 ||
      Math.abs(Math.round(weight * 1000) - weight * 1000) > 0.0001
    ) {
      setError(c.invalidWeight);
      return;
    }
    if (!Number.isSafeInteger(count) || count <= 0) {
      setError(c.invalidPieces);
      return;
    }
    try {
      const next = addPackingGoods(packed, {
        name: name.trim(),
        phone: phone.trim(),
        unitWeight: weight,
        pieces: count,
      });
      if (await save(next, `${c.addGoods}: ${name.trim()}`)) {
        setName("");
        setPhone("");
        setUnitWeight("");
        setPieces("1");
      }
    } catch (value) {
      setError(errorText(value));
    }
  };
  const closeCarton = async () => {
    if (!canEdit) {
      setError(c.canNotEdit);
      return;
    }
    try {
      const next = closePackingCarton(packed);
      await save(next, `${c.closeCarton}: ${packed.tracking}`);
    } catch (value) {
      setError(errorText(value));
    }
  };
  const send = async () => {
    if (!workspace.canEditShipments || packed.status !== "قيد التجهيز") {
      setError(c.canNotEdit);
      return;
    }
    if (!window.confirm(c.confirmSend)) return;
    try {
      await save(
        changePackingStatus(packed, "في الطريق"),
        `${c.sendShipment}: ${packed.tracking}`
      );
    } catch (value) {
      setError(errorText(value));
    }
  };
  const delivered = async () => {
    if (!workspace.canEditShipments || packed.status !== "في الطريق") {
      setError(c.canNotEdit);
      return;
    }
    if (!window.confirm(c.confirmDelivered)) return;
    try {
      await save(
        changePackingStatus(packed, "مسلّمة"),
        `${c.markDelivered}: ${packed.tracking}`
      );
    } catch (value) {
      setError(errorText(value));
    }
  };

  return (
    <PackingLayout
      workspace={workspace}
      title={c.shipmentDetails}
      description={c.sourceInfo}
    >
      <div className="mb-4">
        <Link
          href="/operations/shipments"
          className="inline-flex items-center gap-1 text-sm font-bold text-[#2d6380]"
        >
          {language === "ar" ? (
            <ArrowRight size={16} />
          ) : (
            <ArrowLeft size={16} />
          )}
          {c.returnToList}
        </Link>
      </div>
      <section className="rounded-3xl border border-[#dce4e7] bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <TrackingNumber value={packed.tracking} />
              <SourceBadge source={packed.packing.source} c={c} />
              <PackingScopeBadge scope={packed.scope} c={c} />
            </div>
            <p className="mt-2 text-sm text-[#718088]">{packed.route}</p>
          </div>
          <PackingStatusBadge status={packed.status} c={c} />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 border-y border-slate-100 py-4 sm:grid-cols-4">
          <Metric
            label={c.totalPieces}
            value={formatLocalNumber(totals.pieces, language)}
          />
          <Metric
            label={c.totalWeight}
            value={`${formatLocalNumber(totals.weight, language, 3)} kg`}
          />
          <Metric
            label={c.cartons}
            value={formatLocalNumber(packed.packing.cartons.length, language)}
          />
          <Metric
            label={c.totalCost}
            value={
              workspace.showFinance
                ? `${formatLocalNumber(totals.amount, language, 2)} ${sourceCurrency[packed.packing.source]}`
                : c.amountHidden
            }
          />
        </div>
        {workspace.showFinance && (
          <p className="mt-3 text-xs text-[#718088]">
            {c.pricePerKg}:{" "}
            {formatLocalNumber(packed.packing.pricePerKg, language, 2)}{" "}
            {sourceCurrency[packed.packing.source]}
          </p>
        )}
        {!workspace.showFinance && (
          <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-[#718088]">
            {c.amountHidden}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {error}
          </p>
        )}
      </section>

      {canEdit && (
        <form
          onSubmit={addGoods}
          className="mt-5 rounded-3xl border border-[#dce4e7] bg-white p-5 shadow-sm sm:p-7"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-[#092d50]">
                {c.addGoods}
              </h2>
              <p className="text-xs text-[#718088]">
                {c.currentCarton}: {packed.packing.cartons.at(-1)?.number}
              </p>
            </div>
            <Plus className="text-[#d9a441]" size={21} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <PackingField label={c.nameOrBrand} required>
              <input
                aria-label={c.nameOrBrand}
                required
                maxLength={240}
                disabled={saving}
                className={packingInputClass}
                value={name}
                onChange={event => setName(event.target.value)}
              />
            </PackingField>
            <PackingField label={`${c.phone} (${c.optional})`}>
              <input
                aria-label={`${c.phone} (${c.optional})`}
                maxLength={64}
                disabled={saving}
                className={packingInputClass}
                value={phone}
                onChange={event => setPhone(event.target.value)}
              />
            </PackingField>
            <PackingField label={c.unitWeight} required hint="0.001">
              <input
                aria-label={c.unitWeight}
                required
                type="number"
                min="0.001"
                max="1000000"
                disabled={saving}
                step="0.001"
                inputMode="decimal"
                className={packingInputClass}
                value={unitWeight}
                onChange={event => setUnitWeight(event.target.value)}
              />
            </PackingField>
            <PackingField label={c.pieces} required>
              <input
                aria-label={c.pieces}
                required
                type="number"
                min="1"
                max="1000000"
                disabled={saving}
                step="1"
                inputMode="numeric"
                className={packingInputClass}
                value={pieces}
                onChange={event => setPieces(event.target.value)}
              />
            </PackingField>
          </div>
          <button
            disabled={saving}
            className={`${packingPrimaryClass} mt-5 gap-2`}
            type="submit"
          >
            <Plus size={17} />
            {c.addGoods}
          </button>
        </form>
      )}

      <section className="mt-5 grid gap-4">
        {packed.packing.cartons.map(carton => (
          <CartonCard
            key={carton.number}
            carton={carton}
            c={c}
            language={language}
            showFinance={workspace.showFinance}
            price={packed.packing.pricePerKg}
            open={
              canEdit &&
              !saving &&
              carton.number === packed.packing.cartons.at(-1)?.number
            }
            onClose={closeCarton}
          />
        ))}
      </section>

      {packingCustomers(packed.packing).length > 0 && (
        <section className="mt-5 rounded-3xl border border-[#dce4e7] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-[#092d50]">
            {c.customerSummary}
          </h2>
          <div className="mt-3 grid gap-2">
            {packingCustomers(packed.packing).map(customer => (
              <div
                key={customer.key}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3 text-sm"
              >
                <div>
                  <b>{customer.name}</b>
                  {customer.phones.length > 0 && (
                    <span className="ms-2 text-[#718088]" dir="ltr">
                      {customer.phones.join(" · ")}
                    </span>
                  )}
                  <p className="mt-1 text-xs text-[#718088]">
                    {c.cartons}: {customer.cartons.join(", ")}
                  </p>
                </div>
                <div className="text-end">
                  <b>
                    {formatLocalNumber(customer.pieces, language)} {c.pieces}
                  </b>
                  <p className="text-xs text-[#718088]">
                    {formatLocalNumber(customer.weight, language, 3)} kg
                  </p>
                  {workspace.showFinance && (
                    <p className="text-sm font-bold text-[#092d50]">
                      {formatLocalNumber(customer.amount, language, 2)}{" "}
                      {sourceCurrency[packed.packing.source]}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        {packed.status === "قيد التجهيز" && (
          <button
            disabled={!workspace.canEditShipments || saving}
            onClick={() => void send()}
            className={`${packingPrimaryClass} gap-2`}
          >
            <Send size={16} />
            {c.sendShipment}
          </button>
        )}
        {packed.status === "في الطريق" && (
          <button
            disabled={!workspace.canEditShipments || saving}
            onClick={() => void delivered()}
            className={`${packingPrimaryClass} gap-2`}
          >
            <Check size={16} />
            {c.markDelivered}
          </button>
        )}
        {packed.status === "مسلّمة" && (
          <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800">
            <Lock size={15} />
            {c.readOnly}
          </span>
        )}
      </div>
    </PackingLayout>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block text-xs text-[#718088]">{label}</span>
      <b className="mt-1 block text-sm text-[#092d50]">{value}</b>
    </div>
  );
}
function CartonCard({
  carton,
  c,
  language,
  showFinance,
  price,
  open,
  onClose,
}: {
  carton: PackedShipment["packing"]["cartons"][number];
  c: ReturnType<typeof copyFor>;
  language: string;
  showFinance: boolean;
  price: number;
  open: boolean;
  onClose: () => Promise<void>;
}) {
  const totals = goodsTotals(carton.goods, price);
  return (
    <article className="rounded-3xl border border-[#dce4e7] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-black text-[#092d50]">
            {c.carton} {formatLocalNumber(carton.number, language)}
          </h2>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${carton.closed ? "bg-slate-100 text-slate-700" : "bg-amber-50 text-amber-800"}`}
          >
            {carton.closed ? c.closedCarton : c.openCarton}
          </span>
        </div>
        {open && carton.goods.length > 0 && (
          <button
            className={`${packingSecondaryClass} gap-2`}
            onClick={() => void onClose()}
          >
            <Lock size={15} />
            {c.closeCarton}
          </button>
        )}
      </div>
      {carton.goods.length ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[540px] text-start text-sm">
            <thead className="text-xs text-[#718088]">
              <tr>
                <th className="pb-2 pe-3 text-start">{c.name}</th>
                <th className="pb-2 pe-3 text-start">{c.pieces}</th>
                <th className="pb-2 pe-3 text-start">{c.unitWeight}</th>
                <th className="pb-2 text-start">{c.totalWeight}</th>
              </tr>
            </thead>
            <tbody>
              {carton.goods.map(item => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="py-2 pe-3 font-semibold">
                    {item.name}
                    {item.phone && (
                      <span
                        className="ms-2 text-xs font-normal text-[#718088]"
                        dir="ltr"
                      >
                        {item.phone}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pe-3">
                    {formatLocalNumber(item.pieces, language)}
                  </td>
                  <td className="py-2 pe-3">
                    {formatLocalNumber(item.unitWeight, language, 3)} kg
                  </td>
                  <td className="py-2">
                    {formatLocalNumber(
                      item.unitWeight * item.pieces,
                      language,
                      3
                    )}{" "}
                    kg
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-slate-50 px-3 py-3 text-sm text-[#718088]">
          {c.noGoods}
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-sm sm:grid-cols-3">
        <Metric
          label={c.totalPieces}
          value={formatLocalNumber(totals.pieces, language)}
        />
        <Metric
          label={c.totalWeight}
          value={`${formatLocalNumber(totals.weight, language, 3)} kg`}
        />
        <Metric
          label={c.totalCost}
          value={
            showFinance
              ? formatLocalNumber(totals.amount, language, 2)
              : c.amountHidden
          }
        />
      </div>
    </article>
  );
}
