import { useEffect } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Package, ArrowLeft, ArrowRight, type LucideIcon } from "lucide-react";
import type { AppRole } from "@shared/operations";
import type { PermissionMap } from "@shared/permissions";
import { asPermissionSubject } from "@/lib/offlineAccess";
import { groupedWorkspaceTasks, roleWorkspaceTasks } from "@/lib/roleWorkspace";
import { roleWorkspaceCopy } from "@/lib/roleWorkspaceCopy";
import { workspaceLayoutCopy } from "@/lib/workspaceLayoutCopy";
import { taskIcons } from "@/components/roleWorkspace/WorkspaceNavigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOperationsWorkspace } from "@/hooks/useOperationsWorkspace";
import PackingLayout from "@/components/packing/PackingLayout";

type ActionCopy = Record<
  | "newShipment"
  | "shipments"
  | "customers"
  | "invoice"
  | "offices"
  | "tracking"
  | "settings",
  string
> & { warehouse?: string };
type Action = { href: string; label: string; icon: LucideIcon };

export function legacyDestination(location: string) {
  const [withoutHash, hash = ""] = location.split("#");
  const params = new URLSearchParams(withoutHash.split("?")[1] ?? "");
  const tab = params.get("tab");
  if (!tab) return null;
  const destination =
    tab === "accounts"
      ? "/operations/customers"
      : tab === "invoices"
        ? "/operations/billing"
        : tab === "permissions" || tab === "access"
          ? "/operations/settings"
          : tab === "shipments"
            ? "/operations/shipments"
            : null;
  if (!destination) return null;
  params.delete("tab");
  if (tab === "permissions" || tab === "access")
    params.set("panel", "employees");
  return `${destination}${params.size ? `?${params}` : ""}${hash ? `#${hash}` : ""}`;
}

// Compatibility helper uses the same effective permission policy as the live dashboard.
export function operationActionsForRole(
  role: AppRole | null,
  c: ActionCopy,
  offices?: string[] | null,
  canUpdateTracking?: boolean,
  permissions?: PermissionMap | null
): Action[] {
  const subject = {
    ...asPermissionSubject(role, offices as never, permissions),
    canUpdateTracking,
  };
  return roleWorkspaceTasks(subject).map(task => ({
    href: task.href,
    label:
      task.id === "new-shipment"
        ? c.newShipment
        : task.id === "shipments"
          ? c.shipments
          : task.id === "customers"
            ? c.customers
            : task.id === "invoices"
              ? c.invoice
              : task.id === "offices"
                ? c.offices
                : task.id === "tracking"
                  ? c.tracking
                  : task.id === "settings"
                    ? c.settings
                    : task.id === "warehouse-storage"
                      ? (c.warehouse ?? "Warehouse")
                      : task.id,
    icon: taskIcons[task.id] ?? Package,
  }));
}

export default function OperationsHome() {
  const { language } = useLanguage();
  const workspace = useOperationsWorkspace();
  const [location, navigate] = useLocation();
  const search = useSearch();
  const layout = workspaceLayoutCopy[language];
  const copy = roleWorkspaceCopy[language];
  const Arrow = language === "ar" ? ArrowLeft : ArrowRight;
  useEffect(() => {
    const destination = legacyDestination(
      `${location}${search ? `?${search}` : ""}${globalThis.location?.hash ?? ""}`
    );
    if (destination) navigate(destination, { replace: true });
  }, [location, search, navigate]);
  const subject = {
    role: workspace.role,
    offices: workspace.offices,
    permissions: workspace.permissions,
    canUpdateTracking: workspace.canUpdateTracking,
  };
  const groups = groupedWorkspaceTasks(subject);
  return (
    <PackingLayout
      workspace={workspace}
      title={layout.title[workspace.role ?? "unassigned"]}
      description={layout.description}
    >
      <div className="space-y-5">
        {groups.map((group, index) => (
          <section
            key={group.id}
            aria-labelledby={`workspace-group-${group.id}`}
            className="rounded-2xl border border-[#dce4e7] bg-white p-4 shadow-sm sm:p-5"
          >
            <div className="mb-4 flex items-center gap-2">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#eef3f2] text-xs font-bold text-[#31566c]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h2
                id={`workspace-group-${group.id}`}
                className="text-base font-black text-[#092d50]"
              >
                {layout.groups[group.id]}
              </h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {group.tasks.map(task => {
                const Icon = taskIcons[task.id] ?? Package;
                return (
                  <Link
                    key={task.id}
                    href={task.href}
                    className="group flex min-h-16 min-w-0 items-center justify-between gap-3 rounded-xl border border-[#e6ecec] bg-[#fafbf9] px-4 py-3 text-sm font-semibold text-[#23445d] transition hover:border-[#b4c8cd] hover:bg-[#eef4f3]"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <Icon size={20} className="shrink-0 text-[#b98528]" />
                      {copy.tasks[task.id]}
                    </span>
                    <Arrow
                      size={16}
                      className="shrink-0 text-[#91a3ac] group-hover:text-[#092d50]"
                    />
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
        {!groups.length && (
          <p className="rounded-xl border border-dashed border-[#cbd9dd] bg-white p-5 text-sm text-[#718088]">
            {layout.empty}
          </p>
        )}
      </div>
    </PackingLayout>
  );
}

/** Retained export for legacy callers; storage routes use their real screen. */
export function OperationsWarehouse() {
  const { language } = useLanguage();
  const workspace = useOperationsWorkspace();
  const c = roleWorkspaceCopy[language];
  return (
    <PackingLayout workspace={workspace} title={c.tasks["warehouse-storage"]}>
      <Link
        href="/operations/warehouse"
        className="inline-flex rounded-xl bg-[#092d50] px-5 py-3 font-bold text-white"
      >
        {c.tasks["warehouse-storage"]}
      </Link>
    </PackingLayout>
  );
}
