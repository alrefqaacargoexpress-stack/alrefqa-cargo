import { useEffect } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Package, Warehouse } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AppRole } from "@shared/operations";
import { permissionAllowed, type PermissionMap } from "@shared/permissions";
import { asPermissionSubject } from "@/lib/offlineAccess";
import { roleWorkspaceTasks } from "@/lib/roleWorkspace";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOperationsWorkspace } from "@/hooks/useOperationsWorkspace";
import PackingLayout from "@/components/packing/PackingLayout";
import { packingSecondaryClass } from "@/components/packing/PackingPrimitives";

const copy = {
  ar: {
    title: "مركز العمليات",
    description: "اختصارات واضحة للعمل اليومي حسب صلاحيتك.",
    newShipment: "شحنة جديدة",
    shipments: "قائمة الشحنات",
    customers: "حسابات العملاء",
    invoice: "فاتورة جديدة",
    offices: "حسابات المكاتب",
    tracking: "التتبع",
    settings: "إعدادات المكاتب",
    reports: "التقارير",
    advanced: "الأدوات المتقدمة",
    excel: "Excel والاستيراد",
    more: "المزيد",
    noActions: "لا توجد اختصارات متاحة لهذا الدور.",
    warehouse: "مخزن نواكشوط",
  },
  en: {
    title: "Operations hub",
    description: "Clear daily shortcuts based on your access.",
    newShipment: "New shipment",
    shipments: "Shipment list",
    customers: "Customer accounts",
    invoice: "New invoice",
    offices: "Office accounts",
    tracking: "Tracking",
    settings: "Office settings",
    reports: "Reports",
    advanced: "Advanced tools",
    excel: "Excel and import",
    more: "More",
    noActions: "No shortcuts are available for this role.",
    warehouse: "Nouakchott warehouse",
  },
  zh: {
    title: "运营中心",
    description: "根据您的权限提供清晰的日常快捷入口。",
    newShipment: "新货运",
    shipments: "货运列表",
    customers: "客户账户",
    invoice: "新发票",
    offices: "办公室账务",
    tracking: "追踪",
    settings: "办公室设置",
    reports: "报告",
    advanced: "高级工具",
    excel: "Excel 与导入",
    more: "更多",
    noActions: "此角色没有可用快捷入口。",
    warehouse: "努瓦克肖特仓库",
  },
  tr: {
    title: "Operasyon merkezi",
    description: "Yetkinize göre açık günlük kısayollar.",
    newShipment: "Yeni gönderi",
    shipments: "Gönderi listesi",
    customers: "Müşteri hesapları",
    invoice: "Yeni fatura",
    offices: "Ofis hesapları",
    tracking: "Takip",
    settings: "Ofis ayarları",
    reports: "Raporlar",
    advanced: "Gelişmiş araçlar",
    excel: "Excel ve içe aktarma",
    more: "Daha fazla",
    noActions: "Bu rol için kısayol yok.",
    warehouse: "Nuakşot deposu",
  },
} as const;

type Language = keyof typeof copy;
type Action = {
  href: string;
  label: string;
  icon: LucideIcon;
};
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

export function legacyDestination(location: string) {
  const [withoutHash, hash = ""] = location.split("#");
  const query = withoutHash.split("?")[1] ?? "";
  const params = new URLSearchParams(query);
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
  const suffix = params.toString();
  return `${destination}${suffix ? `?${suffix}` : ""}${hash ? `#${hash}` : ""}`;
}

export function operationActionsForRole(
  role: AppRole | null,
  c: ActionCopy,
  offices?: string[] | null,
  canUpdateTracking?: boolean,
  permissions?: PermissionMap | null
): Action[] {
  const subject = asPermissionSubject(role, offices as never, permissions);
  const effectiveSubject = { ...subject, canUpdateTracking };
  if (permissions === undefined) {
    // Keep the public helper backwards compatible for callers that have not
    // loaded access yet; the live workspace always supplies the access map.
    const legacy: Array<[keyof ActionCopy, string]> | null =
      role === "admin"
        ? [
            ["newShipment", "/operations/shipments/new"],
            ["shipments", "/operations/shipments"],
            ["customers", "/operations/customers"],
            ["invoice", "/operations/billing"],
            ["offices", "/operations/finance"],
            ["tracking", "/operations/tracking"],
            ["settings", "/operations/settings"],
          ]
        : role === "staff"
          ? [
              ["newShipment", "/operations/shipments/new"],
              ["shipments", "/operations/shipments"],
              ["customers", "/operations/customers"],
            ]
          : role === "viewer"
            ? [["tracking", "/operations/tracking"]]
            : null;
    if (legacy)
      return legacy.map(([key, href]) => ({
        href,
        label: c[key] ?? key,
        icon: Package,
      }));
    return roleWorkspaceTasks({ ...effectiveSubject, permissions: null }).map(
      task => ({
        href: task.href,
        label:
          task.id === "new-shipment"
            ? c.newShipment
            : task.id === "shipments"
              ? c.shipments
              : task.id === "customers"
                ? c.customers
                : task.id === "tracking"
                  ? c.tracking
                  : task.id === "settings"
                    ? c.settings
                    : task.id === "offices"
                      ? c.offices
                      : task.id === "warehouse-storage"
                        ? (c.warehouse ?? "Warehouse")
                        : task.id,
        icon: task.id.startsWith("warehouse") ? Warehouse : Package,
      })
    );
  }
  return roleWorkspaceTasks(effectiveSubject).map(task => ({
    href: task.href,
    label:
      task.id === "new-shipment"
        ? c.newShipment
        : task.id === "shipments"
          ? c.shipments
          : task.id === "customers"
            ? c.customers
            : task.id === "tracking"
              ? c.tracking
              : task.id === "settings"
                ? c.settings
                : task.id === "offices"
                  ? c.offices
                  : task.id === "warehouse-storage"
                    ? (c.warehouse ?? "Warehouse")
                    : task.id,
    icon: task.id.startsWith("warehouse") ? Warehouse : Package,
  }));
}

export default function OperationsHome() {
  const { language } = useLanguage();
  const workspace = useOperationsWorkspace();
  const [location, navigate] = useLocation();
  const search = useSearch();
  const c = copy[(language in copy ? language : "ar") as Language];

  useEffect(() => {
    const destination = legacyDestination(
      `${location}${search ? `?${search}` : ""}${globalThis.location?.hash ?? ""}`
    );
    if (destination) navigate(destination, { replace: true });
  }, [location, search, navigate]);

  const actions = operationActionsForRole(
    workspace.role,
    c,
    workspace.offices,
    workspace.canUpdateTracking,
    workspace.permissions
  );

  return (
    <PackingLayout
      workspace={workspace}
      title={c.title}
      description={c.description}
    >
      <div className="space-y-6">
        <section
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          aria-label={c.title}
        >
          {actions.map(action => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className={`${packingSecondaryClass} min-h-24 justify-between rounded-2xl p-4 text-start text-base shadow-sm`}
              >
                <span className="flex items-center gap-3">
                  <Icon size={21} className="text-[#d9a441]" />
                  <span>{action.label}</span>
                </span>
                <span aria-hidden="true" className="text-lg">
                  {language === "ar" ? "←" : "→"}
                </span>
              </Link>
            );
          })}
        </section>
        {!actions.length && (
          <p className="rounded-2xl border border-dashed border-[#cbd9dd] bg-white p-6 text-center text-sm text-[#718088]">
            {c.noActions}
          </p>
        )}
      </div>
    </PackingLayout>
  );
}

/** Route target for the Nouakchott storage-only staff workspace. */
export function OperationsWarehouse() {
  const { language } = useLanguage();
  const workspace = useOperationsWorkspace();
  const title = {
    ar: "مخزن نواكشوط",
    en: "Nouakchott warehouse",
    zh: "努瓦克肖特仓库",
    tr: "Nuakşot deposu",
  }[language];
  const description = {
    ar: "التخزين فقط؛ لا إنشاء شحنات ولا تسجيل وصول أو تسليم.",
    en: "Storage only; no shipment creation or arrival/delivery confirmation.",
    zh: "仅限仓储；不能创建货运或确认到达、交付。",
    tr: "Yalnızca depolama; gönderi oluşturma veya varış/teslim onayı yok.",
  }[language];
  return (
    <PackingLayout
      workspace={workspace}
      title={title}
      description={description}
    >
      <section className="rounded-3xl border border-[#dce4e7] bg-white p-6 shadow-sm">
        <p className="text-sm text-[#52636e]">
          {language === "ar"
            ? "تُعرض السجلات الحالية للقراءة فقط. يظهر رابط التتبع فقط إذا منحك المدير العام صلاحية تحديد أين وصلت الشحنة."
            : language === "en"
              ? "Current records are read-only. Tracking appears only if the general manager grants the shipment-stage permission."
              : language === "zh"
                ? "当前记录为只读。只有总经理授予货运阶段权限时才显示追踪。"
                : "Mevcut kayıtlar salt okunurdur. Takip yalnızca genel müdür gönderi aşaması yetkisi verirse görünür."}
        </p>
      </section>
    </PackingLayout>
  );
}
