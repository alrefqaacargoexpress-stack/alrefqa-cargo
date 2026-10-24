import { useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Lock,
  Plus,
  Search,
  Send,
} from "lucide-react";
import PublishedPackingTariff from "@/components/packing/PublishedPackingTariff";
import PackingLayout from "@/components/packing/PackingLayout";
import ShipmentDeleteActions from "@/components/packing/ShipmentDeleteActions";
import CartonGoods, {
  type CartonGoodsGroup,
} from "@/components/packing/CartonGoods";
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
  deletePackingGoods,
  goodsTotals,
  isPackedShipment,
  matchesPackingGoods,
  normalizeName,
  cartonGroups,
  packingCustomers,
  packingTotals,
  packingTotalsMRU,
  restorePackingGoods,
  sourceCurrency,
  type PackedShipment,
  type PackingCarton,
  type PackingGoods,
} from "@shared/packing";

export default function ShipmentPacking() {
  const workspace = useOperationsWorkspace();
  const { language } = useLanguage();
  const c = copyFor(language);
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
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
  const [search, setSearch] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
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

  const sourceRateApproved =
    Number.isFinite(packed.packing.pricePerKg) && packed.packing.pricePerKg > 0;
  const totals = packingTotals(
    sourceRateApproved ? packed.packing : { ...packed.packing, pricePerKg: 0 }
  );
  const mruTotals = packingTotalsMRU(packed.packing);
  const canEdit = workspace.canEditShipments && packed.status === "قيد التجهيز";
  const canMarkDelivered =
    workspace.canUpdateTracking && packed.status === "في الطريق";
  const canSend = workspace.canSendShipments && packed.status === "قيد التجهيز";
  const openCartonsWithGoods = packed.packing.cartons.filter(
    carton => !carton.closed && carton.goods.some(goods => !goods.deleted)
  );
  const hasGoods = packed.packing.cartons.some(carton =>
    carton.goods.some(goods => !goods.deleted)
  );
  const sendReady = canSend && hasGoods && openCartonsWithGoods.length === 0;
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
      else
        setError(workspace.lastSaveError?.() ?? workspace.error ?? c.saveError);
      return ok;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const addGoods = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!canEdit) return setError(c.canNotEdit);
    const weight = Number(unitWeight);
    const count = Number(pieces);
    if (!name.trim()) return setError(c.invalidTracking);
    if (
      !Number.isFinite(weight) ||
      weight <= 0 ||
      Math.abs(Math.round(weight * 1000) - weight * 1000) > 0.0001
    )
      return setError(c.invalidWeight);
    if (!Number.isSafeInteger(count) || count <= 0)
      return setError(c.invalidPieces);
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
    if (!canEdit) return setError(c.canNotEdit);
    try {
      await save(
        closePackingCarton(packed),
        `${c.closeCarton}: ${packed.tracking}`
      );
    } catch (value) {
      setError(errorText(value));
    }
  };
  const deleteEntry = async (carton: PackingCarton, entry: PackingGoods) => {
    if (!canEdit || entry.deleted) return setError(c.canNotEdit);
    const prompt = c.confirmDelete
      .replace("{name}", entry.name)
      .replace("{carton}", String(carton.number))
      .replace("{weight}", String(entry.unitWeight))
      .replace("{pieces}", String(entry.pieces));
    if (!window.confirm(prompt)) return;
    try {
      await save(
        deletePackingGoods(packed, entry.id, c.deleteReason),
        `${c.delete}: ${entry.name}`
      );
    } catch (value) {
      setError(errorText(value));
    }
  };
  const restoreEntry = async (carton: PackingCarton, entry: PackingGoods) => {
    if (!canEdit || !entry.deleted) return setError(c.canNotEdit);
    const prompt = c.confirmRestore
      .replace("{name}", entry.name)
      .replace("{carton}", String(carton.number));
    if (!window.confirm(prompt)) return;
    try {
      await save(
        restorePackingGoods(packed, entry.id),
        `${c.restore}: ${entry.name}`
      );
    } catch (value) {
      setError(errorText(value));
    }
  };
  const send = async () => {
    if (!canSend) return setError(c.canNotEdit);
    if (!hasGoods) return setError(c.noGoods);
    if (openCartonsWithGoods.length > 0) return setError(c.sendBlocked);
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
    if (!canMarkDelivered || packed.status !== "في الطريق")
      return setError(c.canNotEdit);
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
          <div className="flex flex-wrap items-center justify-end gap-2">
            <PackingStatusBadge status={packed.status} c={c} />
            <ShipmentDeleteActions
              shipment={packed}
              workspace={workspace}
              c={c}
              saving={saving}
              statusLabel={
                packed.status === "قيد التجهيز"
                  ? c.open
                  : packed.status === "في الطريق"
                    ? c.inTransit
                    : packed.status === "مسلّمة"
                      ? c.delivered
                      : packed.status
              }
              onSuccess={() => navigate("/operations/shipments")}
            />
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 border-y border-slate-100 py-4 sm:grid-cols-5">
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
                ? sourceRateApproved
                  ? `${formatLocalNumber(totals.amount, language, 2)} ${sourceCurrency[packed.packing.source]}`
                  : c.sourceRateNotApproved
                : c.amountHidden
            }
          />
          <Metric
            label={c.mru}
            value={
              workspace.showFinance && mruTotals
                ? `${formatLocalNumber(mruTotals.amount, language, 2)} ${c.mru}`
                : workspace.showFinance
                  ? c.noPriceSet
                  : c.amountHidden
            }
          />
        </div>
        {(packed.packing.service || packed.packing.rateSnapshot) && (
          <PublishedPackingTariff
            service={packed.packing.service}
            snapshot={packed.packing.rateSnapshot}
            c={c}
            language={language}
            confirmed={packed.scope === "shared"}
          />
        )}
        {workspace.showFinance && (
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-[#718088]">
            <span>
              {c.pricePerKg}:{" "}
              {sourceRateApproved
                ? `${formatLocalNumber(packed.packing.pricePerKg, language, 2)} ${sourceCurrency[packed.packing.source]}`
                : c.sourceRateNotApproved}
            </span>
            <span>
              {c.pricePerKgMRU}:{" "}
              {packed.packing.pricePerKgMRU === undefined
                ? c.noPriceSet
                : `${formatLocalNumber(packed.packing.pricePerKgMRU, language, 2)} ${c.mru}`}
            </span>
          </div>
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

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label className="relative min-w-[220px] flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <span className="sr-only">{c.searchGoods}</span>
          <input
            aria-label={c.searchGoods}
            className={`${packingInputClass} ps-9`}
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder={c.searchGoods}
            disabled={saving}
          />
        </label>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#243f52]">
          <input
            type="checkbox"
            checked={showDeleted}
            onChange={event => setShowDeleted(event.target.checked)}
            disabled={saving}
          />
          {c.showDeleted}
        </label>
      </div>

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
            source={packed.packing.source}
            sourcePrice={packed.packing.pricePerKg}
            mruPrice={packed.packing.pricePerKgMRU}
            open={
              canEdit &&
              !saving &&
              carton.number === packed.packing.cartons.at(-1)?.number &&
              carton.goods.some(g => !g.deleted)
            }
            onClose={closeCarton}
            query={search}
            showDeleted={showDeleted}
            canEdit={canEdit}
            onDelete={entry => void deleteEntry(carton, entry)}
            onRestore={entry => void restoreEntry(carton, entry)}
          />
        ))}
      </section>

      <CustomerSummary
        packed={packed}
        c={c}
        language={language}
        showFinance={workspace.showFinance}
      />
      <div className="mt-5 flex flex-wrap gap-3">
        {packed.status === "قيد التجهيز" && (
          <button
            disabled={!sendReady || saving}
            onClick={() => void send()}
            className={`${packingPrimaryClass} gap-2`}
          >
            <Send size={16} />
            {c.sendShipment}
          </button>
        )}
        {packed.status === "قيد التجهيز" && canSend && !sendReady && (
          <p className="basis-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
            {!hasGoods ? c.noGoods : c.sendBlocked}
          </p>
        )}
        {packed.status === "في الطريق" && canMarkDelivered && (
          <button
            disabled={!canMarkDelivered || saving}
            onClick={() => void delivered()}
            className={`${packingPrimaryClass} gap-2`}
          >
            <Check size={16} />
            {c.markDelivered}
          </button>
        )}
        {packed.status === "في الطريق" &&
          workspace.role === "staff" &&
          workspace.canUpdateTracking && (
            <Link
              href="/operations/tracking"
              className={`${packingSecondaryClass} gap-2`}
            >
              {language === "ar"
                ? "التتبع"
                : language === "en"
                  ? "Tracking"
                  : language === "zh"
                    ? "追踪"
                    : "Takip"}
            </Link>
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

function makeGroups(
  carton: PackingCarton,
  price: number,
  query: string,
  showDeleted: boolean
): CartonGoodsGroup[] {
  const map = new Map<string, PackingGoods[]>();
  for (const item of carton.goods) {
    if (!showDeleted && item.deleted) continue;
    const key = normalizeName(item.name);
    map.set(key, [...(map.get(key) ?? []), item]);
  }
  return [...map.entries()]
    .filter(
      ([, entries]) =>
        !query.trim() ||
        entries.some(entry => matchesPackingGoods(entry, carton.number, query))
    )
    .map(([key, entries]) => ({
      key,
      name: entries[0].name,
      phones: [...new Set(entries.map(entry => entry.phone).filter(Boolean))],
      entries,
      repetitions: entries.filter(entry => !entry.deleted).length,
      ...goodsTotals(entries, price),
    }));
}

function CartonCard({
  carton,
  c,
  language,
  showFinance,
  source,
  sourcePrice,
  mruPrice,
  open,
  onClose,
  query,
  showDeleted,
  canEdit,
  onDelete,
  onRestore,
}: {
  carton: PackingCarton;
  c: ReturnType<typeof copyFor>;
  language: string;
  showFinance: boolean;
  source: PackedShipment["packing"]["source"];
  sourcePrice: number;
  mruPrice?: number;
  open: boolean;
  onClose: () => Promise<void>;
  query: string;
  showDeleted: boolean;
  canEdit: boolean;
  onDelete: (entry: PackingGoods) => void;
  onRestore: (entry: PackingGoods) => void;
}) {
  const sourceRateApproved = Number.isFinite(sourcePrice) && sourcePrice > 0;
  const safeSourcePrice = sourceRateApproved ? sourcePrice : 0;
  const groups = useMemo(
    () => makeGroups(carton, safeSourcePrice, query, showDeleted),
    [carton, safeSourcePrice, query, showDeleted]
  );
  const uniqueGroupCount = cartonGroups(carton, safeSourcePrice).length;
  const totals = goodsTotals(carton.goods, safeSourcePrice);
  const mruTotals =
    mruPrice === undefined ? null : goodsTotals(carton.goods, mruPrice);
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
        {open && (
          <button
            className={`${packingSecondaryClass} gap-2`}
            onClick={() => void onClose()}
            disabled={!carton.goods.some(g => !g.deleted)}
          >
            <Lock size={15} />
            {c.closeCarton}
          </button>
        )}
      </div>
      <div className="mt-3 text-xs text-[#718088]">
        {c.itemCount}: {formatLocalNumber(uniqueGroupCount, language)}
      </div>
      {groups.length ? (
        <div className="mt-3 grid gap-2">
          {groups.map(group => (
            <CartonGoods
              key={group.key}
              group={group}
              cartonNumber={carton.number}
              c={c}
              language={language}
              showFinance={showFinance}
              sourceCurrency={sourceCurrency[source]}
              sourceRateApproved={sourceRateApproved}
              canEdit={canEdit}
              onDelete={onDelete}
              onRestore={onRestore}
            />
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-slate-50 px-3 py-3 text-sm text-[#718088]">
          {query ? c.noResults : c.noGoods}
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-sm sm:grid-cols-4">
        <Metric
          label={c.actualPieces}
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
              ? sourceRateApproved
                ? `${formatLocalNumber(totals.amount, language, 2)} ${sourceCurrency[source]}`
                : c.sourceRateNotApproved
              : c.amountHidden
          }
        />
        <Metric
          label={c.mru}
          value={
            showFinance && mruTotals
              ? `${formatLocalNumber(mruTotals.amount, language, 2)} ${c.mru}`
              : showFinance
                ? c.noPriceSet
                : c.amountHidden
          }
        />
      </div>
    </article>
  );
}

function CustomerSummary({
  packed,
  c,
  language,
  showFinance,
}: {
  packed: PackedShipment;
  c: ReturnType<typeof copyFor>;
  language: string;
  showFinance: boolean;
}) {
  const sourceRateApproved =
    Number.isFinite(packed.packing.pricePerKg) && packed.packing.pricePerKg > 0;
  const customers = packingCustomers(
    sourceRateApproved ? packed.packing : { ...packed.packing, pricePerKg: 0 }
  );
  const mruCustomers =
    packed.packing.pricePerKgMRU === undefined
      ? null
      : packingCustomers({
          ...packed.packing,
          pricePerKg: packed.packing.pricePerKgMRU,
        });
  if (!customers.length) return null;
  return (
    <section className="mt-5 rounded-3xl border border-[#dce4e7] bg-white p-5 shadow-sm">
      <h2 className="text-lg font-black text-[#092d50]">{c.customerSummary}</h2>
      <div className="mt-3 grid gap-2">
        {customers.map(customer => {
          const mru = mruCustomers?.find(item => item.key === customer.key);
          return (
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
                  {formatLocalNumber(customer.pieces, language)}{" "}
                  {c.actualPieces}
                </b>
                <p className="text-xs text-[#718088]">
                  {formatLocalNumber(customer.weight, language, 3)} kg
                </p>
                {showFinance && (
                  <>
                    <p className="text-sm font-bold text-[#092d50]">
                      {sourceRateApproved
                        ? `${formatLocalNumber(customer.amount, language, 2)} ${sourceCurrency[packed.packing.source]}`
                        : c.sourceRateNotApproved}
                    </p>
                    <p className="text-xs font-bold text-[#2d6380]">
                      {mru
                        ? `${formatLocalNumber(mru.amount, language, 2)} ${c.mru}`
                        : c.noPriceSet}
                    </p>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
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
