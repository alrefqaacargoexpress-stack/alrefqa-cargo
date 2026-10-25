import { useEffect, useMemo, useRef, type PropsWithChildren } from "react";
import { APP_ROLES } from "@shared/operations";
import { trpc } from "@/lib/trpc";
import { useFinanceWorkspace } from "@/hooks/useFinanceWorkspace";
import { loadTrackingCache } from "@/lib/trackingStore";
import {
  syncTrackingQueue,
  type TrackingCommitResult,
} from "@/lib/trackingAutoSync";
import { autoSyncCoordinator, type AutoSyncCoordinator } from "@/lib/autoSync";
import {
  WorkspaceSyncContext,
  useWorkspaceSyncCoordinator,
} from "./WorkspaceSyncContext";

export type WorkspaceSyncProviderProps = PropsWithChildren<{
  userId?: string | null;
  authReady?: boolean;
  authScopeFingerprint?: string | null;
  coordinator?: AutoSyncCoordinator;
}>;

export { useWorkspaceSyncCoordinator } from "./WorkspaceSyncContext";

/** Compatibility provider for focused pages/tests that already have a session scope. */
export function WorkspaceSyncProvider({
  children,
  userId = null,
  authReady = false,
  authScopeFingerprint = null,
  coordinator = autoSyncCoordinator,
}: WorkspaceSyncProviderProps) {
  useEffect(() => coordinator.start(), [coordinator]);
  useEffect(() => {
    coordinator.setSession(userId, authReady, authScopeFingerprint);
  }, [authReady, authScopeFingerprint, coordinator, userId]);
  return (
    <WorkspaceSyncContext.Provider value={coordinator}>
      {children}
    </WorkspaceSyncContext.Provider>
  );
}

function RuntimeRegistration() {
  // useFinanceWorkspace owns the single operations base hook and its finance
  // adapter. Keeping this component mounted means queues sync off-page too.
  const coordinator = useWorkspaceSyncCoordinator();
  const finance = useFinanceWorkspace();
  const base = finance.base;
  const trackingCommit = trpc.tracking.commit.useMutation();
  const commitTracking = trackingCommit.mutateAsync;
  const current = useRef({
    userId: base.userId,
    role: base.role,
    accessReady: base.accessReady,
    localOnly: base.localOnly,
  });
  current.current = {
    userId: base.userId,
    role: base.role,
    accessReady: base.accessReady,
    localOnly: base.localOnly,
  };
  useEffect(() => {
    if (!base.userId || !base.role) return;
    const userId = String(base.userId);
    const role = base.role;
    const env = {
      userId,
      role,
      scopeFingerprint: base.permissionFingerprint ?? null,
      permissions: base.permissions ?? undefined,
      offices: base.offices,
      canUpdateTracking: base.canUpdateTracking,
      isCurrent: () => {
        const live = current.current;
        return (
          live.userId === userId &&
          live.role === role &&
          live.accessReady &&
          !live.localOnly
        );
      },
      commit: async (input: Parameters<typeof commitTracking>[0]) =>
        (await commitTracking(input)) as TrackingCommitResult,
    };
    return coordinator.registerTracking({
      userId,
      scopeFingerprint: base.permissionFingerprint ?? null,
      authReady: base.accessReady && !base.localOnly,
      online: base.online && !base.localOnly,
      pending: () => {
        try {
          return loadTrackingCache(userId, role).pending.length;
        } catch {
          return 0;
        }
      },
      sync: () => syncTrackingQueue(env),
    });
  }, [
    base.accessReady,
    base.canUpdateTracking,
    base.localOnly,
    base.offices,
    base.online,
    base.permissionFingerprint,
    base.permissions,
    base.role,
    base.userId,
    coordinator,
    commitTracking,
  ]);
  return null;
}

function RootSessionRegistration({
  coordinator,
}: {
  coordinator: AutoSyncCoordinator;
}) {
  const me = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const employee = me.data?.accountType === "employee";
  const userId = me.data?.id == null ? null : String(me.data.id);
  const access = trpc.operations.access.useQuery(
    userId ? { clientUserId: userId } : undefined,
    {
      enabled: Boolean(employee && userId),
      retry: false,
      refetchOnWindowFocus: false,
    }
  );
  const role = access.data?.role;
  const validRole = Boolean(
    role && (APP_ROLES as readonly string[]).includes(role)
  );
  const responseUserId =
    access.data?.userId == null ? null : String(access.data.userId);
  const authReady = Boolean(
    employee && userId && responseUserId === userId && access.data && validRole
  );
  const fingerprint = access.data?.permissionFingerprint ?? null;

  useEffect(() => {
    coordinator.setSession(userId, authReady, fingerprint);
  }, [authReady, coordinator, fingerprint, userId]);

  return authReady ? <RuntimeRegistration /> : null;
}

/**
 * Root contract: mount once around Router with no explicit identity props.
 * Customers and guests only execute the session query; workspace queries and
 * adapters are mounted for a valid employee role/access scope only.
 */
export function WorkspaceProviders({
  children,
  coordinator: suppliedCoordinator,
}: WorkspaceSyncProviderProps) {
  const coordinator = useMemo(
    () => suppliedCoordinator ?? autoSyncCoordinator,
    [suppliedCoordinator]
  );
  useEffect(() => coordinator.start(), [coordinator]);
  return (
    <WorkspaceSyncContext.Provider value={coordinator}>
      <RootSessionRegistration coordinator={coordinator} />
      {children}
    </WorkspaceSyncContext.Provider>
  );
}

export { AutoSyncCoordinator, autoSyncCoordinator } from "@/lib/autoSync";
export type {
  AutoSyncState,
  AutoSyncStatus,
  TrackingAdapter,
} from "@/lib/autoSync";
