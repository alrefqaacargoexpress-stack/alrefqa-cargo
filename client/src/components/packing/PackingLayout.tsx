import { type ReactNode } from "react";
import { Link } from "wouter";
import {
  AlertTriangle,
  Cloud,
  CloudOff,
  Package,
  RefreshCw,
} from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOperationsWorkspace } from "@/hooks/useOperationsWorkspace";
import { startLogin } from "@/const";
import { downloadLocalArchive } from "@/lib/offlineStore";
import { copyFor } from "@/lib/packingCopy";
import { roleWorkspaceCopy } from "@/lib/roleWorkspaceCopy";
import { workspaceLayoutCopy } from "@/lib/workspaceLayoutCopy";
import { workspaceSyncStatus } from "@/lib/roleWorkspace";
import { canUseOperations } from "@shared/tracking";
import { permissionAllowed } from "@shared/permissions";
import { trpc } from "@/lib/trpc";
import RoleWorkspaceShell from "@/components/roleWorkspace/RoleWorkspaceShell";
import WorkspaceNavigation from "@/components/roleWorkspace/WorkspaceNavigation";
import SyncConflictPanel from "./SyncConflictPanel";
import DutyAvailability from "./DutyAvailability";
import {
  packingPrimaryClass,
  packingSecondaryClass,
} from "./PackingPrimitives";

export type PackingWorkspace = ReturnType<typeof useOperationsWorkspace>;
export default function PackingLayout({
  children,
  title,
  description,
  workspace,
}: {
  children: ReactNode;
  title: string;
  description?: string;
  workspace: PackingWorkspace;
}) {
  const { language } = useLanguage();
  const c = copyFor(language);
  const roleCopy = roleWorkspaceCopy[language];
  const layoutCopy = workspaceLayoutCopy[language];
  const me = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const subject = {
    role: workspace.role,
    offices: workspace.offices,
    permissions: workspace.permissions,
    canUpdateTracking: workspace.canUpdateTracking,
  };
  const canViewShipments = permissionAllowed(subject, "shipments", "view");
  const canViewCustomers = permissionAllowed(subject, "customers", "view");
  const offlineCandidate = !workspace.online && workspace.offlineAvailable;
  const shellState = () => {
    if (workspace.loading) return <StatePanel title={c.loading} />;
    if (!workspace.userId && !workspace.localOnly)
      return (
        <StatePanel
          title={c.loginRequired}
          detail={c.noSession}
          action={
            <button
              className={packingPrimaryClass}
              disabled={!workspace.online}
              onClick={() => startLogin()}
            >
              {c.login}
            </button>
          }
        />
      );
    if (workspace.error)
      return (
        <StatePanel
          title={c.accessStorage}
          detail={workspace.error}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <button
                className={packingSecondaryClass}
                onClick={() => void workspace.reload()}
              >
                {c.retry}
              </button>
              <button
                className={packingSecondaryClass}
                onClick={() =>
                  downloadLocalArchive(workspace.userId ?? undefined)
                }
              >
                {
                  {
                    ar: "تنزيل أرشيف البيانات",
                    en: "Download data archive",
                    zh: "下载数据存档",
                    tr: "Veri arşivini indir",
                  }[language]
                }
              </button>
            </div>
          }
        />
      );
    if (workspace.role === null && !workspace.localOnly)
      return (
        <StatePanel
          title={roleCopy.roles.unassigned}
          detail={roleCopy.waiting}
        />
      );
    if (
      !canUseOperations(workspace.role) &&
      !canViewShipments &&
      !canViewCustomers &&
      !permissionAllowed(subject, "tracking", "view")
    )
      return <StatePanel title={c.noAccess} detail={c.noPermission} />;
    return null;
  };
  const blocked = shellState();
  const syncStatus = workspaceSyncStatus({
    online: workspace.online,
    localOnly: workspace.localOnly,
    pendingCount: workspace.queue.length,
    syncing: workspace.busy,
    conflictCount: workspace.conflicts.length,
  });
  return (
    <div
      className="min-h-screen bg-[#f7f8f5] text-[#112c43]"
      dir={language === "ar" ? "rtl" : "ltr"}
    >
      <header className="border-b border-[#dce4e7] bg-white">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/operations"
            className="flex min-w-0 items-center gap-2.5"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#092d50] text-[#d9a441]">
              <Package size={21} />
            </span>
            <span className="text-sm font-black text-[#092d50] sm:text-base">
              {layoutCopy.brand}
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <span
              role="status"
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-bold ${syncStatus === "pending" || syncStatus === "review" ? "bg-amber-50 text-amber-800" : syncStatus === "offline" ? "bg-blue-50 text-blue-800" : syncStatus === "syncing" ? "bg-sky-50 text-sky-800" : "bg-emerald-50 text-emerald-800"}`}
            >
              {syncStatus === "syncing" ? (
                <RefreshCw className="animate-spin" size={13} />
              ) : syncStatus === "offline" ? (
                <CloudOff size={13} />
              ) : (
                <Cloud size={13} />
              )}
              {!workspace.authenticated
                ? workspace.online
                  ? c.online
                  : c.offline
                : roleCopy.status[syncStatus]}
              {workspace.queue.length > 0 ? ` · ${workspace.queue.length}` : ""}
            </span>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-[1600px] items-stretch">
        {workspace.authenticated && !workspace.loading && !blocked && (
          <WorkspaceNavigation subject={subject} language={language} />
        )}
        <main className="min-w-0 flex-1 px-4 pt-4 pb-28 sm:px-6 lg:pb-10">
          {workspace.authenticated && !workspace.loading && (
            <RoleWorkspaceShell
              language={language}
              dir={language === "ar" ? "rtl" : "ltr"}
              name={me.data?.name}
              subject={subject}
            />
          )}
          {offlineCandidate && (
            <div className="my-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
              <span className="flex items-center gap-2">
                <CloudOff size={16} />
                {c.localHint}
              </span>
              <button
                className={packingSecondaryClass}
                onClick={workspace.openLocal}
              >
                {c.openLocal}
              </button>
            </div>
          )}
          {!blocked && (
            <>
              <div className="mt-5 mb-5">
                <h1 className="text-2xl font-black tracking-tight text-[#092d50] sm:text-3xl">
                  {title}
                </h1>
                {description && (
                  <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[#718088]">
                    {description}
                  </p>
                )}
              </div>
              {(workspace.localOnly || !workspace.online) && (
                <p className="mb-3 text-xs text-[#52636e]">{c.localHint}</p>
              )}
              {workspace.snapshotError && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  {c.snapshotError}
                  <button
                    className="ms-2 underline"
                    onClick={() => void workspace.reload()}
                  >
                    {c.retrySnapshot}
                  </button>
                </div>
              )}
              {workspace.notice && (
                <p
                  role="status"
                  className="mb-4 rounded-xl border border-[#dce4e7] bg-white p-3 text-sm text-[#23445d]"
                >
                  {workspace.notice}
                </p>
              )}
              <details className="mb-5 rounded-xl border border-[#dce4e7] bg-white">
                <summary className="cursor-pointer px-4 py-3 text-xs font-bold text-[#52636e]">
                  {layoutCopy.duty}
                </summary>
                <div className="px-3 pb-1">
                  <DutyAvailability workspace={workspace} />
                </div>
              </details>
              <SyncConflictPanel
                conflicts={workspace.conflicts}
                queue={workspace.queue}
                language={language}
                busy={workspace.busy}
                onRetry={conflict => void workspace.retryConflict(conflict)}
                onKeepLocal={conflict =>
                  void workspace.resolveConflict(conflict, false)
                }
                onUseServer={conflict =>
                  void workspace.resolveConflict(conflict, true)
                }
              />
              {children}
            </>
          )}
          {blocked}
        </main>
      </div>
    </div>
  );
}
function StatePanel({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <section className="mx-auto mt-6 grid max-w-xl gap-3 rounded-2xl border border-[#dce4e7] bg-white p-6 text-center shadow-sm">
      <AlertTriangle className="mx-auto text-[#d9a441]" size={28} />
      <h2 className="text-xl font-black text-[#092d50]">{title}</h2>
      {detail && <p className="text-sm text-[#718088]">{detail}</p>}
      {action}
    </section>
  );
}
