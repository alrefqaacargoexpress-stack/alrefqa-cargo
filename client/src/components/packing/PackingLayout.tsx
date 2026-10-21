import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Home,
  Package,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOperationsWorkspace } from "@/hooks/useOperationsWorkspace";
import { startLogin } from "@/const";
import { downloadLocalArchive } from "@/lib/offlineStore";
import { copyFor } from "@/lib/packingCopy";
import { canUseOperations } from "@shared/tracking";
import {
  PackingScopeBadge,
  packingPrimaryClass,
  packingSecondaryClass,
} from "@/components/packing/PackingPrimitives";

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
  const [, navigate] = useLocation();
  const [notice, setNotice] = useState<string | null>(null);
  const offlineCandidate = !workspace.online && workspace.offlineAvailable;
  const routeLinks = [
    { href: "/", label: <Home size={15} />, text: c.title },
    {
      href: "/operations",
      label: <ShieldAlert size={15} />,
      text: c.operations,
    },
    {
      href: "/operations/shipments",
      label: <Package size={15} />,
      text: c.shipments,
    },
    { href: "/operations/customers", label: null, text: c.customers },
    { href: "/operations/reports", label: null, text: c.reports },
    {
      href: "/operations/tracking",
      label: null,
      text: {
        ar: "تتبع الشحنات",
        en: "Shipment tracking",
        zh: "货运追踪",
        tr: "Gönderi takibi",
      }[language],
    },
    {
      href: "/operations/offices",
      label: null,
      text: {
        ar: "لوحات المكاتب",
        en: "Office dashboards",
        zh: "办公室面板",
        tr: "Ofis panoları",
      }[language],
    },
    ...(workspace.role === "admin" || workspace.role === "accountant"
      ? [
          {
            href: "/operations/settings",
            label: null,
            text: {
              ar: "إعدادات نواكشوط",
              en: "Nouakchott settings",
              zh: "努瓦克肖特设置",
              tr: "Nuakşot ayarları",
            }[language],
          },
        ]
      : []),
    { href: "/operations?tab=accounts", label: null, text: "Excel" },
  ];

  const reviewAndSync = async () => {
    if (!workspace.queue.length) return;
    const result = await workspace.sync();
    if (!result) return;
    if (result.conflicts.length) setNotice(c.conflicts);
    else if (result.applied.length)
      setNotice(`${c.syncSuccess}: ${result.applied.length} ${c.applied}`);
    else setNotice(c.syncNoSuccess);
  };

  const shellState = () => {
    if (workspace.loading)
      return <StatePanel title={c.loading} detail={c.localHint} />;
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
      return <StatePanel title={c.noAccess} detail={c.noPermission} />;
    if (!canUseOperations(workspace.role))
      return (
        <StatePanel
          title={c.noAccess}
          detail={c.noPermission}
          action={
            <Link href="/operations/tracking" className={packingPrimaryClass}>
              {
                {
                  ar: "تتبع الشحنات",
                  en: "Shipment tracking",
                  zh: "货运追踪",
                  tr: "Gönderi takibi",
                }[language]
              }
            </Link>
          }
        />
      );
    return null;
  };
  const blocked = shellState();

  return (
    <div
      className="min-h-screen bg-[#f7f8f5] text-[#112c43]"
      dir={language === "ar" ? "rtl" : "ltr"}
    >
      <header className="border-b border-[#dce4e7] bg-white/95">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#092d50] text-[#d9a441]">
              <Package size={21} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-black text-[#092d50]">
                {c.title}
              </p>
              <p className="truncate text-xs text-[#718088]">
                {description ?? c.description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${workspace.online ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}
            >
              {workspace.online ? <Cloud size={13} /> : <CloudOff size={13} />}
              {workspace.online ? c.online : c.offline}
            </span>
          </div>
        </div>
        <nav
          className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-3 sm:px-6"
          aria-label={c.operations}
        >
          {routeLinks.map(link => (
            <Link
              key={`${link.href}-${link.text}`}
              href={link.href}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${locationMatches(link.href) ? "bg-[#e8eff1] text-[#092d50]" : "text-[#52636e] hover:bg-[#f1f5f4]"}`}
            >
              {link.label}
              {link.text}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
        {offlineCandidate && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
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
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-black tracking-tight text-[#092d50] sm:text-3xl">
                  {title}
                </h1>
                {description && (
                  <p className="mt-1 max-w-2xl text-sm text-[#718088]">
                    {description}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <PackingScopeBadge
                  scope={
                    workspace.localOnly
                      ? "local"
                      : workspace.queue.length
                        ? "pending"
                        : "shared"
                  }
                  c={c}
                />
                {workspace.queue.length > 0 && (
                  <button
                    className={`${packingSecondaryClass} gap-2`}
                    disabled={
                      workspace.busy || !workspace.online || workspace.localOnly
                    }
                    onClick={() => void reviewAndSync()}
                  >
                    <RefreshCw size={15} />
                    {c.sync} ({workspace.queue.length})
                  </button>
                )}
              </div>
            </div>
            <p className="mb-4 text-xs text-[#52636e]">
              {workspace.localOnly || workspace.queue.length
                ? c.localHint
                : c.sharedHint}
            </p>
            {workspace.snapshotError && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {c.snapshotError}{" "}
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
            {notice && (
              <div
                role="status"
                className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
              >
                <CheckCircle2 size={16} />
                {notice}
              </div>
            )}
            {workspace.conflicts.length > 0 && (
              <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4">
                <p className="font-bold text-red-900">{c.conflicts}</p>
                <div className="mt-3 grid gap-2">
                  {workspace.conflicts.map(conflict => (
                    <div
                      key={conflict.changeId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 text-sm"
                    >
                      <span className="text-red-950">{c.conflicts}</span>
                      <div className="flex gap-2">
                        <button
                          className={packingSecondaryClass}
                          onClick={() =>
                            void workspace.resolveConflict(conflict, false)
                          }
                        >
                          {c.keepLocal}
                        </button>
                        <button
                          className={packingSecondaryClass}
                          disabled={!conflict.current}
                          onClick={() =>
                            void workspace.resolveConflict(conflict, true)
                          }
                        >
                          {c.useServer}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {children}
          </>
        )}
        {blocked}
      </main>
    </div>
  );
}

function locationMatches(href: string) {
  if (typeof window === "undefined") return false;
  return href === "/"
    ? window.location.pathname === "/"
    : window.location.pathname === href ||
        window.location.pathname.startsWith(`${href}/`);
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
    <section className="mx-auto grid max-w-xl gap-3 rounded-3xl border border-[#dce4e7] bg-white p-6 text-center shadow-sm">
      <AlertTriangle className="mx-auto text-[#d9a441]" size={28} />
      <h2 className="text-xl font-black text-[#092d50]">{title}</h2>
      {detail && <p className="text-sm text-[#718088]">{detail}</p>}
      {action}
    </section>
  );
}
