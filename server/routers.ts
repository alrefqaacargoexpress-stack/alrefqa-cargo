import { dutyRouter, endDutyForLogout } from "./duty";
import { customerTrackingRouter } from "./customerTracking";

import {
  shipmentSettlementRouter,
  assertFrozenShipmentComponents,
} from "./shipmentSettlement";
import { financialVoidsRouter } from "./financialVoids";
import { lifecycleAdminRouter } from "./lifecycleAdmin";
import {
  loadLifecycle,
  recordIsActive,
  isRetired,
  assertActiveEntity,
  isEmployeeDisabled,
  insertLifecycle,
} from "./lifecycle";
import { canReadTrackingPermissionRecord } from "./permissionAccess";
import {
  visiblePermissionMembers,
  assignPermissionMembership,
} from "./permissionMemberships";
import {
  canReadPermissionRecord,
  permissionCurrent,
  sanitizePermissionRecord,
  withinRecordOffice,
  changePermission,
  entityPermission,
} from "./permissionAccess";
import {
  permissionAllowed,
  permissionActionRole,
  permissionsFor,
  type PermissionKey,
} from "@shared/permissions";
import { hideForOfficeScope } from "./branches";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { creationTariff } from "./officeTariffs";
import { ONE_YEAR_MS } from "@shared/const";
import {
  normalizeTracking,
  packingServiceSchema,
  sourceCurrency,
} from "@shared/packing";
import {
  trackingRequestSchema,
  summaryOf,
  canTrackingDetails,
  canSuperviseTracking,
  canNoteTracking,
} from "@shared/tracking";
import type {
  AppRole,
  Entity,
  EntityRecord,
  LocalState,
  Shipment,
  SyncResult,
} from "@shared/operations";
import {
  officeMembershipSchema,
  canWriteOfficeRecord,
  officeIdSchema,
} from "@shared/branches";
import { canViewFinance, canWrite, EMPTY_STATE } from "@shared/operations";
import {
  memberRoles,
  localSessions,
  recordKeys,
  records,
  syncReceipts,
  users,
  shipmentTariffSnapshots,
} from "../drizzle/schema";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { ENV } from "./_core/env";
import {
  publicProcedure,
  protectedProcedure,
  authenticatedProcedure,
  router,
} from "./_core/trpc";
import {
  configureGeneralManagerEmail,
  changeAccountPassword,
  resetAccountPassword,
} from "./accountSecurity";
import {
  initialManagerSetupInfo,
  completeInitialManagerSetup,
  INITIAL_SETUP_CODE_PATTERN,
} from "./initialManagerSetup";
import { getDb } from "./db";
import * as dbQueries from "./db";
import {
  createLocalOpenId,
  createSessionToken,
  hashPassword,
  hashSessionToken,
  LOCAL_SESSION_COOKIE,
  normalizeEmail,
  isDuplicateEmailError,
  publicUser,
  verifyPassword,
} from "./localAuth";
import { parse as parseCookieHeader } from "cookie";
import {
  canManageMembers,
  hideFinance,
  isFinancialPayloadNonZero,
  parseChange,
  prepareRecordForWrite,
  publicRecord,
  roleForUser,
  setRoleInputSchema,
  syncInputSchema,
  assertOfficeRecordWrite,
  canReadScopedRecord,
} from "./operations";
import type { User } from "../drizzle/schema";
import { appendAudit, readAudit } from "./audit";
import {
  actorFromUser,
  assertTrackingOwnerFence,
  applyTrackingCommand,
  parseTrackingRequest,
  trackingReceiptKey,
} from "./tracking";
import {
  canonicalInvoicePayment,
  officeRouter,
  readOfficeSettings,
} from "./office";
import { emptyState } from "./operations";
import {
  assignRecord,
  assignRecordSchema,
  branchForbidden,
  confirmArrival,
  confirmArrivalSchema,
  dashboardData,
  listMembers,
  officeIsAssigned,
  officeProfileUpdateSchema,
  publicProfiles,
  readOfficeScope,
  readProfile,
  updateProfile,
} from "./branches";
import { financeSync, financeSnapshot } from "./finance";
import { financeSyncInputSchema } from "@shared/finance";
import { warehouseCommandSchema } from "@shared/warehouse";
import { readWarehouseSnapshot, commitWarehouseStorage } from "./warehouse";
import { lockEmployee } from "./lockedEmployee";
import {
  lookupPublicTracking,
  publicTrackingLimiter,
  trustedClientAddress,
} from "./publicTracking";
import {
  publicTrackingInputSchema,
  publicTrackingResultSchema,
} from "@shared/publicTracking";

const unavailable = () =>
  new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Database is not available",
  });
async function dbOrThrow() {
  const db = await getDb();
  if (!db) throw unavailable();
  return db;
}
const readOwnerInputSchema = z
  .object({
    clientUserId: z.string().min(1).max(128).optional(),
    cacheScope: z.string().min(1).max(256).optional(),
  })
  .optional();
function assertReadOwner(
  input: { clientUserId?: string; cacheScope?: string } | undefined,
  userId: number
) {
  if (input?.clientUserId && input.clientUserId !== String(userId))
    throw forbidden("Session changed");
}

async function membershipRole(userId: number): Promise<AppRole | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select({ role: memberRoles.role })
    .from(memberRoles)
    .where(eq(memberRoles.userId, userId))
    .limit(1);
  return result[0]?.role ?? null;
}
async function effectiveRole(
  user: Pick<User, "id" | "openId" | "role">
): Promise<AppRole | null> {
  return roleForUser(user, await membershipRole(user.id));
}
function forbidden(message = "Insufficient application role") {
  return new TRPCError({ code: "FORBIDDEN", message });
}
function asEntityRecord(data: unknown): EntityRecord {
  return data as EntityRecord;
}
function hiddenCurrent(
  row: { entity: Entity; recordId: string; version: number; data: unknown },
  role: AppRole | null
): EntityRecord {
  return publicRecord(
    {
      entity: row.entity,
      recordId: row.recordId,
      version: row.version,
      data: asEntityRecord(row.data),
    },
    role
  );
}
function actor(ctxUser: Pick<User, "id" | "name">, role: AppRole) {
  return actorFromUser(ctxUser, role);
}
function trackingError(error: unknown): never {
  const message = error instanceof Error ? error.message : "tracking_failed";
  const code =
    message === "tracking_forbidden"
      ? "FORBIDDEN"
      : message === "tracking_not_found"
        ? "NOT_FOUND"
        : message === "tracking_version_conflict"
          ? "CONFLICT"
          : "BAD_REQUEST";
  throw new TRPCError({ code, message });
}

export const appRouter = router({
  system: systemRouter,
  customerTracking: customerTrackingRouter,
  publicTracking: router({
    lookup: publicProcedure
      .input(publicTrackingInputSchema)
      .output(publicTrackingResultSchema)
      .mutation(async ({ ctx, input }) => {
        ctx.res.setHeader("Cache-Control", "no-store");
        if (
          !publicTrackingLimiter.check(
            trustedClientAddress(ctx.req),
            input.tracking
          )
        )
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "too_many_requests",
          });
        const db = await dbOrThrow();
        return lookupPublicTracking(db, input);
      }),
  }),
  auth: router({
    me: publicProcedure.query(opts =>
      opts.ctx.user ? publicUser(opts.ctx.user) : null
    ),
    login: publicProcedure
      .input(
        z
          .object({
            email: z.string().email().max(320),
            password: z.string().min(8).max(128),
            // Accepted for older clients only, never an authorization decision.
            accountType: z.enum(["customer", "employee"]).optional(),
          })
          .strict()
      )
      .mutation(async ({ ctx, input }) => {
        const email = normalizeEmail(input.email);
        let user = await dbQueries.getUserByEmail(email);
        const isOwner = Boolean(ENV.ownerEmail && email === ENV.ownerEmail);
        const valid = Boolean(
          user?.passwordHash &&
            (await verifyPassword(input.password, user.passwordHash))
        );
        if (!valid || !user)
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "invalid_credentials",
          });

        const database = await dbOrThrow();
        if (await isEmployeeDisabled(database, user.id))
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "invalid_credentials",
          });
        if (isOwner && (user.role !== "admin" || user.accountType !== "employee")) {
          await database
            .update(users)
            .set({ role: "admin", accountType: "employee", updatedAt: new Date() })
            .where(eq(users.id, user.id));
          user = { ...user, role: "admin", accountType: "employee" };
        }
        const token = createSessionToken();
        await dbQueries.createLocalSession({
          tokenHash: hashSessionToken(token),
          userId: user.id,
          expiresAt: new Date(Date.now() + ONE_YEAR_MS),
        });
        await dbQueries.upsertUser({
          openId: user.openId,
          lastSignedIn: new Date(),
        });
        ctx.res.cookie(LOCAL_SESSION_COOKIE, token, {
          ...getSessionCookieOptions(ctx.req),
          maxAge: ONE_YEAR_MS,
        });
        return {
          user: publicUser(user),
          accountType: user.accountType,
          mustChangePassword: Boolean(user.mustChangePassword),
        };
      }),
    signup: publicProcedure
      .input(
        z
          .object({
            name: z.string().trim().min(2).max(120),
            email: z.string().email().max(320),
            password: z.string().min(8).max(128),
            accountType: z.enum(["customer", "employee"]),
          })
          .strict()
      )
      .mutation(async ({ ctx, input }) => {
        const email = normalizeEmail(input.email);
        const isOwner = Boolean(ENV.ownerEmail && email === ENV.ownerEmail);
        const existing = await dbQueries.getUserByEmail(email);
        if (existing)
          throw new TRPCError({
            code: "CONFLICT",
            message: "email_registered",
          });

        const passwordHash = await hashPassword(input.password);
        const openId = createLocalOpenId();
        const db = await dbOrThrow();
        try {
          await db.insert(users).values({
            openId,
            name: input.name.trim(),
            email,
            loginMethod: "email",
            accountType: isOwner ? "employee" : input.accountType,
            passwordHash,
            role: isOwner ? "admin" : "user",
          });
        } catch (error) {
          if (isDuplicateEmailError(error))
            throw new TRPCError({
              code: "CONFLICT",
              message: "email_registered",
            });
          throw error;
        }
        const user = await dbQueries.getUserByOpenId(openId);
        if (!user)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "user_creation_failed",
          });

        const token = createSessionToken();
        await dbQueries.createLocalSession({
          tokenHash: hashSessionToken(token),
          userId: user.id,
          expiresAt: new Date(Date.now() + ONE_YEAR_MS),
        });
        ctx.res.cookie(LOCAL_SESSION_COOKIE, token, {
          ...getSessionCookieOptions(ctx.req),
          maxAge: ONE_YEAR_MS,
        });
        return {
          user: publicUser(user),
          accountType: user.accountType,
          mustChangePassword: Boolean(user.mustChangePassword),
        };
      }),
    initialSetupInfo: publicProcedure
      .input(
        z
          .object({ token: z.string().regex(INITIAL_SETUP_CODE_PATTERN) })
          .strict()
      )
      .mutation(({ input }) => initialManagerSetupInfo(input.token)),
    completeInitialSetup: publicProcedure
      .input(
        z
          .object({
            token: z.string().regex(INITIAL_SETUP_CODE_PATTERN),
            password: z.string().min(8).max(128),
          })
          .strict()
      )
      .mutation(({ ctx, input }) => completeInitialManagerSetup(ctx, input)),
    configureEmail: authenticatedProcedure
      .input(z.object({ password: z.string().min(8).max(128) }).strict())
      .mutation(({ ctx, input }) =>
        configureGeneralManagerEmail(ctx, input.password)
      ),
    changePassword: authenticatedProcedure
      .input(
        z
          .object({
            newPassword: z.string().min(8).max(128),
            currentPassword: z.string().min(8).max(128).optional(),
          })
          .strict()
      )
      .mutation(({ ctx, input }) => changeAccountPassword(ctx, input)),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      const cookies = parseCookieHeader(ctx.req.headers.cookie ?? "");
      const localToken = cookies[LOCAL_SESSION_COOKIE];
      if (ctx.user?.accountType === "employee") {
        const database = await getDb();
        if (database) {
          const key =
            "logout-" +
            createHash("sha256")
              .update(
                String(ctx.user.id) + ":" + (localToken ?? "no-local-session")
              )
              .digest("hex");
          await endDutyForLogout(database, ctx.user.id, key);
        }
      }
      if (localToken) {
        await dbQueries.deleteLocalSession(hashSessionToken(localToken));
      }
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      ctx.res.clearCookie(LOCAL_SESSION_COOKIE, {
        ...cookieOptions,
        maxAge: -1,
      });
      return { success: true } as const;
    }),
  }),
  branches: router({
    public: publicProcedure.query(async () => publicProfiles(await getDb())),
    profiles: protectedProcedure.query(async ({ ctx }) => {
      const db = await dbOrThrow();
      const scope = await readOfficeScope(db, ctx.user);
      if (!permissionAllowed(scope, "office_settings", "view"))
        throw branchForbidden("office_settings_permission_required");
      const profiles = await publicProfiles(db);
      return scope.role === "office_manager"
        ? profiles.filter(profile => officeIsAssigned(scope, profile.officeId))
        : profiles;
    }),
    update: protectedProcedure
      .input(officeProfileUpdateSchema)
      .mutation(async ({ ctx, input }) => {
        const db = await dbOrThrow();
        const scope = await readOfficeScope(db, ctx.user);
        if (
          !permissionAllowed(scope, "office_settings", "manage") ||
          !officeIsAssigned(scope, input.officeId)
        )
          throw branchForbidden("Office profile access is restricted");
        return updateProfile(db, ctx.user, input, scope.role!);
      }),
    dashboard: protectedProcedure
      .input(
        z
          .object({
            officeId: z.enum(["nouakchott", "dubai", "china", "turkey"]),
          })
          .strict()
      )
      .query(async ({ ctx, input }) => {
        const db = await dbOrThrow();
        return dashboardData(
          db,
          await readOfficeScope(db, ctx.user),
          input.officeId
        );
      }),
    members: protectedProcedure.query(async ({ ctx }) =>
      visiblePermissionMembers(await dbOrThrow(), ctx.user)
    ),
    assignMember: protectedProcedure
      .input(officeMembershipSchema)
      .mutation(async ({ ctx, input }) =>
        assignPermissionMembership(await dbOrThrow(), ctx.user, input)
      ),
    assignRecord: protectedProcedure
      .input(assignRecordSchema)
      .mutation(async ({ ctx, input }) => {
        const db = await dbOrThrow();
        const scope = await readOfficeScope(db, ctx.user);
        if (scope.role !== "admin")
          throw branchForbidden("Only global admins may assign record offices");
        return assignRecord(db, ctx.user, input);
      }),
    confirmArrival: protectedProcedure
      .input(confirmArrivalSchema)
      .mutation(async ({ ctx, input }) => {
        const db = await dbOrThrow();
        return confirmArrival(
          db,
          ctx.user,
          await readOfficeScope(db, ctx.user),
          input
        );
      }),
  }),
  warehouse: router({
    snapshot: protectedProcedure.query(async ({ ctx }) =>
      readWarehouseSnapshot(await dbOrThrow(), ctx.user)
    ),
    commit: protectedProcedure
      .input(warehouseCommandSchema)
      .mutation(async ({ ctx, input }) => {
        if (input.clientUserId && input.clientUserId !== String(ctx.user.id))
          throw forbidden("Warehouse session changed");
        return commitWarehouseStorage(await dbOrThrow(), ctx.user, input);
      }),
  }),
  finance: router({
    snapshot: protectedProcedure
      .input(readOwnerInputSchema)
      .query(async ({ ctx, input }) => {
        if (input?.clientUserId && input.clientUserId !== String(ctx.user.id))
          throw forbidden("Finance session changed");
        const db = await dbOrThrow();
        try {
          return await db.transaction(async (tx: any) =>
            financeSnapshot(tx, await readOfficeScope(tx, ctx.user))
          );
        } catch (error) {
          if (error instanceof Error && error.message === "finance_forbidden")
            throw forbidden("Finance access is restricted");
          throw error;
        }
      }),
    sync: protectedProcedure
      .input(financeSyncInputSchema)
      .mutation(async ({ ctx, input }) => {
        if (input.clientUserId && input.clientUserId !== String(ctx.user.id))
          throw forbidden("Finance session changed");
        const db = await dbOrThrow();
        try {
          return await financeSync(db, ctx.user, input.commands);
        } catch (error) {
          if (error instanceof Error && error.message === "finance_forbidden")
            throw forbidden("Finance access is restricted");
          throw error;
        }
      }),
  }),
  duty: dutyRouter,
  shipmentSettlement: shipmentSettlementRouter,
  financialVoids: financialVoidsRouter,
  lifecycle: lifecycleAdminRouter,
  operations: router({
    access: protectedProcedure
      .input(readOwnerInputSchema)
      .query(async ({ ctx, input }) => {
        assertReadOwner(input, ctx.user.id);
        const db = await dbOrThrow();
        const scope = await readOfficeScope(db, ctx.user);
        return {
          role: scope.role,
          userId: ctx.user.id,
          offices: scope.offices,
          homeOffice: scope.homeOffice,
          canUpdateTracking: Boolean(scope.canUpdateTracking),
          membershipVersion: scope.membershipVersion,
          permissions: scope.permissions,
          delegationCeiling: scope.delegationCeiling,
          delegationPolicyConfigured: scope.delegationPolicyConfigured,
          permissionsCustomized: scope.permissionsCustomized,
          delegatedBy: scope.delegatedBy,
          permissionFingerprint: createHash("sha256")
            .update(JSON.stringify(scope.permissions))
            .digest("hex"),
        };
      }),

    snapshot: protectedProcedure
      .input(readOwnerInputSchema)
      .query(async ({ ctx, input }) => {
        assertReadOwner(input, ctx.user.id);
        const db = await dbOrThrow();
        const scope = await readOfficeScope(db, ctx.user);
        if (!scope.role) throw forbidden();
        const state = emptyState();
        state.retiredRecords = [];
        const retired = await loadLifecycle(db);
        const rows = await db.select().from(records);
        for (const row of rows) {
          if (
            !recordIsActive(
              retired,
              row.entity as Entity,
              row.data as EntityRecord
            )
          ) {
            if (
              canReadPermissionRecord(
                scope,
                row.entity as Entity,
                row.data as EntityRecord
              )
            )
              state.retiredRecords!.push({
                entity: row.entity as Entity,
                recordId: row.recordId,
              });
            continue;
          }
          if (
            !canReadPermissionRecord(
              scope,
              row.entity as Entity,
              row.data as EntityRecord
            )
          )
            continue;
          const data = permissionCurrent(row, scope);
          if (row.entity === "account") state.accounts.push(data as any);
          else if (row.entity === "shipment") state.shipments.push(data as any);
          else if (row.entity === "invoice") state.invoices.push(data as any);
        }
        return state;
      }),
    members: protectedProcedure.query(async ({ ctx }) =>
      visiblePermissionMembers(await dbOrThrow(), ctx.user)
    ),
    resetPassword: protectedProcedure
      .input(
        z
          .object({
            userId: z.number().int().positive(),
            temporaryPassword: z.string().min(8).max(128),
          })
          .strict()
      )
      .mutation(({ ctx, input }) =>
        resetAccountPassword(ctx, input.userId, input.temporaryPassword)
      ),

    setRole: protectedProcedure
      .input(setRoleInputSchema)
      .mutation(async ({ ctx, input }) => {
        const actorRole = await effectiveRole(ctx.user);
        if (!canManageMembers(ctx.user, actorRole))
          throw forbidden("Only the owner or an admin may assign roles");
        // The legacy endpoint could grant a role without an office scope. Keep
        // it as a hard failure so callers must use assignMember atomically.
        void input;
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "office_required_use_assignMember",
        });
      }),

    sync: protectedProcedure
      .input(syncInputSchema)
      .mutation(async ({ ctx, input }) => {
        if (input.clientUserId && input.clientUserId !== String(ctx.user.id))
          throw forbidden("Operations session changed");
        const role = await effectiveRole(ctx.user);
        if (!role) throw forbidden();
        const db = await dbOrThrow();
        const scope = await readOfficeScope(db, ctx.user);
        const output: SyncResult = { applied: [], conflicts: [] };
        await db.transaction(async tx => {
          // The user row always exists for a real session. Lock it before any
          // snapshot read so concurrent first-use requests cannot both observe
          // a missing receipt and perform the same shipment mutation.
          await tx
            .select({ id: users.id })
            .from(users)
            .where(eq(users.id, ctx.user.id))
            .limit(1)
            .for("update");
          const scope = await readOfficeScope(tx, ctx.user);
          const role = scope.role;
          if (!role) throw forbidden();
          const retired = await loadLifecycle(tx);
          for (const rawChange of input.changes) {
            const change = parseChange(rawChange);
            if (
              change.action === "restore-shipment" ||
              (isRetired(retired, change.entity, change.recordId) &&
                change.action !== "delete-shipment")
            ) {
              output.conflicts.push({
                changeId: change.id,
                reason: "record_permanently_retired",
                current: null,
              });
              continue;
            }
            const payloadHash = createHash("sha256")
              .update(JSON.stringify(change))
              .digest("hex");
            const scopeCurrentRows = await tx
              .select()
              .from(records)
              .where(
                and(
                  eq(records.entity, change.entity),
                  eq(records.recordId, change.recordId)
                )
              )
              .limit(1);
            const scopeCurrent = scopeCurrentRows[0] ?? null;
            const permission = changePermission(
              scope,
              change,
              (scopeCurrent?.data as EntityRecord) ?? null
            );
            const authorizationRole = permission.role;
            if (
              !authorizationRole ||
              !withinRecordOffice(
                scope,
                change.entity,
                change.data as EntityRecord,
                true
              ) ||
              (scopeCurrent &&
                !withinRecordOffice(
                  scope,
                  change.entity,
                  scopeCurrent.data as EntityRecord,
                  true
                ))
            ) {
              output.conflicts.push({
                changeId: change.id,
                reason: "permission_denied",
                current: null,
              });
              continue;
            }

            if (
              scopeCurrent &&
              !canReadPermissionRecord(
                scope,
                change.entity,
                scopeCurrent.data as EntityRecord
              )
            )
              throw forbidden("Record is outside your office scope");
            const existingReceipt = await tx
              .select()
              .from(syncReceipts)
              .where(
                and(
                  eq(syncReceipts.userId, ctx.user.id),
                  eq(syncReceipts.changeId, change.id)
                )
              )
              .limit(1)
              .for("update");
            if (existingReceipt[0]) {
              const replay = existingReceipt[0].result as unknown as SyncResult;
              const storedHash = (
                existingReceipt[0].result as { payloadHash?: string }
              ).payloadHash;
              if (storedHash !== payloadHash) {
                output.conflicts.push({
                  changeId: change.id,
                  reason: storedHash
                    ? "replay_payload_mismatch"
                    : "legacy_receipt_requires_review",
                  current: null,
                });
                continue;
              }
              if (
                (replay.applied ?? []).some(
                  item =>
                    item.entity !== change.entity ||
                    item.record.id !== change.recordId ||
                    !canReadPermissionRecord(scope, item.entity, item.record)
                )
              ) {
                output.conflicts.push({
                  changeId: change.id,
                  reason: "previously_applied_access_changed",
                  current: null,
                });
                continue;
              }
              if (
                (replay.applied ?? []).some(
                  item => !recordIsActive(retired, item.entity, item.record)
                ) &&
                change.action !== "delete-shipment"
              ) {
                output.conflicts.push({
                  changeId: change.id,
                  reason: "record_permanently_retired",
                  current: null,
                });
                continue;
              }
              for (const acknowledged of replay.applied ?? []) {
                if (
                  acknowledged.entity === "invoice" &&
                  !permissionAllowed(scope, "invoices", "view")
                )
                  output.conflicts.push({
                    changeId: acknowledged.changeId,
                    reason: "previously_applied_access_changed",
                    current: null,
                  });
              }
              output.applied.push(
                ...(replay.applied ?? [])
                  .filter(
                    item => item.entity !== "invoice" || canViewFinance(role)
                  )
                  .map(item => ({
                    ...item,
                    record: hideForOfficeScope(
                      item.record,
                      role,
                      scope.offices
                    ),
                  }))
              );
              output.conflicts.push(
                ...(replay.conflicts ?? []).map(item => ({
                  ...item,
                  current:
                    item.current &&
                    (change.entity !== "invoice" || canViewFinance(role)) &&
                    canReadPermissionRecord(scope, change.entity, item.current)
                      ? hideForOfficeScope(item.current, role, scope.offices)
                      : null,
                }))
              );
              continue;
            }
            const currentRows = await tx
              .select()
              .from(records)
              .where(
                and(
                  eq(records.entity, change.entity),
                  eq(records.recordId, change.recordId)
                )
              )
              .limit(1)
              .for("update");
            const current = currentRows[0] ?? null;
            if (isRetired(retired, change.entity, change.recordId)) {
              output.conflicts.push({
                changeId: change.id,
                reason: "record_permanently_retired",
                current: null,
              });
              continue;
            }
            const currentPublic = current
              ? hideForOfficeScope(
                  permissionCurrent(current, scope),
                  role,
                  scope.offices
                )
              : null;
            let result: SyncResult;
            let financeShipment: Shipment | null = null;
            if (!canWrite(authorizationRole, change.entity))
              result = {
                applied: [],
                conflicts: [
                  {
                    changeId: change.id,
                    reason: "forbidden",
                    current: currentPublic,
                  },
                ],
              };
            else if (
              role === "staff" &&
              isFinancialPayloadNonZero(change) &&
              !current
            )
              result = {
                applied: [],
                conflicts: [
                  {
                    changeId: change.id,
                    reason: "financial_write_forbidden",
                    current: null,
                  },
                ],
              };
            else if (
              change.expectedVersion !== null &&
              (!current || current.version !== change.expectedVersion)
            )
              result = {
                applied: [],
                conflicts: [
                  {
                    changeId: change.id,
                    reason: "version_conflict",
                    current: currentPublic,
                  },
                ],
              };
            else if (change.expectedVersion === null && current)
              result = {
                applied: [],
                conflicts: [
                  {
                    changeId: change.id,
                    reason: "already_exists",
                    current: currentPublic,
                  },
                ],
              };
            else if (
              current &&
              change.entity === "shipment" &&
              (current.data as { tracking?: string }).tracking !==
                (change.data as { tracking?: string }).tracking
            )
              result = {
                applied: [],
                conflicts: [
                  {
                    changeId: change.id,
                    reason: "tracking_change_forbidden",
                    current: currentPublic,
                  },
                ],
              };
            else {
              let nextData: EntityRecord;
              let approvedServerTariff = false;
              try {
                let candidate: EntityRecord = change.data as EntityRecord;
                if (
                  change.entity === "invoice" &&
                  (candidate as any).payment !== undefined
                ) {
                  const currentInvoice = current
                    ? (asEntityRecord(current.data) as any)
                    : null;
                  const invoiceOffice = officeIdSchema.parse(
                    (candidate as any).officeId ??
                      currentInvoice?.officeId ??
                      scope.homeOffice ??
                      (scope.role === "admin" ? "nouakchott" : undefined)
                  );
                  if (
                    scope.role !== "admin" &&
                    !scope.offices?.includes(invoiceOffice)
                  )
                    throw new Error("payment_office_scope_forbidden");
                  const settings = await readOfficeSettings(tx, invoiceOffice);
                  const payment = canonicalInvoicePayment(
                    (candidate as any).payment,
                    currentInvoice,
                    settings,
                    invoiceOffice
                  );
                  candidate = payment
                    ? ({ ...candidate, payment } as EntityRecord)
                    : candidate;
                }
                if (
                  change.entity === "shipment" &&
                  current &&
                  (candidate as Shipment).packing &&
                  !permissionAllowed(scope, "shipment_prices", "view")
                ) {
                  const previous = current.data as Shipment;
                  candidate = {
                    ...candidate,
                    amount: previous.amount,
                    packing: {
                      ...(candidate as Shipment).packing!,
                      pricePerKg: previous.packing?.pricePerKg ?? 0,
                      ...(previous.packing?.pricePerKgMRU === undefined
                        ? {}
                        : { pricePerKgMRU: previous.packing.pricePerKgMRU }),
                    },
                  } as EntityRecord;
                }
                if (
                  change.entity === "shipment" &&
                  !current &&
                  (candidate as Shipment).packing
                ) {
                  const shipment = candidate as Shipment;
                  const packing = shipment.packing!;
                  const service = packingServiceSchema.parse(
                    packing.service ?? "airRegular"
                  );
                  // Prices and versions are resolved from server publication history.
                  // An offline draft keeps its creation-time rate, never a guessed
                  // newer rate or an arbitrary rate supplied by the browser.
                  const tariff = await creationTariff(tx, {
                    ...packing,
                    service,
                  });
                  const { pricePerKgMRU: _ignoredMru, ...withoutMru } = packing;
                  candidate = {
                    ...shipment,
                    accountingModelVersion: 2,
                    amount: 0,
                    packing: {
                      ...withoutMru,
                      service,
                      pricePerKg: tariff.pricePerKg,
                      ...(tariff.pricePerKgMRU === undefined
                        ? {}
                        : { pricePerKgMRU: tariff.pricePerKgMRU }),
                      rateSnapshot: tariff.snapshot,
                    },
                  } as EntityRecord;
                  approvedServerTariff = true;
                }
                nextData = prepareRecordForWrite(
                  authorizationRole,
                  candidate,
                  current ? asEntityRecord(current.data) : null,
                  change.action,
                  approvedServerTariff
                );
                if (change.entity === "shipment") {
                  if (current)
                    await assertFrozenShipmentComponents(
                      tx,
                      current.data as Shipment,
                      nextData as Shipment
                    );
                  const version = (current?.data as Shipment | undefined)
                    ?.accountingModelVersion;
                  if (current) {
                    if (version === 2)
                      (nextData as Shipment).accountingModelVersion = 2;
                    else delete (nextData as Shipment).accountingModelVersion;
                  }
                  financeShipment = nextData as Shipment;
                }
                assertOfficeRecordWrite(
                  authorizationRole,
                  scope.offices,
                  change.entity,
                  nextData,
                  current ? asEntityRecord(current.data) : null
                );
              } catch (error) {
                result = {
                  applied: [],
                  conflicts: [
                    {
                      changeId: change.id,
                      reason:
                        error instanceof Error
                          ? error.message
                          : "invalid_record",
                      current: currentPublic,
                    },
                  ],
                };
                await tx.insert(syncReceipts).values({
                  userId: ctx.user.id,
                  changeId: change.id,
                  result: { ...result, payloadHash },
                });
                output.conflicts.push(...result.conflicts);
                continue;
              }
              const nextVersion = current ? current.version + 1 : 1;
              if (!current) {
                const idKeyType = `${change.entity}-id` as
                  | "account-id"
                  | "shipment-id"
                  | "invoice-id";
                const keyConflict = await tx
                  .select()
                  .from(recordKeys)
                  .where(
                    and(
                      eq(recordKeys.keyType, idKeyType),
                      eq(recordKeys.keyValue, change.recordId)
                    )
                  )
                  .limit(1)
                  .for("update");
                const trackingConflict =
                  change.entity === "shipment"
                    ? await tx
                        .select()
                        .from(recordKeys)
                        .where(
                          and(
                            eq(recordKeys.keyType, "shipment-tracking"),
                            sql`lower(trim(${recordKeys.keyValue})) = ${normalizeTracking((nextData as Shipment).tracking)}`
                          )
                        )
                        .limit(1)
                        .for("update")
                    : [];
                if (
                  (keyConflict[0] &&
                    keyConflict[0].recordId !== change.recordId) ||
                  (trackingConflict[0] &&
                    trackingConflict[0].recordId !== change.recordId)
                )
                  result = {
                    applied: [],
                    conflicts: [
                      {
                        changeId: change.id,
                        reason: "identifier_conflict",
                        current: null,
                      },
                    ],
                  };
                else {
                  await tx.insert(recordKeys).values({
                    keyType: idKeyType,
                    keyValue: change.recordId,
                    entity: change.entity,
                    recordId: change.recordId,
                  }).onConflictDoNothing();
                  if (change.entity === "shipment")
                    await tx
                      .insert(recordKeys)
                      .values({
                        keyType: "shipment-tracking",
                        keyValue: normalizeTracking(
                          (nextData as Shipment).tracking
                        ),
                        entity: change.entity,
                        recordId: change.recordId,
                      }).onConflictDoNothing();
                  await tx.insert(records).values({
                    entity: change.entity,
                    recordId: change.recordId,
                    version: nextVersion,
                    data: nextData,
                    updatedBy: ctx.user.id,
                  }).onConflictDoNothing();
                  const after = (
                    await tx
                      .select()
                      .from(records)
                      .where(
                        and(
                          eq(records.entity, change.entity),
                          eq(records.recordId, change.recordId)
                        )
                      )
                      .limit(1)
                  )[0];
                  if (!after || after.updatedBy !== ctx.user.id)
                    result = {
                      applied: [],
                      conflicts: [
                        {
                          changeId: change.id,
                          reason: "identifier_conflict",
                          current: after
                            ? permissionCurrent(after, scope)
                            : null,
                        },
                      ],
                    };
                  else {
                    await appendAudit(tx, {
                      actor: actor(ctx.user, role),
                      entity: change.entity,
                      recordId: change.recordId,
                      action: "create",
                      after: nextData,
                      afterVersion: nextVersion,
                      requestKey: `sync:${change.id}`,
                    });
                    result = {
                      applied: [
                        {
                          changeId: change.id,
                          entity: change.entity,
                          record: permissionCurrent(after, scope),
                        },
                      ],
                      conflicts: [],
                    };
                  }
                }
              } else {
                let after;
                if (change.action === "delete-shipment") {
                  await insertLifecycle(tx, {
                    entity: "shipment",
                    recordId: change.recordId,
                    action: "delete",
                    officeId:
                      (current.data as Shipment).packing?.source ??
                      (current.data as Shipment).officeId ??
                      null,
                    reason: (nextData as Shipment).deleted?.reason ?? "deleted",
                    expectedVersion: current.version,
                    actorId: ctx.user.id,
                    requestKey: change.id,
                    snapshot: { before: current.data, payloadHash },
                  });
                  const ids = retired.get("shipment") ?? new Set<string>();
                  ids.add(change.recordId);
                  retired.set("shipment", ids);
                  after = { ...current, data: nextData, version: nextVersion };
                } else {
                  await tx
                    .update(records)
                    .set({
                      version: nextVersion,
                      data: nextData,
                      updatedBy: ctx.user.id,
                    })
                    .where(eq(records.id, current.id));
                  after = (
                    await tx
                      .select()
                      .from(records)
                      .where(eq(records.id, current.id))
                      .limit(1)
                  )[0];
                }
                await appendAudit(tx, {
                  actor: actor(ctx.user, role),
                  entity: change.entity,
                  recordId: change.recordId,
                  action:
                    change.action === "delete-shipment" ? "delete" : "update",
                  before: current.data,
                  after: nextData,
                  beforeVersion: current.version,
                  afterVersion: nextVersion,
                  requestKey: `sync:${change.id}`,
                });
                result = {
                  applied: [
                    {
                      changeId: change.id,
                      entity: change.entity,
                      record: permissionCurrent(after, scope),
                    },
                  ],
                  conflicts: [],
                };
              }
            }
            if (
              change.entity === "shipment" &&
              !current &&
              result.applied.length &&
              financeShipment?.packing
            ) {
              const packing = financeShipment.packing;
              await tx.insert(shipmentTariffSnapshots).values({
                id: `shipment-created-tariff:${change.id}`,
                shipmentId: financeShipment.id,
                officeId: packing.source,
                serviceType: packing.service ?? "airRegular",
                currency: sourceCurrency[packing.source] as
                  | "AED"
                  | "CNY"
                  | "TRY",
                pricePerKg: packing.pricePerKg.toFixed(2),
                pricePerKgMRU: packing.pricePerKgMRU?.toFixed(2) ?? null,
                capturedBy: ctx.user.id,
                data: {
                  origin: "published_at_creation",
                  creationDate: packing.createdAt,
                  snapshot: packing.rateSnapshot,
                },
              });
            }
            await tx.insert(syncReceipts).values({
              userId: ctx.user.id,
              changeId: change.id,
              result: { ...result, payloadHash },
            });
            output.applied.push(...result.applied);
            output.conflicts.push(...result.conflicts);
          }
        });
        return output;
      }),
  }),

  tracking: router({
    list: protectedProcedure
      .input(
        z.object({ search: z.string().trim().max(240).optional() }).default({})
      )
      .query(async ({ ctx, input }) => {
        const role = await effectiveRole(ctx.user);
        if (!role) throw forbidden();
        const db = await dbOrThrow();
        const scope = await readOfficeScope(db, ctx.user);
        if (!permissionAllowed(scope, "tracking", "view"))
          throw forbidden("tracking_permission_required");
        const search = input.search?.toLocaleLowerCase("ar");
        const retired = await loadLifecycle(db);
        const rows = await db.select().from(records);
        const matching = rows.filter(row => {
          if (
            row.entity !== "shipment" ||
            !recordIsActive(retired, "shipment", row.data as Shipment)
          )
            return false;
          if (
            !canReadTrackingPermissionRecord(
              scope,
              "shipment",
              row.data as Shipment
            )
          )
            return false;
          if (!search) return true;
          const shipment = row.data as Shipment;
          return (
            shipment.id.toLocaleLowerCase().includes(search) ||
            shipment.tracking.toLocaleLowerCase().includes(search)
          );
        });
        return {
          items: matching.slice(0, 5000).map(row => {
            const summary = summaryOf(row.data as Shipment, row.version);
            return role === "viewer"
              ? {
                  ...summary,
                  branch: null,
                  startedAt: null,
                  expectedDays: null,
                  updatedAt: null,
                  version: 0,
                }
              : summary;
          }),
          total: matching.length,
          truncated: matching.length > 5000,
        };
      }),

    detail: protectedProcedure
      .input(z.object({ shipmentId: z.string().min(1).max(128) }))
      .query(async ({ ctx, input }) => {
        const role = await effectiveRole(ctx.user);

        const db = await dbOrThrow();
        const scope = await readOfficeScope(db, ctx.user);
        if (scope.role === "viewer" && !scope.permissionsCustomized)
          throw forbidden("Tracking detail is not available to viewers");
        if (!permissionAllowed(scope, "tracking", "view"))
          throw forbidden("tracking_permission_required");
        const row = (
          await db
            .select()
            .from(records)
            .where(
              and(
                eq(records.entity, "shipment"),
                eq(records.recordId, input.shipmentId)
              )
            )
            .limit(1)
        )[0];
        if (!row || (row.data as Shipment).deleted)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Shipment not found",
          });
        if (
          !canReadTrackingPermissionRecord(
            scope,
            "shipment",
            row.data as Shipment
          )
        )
          throw branchForbidden();
        await assertActiveEntity(db, "shipment", input.shipmentId);
        return sanitizePermissionRecord(scope, "shipment", {
          ...(row.data as Shipment),
          scope: "shared",
          version: row.version,
        });
      }),

    commit: protectedProcedure
      .input(trackingRequestSchema)
      .mutation(async ({ ctx, input }) => {
        assertTrackingOwnerFence(input.clientUserId, ctx.user.id);
        const role = await effectiveRole(ctx.user);
        if (!role) throw forbidden();
        const request = parseTrackingRequest(input);
        if (role === "office_manager" && request.command.type === "transfer")
          throw forbidden(
            "Only the general manager may transfer shipments for this role"
          );
        const db = await dbOrThrow();
        const scope = await readOfficeScope(db, ctx.user);
        if (!permissionAllowed(scope, "tracking", "view"))
          throw forbidden("tracking_permission_required");
        try {
          return await db.transaction(async tx => {
            const freshUser = await lockEmployee(tx, ctx.user);
            const scope = await readOfficeScope(
              tx,
              freshUser,
              new Set<number>(),
              true
            );
            await assertActiveEntity(tx, "shipment", request.shipmentId);
            const role = scope.role;
            const authorizationRole = permissionActionRole(
              scope,
              "tracking",
              "manage"
            );
            if (!role || !authorizationRole)
              throw new Error("tracking_forbidden");
            if (
              role === "staff" &&
              !scope.permissionsCustomized &&
              (!scope.canUpdateTracking ||
                scope.offices?.length !== 1 ||
                scope.homeOffice === "nouakchott" ||
                request.command.type !== "stage")
            )
              throw new Error("tracking_forbidden");
            const receiptKey = trackingReceiptKey(request.requestId);
            const payloadHash = createHash("sha256")
              .update(JSON.stringify(request))
              .digest("hex");
            const scopeRows = await tx
              .select()
              .from(records)
              .where(
                and(
                  eq(records.entity, "shipment"),
                  eq(records.recordId, request.shipmentId)
                )
              )
              .limit(1)
              .for("update");
            if (!scopeRows[0] || (scopeRows[0].data as Shipment).deleted)
              throw new Error("tracking_not_found");
            if (
              !canReadTrackingPermissionRecord(
                scope,
                "shipment",
                scopeRows[0].data as Shipment
              )
            )
              throw new Error("tracking_forbidden");
            const existing = await tx
              .select()
              .from(syncReceipts)
              .where(
                and(
                  eq(syncReceipts.userId, freshUser.id),
                  eq(syncReceipts.changeId, receiptKey)
                )
              )
              .limit(1)
              .for("update");
            if (existing[0]) {
              if (
                (existing[0].result as { payloadHash?: string }).payloadHash !==
                payloadHash
              )
                throw new Error("tracking_request_reuse");
              const old = existing[0].result as {
                requestId: string;
                shipment: Shipment;
                version: number;
              };
              if (
                old.shipment.id !== request.shipmentId ||
                !canReadTrackingPermissionRecord(
                  scope,
                  "shipment",
                  old.shipment
                )
              )
                throw new Error("tracking_forbidden");
              return {
                requestId: old.requestId,
                shipment: hideForOfficeScope(old.shipment, role, scope.offices),
                version: old.version,
              };
            }
            const row = (
              await tx
                .select()
                .from(records)
                .where(
                  and(
                    eq(records.entity, "shipment"),
                    eq(records.recordId, request.shipmentId)
                  )
                )
                .limit(1)
                .for("update")
            )[0];
            if (!row) throw new Error("tracking_not_found");
            if (
              !canReadTrackingPermissionRecord(
                scope,
                "shipment",
                row.data as Shipment
              )
            )
              throw new Error("tracking_forbidden");
            if (
              scope.role !== "admin" &&
              scope.offices !== null &&
              !canWriteOfficeRecord(
                authorizationRole,
                scope.offices,
                "shipment",
                row.data as Shipment
              )
            )
              throw new Error("tracking_forbidden");
            if (row.version !== request.expectedVersion)
              throw new Error("tracking_version_conflict");
            const mutation = applyTrackingCommand(
              row.data as Shipment,
              request.command,
              actorFromUser(freshUser, role, authorizationRole)
            );
            const nextVersion = row.version + 1;
            await tx
              .update(records)
              .set({
                version: nextVersion,
                data: mutation.shipment,
                updatedBy: freshUser.id,
              })
              .where(eq(records.id, row.id));
            await appendAudit(tx, {
              actor: actor(freshUser, role),
              entity: "shipment",
              recordId: request.shipmentId,
              action: mutation.action,
              before: row.data,
              after: mutation.shipment,
              beforeVersion: row.version,
              afterVersion: nextVersion,
              requestKey: receiptKey,
            });
            const result = {
              requestId: request.requestId,
              shipment: mutation.shipment,
              version: nextVersion,
            };
            await tx.insert(syncReceipts).values({
              userId: freshUser.id,
              changeId: receiptKey,
              result: { ...result, payloadHash },
            });
            return {
              requestId: result.requestId,
              shipment: hideForOfficeScope(
                result.shipment,
                role,
                scope.offices
              ),
              version: result.version,
            };
          });
        } catch (error) {
          return trackingError(error);
        }
      }),

    export: protectedProcedure
      .input(
        z.object({ search: z.string().trim().max(240).optional() }).default({})
      )
      .query(async ({ ctx, input }) => {
        const role = await effectiveRole(ctx.user);
        if (!role) throw forbidden();
        const db = await dbOrThrow();
        const scope = await readOfficeScope(db, ctx.user);
        if (!permissionAllowed(scope, "excel", "view"))
          throw forbidden("excel_permission_required");
        if (!permissionAllowed(scope, "tracking", "view"))
          throw forbidden("tracking_permission_required");
        const search = input.search?.toLocaleLowerCase("ar");
        const retired = await loadLifecycle(db);
        const rows = await db.select().from(records);
        return rows
          .filter(
            row =>
              row.entity === "shipment" &&
              recordIsActive(retired, "shipment", row.data as Shipment) &&
              canReadTrackingPermissionRecord(
                scope,
                "shipment",
                row.data as Shipment
              ) &&
              (!search ||
                String((row.data as Shipment).id)
                  .toLocaleLowerCase()
                  .includes(search) ||
                String((row.data as Shipment).tracking)
                  .toLocaleLowerCase()
                  .includes(search))
          )
          .slice(0, 5000)
          .map(row => summaryOf(row.data as Shipment, row.version));
      }),

    audit: protectedProcedure
      .input(
        z.object({
          shipmentId: z.string().min(1).max(128).optional(),
          afterId: z.number().int().nonnegative().optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        const role = await effectiveRole(ctx.user);
        if (!role) throw forbidden();
        const db = await dbOrThrow();
        const auditScope = await readOfficeScope(db, ctx.user);
        if (!permissionAllowed(auditScope, "audit", "view"))
          throw forbidden("audit_permission_required");
        if (role !== "admin") {
          if (!input.shipmentId)
            throw forbidden("Shipment-specific audit access is required");
          const scope = await readOfficeScope(db, ctx.user);
          if (!permissionAllowed(scope, "tracking", "view"))
            throw forbidden("tracking_permission_required");
          const row = (
            await db
              .select()
              .from(records)
              .where(
                and(
                  eq(records.entity, "shipment"),
                  eq(records.recordId, input.shipmentId)
                )
              )
              .limit(1)
          )[0];
          if (
            !row ||
            !canReadTrackingPermissionRecord(
              scope,
              "shipment",
              row.data as Shipment
            )
          )
            throw forbidden();
        }
        const page = await readAudit(
          db,
          role === "admin" ? "admin" : "supervisor",
          input
        );
        if (role === "admin") return page;
        return {
          ...page,
          items: page.items.map(event => ({
            ...event,
            before:
              event.before && typeof event.before === "object"
                ? sanitizePermissionRecord(
                    auditScope,
                    "shipment",
                    event.before as Shipment
                  )
                : event.before,
            after:
              event.after && typeof event.after === "object"
                ? sanitizePermissionRecord(
                    auditScope,
                    "shipment",
                    event.after as Shipment
                  )
                : event.after,
          })),
        };
      }),
  }),

  audit: router({
    list: protectedProcedure
      .input(
        z.object({
          shipmentId: z.string().min(1).max(128).optional(),
          afterId: z.number().int().nonnegative().optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        const role = await effectiveRole(ctx.user);
        if (!role) throw forbidden();
        const db = await dbOrThrow();
        const auditScope = await readOfficeScope(db, ctx.user);
        if (!permissionAllowed(auditScope, "audit", "view"))
          throw forbidden("audit_permission_required");
        if (role !== "admin") {
          if (!input.shipmentId)
            throw forbidden("Shipment-specific audit access is required");
          const scope = await readOfficeScope(db, ctx.user);
          if (!permissionAllowed(scope, "tracking", "view"))
            throw forbidden("tracking_permission_required");
          const row = (
            await db
              .select()
              .from(records)
              .where(
                and(
                  eq(records.entity, "shipment"),
                  eq(records.recordId, input.shipmentId)
                )
              )
              .limit(1)
          )[0];
          if (
            !row ||
            !canReadTrackingPermissionRecord(
              scope,
              "shipment",
              row.data as Shipment
            )
          )
            throw forbidden();
        }
        const page = await readAudit(
          db,
          role === "admin" ? "admin" : "supervisor",
          input
        );
        if (role === "admin") return page;
        return {
          ...page,
          items: page.items.map(event => ({
            ...event,
            before:
              event.before && typeof event.before === "object"
                ? sanitizePermissionRecord(
                    auditScope,
                    "shipment",
                    event.before as Shipment
                  )
                : event.before,
            after:
              event.after && typeof event.after === "object"
                ? sanitizePermissionRecord(
                    auditScope,
                    "shipment",
                    event.after as Shipment
                  )
                : event.after,
          })),
        };
      }),
  }),

  office: officeRouter,
});

export type AppRouter = typeof appRouter;
