import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { z } from "zod";
import { officeMembershipSchema } from "@shared/branches";
import {
  blankPermissions,
  defaultPermissions,
  permissionMapSchema,
  permissionAllowed,
  permissionsFor,
  withinPermissionCeiling,
  rootOnlyPermissions,
} from "@shared/permissions";
import {
  memberRoles,
  permissionDelegations,
  users,
  type User,
} from "../drizzle/schema";
import { appendAudit } from "./audit";
import { readOfficeScope, rootAdmin, listMembers } from "./branches";
import { isEmployeeDisabled } from "./lifecycle";

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
  // Routers parse this schema too, but this service is also called directly by
  // sync/import code and tests. Keep the mutation boundary authoritative.
  input = officeMembershipSchema.parse(input);
  return db.transaction(async (tx: any) => {
    if (await isEmployeeDisabled(tx, user.id)) forbidden("employee_disabled");
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
    if (await isEmployeeDisabled(tx, target.id)) forbidden("employee_disabled");
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
    const homeOffice = [
      "office_manager",
      "staff",
      "accountant",
      "general_accountant",
      "cashier",
      "source_warehouse",
      "destination_warehouse",
    ].includes(input.role)
      ? input.offices[0]
      : (input.homeOffice ?? input.offices[0]);
    if (!input.offices.includes(homeOffice))
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "home_office_outside_scope",
      });
    const canUpdateTracking = Boolean(
      ["staff", "source_warehouse"].includes(input.role) &&
        input.offices.length === 1 &&
        input.offices[0] !== "nouakchott" &&
        (input.canUpdateTracking ?? old?.canUpdateTracking)
    );
    const requestedSource =
      input.permissions ??
      (old?.role === input.role ? old?.permissions : null) ??
      defaultPermissions({
        role: input.role,
        offices: input.offices,
        homeOffice,
        canUpdateTracking,
      });
    const parsedRequested = permissionMapSchema.safeParse(requestedSource);
    if (!parsedRequested.success) forbidden("invalid_permission_map");
    const requested = {
      ...blankPermissions(),
      ...parsedRequested.data,
    };
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
    await tx
      .update(permissionDelegations)
      .set({ status: "revoked", revokedAt: new Date() })
      .where(
        and(
          eq(permissionDelegations.targetUserId, input.userId),
          eq(permissionDelegations.status, "active")
        )
      );
    const delegationRows = Object.entries(requested)
      .filter(([, level]) => level !== "none")
      .map(([permissionKey, level]) => ({
        targetUserId: input.userId,
        officeId: homeOffice,
        permissionKey,
        level,
        delegatedBy: user.id,
        status: "active" as const,
        reason: "membership_assignment",
        version,
      }));
    if (delegationRows.length)
      await tx.insert(permissionDelegations).values(delegationRows);
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
