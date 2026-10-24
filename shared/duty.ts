import { z } from "zod";
import { officeIdSchema, officeIds, type OfficeId } from "./branches";
import { APP_ROLES, type AppRole } from "./operations";

export const dutyRoleSchema = z.enum(APP_ROLES);
export const dutyStatusSchema = z.enum(["on", "off"]);

/**
 * The command is an immutable selection. `id` is the client command id;
 * `requestKey` is the server idempotency key and is never reused for another
 * payload by the same employee.
 */
export const dutyCommandSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    requestKey: z.string().trim().min(1).max(128),
    officeId: officeIdSchema,
    role: dutyRoleSchema.optional(),
    reason: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

export type DutyCommand = z.infer<typeof dutyCommandSchema>;

export type DutyEventSnapshot = {
  id: number;
  userId: number;
  actorId: number;
  role: AppRole;
  officeId: OfficeId;
  status: "on" | "off";
  reason: string;
  membershipVersion: number;
  expiresAt: Date | null;
  requestKey: string;
  createdAt: Date;
};

export type DutyCurrentScope = {
  accountType: "employee" | "customer";
  role: AppRole | null;
  offices: readonly OfficeId[] | null;
  membershipVersion: number;
  disabled?: boolean;
};

export type DutyAvailability = {
  id: number;
  name: string;
  role: AppRole;
  office: OfficeId | null;
  status: "on" | "off";
  activatedAt: Date | null;
  expiresAt: Date | null;
};

export function isDutyEventCurrent(
  event: Pick<
    DutyEventSnapshot,
    "status" | "role" | "officeId" | "membershipVersion" | "expiresAt"
  >,
  scope: DutyCurrentScope,
  now = new Date()
): boolean {
  if (scope.accountType !== "employee" || scope.disabled) return false;
  if (!scope.role || event.status !== "on") return false;
  if (event.role !== scope.role) return false;
  if (event.membershipVersion !== scope.membershipVersion) return false;
  if (scope.role !== "admin" && !scope.offices?.includes(event.officeId))
    return false;
  return event.expiresAt === null || event.expiresAt.getTime() > now.getTime();
}

/**
 * Projects an employee's latest event into the safe institution-only view.
 * An expired, stale, or off event is deliberately represented as `off`; this
 * is availability, not proof of attendance, GPS presence, or a heartbeat.
 */
export function projectDutyAvailability(
  employee: Pick<DutyAvailability, "id" | "name">,
  latest: DutyEventSnapshot | null,
  scope: DutyCurrentScope,
  now = new Date()
): DutyAvailability | null {
  if (scope.accountType !== "employee" || !scope.role || scope.disabled)
    return null;

  const office =
    latest &&
    (scope.role === "admin" || scope.offices?.includes(latest.officeId))
      ? latest.officeId
      : (scope.offices?.[0] ?? null);
  const live = latest ? isDutyEventCurrent(latest, scope, now) : false;

  return {
    id: employee.id,
    name: employee.name,
    role: scope.role,
    office,
    status: live ? "on" : "off",
    activatedAt: live && latest ? latest.createdAt : null,
    expiresAt: live && latest ? latest.expiresAt : null,
  };
}

export function isOfficeId(value: string): value is OfficeId {
  return (officeIds as readonly string[]).includes(value);
}

/** Stable enough for a command hash: object keys are sorted recursively. */
export function canonicalDutyCommand(
  action: "activate" | "deactivate" | "logout",
  command: Pick<
    DutyCommand,
    "id" | "requestKey" | "officeId" | "role" | "reason"
  >,
  userId?: number
): string {
  const value = {
    action,
    userId,
    id: command.id,
    requestKey: command.requestKey,
    officeId: command.officeId,
    role: command.role ?? null,
    reason: command.reason ?? null,
  };
  return JSON.stringify(value);
}
