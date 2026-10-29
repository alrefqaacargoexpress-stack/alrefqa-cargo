import { useEffect, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  LayoutDashboard,
  Building2,
  Users,
  Package,
  PackageSearch,
  Truck,
  Warehouse,
  Receipt,
  Wallet,
  Coins,
  Settings,
  FileBarChart,
  FileSpreadsheet,
  ShieldCheck,
  MoreHorizontal,
  X,
  Globe,
  type LucideIcon,
} from "lucide-react";
import {
  groupedWorkspaceTasks,
  type RoleWorkspaceSubject,
  type RoleWorkspaceTaskId,
} from "@/lib/roleWorkspace";
import { roleWorkspaceCopy } from "@/lib/roleWorkspaceCopy";
import { workspaceLayoutCopy } from "@/lib/workspaceLayoutCopy";
import type { Language } from "@/lib/publicCopy";

export const taskIcons: Partial<Record<RoleWorkspaceTaskId, LucideIcon>> = {
  offices: Building2,
  employees: Users,
  settings: Settings,
  "new-shipment": Package,
  shipments: Package,
  tracking: Truck,
  "market-warehouse": PackageSearch,
  "warehouse-arrivals": Warehouse,
  "warehouse-storage": Warehouse,
  "warehouse-delivery": Truck,
  invoices: Receipt,
  customers: Users,
  cash: Wallet,
  "shipment-cost": Coins,
  "arrival-cost": Coins,
  pricing: Coins,
  reports: FileBarChart,
  excel: FileSpreadsheet,
  audit: ShieldCheck,
};

export function workspaceLinkActive(
  href: string,
  path: string,
  search: string
) {
  const [targetPath, query = ""] = href.split("?");
  if (targetPath === "/operations") return path === targetPath;
  if (path !== targetPath && !path.startsWith(`${targetPath}/`)) return false;
  const expected = new URLSearchParams(query);
  const actual = new URLSearchParams(search);
  return Array.from(expected.entries()).every(
    ([key, value]) => actual.get(key) === value
  );
}

export default function WorkspaceNavigation({
  subject,
  language,
}: {
  subject: RoleWorkspaceSubject;
  language: Language;
}) {
  const [path] = useLocation();
  const search = useSearch();
  const [open, setOpen] = useState(false);
  const c = workspaceLayoutCopy[language];
  const taskCopy = roleWorkspaceCopy[language];
  const groups = groupedWorkspaceTasks(subject);
  const tasks = groups.flatMap(group => group.tasks);
  const preferred: RoleWorkspaceTaskId[] =
    subject.role === "admin" || subject.role === "office_manager"
      ? ["offices", "employees", "shipments"]
      : subject.role === "destination_warehouse" ||
          (subject.role === "staff" && subject.offices?.[0] === "nouakchott")
        ? ["warehouse-arrivals", "warehouse-storage", "warehouse-delivery"]
        : subject.role === "accountant" || subject.role === "cashier"
          ? ["invoices", "customers", "cash"]
          : subject.role === "general_accountant"
            ? ["shipment-cost", "arrival-cost", "invoices"]
            : ["new-shipment", "shipments", "tracking"];
  const primary = preferred
    .flatMap(id => tasks.find(task => task.id === id) ?? [])
    .slice(0, 3);
  useEffect(() => {
    setOpen(false);
  }, [path, search]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  const itemClass = (active: boolean) =>
    `flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? "bg-[#092d50] font-bold text-white" : "text-[#52636e] hover:bg-[#e8eff1]"}`;
  const groupedLinks = () => (
    <>
      <Link
        href="/operations"
        aria-current={path === "/operations" ? "page" : undefined}
        className={itemClass(path === "/operations")}
      >
        <LayoutDashboard size={18} />
        {c.home}
      </Link>
      {groups.map(group => (
        <div key={group.id} className="mt-4">
          <p className="mb-1 px-3 text-[11px] font-bold text-[#718088]">
            {c.groups[group.id]}
          </p>
          {group.tasks.map(task => {
            const Icon = taskIcons[task.id] ?? Package;
            const active = workspaceLinkActive(task.href, path, search);
            return (
              <Link
                key={task.id}
                href={task.href}
                aria-current={active ? "page" : undefined}
                className={itemClass(active)}
              >
                <Icon size={17} className="shrink-0" />
                {taskCopy.tasks[task.id]}
              </Link>
            );
          })}
        </div>
      ))}
      <div className="mt-5 border-t border-[#dce4e7] pt-3">
        <Link
          href="/account/security"
          className={itemClass(path === "/account/security")}
        >
          <ShieldCheck size={17} />
          {c.security}
        </Link>
        <Link href="/" className={itemClass(false)}>
          <Globe size={17} />
          {c.public}
        </Link>
      </div>
    </>
  );
  return (
    <>
      <aside className="hidden w-60 shrink-0 border-e border-[#dce4e7] bg-white lg:block">
        <nav
          aria-label={c.navigation}
          className="sticky top-0 max-h-screen overflow-y-auto p-4"
        >
          {groupedLinks()}
        </nav>
      </aside>
      <nav
        aria-label={c.navigation}
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-[#dce4e7] bg-white px-1 pt-1 pb-[max(0.4rem,env(safe-area-inset-bottom))] shadow-lg lg:hidden"
      >
        <Link
          href="/operations"
          aria-current={path === "/operations" ? "page" : undefined}
          className={`flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[10px] ${path === "/operations" ? "bg-[#e8eff1] font-bold text-[#092d50]" : "text-[#52636e]"}`}
        >
          <LayoutDashboard size={20} />
          {c.home}
        </Link>
        {primary.map(task => {
          const Icon = taskIcons[task.id] ?? Package;
          const active = workspaceLinkActive(task.href, path, search);
          return (
            <Link
              key={task.id}
              href={task.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 text-center text-[10px] ${active ? "bg-[#e8eff1] font-bold text-[#092d50]" : "text-[#52636e]"}`}
            >
              <Icon size={20} />
              <span className="line-clamp-2">{taskCopy.tasks[task.id]}</span>
            </Link>
          );
        })}
        <button
          type="button"
          aria-expanded={open}
          aria-controls="workspace-mobile-menu"
          onClick={() => setOpen(true)}
          className="flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[10px] text-[#52636e]"
        >
          <MoreHorizontal size={20} />
          {c.more}
        </button>
      </nav>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-[#092d50]/40 lg:hidden"
          onClick={() => setOpen(false)}
        >
          <section
            id="workspace-mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label={c.navigation}
            className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
            onClick={event => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-black text-[#092d50]">{c.navigation}</h2>
              <button
                type="button"
                autoFocus
                onClick={() => setOpen(false)}
                aria-label={c.close}
                className="grid size-11 place-items-center rounded-full bg-[#f1f5f4]"
              >
                <X size={19} />
              </button>
            </div>
            <nav aria-label={c.navigation}>{groupedLinks()}</nav>
          </section>
        </div>
      )}
    </>
  );
}
