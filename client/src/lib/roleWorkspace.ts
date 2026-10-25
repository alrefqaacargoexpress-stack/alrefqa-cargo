import {
  officeNames,
  type OfficeId,
} from "@shared/branches";
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
  | "audit";

export type RoleWorkspaceTask = {
  id: RoleWorkspaceTaskId;
  href: string;
  permission: PermissionKey;
  level: PermissionLevel;
  priority: number;
};

const taskCatalog: readonly RoleWorkspaceTask[] = [
  { id: "new-shipment", href: "/operations/shipments/new", permission: "shipments", level: "manage", priority: 1 },
  { id: "shipments", href: "/operations/shipments", permission: "shipments", level: "view", priority: 2 },
  { id: "customers", href: "/operations/customers", permission: "customers", level: "view", priority: 3 },
  { id: "offices", href: "/operations/offices", permission: "office_settings", level: "view", priority: 4 },
  { id: "employees", href: "/operations/settings?panel=employees", permission: "employees", level: "view", priority: 5 },
  { id: "tracking", href: "/operations/tracking", permission: "tracking", level: "view", priority: 6 },
  { id: "warehouse-arrivals", href: "/operations/warehouse?panel=arrivals", permission: "arrival", level: "manage", priority: 1 },
  { id: "warehouse-storage", href: "/operations/warehouse?panel=storage", permission: "storage", level: "view", priority: 2 },
  { id: "warehouse-rack", href: "/operations/warehouse?panel=rack", permission: "storage", level: "manage", priority: 3 },
  { id: "warehouse-delivery", href: "/operations/warehouse?panel=delivery", permission: "storage", level: "manage", priority: 4 },
  { id: "invoices", href: "/operations/billing", permission: "invoices", level: "view", priority: 1 },
  { id: "receipts", href: "/operations/billing?panel=receipts", permission: "payments", level: "view", priority: 2 },
  { id: "cash", href: "/operations/finance?panel=cash", permission: "payments", level: "manage", priority: 3 },
  { id: "shipment-cost", href: "/operations/finance?panel=shipment-cost", permission: "shipment_cost", level: "view", priority: 1 },
  { id: "arrival-cost", href: "/operations/finance?panel=arrival-cost", permission: "arrival_cost", level: "view", priority: 2 },
  { id: "pricing", href: "/operations/finance?panel=price", permission: "shipment_prices", level: "manage", priority: 3 },
  { id: "reports", href: "/operations/reports", permission: "reports", level: "view", priority: 7 },
  { id: "excel", href: "/operations/advanced?tab=accounts", permission: "excel", level: "view", priority: 8 },
  { id: "advanced", href: "/operations/advanced", permission: "audit", level: "view", priority: 9 },
  { id: "settings", href: "/operations/settings", permission: "office_settings", level: "manage", priority: 10 },
  { id: "audit", href: "/operations/reports?panel=audit", permission: "audit", level: "view", priority: 11 },
];

export function roleWorkspaceTasks(subject: RoleWorkspaceSubject): RoleWorkspaceTask[] {
  return taskCatalog
    .filter(task => permissionAllowed(subject, task.permission, task.level))
    .sort((a, b) => a.priority - b.priority);
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
  if (isAdmin) return officeNames[language].nouakchott === "نواكشوط" && language === "ar" ? "كل المكاتب" : language === "en" ? "All offices" : language === "zh" ? "所有办公室" : "Tüm ofisler";
  if (!offices?.length) return language === "ar" ? "بانتظار تعيين المكتب" : language === "en" ? "Waiting for office assignment" : language === "zh" ? "等待分配办公室" : "Ofis ataması bekleniyor";
  return offices.map(office => officeNames[language][office]).join(language === "ar" ? "، " : ", ");
}

export function taskUsesFinance(task: RoleWorkspaceTask) {
  return ["invoices", "receipts", "cash", "shipment-cost", "arrival-cost", "pricing"].includes(task.id);
}

export { taskCatalog };
