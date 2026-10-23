import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Warehouse,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { warehouseCopy } from "@/lib/warehouseCopy";
import {
  loadWarehousePending,
  queueWarehouseLocation,
  removeWarehouseLocation,
  type PendingWarehouseLocation,
} from "@/lib/warehouseStore";
import { useOperationsWorkspace } from "@/hooks/useOperationsWorkspace";
import type { Shipment } from "@shared/operations";
import type { DestinationStorageItem } from "@shared/warehouse";

type WarehouseApi = {
  snapshot: {
    useQuery: (input?: undefined, options?: Record<string, unknown>) => any;
  };
  commit: {
    useMutation: () => {
      mutateAsync: (
        input: Omit<PendingWarehouseLocation, "createdAt">
      ) => Promise<{ version: number }>;
      isPending: boolean;
    };
  };
};
const api = (trpc as unknown as { warehouse: WarehouseApi }).warehouse;

type GoodRow = {
  shipment: Shipment;
  goodsId: string;
  carton: number;
  name: string;
  phone: string;
  location?: DestinationStorageItem;
};
function rowsFrom(shipments: Shipment[]): GoodRow[] {
  return shipments.flatMap(shipment =>
    (shipment.packing?.cartons ?? []).flatMap(carton =>
      carton.goods
        .filter(goods => !goods.deleted)
        .map(goods => ({
          shipment,
          goodsId: goods.id,
          carton: carton.number,
          name: goods.name,
          phone: goods.phone,
          location: (
            shipment as Shipment & {
              destinationStorage?: DestinationStorageItem[];
            }
          ).destinationStorage?.find(item => item.goodsId === goods.id),
        }))
    )
  );
}

export default function WarehouseStorage() {
  const { language, dir } = useLanguage();
  const c = warehouseCopy(language);
  const workspace = useOperationsWorkspace();
  const userId = workspace.userId;
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? false : navigator.onLine
  );
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<PendingWarehouseLocation[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const realSession = Boolean(userId && !workspace.localOnly);
  const snapshot = api.snapshot.useQuery(undefined, {
    enabled: realSession,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const commit = api.commit.useMutation();

  useEffect(() => {
    const on = () => setOnline(true),
      off = () => setOnline(false);
    addEventListener("online", on);
    addEventListener("offline", off);
    return () => {
      removeEventListener("online", on);
      removeEventListener("offline", off);
    };
  }, []);
  useEffect(() => {
    if (!userId) {
      setDrafts([]);
      return;
    }
    try {
      setDrafts(loadWarehousePending(userId).pending);
      setError(null);
    } catch {
      setError(c.login);
    }
  }, [userId, c.login]);

  const rows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return rowsFrom((snapshot.data?.shipments ?? []) as Shipment[]).filter(
      row => {
        if (!needle) return true;
        return [
          row.shipment.tracking,
          row.name,
          row.phone,
          row.location?.warehouse ?? "",
          row.location?.shelf ?? "",
        ].some(value => value.toLocaleLowerCase().includes(needle));
      }
    );
  }, [snapshot.data?.shipments, search]);
  const draftFor = (row: GoodRow) =>
    drafts.find(
      item =>
        item.shipmentId === row.shipment.id && item.goodsId === row.goodsId
    );

  const saveDraft = (row: GoodRow, warehouse: string, shelf: string) => {
    if (!userId || workspace.localOnly) {
      setNotice(c.login);
      return;
    }
    if (!warehouse.trim() || !shelf.trim()) {
      setNotice(c.missing);
      return;
    }
    try {
      const next = queueWarehouseLocation(userId, {
        requestId: crypto.randomUUID(),
        shipmentId: row.shipment.id,
        goodsId: row.goodsId,
        warehouse: warehouse.trim(),
        shelf: shelf.trim(),
        expectedVersion: row.shipment.version ?? 1,
      });
      setDrafts(next.pending);
      setNotice(c.saved);
    } catch {
      setNotice(c.offline);
    }
  };
  const share = async () => {
    if (!userId || workspace.localOnly || !online || !drafts.length) return;
    let accepted = 0;
    // Each accepted shelf assignment bumps the shipment version. Later goods of
    // the same shipment are rebased only from the exact version this batch
    // consumed, so a newer edit by another employee still raises a conflict.
    const advanced = new Map<string, { from: number; to: number }>();
    for (const draft of [...drafts]) {
      const step = advanced.get(draft.shipmentId);
      const rebased = Boolean(step && draft.expectedVersion === step.from);
      const expectedVersion = rebased ? step!.to : draft.expectedVersion;
      try {
        const result = await commit.mutateAsync({
          requestId: rebased ? crypto.randomUUID() : draft.requestId,
          shipmentId: draft.shipmentId,
          goodsId: draft.goodsId,
          warehouse: draft.warehouse,
          shelf: draft.shelf,
          expectedVersion,
        });
        advanced.set(draft.shipmentId, {
          from: rebased ? step!.from : expectedVersion,
          to: result.version,
        });
        const next = removeWarehouseLocation(userId, draft.requestId);
        setDrafts(next.pending);
        accepted++;
      } catch {
        // Conflicts and denial deliberately remain in the local queue for review.
        setNotice(c.conflict);
      }
    }
    if (accepted) {
      setNotice(`${c.sharedCount}: ${accepted}`);
      await snapshot.refetch();
    }
  };

  return (
    <div
      dir={dir}
      className="min-h-screen bg-[#f6f8f8] px-4 py-6 text-[#092d50] sm:px-8"
    >
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-[#dce4e7] bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <Warehouse className="mt-1 text-[#2e6280]" />
            <div>
              <h1 className="text-2xl font-black">{c.title}</h1>
              <p className="mt-1 text-sm text-[#5f7480]">{c.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm font-bold">
            {online ? <Cloud size={17} /> : <CloudOff size={17} />}
            {online ? "Online" : "Offline"}
          </div>
        </header>
        {!userId && (
          <Panel>
            <AlertTriangle size={16} />
            {c.login}
          </Panel>
        )}
        {error && (
          <Panel>
            <AlertTriangle size={16} />
            {error}
          </Panel>
        )}
        {snapshot.error && (
          <Panel>
            <AlertTriangle size={16} />
            {c.noAccess}
          </Panel>
        )}
        <div className="flex flex-wrap gap-3 rounded-2xl border border-[#dce4e7] bg-white p-4">
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder={c.search}
            className="min-h-11 min-w-[min(100%,28rem)] flex-1 rounded-xl border border-[#cbd9de] px-3 text-sm"
          />
          <button
            type="button"
            onClick={() => void share()}
            disabled={
              !online ||
              !drafts.length ||
              commit.isPending ||
              !snapshot.data?.canEdit
            }
            className="min-h-11 rounded-xl bg-[#092d50] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {c.share} {drafts.length ? `(${drafts.length})` : ""}
          </button>
        </div>
        {notice && (
          <div className="flex items-center gap-2 rounded-xl border border-[#cbd9de] bg-white p-3 text-sm">
            <CheckCircle2 size={16} className="text-[#2e8068]" />
            {notice}
          </div>
        )}
        {snapshot.isLoading ? (
          <Panel>{c.loading}</Panel>
        ) : !rows.length ? (
          <Panel>{search ? c.noResults : c.noGoods}</Panel>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map(row => (
              <LocationCard
                key={`${row.shipment.id}:${row.goodsId}`}
                row={row}
                draft={draftFor(row)}
                copy={c}
                canEdit={Boolean(snapshot.data?.canEdit)}
                onSave={saveDraft}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
function LocationCard({
  row,
  draft,
  copy: c,
  canEdit,
  onSave,
}: {
  row: GoodRow;
  draft?: PendingWarehouseLocation;
  copy: ReturnType<typeof warehouseCopy>;
  canEdit: boolean;
  onSave: (row: GoodRow, warehouse: string, shelf: string) => void;
}) {
  const [warehouse, setWarehouse] = useState(
    draft?.warehouse ?? row.location?.warehouse ?? ""
  );
  const [shelf, setShelf] = useState(draft?.shelf ?? row.location?.shelf ?? "");
  useEffect(() => {
    setWarehouse(draft?.warehouse ?? row.location?.warehouse ?? "");
    setShelf(draft?.shelf ?? row.location?.shelf ?? "");
  }, [draft?.requestId, row.location?.updatedAt]);
  return (
    <article className="rounded-2xl border border-[#dce4e7] bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-black">{row.name}</h2>
          <p className="text-xs text-[#5f7480]">
            {c.shipment}: {row.shipment.tracking} · {c.carton}: {row.carton} ·{" "}
            {c.goods}: {row.goodsId} · {row.phone}
          </p>
        </div>
        {draft && (
          <span className="rounded-full bg-[#fff4d6] px-2 py-1 text-xs font-bold">
            {c.pending}
          </span>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-bold">
          {c.warehouse}
          <input
            value={warehouse}
            disabled={!canEdit}
            onChange={event => setWarehouse(event.target.value)}
            className="min-h-10 rounded-lg border border-[#cbd9de] px-2 text-sm disabled:bg-slate-50"
          />
        </label>
        <label className="grid gap-1 text-xs font-bold">
          {c.shelf}
          <input
            value={shelf}
            disabled={!canEdit}
            onChange={event => setShelf(event.target.value)}
            className="min-h-10 rounded-lg border border-[#cbd9de] px-2 text-sm disabled:bg-slate-50"
          />
        </label>
      </div>
      {canEdit && (
        <button
          type="button"
          onClick={() => onSave(row, warehouse, shelf)}
          className="mt-3 rounded-lg border border-[#2e6280] px-3 py-2 text-xs font-black text-[#2e6280]"
        >
          {c.save}
        </button>
      )}
    </article>
  );
}
function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-[#ead9a8] bg-[#fffaf0] p-4 text-sm">
      {children}
    </div>
  );
}
