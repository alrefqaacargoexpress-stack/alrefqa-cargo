import { officeNames, type OfficeId } from "@shared/branches";
import {
  permissionAllowed,
  type PermissionKey,
  type PermissionLevel,
  type PermissionMap,
} from "@shared/permissions";
import type { AppRole } from "@shared/operations";
import type { Language } from "@/lib/publicCopy";

export type SyncWorkspaceStatus =
  | "idle"
  | "pending"
  | "syncing"
  | "offline"
  | "review";
export type RoleWorkspaceSubject = {
  role: AppRole | null;
  offices?: readonly OfficeId[] | null;
  homeOffice?: OfficeId | null;
  permissions?: PermissionMap | null;
  canUpdateTracking?: boolean;
};
export type RoleWorkspaceTaskId =
  | "new-shipment"
  | "shipments"
  | "customers"
  | "offices"
  | "employees"
  | "tracking"
  | "market-warehouse"
  | "warehouse-arrivals"
  | "warehouse-storage"
  | "warehouse-rack"
  | "warehouse-delivery"
  | "invoices"
  | "receipts"
  | "cash"
  | "shipment-cost"
  | "arrival-cost"
  | "pricing"
  | "reports"
  | "excel"
  | "advanced"
  | "settings"
  | "audit"
  | "finance-summary"
  | "expenses";
export type WorkspaceGroupId =
  | "management"
  | "shipping"
  | "warehouse"
  | "sales"
  | "finance"
  | "insights";
export type RoleWorkspaceTask = {
  id: RoleWorkspaceTaskId;
  href: string;
  permission: PermissionKey;
  level: PermissionLevel;
  priority: number;
  group: WorkspaceGroupId;
};

// Links identify real screens; related work is grouped instead of duplicating shortcuts.
const taskCatalog: readonly RoleWorkspaceTask[] = [
  {
    id: "offices",
    href: "/operations/offices",
    permission: "office_settings",
    level: "view",
    priority: 1,
    group: "management",
  },
  {
    id: "employees",
    href: "/operations/settings?panel=employees",
    permission: "employees",
    level: "view",
    priority: 2,
    group: "management",
  },
  {
    id: "settings",
    href: "/operations/settings?panel=profile",
    permission: "office_settings",
    level: "manage",
    priority: 3,
    group: "management",
  },
  {
    id: "new-shipment",
    href: "/operations/shipments/new",
    permission: "shipments",
    level: "manage",
    priority: 1,
    group: "shipping",
  },
  {
    id: "shipments",
    href: "/operations/shipments",
    permission: "shipments",
    level: "view",
    priority: 2,
    group: "shipping",
  },
  {
    id: "tracking",
    href: "/operations/tracking",
    permission: "tracking",
    level: "view",
    priority: 3,
    group: "shipping",
  },
  {
    id: "market-warehouse",
    href: "/operations/market-warehouse",
    permission: "market_warehouse",
    level: "view",
    priority: 4,
    group: "warehouse",
  },
  {
    id: "warehouse-arrivals",
    href: "/operations/offices?office=nouakchott",
    permission: "arrival",
    level: "manage",
    priority: 1,
    group: "warehouse",
  },
  {
    id: "warehouse-storage",
    href: "/operations/warehouse",
    permission: "storage",
    level: "view",
    priority: 2,
    group: "warehouse",
  },
  {
    id: "warehouse-delivery",
    href: "/operations/tracking",
    permission: "arrival",
    level: "manage",
    priority: 3,
    group: "warehouse",
  },
  {
    id: "invoices",
    href: "/operations/billing",
    permission: "invoices",
    level: "view",
    priority: 1,
    group: "sales",
  },
  {
    id: "customers",
    href: "/operations/customers",
    permission: "customers",
    level: "view",
    priority: 2,
    group: "sales",
  },
  {
    id: "cash",
    href: "/operations/finance?panel=cash",
    permission: "payments",
    level: "manage",
    priority: 1,
    group: "finance",
  },
  {
    id: "shipment-cost",
    href: "/operations/finance?panel=shipment-cost",
    permission: "shipment_cost",
    level: "view",
    priority: 2,
    group: "finance",
  },
  {
    id: "arrival-cost",
    href: "/operations/finance?panel=arrival-cost",
    permission: "arrival_cost",
    level: "view",
    priority: 3,
    group: "finance",
  },
  {
    id: "pricing",
    href: "/operations/finance?panel=price",
    permission: "shipment_prices",
    level: "manage",
    priority: 4,
    group: "finance",
  },
  {
    id: "finance-summary",
    href: "/operations/finance",
    permission: "finance_reports",
    level: "view",
    priority: 5,
    group: "finance",
  },
  {
    id: "expenses",
    href: "/operations/finance?panel=expenses",
    permission: "expenses",
    level: "manage",
    priority: 6,
    group: "finance",
  },

  {
    id: "reports",
    href: "/operations/reports",
    permission: "reports",
    level: "view",
    priority: 1,
    group: "insights",
  },
  {
    id: "excel",
    href: "/operations/advanced?tab=accounts",
    permission: "excel",
    level: "view",
    priority: 2,
    group: "insights",
  },
  {
    id: "audit",
    href: "/operations/reports?panel=audit",
    permission: "audit",
    level: "view",
    priority: 3,
    group: "insights",
  },
];

export function workspaceGroupOrder(
  subject: RoleWorkspaceSubject
): WorkspaceGroupId[] {
  if (subject.role === "admin" || subject.role === "office_manager")
    return [
      "management",
      "shipping",
      "warehouse",
      "sales",
      "finance",
      "insights",
    ];
  if (
    subject.role === "destination_warehouse" ||
    (subject.role === "staff" && subject.offices?.[0] === "nouakchott")
  )
    return [
      "warehouse",
      "shipping",
      "sales",
      "finance",
      "insights",
      "management",
    ];
  if (subject.role === "general_accountant")
    return [
      "finance",
      "sales",
      "shipping",
      "insights",
      "warehouse",
      "management",
    ];
  if (subject.role === "accountant" || subject.role === "cashier")
    return [
      "sales",
      "finance",
      "shipping",
      "insights",
      "warehouse",
      "management",
    ];
  return [
    "shipping",
    "warehouse",
    "insights",
    "sales",
    "finance",
    "management",
  ];
}

export function roleWorkspaceTasks(
  subject: RoleWorkspaceSubject
): RoleWorkspaceTask[] {
  const order = workspaceGroupOrder(subject);
  return taskCatalog
    .filter(
      task =>
        permissionAllowed(subject, task.permission, task.level) &&
        (task.id !== "audit" ||
          subject.role === "admin" ||
          permissionAllowed(subject, "tracking", "view"))
    )
    .sort(
      (a, b) =>
        order.indexOf(a.group) - order.indexOf(b.group) ||
        a.priority - b.priority
    );
}

export function groupedWorkspaceTasks(
  subject: RoleWorkspaceSubject,
  tasks = roleWorkspaceTasks(subject)
) {
  return workspaceGroupOrder(subject)
    .map(id => ({ id, tasks: tasks.filter(task => task.group === id) }))
    .filter(group => group.tasks.length > 0);
}

export function splitRoleWorkspaceTasks(
  tasks: readonly RoleWorkspaceTask[],
  primaryLimit = 5
) {
  return {
    primary: tasks.slice(0, primaryLimit),
    more: tasks.slice(primaryLimit),
  };
}

export function workspaceSyncStatus(input: {
  online: boolean;
  localOnly: boolean;
  pendingCount: number;
  syncing: boolean;
  conflictCount: number;
}): SyncWorkspaceStatus {
  if (input.syncing) return "syncing";
  if (input.conflictCount > 0) return "review";
  if (!input.online || input.localOnly) return "offline";
  if (input.pendingCount > 0) return "pending";
  return "idle";
}
export function roleDisplayKey(role: AppRole | null) {
  return role ?? "unassigned";
}
export function officeDisplayLabel(
  offices: readonly OfficeId[] | null | undefined,
  language: Language,
  isAdmin = false
) {
  if (isAdmin)
    return {
      ar: "كل المكاتب",
      en: "All offices",
      zh: "所有办公室",
      tr: "Tüm ofisler",
    }[language];
  if (!offices?.length)
    return {
      ar: "بانتظار تعيين المكتب",
      en: "Waiting for office assignment",
      zh: "等待分配办公室",
      tr: "Ofis ataması bekleniyor",
    }[language];
  return offices
    .map(office => officeNames[language][office])
    .join(language === "ar" ? "، " : ", ");
}
export function taskUsesFinance(task: RoleWorkspaceTask) {
  return [
    "invoices",
    "receipts",
    "cash",
    "shipment-cost",
    "arrival-cost",
    "pricing",
  ].includes(task.id);
}
export { taskCatalog };
