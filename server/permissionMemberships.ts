import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { z } from "zod";
import { officeMembershipSchema } from "@shared/branches";
import {
  blankPermissions,
  defaultPermissions,
  permissionAllowed,
  permissionsFor,
  withinPermissionCeiling,
  rootOnlyPermissions,
} from "@shared/permissions";
import { memberRoles, users, type User } from "../drizzle/schema";
import { appendAudit } from "./audit";
import { readOfficeScope, rootAdmin, listMembers } from "./branches";

function forbidden(message: string): never {
  throw new TRPCError({ code: "FORBIDDEN", message });
}
export async function visiblePermissionMembers(db: any, user: User) {
  const scope = await readOfficeScope(db, user);
  if (!permissionAllowed(scope, "employees", "view"))
    forbidden("employee_permission_required");
  const members = await listMembers(db);
  const visible =
    scope.role === "admin"
      ? members
      : members.filter(
          member =>
            member.role !== "admin" &&
            member.offices?.length === 1 &&
            scope.offices?.includes(member.offices[0])
        );
  return Promise.all(
    visible.map(async member => {
      if (member.role === "admin")
        return { ...member, effectivePermissions: blankPermissions("manage") };
      const actual = (
        await db
          .select()
          .from(users)
          .where(eq(users.id, member.userId))
          .limit(1)
      )[0];
      const effective = actual ? await readOfficeScope(db, actual) : null;
      return {
        ...member,
        effectivePermissions: effective?.permissions ?? blankPermissions(),
        permissionsCustomized: effective?.permissionsCustomized ?? false,
      };
    })
  );
}
export async function assignPermissionMembership(
  db: any,
  user: User,
  input: z.infer<typeof officeMembershipSchema>
) {
  return db.transaction(async (tx: any) => {
    const scope = await readOfficeScope(tx, user);
    if (
      !permissionAllowed(scope, "employees", "manage") ||
      !["admin", "office_manager"].includes(scope.role ?? "")
    )
      forbidden("employee_management_required");
    const target = (
      await tx
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1)
        .for("update")
    )[0];
    if (!target)
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    if (rootAdmin(target)) forbidden("root_admin_protected");
    if (target.accountType !== "employee")
      forbidden("employee_account_required");
    if (!input.offices.length)
      throw new TRPCError({ code: "BAD_REQUEST", message: "office_required" });
    const old = (
      await tx
        .select()
        .from(memberRoles)
        .where(eq(memberRoles.userId, input.userId))
        .limit(1)
        .for("update")
    )[0];
    if ((old?.version ?? 0) !== input.expectedVersion)
      throw new TRPCError({
        code: "CONFLICT",
        message: "member_version_conflict",
      });
    if (scope.role === "office_manager") {
      if (
        input.userId === user.id ||
        input.role === "office_manager" ||
        old?.role === "office_manager"
      )
        forbidden("manager_target_protected");
      if (
        scope.offices?.length !== 1 ||
        input.offices.length !== 1 ||
        input.offices[0] !== scope.offices[0] ||
        !Array.isArray(old?.offices) ||
        old.offices.length !== 1 ||
        old.offices[0] !== scope.offices[0]
      )
        forbidden("employee_outside_office");
    }
    const homeOffice = ["office_manager", "staff", "accountant"].includes(
      input.role
    )
      ? input.offices[0]
      : (input.homeOffice ?? input.offices[0]);
    if (!input.offices.includes(homeOffice))
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "home_office_outside_scope",
      });
    const canUpdateTracking = Boolean(
      input.role === "staff" &&
        input.offices.length === 1 &&
        input.offices[0] !== "nouakchott" &&
        (input.canUpdateTracking ?? old?.canUpdateTracking)
    );
    const requested =
      input.permissions ??
      (old?.role === input.role ? old?.permissions : null) ??
      defaultPermissions({
        role: input.role,
        offices: input.offices,
        homeOffice,
        canUpdateTracking,
      });
    if (rootOnlyPermissions.some(key => requested[key] !== "none"))
      forbidden("global_permission_not_delegable");
    if (
      scope.role === "office_manager" &&
      !withinPermissionCeiling(requested, permissionsFor(scope))
    )
      forbidden("permission_exceeds_manager_ceiling");
    const delegatedBy = scope.role === "office_manager" ? user.id : null;
    const version = (old?.version ?? 0) + 1;
    const values = {
      role: input.role,
      offices: input.offices,
      homeOffice,
      canUpdateTracking,
      permissions: requested,
      delegatedBy,
      version,
    };
    if (old)
      await tx
        .update(memberRoles)
        .set(values)
        .where(eq(memberRoles.userId, input.userId));
    else
      await tx.insert(memberRoles).values({ userId: input.userId, ...values });
    await appendAudit(tx, {
      actor: {
        id: user.id,
        name: user.name ?? user.email ?? String(user.id),
        role: scope.role!,
      },
      entity: "member_membership",
      recordId: String(input.userId),
      action: "membership_assign",
      before: old
        ? {
            role: old.role,
            offices: old.offices,
            homeOffice: old.homeOffice,
            permissions: old.permissions,
            delegatedBy: old.delegatedBy,
            version: old.version,
          }
        : null,
      after: values,
      beforeVersion: old?.version ?? 0,
      afterVersion: version,
      requestKey: `member:${input.userId}:${version}`,
    });
    return {
      userId: input.userId,
      name: target.name ?? "",
      email: target.email ?? "",
      accountType: target.accountType,
      ...values,
      effectivePermissions: permissionsFor({
        role: input.role,
        offices: input.offices,
        permissions: requested,
      }),
      permissionsCustomized: true,
    };
  });
}
