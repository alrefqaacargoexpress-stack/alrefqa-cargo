import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useRoute, useSearch } from "wouter";
import { Plus, Search } from "lucide-react";
import ShipmentDeleteActions from "@/components/packing/ShipmentDeleteActions";
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
  officeIds,
  officeNames,
  ownerOffice,
  recordBelongsToOffice,
  type OfficeId,
} from "@shared/branches";
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
  const query = useSearch();
  const requestedOffice = new URLSearchParams(query).get("office");
  const officeOptions: OfficeId[] =
    workspace.offices === null ? [...officeIds] : workspace.offices;
  const selectedOffice: OfficeId | null =
    officeIds.includes(requestedOffice as OfficeId) &&
    officeOptions.includes(requestedOffice as OfficeId)
      ? (requestedOffice as OfficeId)
      : !requestedOffice && officeOptions.length === 1
        ? officeOptions[0]
        : null;
  const officeFilter: OfficeId | "all" | "unassigned" =
    requestedOffice === "unassigned" ? "unassigned" : (selectedOffice ?? "all");
  const [source, setSource] = useState<PackingSource>(
    selectedOffice && selectedOffice !== "nouakchott" ? selectedOffice : "dubai"
  );
  const [pricePerKg, setPricePerKg] = useState("0");
  const [pricePerKgMRU, setPricePerKgMRU] = useState("");
  const [saving, setSaving] = useState(false);
  const showDeletedShipments =
    new URLSearchParams(query).get("deleted") === "1";
  const setShowDeletedShipments = (value: boolean) => {
    const params = new URLSearchParams(query);
    if (value) params.set("deleted", "1");
    else params.delete("deleted");
    navigate(`/operations/shipments${params.toString() ? `?${params}` : ""}`);
  };
  useEffect(() => {
    if (selectedOffice && selectedOffice !== "nouakchott")
      setSource(selectedOffice);
  }, [selectedOffice]);
  const setOfficeFilter = (office: OfficeId | "all" | "unassigned") => {
    const params = new URLSearchParams(query);
    if (office === "all") params.delete("office");
    else params.set("office", office);
    navigate(`/operations/shipments${params.toString() ? `?${params}` : ""}`);
  };
  const officeLabel = (office: OfficeId | "all" | "unassigned") => {
    if (office === "all")
      return (
        {
          ar: "كل المكاتب",
          en: "All offices",
          zh: "所有办公室",
          tr: "Tüm ofisler",
        }[language] ?? "All offices"
      );
    if (office === "unassigned")
      return (
        { ar: "غير مخصص", en: "Unassigned", zh: "未分配", tr: "Atanmamış" }[
          language
        ] ?? "Unassigned"
      );
    return (
      officeNames[language as keyof typeof officeNames]?.[office] ?? office
    );
  };
  const savingRef = useRef(false);
  const allShipments = useMemo(
    () =>
      workspace.state.shipments.filter(shipment =>
        officeFilter === "unassigned"
          ? ownerOffice("shipment", shipment) === null
          : officeFilter === "all"
            ? true
            : recordBelongsToOffice("shipment", shipment, officeFilter)
      ),
    [workspace.state.shipments, officeFilter]
  );
  const visibleShipments = useMemo(
    () =>
      allShipments.filter(
        shipment => Boolean(shipment.deleted) === showDeletedShipments
      ),
    [allShipments, showDeletedShipments]
  );
  const packingShipments = useMemo(
    () => visibleShipments.filter(isPackedShipment),
    [visibleShipments]
  );
  const legacyShipments = useMemo(
    () => visibleShipments.filter(shipment => !isPackedShipment(shipment)),
    [visibleShipments]
  );
  const deletedCount = allShipments.filter(shipment => shipment.deleted).length;
  const activeCount = allShipments.length - deletedCount;
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
    if (
      officeIds.includes(requestedOffice as OfficeId) &&
      !officeOptions.includes(requestedOffice as OfficeId)
    ) {
      setFormError(c.canNotEdit);
      return;
    }
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
        ...(selectedOffice
          ? { officeId: selectedOffice }
          : { officeId: source }),
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
      navigate(
        `/operations/shipments/${shipment.id}${query ? `?${query}` : ""}`
      );
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
              <p className="font-black text-[#092d50]">
                {showDeletedShipments ? c.deletedShipments : c.shipments}
              </p>
              <p className="text-sm text-[#718088]">{c.createHelp}</p>
            </div>
            <Link
              href={`/operations/shipments/new${query ? `?${query}` : ""}`}
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
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={!showDeletedShipments}
              onClick={() => setShowDeletedShipments(false)}
              className={`rounded-xl border px-3 py-2 text-sm font-bold ${!showDeletedShipments ? "border-[#092d50] bg-[#092d50] text-white" : "border-slate-200 bg-white text-[#243f52]"}`}
            >
              {c.shipments} ({activeCount})
            </button>
            <button
              type="button"
              aria-pressed={showDeletedShipments}
              onClick={() => setShowDeletedShipments(true)}
              className={`rounded-xl border px-3 py-2 text-sm font-bold ${showDeletedShipments ? "border-[#092d50] bg-[#092d50] text-white" : "border-slate-200 bg-white text-[#243f52]"}`}
            >
              {c.deletedShipments} ({deletedCount})
            </button>
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold">
              <span className="sr-only">Office</span>
              <select
                aria-label="Office"
                className="bg-transparent outline-none"
                value={officeFilter}
                onChange={event =>
                  setOfficeFilter(
                    event.target.value as OfficeId | "all" | "unassigned"
                  )
                }
              >
                <option value="all">{officeLabel("all")}</option>
                <option value="unassigned">{officeLabel("unassigned")}</option>
                {officeOptions.map(office => (
                  <option key={office} value={office}>
                    {officeLabel(office)}
                  </option>
                ))}
              </select>
            </label>
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
                  workspace={workspace}
                  officeQuery={query}
                />
              ))}
            </div>
          ) : !filteredLegacy.length ? (
            <EmptyPanel
              text={
                search
                  ? c.noResults
                  : showDeletedShipments
                    ? c.noDeletedShipments
                    : c.noShipments
              }
            />
          ) : null}
          {filteredLegacy.length > 0 && (
            <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3">
                <h2 className="font-black text-[#092d50]">
                  {c.legacyShipment}
                </h2>
                <p className="text-sm text-[#718088]">{c.legacySummary}</p>
                <Link
                  href={`/operations/shipments${query ? `?${query}` : ""}`}
                  className="mt-2 inline-block text-sm font-bold text-[#2d6380] underline"
                >
                  {c.manageShipments}
                </Link>
              </div>
              <div className="grid gap-2">
                {filteredLegacy.map(shipment => (
                  <div
                    key={shipment.id}
                    className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm ${shipment.deleted ? "border-amber-200 bg-amber-50/40" : "border-slate-100"}`}
                  >
                    <div>
                      <TrackingNumber value={shipment.tracking} />{" "}
                      <span className="ms-2 text-[#718088]">
                        {shipment.deleted ? c.deleted : shipment.status}
                      </span>
                      {shipment.deleted && (
                        <p className="mt-1 text-xs text-amber-800">
                          {c.deletedAt}:{" "}
                          {new Date(shipment.deleted.at).toLocaleString()} ·{" "}
                          {c.deletionReason}: {shipment.deleted.reason}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Link
                        className="font-bold text-[#2d6380] underline"
                        href={
                          shipment.deleted
                            ? `/operations/shipments/${shipment.id}${query ? `?${query}` : ""}`
                            : `/operations?${query}`
                        }
                      >
                        {shipment.deleted
                          ? c.shipmentDetails
                          : c.viewOperations}
                      </Link>
                      <ShipmentDeleteActions
                        shipment={shipment}
                        workspace={workspace}
                        c={c}
                        saving={saving}
                      />
                    </div>
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
          sourceLocked={Boolean(
            selectedOffice && selectedOffice !== "nouakchott"
          )}
          selectedOffice={selectedOffice}
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
  sourceLocked,
  selectedOffice,
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
  sourceLocked: boolean;
  selectedOffice: OfficeId | null;
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
            disabled={saving || sourceLocked}
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
  workspace,
  officeQuery,
}: {
  shipment: ReturnType<typeof import("@shared/packing").createPackedShipment>;
  c: ReturnType<typeof copyFor>;
  language: string;
  showFinance: boolean;
  workspace: ReturnType<typeof useOperationsWorkspace>;
  officeQuery: string;
}) {
  const totals = packingTotals(shipment.packing);
  const mruTotals = packingTotalsMRU(shipment.packing);
  return (
    <article
      className={`rounded-2xl border p-4 shadow-sm transition ${shipment.deleted ? "border-amber-200 bg-amber-50/40" : "border-[#dce4e7] bg-white"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Link
          href={`/operations/shipments/${shipment.id}${officeQuery ? `?${officeQuery}` : ""}`}
          className="min-w-0 flex-1 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#d9a441]"
        >
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
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {shipment.deleted && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">
              {c.deleted}
            </span>
          )}
          <ShipmentDeleteActions
            shipment={shipment}
            workspace={workspace}
            c={c}
            saving={false}
            statusLabel={
              shipment.status === "قيد التجهيز"
                ? c.open
                : shipment.status === "في الطريق"
                  ? c.inTransit
                  : shipment.status === "مسلّمة"
                    ? c.delivered
                    : shipment.status
            }
          />
        </div>
      </div>
      {shipment.deleted && (
        <p className="mt-2 text-xs text-amber-800">
          {c.deletedAt}: {new Date(shipment.deleted.at).toLocaleString()} ·{" "}
          {c.deletionReason}: {shipment.deleted.reason}
        </p>
      )}
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
    </article>
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
