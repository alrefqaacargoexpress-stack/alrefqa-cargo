import { z } from "zod";
import type { AppRole } from "./operations";
import type { OfficeId } from "./branches";

export const permissionKeys = [
  "shipments",
  "shipment_send",
  "shipment_delete",
  "tracking",
  "market_warehouse",
  "arrival",
  "storage",
  "customers",
  "invoices",
  "payments",
  "expenses",
  "shipment_cost",
  "arrival_cost",
  "opening_balance",
  "shipment_prices",
  "reports",
  "finance_reports",
  "excel",
  "office_settings",
  "office_wallets",
  "employees",
  "audit",
  "office_assign",
  "invoice_void",
  "entry_void",
  "employee_disable",
] as const;
export type PermissionKey = (typeof permissionKeys)[number];
export const permissionLevels = ["none", "view", "manage"] as const;
export type PermissionLevel = (typeof permissionLevels)[number];
export type PermissionMap = Record<PermissionKey, PermissionLevel>;
export const permissionMapSchema = z.partialRecord(
  z.enum(permissionKeys),
  z.enum(permissionLevels)
);
export type PermissionSubject = {
  role: AppRole | null;
  offices?: readonly OfficeId[] | null;
  homeOffice?: OfficeId | null;
  canUpdateTracking?: boolean;
  permissions?: PermissionMap | null;
  /** The delegating role is metadata for callers; it never elevates a subject. */
  delegatedBy?: number | null;
  permissionsCustomized?: boolean;
};
export const rootOnlyPermissions: readonly PermissionKey[] = ["office_assign"];
export const financialPermissionKeys: readonly PermissionKey[] = [
  "customers",
  "invoices",
  "payments",
  "expenses",
  "shipment_cost",
  "arrival_cost",
  "opening_balance",
  "shipment_prices",
  "finance_reports",
  "office_wallets",
  "invoice_void",
  "entry_void",
];
export function blankPermissions(
  level: PermissionLevel = "none"
): PermissionMap {
  return Object.fromEntries(
    permissionKeys.map(key => [key, level])
  ) as PermissionMap;
}
export function defaultPermissions(subject: PermissionSubject): PermissionMap {
  if (subject.role === "admin") return blankPermissions("manage");
  const result = blankPermissions();
  if (!subject.role) return result;
  const put = (keys: readonly PermissionKey[], value: PermissionLevel) =>
    keys.forEach(key => (result[key] = value));
  put(["shipments", "tracking"], "view");
  if (subject.role === "office_manager") {
    put(
      [
        "shipments",
        "shipment_send",
        "shipment_delete",
        "tracking",
        "market_warehouse",
        "office_settings",
        "employees",
      ],
      "manage"
    );
    put(
      [
        "customers",
        "invoices",
        "payments",
        "expenses",
        "opening_balance",
        "shipment_prices",
        "finance_reports",
        "reports",
        "excel",
      ],
      "view"
    );
    result.customers = "manage";
    result.office_wallets = "view";
    if (subject.offices?.includes("nouakchott"))
      put(["storage", "arrival"], "manage");
  } else if (subject.role === "staff" || subject.role === "source_warehouse") {
    if (subject.offices?.length === 1 && subject.offices[0] === "nouakchott")
      put(["storage", "arrival", "market_warehouse"], "manage");
    else if (subject.offices?.length === 1) {
      put(["shipments", "shipment_send", "market_warehouse"], "manage");
      if (subject.role === "source_warehouse" || subject.canUpdateTracking)
        put(["tracking"], "manage");
    }
  } else if (
    subject.role === "general_accountant" &&
    !subject.offices?.includes("nouakchott")
  ) {
    // Source general accountants approve source costs, not sales, payments,
    // opening balances, customer edits or general expense execution.
    put(
      [
        "customers",
        "invoices",
        "payments",
        "expenses",
        "opening_balance",
        "shipment_prices",
        "finance_reports",
        "reports",
        "excel",
        "office_wallets",
      ],
      "view"
    );
    put(["shipment_cost"], "manage");
  } else if (
    subject.role === "accountant" ||
    subject.role === "general_accountant"
  ) {
    put(
      [
        "customers",
        "invoices",
        "payments",
        "expenses",
        "opening_balance",
        "shipment_prices",
        "excel",
      ],
      "manage"
    );
    put(["reports", "finance_reports"], "view");
    put(["office_wallets"], "manage");
    if (subject.offices?.includes("nouakchott"))
      put(["arrival_cost"], "manage");
  } else if (subject.role === "cashier") {
    put(["customers", "invoices", "payments", "expenses"], "manage");
    put(["reports"], "view");
  } else if (subject.role === "destination_warehouse") {
    if (subject.offices?.includes("nouakchott"))
      put(["storage", "arrival", "market_warehouse"], "manage");
  } else if (subject.role === "supervisor") {
    put(["tracking", "market_warehouse"], "manage");
    put(["reports", "audit", "storage", "excel"], "view");
    if (subject.offices?.includes("nouakchott")) put(["arrival"], "manage");
  } else if (subject.role === "tracking_staff")
    put(["tracking", "market_warehouse"], "manage");
  if (["viewer", "tracking_staff"].includes(subject.role))
    result.shipments = "none";
  return result;
}
export function permissionRank(value: PermissionLevel) {
  return permissionLevels.indexOf(value);
}
export function permissionsFor(subject: PermissionSubject): PermissionMap {
  if (subject.role === "admin") return blankPermissions("manage");
  if (!subject.permissions) return defaultPermissions(subject);
  const parsed = permissionMapSchema.safeParse(subject.permissions);
  const result: PermissionMap = parsed.success
    ? { ...blankPermissions(), ...parsed.data }
    : blankPermissions();
  rootOnlyPermissions.forEach(key => (result[key] = "none"));
  return result;
}
export function intersectPermissions(
  requested: PermissionMap,
  ceiling: PermissionMap
): PermissionMap {
  return Object.fromEntries(
    permissionKeys.map(key => [
      key,
      permissionLevels[
        Math.min(permissionRank(requested[key]), permissionRank(ceiling[key]))
      ],
    ])
  ) as PermissionMap;
}
export function withinPermissionCeiling(
  requested: PermissionMap,
  ceiling: PermissionMap
) {
  return permissionKeys.every(
    key => permissionRank(requested[key]) <= permissionRank(ceiling[key])
  );
}
export function permissionAllowed(
  subject: PermissionSubject,
  key: PermissionKey,
  level: PermissionLevel = "view"
): boolean {
  if (subject.role === "admin") return true;
  if (!subject.role || !subject.offices?.length) return false;
  if (
    ["arrival", "storage"].includes(key) &&
    level === "manage" &&
    !subject.offices.includes("nouakchott")
  )
    return false;
  if (
    ["shipments", "shipment_send", "shipment_delete"].includes(key) &&
    level === "manage" &&
    subject.offices.every(id => id === "nouakchott")
  )
    return false;
  return permissionRank(permissionsFor(subject)[key]) >= permissionRank(level);
}
export function canReadAnyFinance(subject: PermissionSubject) {
  return financialPermissionKeys.some(key =>
    permissionAllowed(subject, key, "view")
  );
}
/** Compatibility role for an action; never use this role for auditing or assigning users. */
/**
 * Returns the compatibility role used by command validators after a capability
 * check. This role is authorization metadata only; audit actors retain their
 * real role. Explicit grants are intentionally scoped to the requested key.
 */
export function actionRole(
  subject: PermissionSubject,
  key: PermissionKey,
  level: PermissionLevel = "view"
): AppRole | null {
  if (!permissionAllowed(subject, key, level)) return null;
  if (subject.role === "admin") return "admin";
  if (!subject.permissions || subject.permissionsCustomized === false)
    return subject.role;
  if (financialPermissionKeys.includes(key))
    return subject.role === "cashier" ? "cashier" : "accountant";
  if (["tracking", "arrival"].includes(key))
    return subject.role === "source_warehouse"
      ? "source_warehouse"
      : level === "manage"
        ? "supervisor"
        : "tracking_staff";
  if (key === "storage")
    return subject.role === "destination_warehouse"
      ? "destination_warehouse"
      : "staff";
  if (
    key === "shipments" ||
    key === "shipment_send" ||
    key === "shipment_delete"
  )
    return subject.role === "source_warehouse"
      ? "source_warehouse"
      : "office_manager";
  return subject.role;
}

/** Backwards-compatible name used by the existing routers and tests. */
export const permissionActionRole = actionRole;
