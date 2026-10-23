import type { Entity, EntityRecord, AppRole } from "@shared/operations";
import type { OfficeScope } from "./branches";
import {
  officeIds,
  ownerOffice,
  recordBelongsToOffice,
} from "@shared/branches";
import {
  permissionAllowed,
  permissionActionRole,
  type PermissionKey,
} from "@shared/permissions";
import { hideForOfficeScope } from "./branches";
export function entityPermission(entity: Entity): PermissionKey {
  return entity === "shipment"
    ? "shipments"
    : entity === "account"
      ? "customers"
      : "invoices";
}
export function withinRecordOffice(
  scope: OfficeScope,
  entity: Entity,
  record: EntityRecord,
  writing = false
) {
  if (scope.role === "admin") return true;
  if (!scope.role || !scope.offices?.length) return false;
  if (writing) {
    const owner = ownerOffice(entity, record);
    return Boolean(owner && scope.offices.includes(owner));
  }
  if (
    scope.role === "office_manager" &&
    !scope.offices.includes("nouakchott")
  ) {
    const owner = ownerOffice(entity, record);
    return Boolean(owner && scope.offices.includes(owner));
  }
  return scope.offices.some(office =>
    recordBelongsToOffice(entity, record, office)
  );
}
export function canReadPermissionRecord(
  scope: OfficeScope,
  entity: Entity,
  record: EntityRecord,
  key = entityPermission(entity)
) {
  return (
    permissionAllowed(scope, key, "view") &&
    withinRecordOffice(scope, entity, record)
  );
}
export function sanitizePermissionRecord<T extends EntityRecord>(
  scope: OfficeScope,
  entity: Entity,
  record: T
): T {
  const key =
    entity === "shipment" ? "shipment_prices" : entityPermission(entity);
  const financialRole: AppRole = permissionAllowed(scope, key, "view")
    ? scope.role === "admin"
      ? "admin"
      : "accountant"
    : "staff";
  return hideForOfficeScope(record, financialRole, scope.offices);
}
export function permissionCurrent(row: any, scope: OfficeScope) {
  return sanitizePermissionRecord(scope, row.entity, {
    ...row.data,
    scope: "shared",
    version: row.version,
  });
}
export function changePermission(
  scope: OfficeScope,
  change: any,
  current: EntityRecord | null
): { key: PermissionKey; role: AppRole | null } {
  let key = entityPermission(change.entity);
  if (change.entity === "shipment" && change.action) key = "shipment_delete";
  if (!permissionAllowed(scope, key, "manage")) return { key, role: null };
  const next = change.data;
  if (
    change.entity === "shipment" &&
    next?.status === "في الطريق" &&
    (!current || ("status" in current && next.status !== current.status)) &&
    !permissionAllowed(scope, "shipment_send", "manage")
  )
    return { key: "shipment_send", role: null };
  return { key, role: permissionActionRole(scope, key, "manage") };
}

export function canReadTrackingPermissionRecord(
  scope: OfficeScope,
  entity: Entity,
  record: EntityRecord
) {
  return canReadPermissionRecord(scope, entity, record, "tracking");
}
