import type { AppRole } from "@shared/operations";
import type { OfficeId } from "@shared/branches";

export type CachedAccessProfile = {
  userId: string;
  role: AppRole;
  offices?: readonly OfficeId[] | null;
};

/** A cached role is descriptive only; it is never an authentication proof. */
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

export function canOpenLocalWorkspace(
  profile: CachedAccessProfile | null | undefined,
  authenticatedUserId: string | null | undefined,
  online: boolean
) {
  return !online && profileMatchesUser(profile, authenticatedUserId);
}

export function isNouakchottStaff(
  role: AppRole | null,
  offices: OfficeId[] | null
) {
  return (
    role === "staff" && offices?.length === 1 && offices[0] === "nouakchott"
  );
}

export function sourceOffices(offices: OfficeId[] | null) {
  return (offices ?? ["dubai", "turkey", "china"]).filter(
    office => office !== "nouakchott"
  );
}

export function canEditCustomerAccount(
  role: AppRole | null,
  offices: OfficeId[] | null
) {
  // Customer account writes belong to an accountant assigned to exactly one office.
  return role === "accountant" && offices !== null && offices.length === 1;
}

export function canCreateSourceShipment(
  role: AppRole | null,
  offices: OfficeId[] | null
) {
  if (isNouakchottStaff(role, offices)) return false;
  return role === "admin" || role === "office_manager" || role === "staff";
}

export function canStaffSendShipment(
  role: AppRole | null,
  fromStatus: string | undefined,
  toStatus: string | undefined
) {
  return (
    role !== "staff" ||
    (fromStatus === "قيد التجهيز" && toStatus === "في الطريق")
  );
}

export function canShowTrackingLink(canUpdateTracking: boolean) {
  return canUpdateTracking === true;
}
