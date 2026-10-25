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
import {
  actionRole,
  permissionAllowed,
  type PermissionMap,
} from "@shared/permissions";

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
  const access = trpc.operations.access.useQuery(
    activeId ? { clientUserId: activeId } : undefined,
    {
      enabled: Boolean(activeId),
      retry: false,
      refetchOnWindowFocus: false,
    }
  );
  const accessUserId =
    access.data?.userId == null ? null : String(access.data.userId);
  const boundAccess = accessUserId === activeId ? access.data : undefined;
  const serverRole = activeId ? (boundAccess?.role ?? null) : null;
  const accessPermissions = (
    boundAccess as { permissions?: PermissionMap | null } | undefined
  )?.permissions;
  const accessOffices = boundAccess?.offices ?? null;
  const accessHomeOffice = boundAccess?.homeOffice ?? null;
  const permissionSubject = {
    role: serverRole,
    offices: accessOffices,
    homeOffice: accessHomeOffice,
    permissions: accessPermissions,
  };
  const canReadTracking = permissionAllowed(
    permissionSubject,
    "tracking",
    "view"
  );
  const canManageTracking = permissionAllowed(
    permissionSubject,
    "tracking",
    "manage"
  );
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
  // A remembered profile is not authorization to unlock another user's cargo.
  const userId = activeId;
  const role = serverRole;
  const offline = !activeId;
  const authorized = Boolean(userId && role && canReadTracking);
  const canUpdateWarehouseStage = Boolean(
    role === "staff" &&
      canManageTracking &&
      boundAccess?.offices?.length === 1 &&
      boundAccess?.homeOffice !== "nouakchott"
  );
  const listEnabled = Boolean(activeId && role && canReadTracking);
  const listQuery = api.tracking.list.useQuery(
    { search: search.trim() || undefined },
    { enabled: listEnabled, retry: false, refetchOnWindowFocus: false }
  );
  const detailQuery = api.tracking.detail.useQuery(
    { shipmentId: selectedId ?? "" },
    {
      enabled: Boolean(
        activeId &&
          role &&
          selectedId &&
          canReadTracking &&
          canTrackingDetails(role)
      ),
      retry: false,
      refetchOnWindowFocus: false,
    }
  );
  const auditQuery = api.tracking.audit.useQuery(
    { shipmentId: selectedId ?? undefined, afterId: auditAfterId },
    {
      enabled: Boolean(
        activeId &&
          selectedId &&
          canSuperviseTracking(role) &&
          canManageTracking
      ),
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
    if (!userId || !role) return;
    const refreshFromStorage = () => {
      try {
        setCache(loadTrackingCache(userId, role));
        setCacheError(null);
      } catch {
        setCacheError("tracking_cache_read");
      }
    };
    const onWorkspaceChanged = (event: Event) => {
      const changedUserId = (event as CustomEvent<{ userId?: string }>).detail
        ?.userId;
      if (!changedUserId || changedUserId === userId) refreshFromStorage();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key?.startsWith(`alrefqaa-tracking-cache-v2-${userId}-`))
        refreshFromStorage();
    };
    addEventListener("alrefqaa-workspace-changed", onWorkspaceChanged);
    addEventListener("storage", onStorage);
    return () => {
      removeEventListener("alrefqaa-workspace-changed", onWorkspaceChanged);
      removeEventListener("storage", onStorage);
    };
  }, [userId, role]);
  useEffect(() => {
    if (!activeId || !serverRole || !me.data) return;
    try {
      writeLastTrackingProfile({
        userId: activeId,
        role: serverRole,
        name: me.data.name ?? "",
        permissions: accessPermissions ?? null,
      });
    } catch {
      /* live access remains authoritative */
    }
  }, [activeId, serverRole, me.data, accessPermissions]);
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
      if (role === "staff" && !canManageTracking) {
        setNotice("tracking_forbidden");
        return false;
      }
      if (
        !userId ||
        !role ||
        !canReadTracking ||
        !canManageTracking ||
        !canTrackingDetails(role) ||
        role === "viewer"
      ) {
        setNotice("tracking_forbidden");
        return false;
      }
      if (command.type === "plan" && !canManageTracking) {
        setNotice("tracking_forbidden");
        return false;
      }
      if (
        command.type === "transfer" &&
        (!canSuperviseTracking(role) || role === "office_manager")
      ) {
        setNotice("tracking_forbidden");
        return false;
      }
      if (command.type === "cancel" && role !== "admin") {
        setNotice("tracking_forbidden");
        return false;
      }
      if (command.type === "note" && !canManageTracking) {
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
          const commandRole =
            actionRole(permissionSubject, "tracking", "manage") ?? role;
          assertTrackingCommand(
            commandRole,
            shipment as unknown as Shipment,
            command
          );
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
    [
      cache,
      detail,
      role,
      selectedId,
      userId,
      canUpdateWarehouseStage,
      canReadTracking,
      canManageTracking,
      accessPermissions,
      accessOffices,
      accessHomeOffice,
    ]
  );
  const share = useCallback(async () => {
    if (
      !activeId ||
      !serverRole ||
      !online ||
      !cache?.pending.length ||
      !canTrackingDetails(serverRole) ||
      !canManageTracking
    )
      return { applied: 0, stopped: false };
    // The root coordinator is the only ordinary sync path. Keep this method
    // as a compatibility/manual-review surface for callers that still render
    // it, but never bypass the coordinator or ask for a second confirmation.
    setNotice("tracking_pending");
    return { applied: 0, stopped: false };
  }, [activeId, serverRole, online, cache, canManageTracking]);
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
    permissions: accessPermissions ?? null,
    canReadTracking,
    canManageTracking,
    canUpdateWarehouseStage,
    offlineCandidate:
      activeId && candidate?.userId === activeId ? candidate : null,
    offlineOpen,
    openOffline: () => {
      if (activeId) setOfflineOpen(true);
    },
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
    canSupervise:
      canManageTracking &&
      (canSuperviseTracking(role) ||
        (accessPermissions !== undefined && accessPermissions !== null)),
    canTransfer: role === "admin" || role === "supervisor",
    canDetails: canReadTracking && canTrackingDetails(role),
    queue,
    share,
    sharing: Boolean(commit.isPending),
    refresh: () => {
      void listQuery.refetch();
      if (selectedId) void detailQuery.refetch();
      if (canSuperviseTracking(role) && canManageTracking)
        void auditQuery.refetch();
    },
  };
}
export type TrackingWorkspace = ReturnType<typeof useTrackingWorkspace>;
