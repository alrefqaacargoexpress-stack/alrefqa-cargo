import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { entityLifecycle, users, memberRoles } from "../drizzle/schema";
import { getDb } from "./db";
import { router, protectedProcedure } from "./_core/trpc";
import { readOfficeScope, rootAdmin } from "./branches";
import { permissionAllowed } from "../shared/permissions";
import { appendAudit } from "./audit";
import { insertLifecycle } from "./lifecycle";

const disableInput = z
  .object({
    userId: z.number().int().positive(),
    expectedVersion: z.number().int().nonnegative(),
    confirmation: z.string().trim(),
    reason: z.string().trim().min(2).max(500),
    requestKey: z.string().trim().min(1).max(100),
  })
  .strict();
export const lifecycleAdminRouter = router({
  disableEmployee: protectedProcedure
    .input(disableInput)
    .mutation(async ({ ctx, input }) => {
      if (input.confirmation !== String(input.userId))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "confirmation_mismatch",
        });
      if (input.userId === ctx.user.id)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "cannot_disable_self",
        });
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "database_unavailable",
        });
      return db.transaction(async tx => {
        await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, ctx.user.id))
          .limit(1)
          .for("update");
        const scope = await readOfficeScope(tx, ctx.user);
        if (!permissionAllowed(scope, "employee_disable", "manage"))
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "permission_denied",
          });
        const [target] = await tx
          .select()
          .from(users)
          .where(eq(users.id, input.userId))
          .limit(1)
          .for("update");
        if (!target || target.accountType !== "employee")
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "employee_not_found",
          });
        if (rootAdmin(target))
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "cannot_disable_general_manager",
          });
        const [membership] = await tx
          .select()
          .from(memberRoles)
          .where(eq(memberRoles.userId, input.userId))
          .limit(1)
          .for("update");
        if (
          scope.role !== "admin" &&
          (scope.role !== "office_manager" ||
            membership?.role === "office_manager" ||
            membership?.role === "admin" ||
            !Array.isArray(membership?.offices) ||
            membership.offices.length !== 1 ||
            !scope.offices?.includes(membership.offices[0]))
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "employee_office_forbidden",
          });
        const hash = createHash("sha256")
          .update(JSON.stringify(input))
          .digest("hex");
        const [prior] = await tx
          .select()
          .from(entityLifecycle)
          .where(
            and(
              eq(entityLifecycle.entity, "employee"),
              eq(entityLifecycle.recordId, String(input.userId))
            )
          )
          .limit(1);
        if (prior) {
          if (
            prior.actorId === ctx.user.id &&
            prior.requestKey === input.requestKey &&
            (prior.snapshot as { payloadHash?: string })?.payloadHash === hash
          )
            return { userId: input.userId, disabled: true as const };
          throw new TRPCError({
            code: "CONFLICT",
            message: "record_permanently_retired",
          });
        }
        const version = membership?.version ?? 0;
        if (version !== input.expectedVersion)
          throw new TRPCError({
            code: "CONFLICT",
            message: "membership_version_conflict",
          });
        const safeBefore = {
          userId: target.id,
          name: target.name,
          role: membership?.role ?? null,
          offices: membership?.offices ?? null,
        };
        await insertLifecycle(tx, {
          entity: "employee",
          recordId: String(input.userId),
          action: "disable",
          officeId: membership?.homeOffice ?? null,
          reason: input.reason,
          expectedVersion: version,
          actorId: ctx.user.id,
          requestKey: input.requestKey,
          snapshot: { payloadHash: hash, before: safeBefore },
        });
        await appendAudit(tx, {
          actor: {
            id: ctx.user.id,
            name: ctx.user.name?.trim() || `user-${ctx.user.id}`,
            role: scope.role!,
          },
          entity: "employee",
          recordId: String(input.userId),
          action: "disable",
          before: safeBefore,
          after: { disabled: true, reason: input.reason },
          beforeVersion: version,
          afterVersion: version,
          requestKey:
            "employee-disable:" +
            createHash("sha256").update(input.requestKey).digest("hex"),
        });
        return { userId: input.userId, disabled: true as const };
      });
    }),
  archive: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "database_unavailable",
      });
    const scope = await readOfficeScope(db, ctx.user);
    if (scope.role !== "admin")
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "general_manager_only",
      });
    const rows = await db.select().from(entityLifecycle);
    return rows.map(({ snapshot, ...row }) => row);
  }),
});
