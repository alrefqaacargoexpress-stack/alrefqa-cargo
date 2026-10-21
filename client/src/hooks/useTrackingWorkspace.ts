import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import {
  emptyTrackingCache,
  loadTrackingCache,
  parseTrackingAudit,
  parseTrackingDetail,
  parseTrackingSummaries,
  queueTrackingCommand,
  readLastTrackingProfile,
  removeAcknowledged,
  saveTrackingCache,
  writeLastTrackingProfile,
  type TrackingCache,
  type TrackingShipment,
} from "@/lib/trackingStore";
import {
  assertTrackingCommand,
  canExportTracking,
  canNoteTracking,
  canSuperviseTracking,
  canTrackingDetails,
  type TrackingCommand,
} from "@shared/tracking";
import type { AppRole, Shipment } from "@shared/operations";

const api = trpc as unknown as {
  tracking: {
    list: {
      useQuery: (
        input: { search?: string },
        options?: Record<string, unknown>
      ) => any;
    };
    detail: {
      useQuery: (
        input: { shipmentId: string },
        options?: Record<string, unknown>
      ) => any;
    };
    audit: {
      useQuery: (
        input: { shipmentId?: string; afterId?: number },
        options?: Record<string, unknown>
      ) => any;
    };
    commit: {
      useMutation: () => {
        mutateAsync: (input: unknown) => Promise<unknown>;
        isPending: boolean;
      };
    };
  };
};

export function useTrackingWorkspace(
  selectedId: string | null,
  search: string
) {
  const { language } = useLanguage();
  const me = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const activeId = me.data?.id == null ? null : String(me.data.id);
  const access = trpc.operations.access.useQuery(undefined, {
    enabled: Boolean(activeId),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const serverRole = activeId ? (access.data?.role ?? null) : null;
  const [offlineOpen, setOfflineOpen] = useState(false);
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine
  );
  const [cache, setCache] = useState<TrackingCache | null>(null);
  const [cacheError, setCacheError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [auditAfterId, setAuditAfterId] = useState<number | undefined>(
    undefined
  );
  const candidate = useMemo(() => readLastTrackingProfile(), [me.data?.id]);
  const offlineIdentity = !activeId && offlineOpen ? candidate : null;
  const userId = activeId ?? offlineIdentity?.userId ?? null;
  const role = serverRole ?? offlineIdentity?.role ?? null;
  const offline = !activeId;
  const authorized = Boolean(userId && role);
  const listEnabled = Boolean(activeId && role);
  const listQuery = api.tracking.list.useQuery(
    { search: search.trim() || undefined },
    { enabled: listEnabled, retry: false, refetchOnWindowFocus: false }
  );
  const detailQuery = api.tracking.detail.useQuery(
    { shipmentId: selectedId ?? "" },
    {
      enabled: Boolean(
        activeId && role && selectedId && canTrackingDetails(role)
      ),
      retry: false,
      refetchOnWindowFocus: false,
    }
  );
  const auditQuery = api.tracking.audit.useQuery(
    { shipmentId: selectedId ?? undefined, afterId: auditAfterId },
    {
      enabled: Boolean(activeId && selectedId && canSuperviseTracking(role)),
      retry: false,
      refetchOnWindowFocus: false,
    }
  );
  const commit = api.tracking.commit.useMutation();

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
    if (!userId || !role) {
      setCache(null);
      return;
    }
    try {
      setCache(loadTrackingCache(userId, role));
      setCacheError(null);
    } catch {
      setCache(null);
      setCacheError("tracking_cache_read");
    }
  }, [userId, role]);
  useEffect(() => {
    if (!activeId || !serverRole || !me.data) return;
    try {
      writeLastTrackingProfile({
        userId: activeId,
        role: serverRole,
        name: me.data.name ?? "",
      });
    } catch {
      /* live access remains authoritative */
    }
  }, [activeId, serverRole, me.data]);
  useEffect(() => {
    if (!userId || !role || !listQuery.data) return;
    try {
      const parsed = parseTrackingSummaries(listQuery.data);
      setCache(previous => {
        const base = previous ?? emptyTrackingCache(userId, role);
        const next = { ...base, summaries: parsed.items };
        void saveTrackingCache(next)
          .then(saved => setCache(saved))
          .catch(() => setNotice("tracking_cache_write"));
        return next;
      });
    } catch {
      setNotice("tracking_payload");
    }
  }, [listQuery.data, userId, role]);
  useEffect(() => {
    if (!selectedId || !detailQuery.data || !userId || !role) return;
    try {
      const shipment = parseTrackingDetail(detailQuery.data);
      setCache(previous => {
        if (!previous) return previous;
        const next = {
          ...previous,
          details: { ...previous.details, [shipment.id]: shipment },
        };
        void saveTrackingCache(next)
          .then(saved => setCache(saved))
          .catch(() => setNotice("tracking_cache_write"));
        return next;
      });
    } catch {
      setNotice("tracking_payload");
    }
  }, [detailQuery.data, selectedId, userId, role]);

  const summaries = useMemo(() => {
    if (activeId && listQuery.data) {
      try {
        return parseTrackingSummaries(listQuery.data).items;
      } catch {
        return [];
      }
    }
    if (activeId && online) return [];
    return cache?.summaries ?? [];
  }, [activeId, online, listQuery.data, cache]);
  const detail: TrackingShipment | null = useMemo(() => {
    if (activeId && detailQuery.data && canTrackingDetails(role)) {
      try {
        return parseTrackingDetail(detailQuery.data);
      } catch {
        return null;
      }
    }
    if (!canTrackingDetails(role) || (activeId && online)) return null;
    return selectedId ? (cache?.details[selectedId] ?? null) : null;
  }, [activeId, online, detailQuery.data, role, selectedId, cache]);
  const auditState = useMemo(() => {
    if (!auditQuery.data || !canSuperviseTracking(role))
      return { value: null, error: false };
    try {
      return { value: parseTrackingAudit(auditQuery.data), error: false };
    } catch {
      return { value: null, error: true };
    }
  }, [auditQuery.data, role]);
  const audit = auditState.value;
  const auditError =
    canSuperviseTracking(role) && (auditQuery.isError || auditState.error)
      ? "tracking_audit_error"
      : null;
  const queue = useCallback(
    async (shipmentId: string, command: TrackingCommand) => {
      if (!userId || !role || !canTrackingDetails(role) || role === "viewer") {
        setNotice("tracking_forbidden");
        return false;
      }
      if (
        (command.type === "plan" || command.type === "transfer") &&
        !canSuperviseTracking(role)
      ) {
        setNotice("tracking_forbidden");
        return false;
      }
      if (command.type === "cancel" && role !== "admin") {
        setNotice("tracking_forbidden");
        return false;
      }
      if (command.type === "note" && !canNoteTracking(role)) {
        setNotice("tracking_forbidden");
        return false;
      }
      const shipment =
        cache?.details[shipmentId] ??
        (selectedId === shipmentId ? detail : null);
      if (
        command.type === "stage" &&
        !canSuperviseTracking(role) &&
        !shipment
      ) {
        setNotice("tracking_forbidden");
        return false;
      }
      if (shipment) {
        try {
          assertTrackingCommand(role, shipment as unknown as Shipment, command);
        } catch (error) {
          setNotice(
            error instanceof Error ? error.message : "tracking_forbidden"
          );
          return false;
        }
      }
      try {
        const previous = cache ?? emptyTrackingCache(userId, role);
        const next = queueTrackingCommand(previous, role, shipmentId, command);
        const saved = await saveTrackingCache(next);
        setCache(saved);
        setNotice("tracking_pending");
        return true;
      } catch {
        setNotice("tracking_cache_write");
        return false;
      }
    },
    [cache, detail, role, selectedId, userId]
  );
  const share = useCallback(async () => {
    if (
      !activeId ||
      !serverRole ||
      !online ||
      !cache?.pending.length ||
      !canTrackingDetails(serverRole)
    )
      return { applied: 0, stopped: false };
    const ownerRole = serverRole;
    let applied = 0;
    for (const pending of cache.pending.slice(0, 500)) {
      if (serverRole !== ownerRole) return { applied, stopped: true };
      try {
        const result = await commit.mutateAsync({
          requestId: pending.requestId,
          shipmentId: pending.shipmentId,
          expectedVersion: pending.expectedVersion,
          command: pending.command,
        });
        const parsed = result as {
          requestId: string;
          shipment: unknown;
          version: number;
        };
        const current = loadTrackingCache(activeId, ownerRole);
        const next = removeAcknowledged(current, pending.requestId, parsed);
        const saved = await saveTrackingCache(next);
        setCache(saved);
        applied++;
      } catch {
        setNotice("tracking_conflict");
        return { applied, stopped: true };
      }
    }
    setNotice("tracking_synced");
    return { applied, stopped: false };
  }, [activeId, serverRole, online, cache, commit]);
  return {
    language,
    me,
    access,
    userId,
    role,
    serverRole,
    online,
    offline,
    authorized,
    offlineCandidate: candidate,
    offlineOpen,
    openOffline: () => setOfflineOpen(true),
    summaries,
    total: listQuery.data?.total ?? summaries.length,
    truncated: Boolean(listQuery.data?.truncated),
    listLoading: listQuery.isLoading,
    detail,
    detailLoading: detailQuery.isLoading,
    audit,
    auditError,
    auditLoading: auditQuery.isLoading,
    nextAudit:
      audit?.nextCursor != null
        ? () => setAuditAfterId(audit.nextCursor ?? undefined)
        : null,
    pending: cache?.pending ?? [],
    notice,
    cacheError,
    canExport: canExportTracking(role),
    canSupervise: canSuperviseTracking(role),
    canDetails: canTrackingDetails(role),
    queue,
    share,
    sharing: Boolean(commit.isPending),
    refresh: () => {
      void listQuery.refetch();
      if (selectedId) void detailQuery.refetch();
      if (canSuperviseTracking(role)) void auditQuery.refetch();
    },
  };
}
export type TrackingWorkspace = ReturnType<typeof useTrackingWorkspace>;
