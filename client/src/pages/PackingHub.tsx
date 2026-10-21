import { useMemo, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { Plus, Search } from "lucide-react";
import PackingLayout from "@/components/packing/PackingLayout";
import {
  PackingField,
  PackingStatusBadge,
  PackingScopeBadge,
  SourceBadge,
  TrackingNumber,
  formatLocalNumber,
  packingPrimaryClass,
  packingInputClass,
} from "@/components/packing/PackingPrimitives";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOperationsWorkspace } from "@/hooks/useOperationsWorkspace";
import { copyFor } from "@/lib/packingCopy";
import {
  createPackedShipment,
  isPackedShipment,
  matchesShipment,
  packingTotals,
  packingTotalsMRU,
  sourceCurrency,
  type PackingSource,
} from "@shared/packing";

const sources: PackingSource[] = ["dubai", "turkey", "china"];

export default function PackingHub() {
  const workspace = useOperationsWorkspace();
  const { language } = useLanguage();
  const c = copyFor(language);
  const [, navigate] = useLocation();
  const [isNew] = useRoute("/operations/shipments/new");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [tracking, setTracking] = useState("");
  const [source, setSource] = useState<PackingSource>("dubai");
  const [pricePerKg, setPricePerKg] = useState("0");
  const [pricePerKgMRU, setPricePerKgMRU] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const allShipments = workspace.state.shipments;
  const packingShipments = useMemo(
    () => allShipments.filter(isPackedShipment),
    [allShipments]
  );
  const legacyShipments = useMemo(
    () => allShipments.filter(shipment => !isPackedShipment(shipment)),
    [allShipments]
  );
  const filtered = useMemo(
    () =>
      packingShipments.filter(shipment => matchesShipment(shipment, search)),
    [packingShipments, search]
  );
  const filteredLegacy = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    if (!needle) return legacyShipments;
    return legacyShipments.filter(shipment =>
      [shipment.tracking, shipment.account, shipment.route].some(value =>
        value.toLocaleLowerCase().includes(needle)
      )
    );
  }, [legacyShipments, search]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingRef.current) return;
    setFormError(null);
    if (!workspace.canEditShipments) {
      setFormError(c.canNotEdit);
      return;
    }
    const cleanTracking = tracking.trim();
    if (!cleanTracking || cleanTracking.length > 128) {
      setFormError(c.invalidTracking);
      return;
    }
    if (
      allShipments.some(
        item =>
          item.tracking.trim().toLocaleLowerCase() ===
          cleanTracking.toLocaleLowerCase()
      )
    ) {
      setFormError(c.invalidTracking);
      return;
    }
    const numericRate = Number(pricePerKg);
    const rawMru = pricePerKgMRU.trim();
    const numericMru = rawMru === "" ? undefined : Number(rawMru);
    if (
      !Number.isFinite(numericRate) ||
      numericRate < 0 ||
      (numericMru !== undefined &&
        (!Number.isFinite(numericMru) || numericMru < 0))
    ) {
      setFormError(c.error);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const shipment = createPackedShipment({
        tracking: cleanTracking,
        source,
        pricePerKg: workspace.showFinance ? numericRate : 0,
        ...(workspace.showFinance && numericMru !== undefined
          ? { pricePerKgMRU: numericMru }
          : {}),
      });
      const saved = await workspace.saveShipment(
        shipment,
        `${c.createShipment}: ${cleanTracking}`
      );
      if (!saved) {
        setFormError(workspace.error ?? c.saveError);
        return;
      }
      setMessage(c.created);
      setTracking("");
      setPricePerKg("0");
      setPricePerKgMRU("");
      navigate(`/operations/shipments/${shipment.id}`);
    } catch (error) {
      setFormError(
        error instanceof Error && error.message === "invalid_tracking"
          ? c.invalidTracking
          : c.error
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <PackingLayout
      workspace={workspace}
      title={isNew ? c.newShipment : c.shipments}
      description={c.description}
    >
      {!isNew ? (
        <>
          <section className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dce4e7] bg-white p-4 shadow-sm">
            <div>
              <p className="font-black text-[#092d50]">{c.shipments}</p>
              <p className="text-sm text-[#718088]">{c.createHelp}</p>
            </div>
            <Link
              href="/operations/shipments/new"
              className={`${packingPrimaryClass} gap-2`}
            >
              <Plus size={17} />
              {c.newShipment}
            </Link>
          </section>
          {message && (
            <p
              className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
              role="status"
            >
              {message}
            </p>
          )}
          <div className="mb-4 flex flex-wrap gap-3">
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
              />
            </label>
          </div>
          {filtered.length ? (
            <div className="grid gap-3">
              {filtered.map(shipment => (
                <ShipmentRow
                  key={shipment.id}
                  shipment={shipment}
                  c={c}
                  language={language}
                  showFinance={workspace.showFinance}
                />
              ))}
            </div>
          ) : !filteredLegacy.length ? (
            <EmptyPanel text={search ? c.noResults : c.noShipments} />
          ) : null}
          {filteredLegacy.length > 0 && (
            <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3">
                <h2 className="font-black text-[#092d50]">
                  {c.legacyShipment}
                </h2>
                <p className="text-sm text-[#718088]">{c.legacySummary}</p>
              </div>
              <div className="grid gap-2">
                {filteredLegacy.map(shipment => (
                  <div
                    key={shipment.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3 text-sm"
                  >
                    <span>
                      <TrackingNumber value={shipment.tracking} />{" "}
                      <span className="ms-2 text-[#718088]">
                        {shipment.status}
                      </span>
                    </span>
                    <Link
                      className="font-bold text-[#2d6380] underline"
                      href="/operations"
                    >
                      {c.viewOperations}
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <NewShipmentForm
          c={c}
          canEdit={workspace.canEditShipments}
          showFinance={workspace.showFinance}
          tracking={tracking}
          setTracking={setTracking}
          source={source}
          setSource={setSource}
          pricePerKg={pricePerKg}
          setPricePerKg={setPricePerKg}
          pricePerKgMRU={pricePerKgMRU}
          setPricePerKgMRU={setPricePerKgMRU}
          saving={saving}
          error={formError}
          submit={submit}
        />
      )}
    </PackingLayout>
  );
}

function NewShipmentForm({
  c,
  canEdit,
  showFinance,
  tracking,
  setTracking,
  source,
  setSource,
  pricePerKg,
  setPricePerKg,
  pricePerKgMRU,
  setPricePerKgMRU,
  saving,
  error,
  submit,
}: {
  c: ReturnType<typeof copyFor>;
  canEdit: boolean;
  showFinance: boolean;
  tracking: string;
  setTracking: (v: string) => void;
  source: PackingSource;
  setSource: (v: PackingSource) => void;
  pricePerKg: string;
  setPricePerKg: (v: string) => void;
  pricePerKgMRU: string;
  setPricePerKgMRU: (v: string) => void;
  saving: boolean;
  error: string | null;
  submit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  return (
    <form
      onSubmit={submit}
      className="max-w-2xl rounded-3xl border border-[#dce4e7] bg-white p-5 shadow-sm sm:p-7"
    >
      <div className="mb-5">
        <h2 className="text-xl font-black text-[#092d50]">{c.newShipment}</h2>
        <p className="mt-1 text-sm text-[#718088]">{c.createHelp}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <PackingField label={c.shipmentNumber} required>
          <input
            aria-label={c.shipmentNumber}
            required
            maxLength={128}
            disabled={saving}
            className={packingInputClass}
            value={tracking}
            onChange={event => setTracking(event.target.value)}
          />
        </PackingField>
        <PackingField label={c.source} required>
          <select
            aria-label={c.source}
            required
            disabled={saving}
            className={packingInputClass}
            value={source}
            onChange={event => setSource(event.target.value as PackingSource)}
          >
            {sources.map(item => (
              <option key={item} value={item}>
                {item === "dubai"
                  ? c.dubai
                  : item === "turkey"
                    ? c.turkey
                    : c.china}
              </option>
            ))}
          </select>
        </PackingField>
        <PackingField
          label={`${c.pricePerKg} (${sourceCurrency[source]})`}
          hint={showFinance ? c.priceHelp : c.rateRestricted}
        >
          <input
            aria-label={c.pricePerKg}
            type="number"
            min="0"
            max="999999999"
            step="0.01"
            inputMode="decimal"
            className={packingInputClass}
            value={pricePerKg}
            readOnly={!showFinance}
            disabled={!showFinance || !canEdit || saving}
            onChange={event => setPricePerKg(event.target.value)}
          />
        </PackingField>
        <PackingField label={c.pricePerKgMRU} hint={c.mruPriceHelp}>
          <input
            aria-label={c.pricePerKgMRU}
            type="number"
            min="0"
            max="999999999"
            step="0.01"
            inputMode="decimal"
            className={packingInputClass}
            value={pricePerKgMRU}
            disabled={!showFinance || !canEdit || saving}
            onChange={event => setPricePerKgMRU(event.target.value)}
          />
        </PackingField>
      </div>
      {!canEdit && (
        <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-sm text-[#718088]">
          {c.canNotEdit}
        </p>
      )}
      {!showFinance && (
        <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-sm text-[#718088]">
          {c.rateRestricted}
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
      <button
        type="submit"
        disabled={!canEdit || saving}
        className={`${packingPrimaryClass} mt-6 gap-2`}
      >
        <Plus size={17} />
        {c.createShipment}
      </button>
    </form>
  );
}

function ShipmentRow({
  shipment,
  c,
  language,
  showFinance,
}: {
  shipment: ReturnType<typeof import("@shared/packing").createPackedShipment>;
  c: ReturnType<typeof copyFor>;
  language: string;
  showFinance: boolean;
}) {
  const totals = packingTotals(shipment.packing);
  const mruTotals = packingTotalsMRU(shipment.packing);
  return (
    <Link
      href={`/operations/shipments/${shipment.id}`}
      className="block rounded-2xl border border-[#dce4e7] bg-white p-4 shadow-sm transition hover:border-[#9ab7c3] hover:shadow-md"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <TrackingNumber value={shipment.tracking} />
            <SourceBadge source={shipment.packing.source} c={c} />
            <PackingScopeBadge scope={shipment.scope} c={c} />
          </div>
          <p className="mt-2 text-sm text-[#718088]">
            {shipment.route} ·{" "}
            {formatLocalNumber(shipment.packing.cartons.length, language)}{" "}
            {c.cartons}
          </p>
        </div>
        <PackingStatusBadge status={shipment.status} c={c} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-sm sm:grid-cols-4">
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
              ? `${formatLocalNumber(totals.amount, language, 2)} ${sourceCurrency[shipment.packing.source]}`
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
    </Link>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block text-xs text-[#718088]">{label}</span>
      <b>{value}</b>
    </div>
  );
}
function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#bdcdd2] bg-white p-8 text-center text-sm text-[#718088]">
      {text}
    </div>
  );
}
