import {
  permissionActionRole,
  permissionAllowed,
  permissionRank,
  permissionsFor,
  type PermissionKey,
  type PermissionLevel,
  type PermissionMap,
  type PermissionSubject,
} from "@shared/permissions";
import type { AppRole } from "@shared/operations";
import type { OfficeId } from "@shared/branches";

export type CachedAccessProfile = {
  userId: string;
  /** The real role remains descriptive and is never replaced by a custom role. */
  role: AppRole | null;
  offices?: OfficeId[] | null;
  homeOffice?: OfficeId | null;
  permissions?: PermissionMap | null;
  delegatedBy?: number | null;
  /** Server supplied value; a changed fingerprint invalidates cached privilege. */
  permissionFingerprint?: string | null;
};

export type ClientAccessSubject = PermissionSubject & {
  role: AppRole | null;
  offices?: OfficeId[] | null;
  homeOffice?: OfficeId | null;
  permissions?: PermissionMap | null;
};

export function asPermissionSubject(
  roleOrSubject: AppRole | null | ClientAccessSubject,
  offices?: OfficeId[] | null,
  permissions?: PermissionMap | null,
  homeOffice?: OfficeId | null,
  canUpdateTracking?: boolean
): ClientAccessSubject {
  if (typeof roleOrSubject === "object" && roleOrSubject !== null)
    return roleOrSubject;
  return {
    role: roleOrSubject,
    offices,
    permissions,
    homeOffice,
    canUpdateTracking,
  };
}

/** Stable, non-secret cache key for the effective permission state. */
export function permissionFingerprint(
  permissions: PermissionMap | null | undefined,
  delegatedBy?: number | null
) {
  const effective = permissionsFor({ role: null, permissions });
  return `${Object.entries(effective)
    .map(([key, level]) => `${key}:${level}`)
    .join("|")}::${delegatedBy ?? ""}`;
}

export function profileMatchesUser(
  profile: CachedAccessProfile | null | undefined,
  authenticatedUserId: string | null | undefined
) {
  return Boolean(
    profile &&
      authenticatedUserId &&
      String(profile.userId) === String(authenticatedUserId)
  );
}

export function cachedProfileUsable(
  profile: CachedAccessProfile | null | undefined,
  authenticatedUserId: string | null | undefined,
  expectedFingerprint?: string | null
) {
  return (
    profileMatchesUser(profile, authenticatedUserId) &&
    (!expectedFingerprint ||
      !profile?.permissionFingerprint ||
      profile.permissionFingerprint === expectedFingerprint)
  );
}

export function canOpenLocalWorkspace(
  profile: CachedAccessProfile | null | undefined,
  authenticatedUserId: string | null | undefined,
  online: boolean,
  expectedFingerprint?: string | null
) {
  return (
    !online &&
    cachedProfileUsable(profile, authenticatedUserId, expectedFingerprint)
  );
}

export function subjectPermission(
  roleOrSubject: AppRole | null | ClientAccessSubject,
  key: PermissionKey,
  level: PermissionLevel = "view",
  offices?: OfficeId[] | null,
  permissions?: PermissionMap | null
) {
  return permissionAllowed(
    asPermissionSubject(roleOrSubject, offices, permissions),
    key,
    level
  );
}

export function isNouakchottStaff(
  roleOrSubject: AppRole | null | ClientAccessSubject,
  offices?: OfficeId[] | null,
  permissions?: PermissionMap | null
) {
  const subject = asPermissionSubject(roleOrSubject, offices, permissions);
  return (
    subject.role === "staff" &&
    subject.offices?.length === 1 &&
    subject.offices[0] === "nouakchott"
  );
}

export function canEditCustomerAccount(
  roleOrSubject: AppRole | null | ClientAccessSubject,
  offices?: OfficeId[] | null,
  permissions?: PermissionMap | null
) {
  const subject = asPermissionSubject(roleOrSubject, offices, permissions);
  // Explicit customers.manage grants may be assigned to a non-accountant. The
  // one-office rule is retained for employee compatibility, while the local
  // compatibility role is only used by strict business helpers.
  return Boolean(
    subject.offices?.length === 1 &&
      permissionAllowed(subject, "customers", "manage") &&
      permissionActionRole(subject, "customers", "manage")
  );
}

export function canCreateSourceShipment(
  roleOrSubject: AppRole | null | ClientAccessSubject,
  offices?: OfficeId[] | null,
  permissions?: PermissionMap | null
) {
  const subject = asPermissionSubject(roleOrSubject, offices, permissions);
  if (isNouakchottStaff(subject)) return false;
  return permissionAllowed(subject, "shipments", "manage");
}

export function canEditShipments(
  roleOrSubject: AppRole | null | ClientAccessSubject,
  offices?: OfficeId[] | null,
  permissions?: PermissionMap | null
) {
  const subject = asPermissionSubject(roleOrSubject, offices, permissions);
  return permissionAllowed(subject, "shipments", "manage");
}

export function canSendShipments(
  roleOrSubject: AppRole | null | ClientAccessSubject,
  offices?: OfficeId[] | null,
  permissions?: PermissionMap | null
) {
  const subject = asPermissionSubject(roleOrSubject, offices, permissions);
  return permissionAllowed(subject, "shipment_send", "manage");
}

export function canDeleteShipments(
  roleOrSubject: AppRole | null | ClientAccessSubject,
  offices?: OfficeId[] | null,
  permissions?: PermissionMap | null
) {
  const subject = asPermissionSubject(roleOrSubject, offices, permissions);
  return permissionAllowed(subject, "shipment_delete", "manage");
}

export function canViewShipments(
  roleOrSubject: AppRole | null | ClientAccessSubject,
  offices?: OfficeId[] | null,
  permissions?: PermissionMap | null
) {
  const subject = asPermissionSubject(roleOrSubject, offices, permissions);
  return permissionAllowed(subject, "shipments", "view");
}

export function canStaffSendShipment(
  roleOrSubject: AppRole | null | ClientAccessSubject,
  fromStatus: string | undefined,
  toStatus: string | undefined,
  offices?: OfficeId[] | null,
  permissions?: PermissionMap | null
) {
  const subject = asPermissionSubject(roleOrSubject, offices, permissions);
  const needsSend = toStatus === "في الطريق";
  if (
    needsSend &&
    subject.permissions &&
    !permissionAllowed(subject, "shipment_send", "manage")
  )
    return false;
  if (subject.role !== "staff") return true;
  // A warehouse employee may open and fill a shipment in preparation, and
  // send it once. Other stage changes remain tracking commands.
  if (fromStatus === undefined) return toStatus === "قيد التجهيز";
  if (fromStatus === toStatus) return fromStatus === "قيد التجهيز";
  return fromStatus === "قيد التجهيز" && toStatus === "في الطريق";
}

export function canShowTrackingLink(canUpdateTracking: boolean) {
  return canUpdateTracking === true;
}

export function compatibilityRoleForAction(
  roleOrSubject: AppRole | null | ClientAccessSubject,
  key: PermissionKey,
  level: PermissionLevel = "view",
  offices?: OfficeId[] | null,
  permissions?: PermissionMap | null
) {
  return permissionActionRole(
    asPermissionSubject(roleOrSubject, offices, permissions),
    key,
    level
  );
}

export function permissionLevel(
  roleOrSubject: AppRole | null | ClientAccessSubject,
  key: PermissionKey,
  offices?: OfficeId[] | null,
  permissions?: PermissionMap | null
) {
  return permissionsFor(
    asPermissionSubject(roleOrSubject, offices, permissions)
  )[key];
}

export { permissionRank };
