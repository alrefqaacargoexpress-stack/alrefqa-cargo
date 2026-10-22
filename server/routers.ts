import { hideForOfficeScope } from "./branches";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { ONE_YEAR_MS } from "@shared/const";
import { normalizeTracking } from "@shared/packing";
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
import { officeMembershipSchema, canWriteOfficeRecord } from "@shared/branches";
import { canViewFinance, canWrite, EMPTY_STATE } from "@shared/operations";
import { officeSettingsSchema } from "@shared/office";
import {
  memberRoles,
  localSessions,
  recordKeys,
  records,
  syncReceipts,
  users,
  officeSettings,
} from "../drizzle/schema";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { ENV } from "./_core/env";
import { publicProcedure, protectedProcedure, authenticatedProcedure, router } from "./_core/trpc";
import { configureGeneralManagerEmail, changeAccountPassword, resetAccountPassword } from "./accountSecurity";
import { initialManagerSetupInfo, completeInitialManagerSetup, INITIAL_SETUP_CODE_PATTERN } from "./initialManagerSetup";
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
  applyTrackingCommand,
  parseTrackingRequest,
  trackingReceiptKey,
} from "./tracking";
import {
  canonicalInvoicePayment,
  officeUpdateSchema,
  publicOfficeSettings,
  readOfficeSettings,
  sameOfficeMethods,
  settingsWithVersion,
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
import {
  financeSync,
  financeSnapshot,
  maybePostShipmentRevenue,
} from "./finance";
import { financeSyncInputSchema } from "@shared/finance";
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
        const user = await dbQueries.getUserByEmail(email);
        const valid = Boolean(
          user?.passwordHash &&
            (await verifyPassword(input.password, user.passwordHash))
        );
        if (!valid || !user)
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "invalid_credentials",
          });

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
        return { user: publicUser(user), accountType: user.accountType, mustChangePassword: Boolean(user.mustChangePassword) };
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
            accountType: input.accountType,
            passwordHash,
            role: "user",
          });
        } catch (error) {
          if (isDuplicateEmailError(error))
            throw new TRPCError({ code: "CONFLICT", message: "email_registered" });
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
        return { user: publicUser(user), accountType: user.accountType, mustChangePassword: Boolean(user.mustChangePassword) };
      }),
    initialSetupInfo: publicProcedure
      .input(z.object({ token: z.string().regex(INITIAL_SETUP_CODE_PATTERN) }).strict())
      .mutation(({ input }) => initialManagerSetupInfo(input.token)),
    completeInitialSetup: publicProcedure
      .input(z.object({ token: z.string().regex(INITIAL_SETUP_CODE_PATTERN), password: z.string().min(8).max(128) }).strict())
      .mutation(({ ctx, input }) => completeInitialManagerSetup(ctx, input)),
    configureEmail: authenticatedProcedure
      .input(z.object({ password: z.string().min(8).max(128) }).strict())
      .mutation(({ ctx, input }) => configureGeneralManagerEmail(ctx, input.password)),
    changePassword: authenticatedProcedure
      .input(z.object({
        newPassword: z.string().min(8).max(128),
        currentPassword: z.string().min(8).max(128).optional(),
      }).strict())
      .mutation(({ ctx, input }) => changeAccountPassword(ctx, input)),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      const cookies = parseCookieHeader(ctx.req.headers.cookie ?? "");
      const localToken = cookies[LOCAL_SESSION_COOKIE];
      if (localToken) {
        await dbQueries.deleteLocalSession(hashSessionToken(localToken));
      }
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      ctx.res.clearCookie(LOCAL_SESSION_COOKIE, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  branches: router({
    public: publicProcedure.query(async () => publicProfiles(await getDb())),
    profiles: protectedProcedure.query(async ({ ctx }) => {
      const db = await dbOrThrow();
      const scope = await readOfficeScope(db, ctx.user);
      if (!scope.role || scope.role === "viewer")
        throw branchForbidden("Branch profiles are restricted");
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
        if (scope.role !== "admin" && !(scope.role === "office_manager" && officeIsAssigned(scope, input.officeId)))
          throw branchForbidden("Office profile access is restricted");
        return updateProfile(db, ctx.user, input, scope.role);
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
    members: protectedProcedure.query(async ({ ctx }) => {
      const db = await dbOrThrow();
      const scope = await readOfficeScope(db, ctx.user);
      if (scope.role !== "admin")
        throw branchForbidden("Only global admins may list members");
      return listMembers(db);
    }),
    assignMember: protectedProcedure
      .input(officeMembershipSchema)
      .mutation(async ({ ctx, input }) => {
        const db = await dbOrThrow();
        const scope = await readOfficeScope(db, ctx.user);
        if (scope.role !== "admin")
          throw branchForbidden("Only global admins may assign members");
        if (input.offices.length === 0)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "office_required",
          });
        return db.transaction(async (tx: any) => {
          const target = await tx
            .select({
              id: users.id,
              openId: users.openId,
              role: users.role,
              name: users.name,
              email: users.email,
              accountType: users.accountType,
            })
            .from(users)
            .where(eq(users.id, input.userId))
            .limit(1);
          if (!target[0])
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "User not found",
            });
          if (
            (ENV.ownerOpenId && target[0].openId === ENV.ownerOpenId) ||
            target[0].role === "admin"
          )
            throw branchForbidden("The root admin cannot be changed");
          if (target[0].accountType !== "employee")
            throw branchForbidden("Only employee accounts may receive office roles");
          const oldRows = await tx
            .select()
            .from(memberRoles)
            .where(eq(memberRoles.userId, input.userId))
            .limit(1)
            .for("update");
          const old = oldRows[0];
          if ((old?.version ?? 0) !== input.expectedVersion)
            throw new TRPCError({
              code: "CONFLICT",
              message: "member_version_conflict",
            });
          const homeOffice = input.role === "office_manager" ? input.offices[0] :
            input.homeOffice !== undefined
              ? input.homeOffice
              : (old?.homeOffice ?? null);
          if (
            homeOffice &&
            !input.offices.some(office => office === homeOffice)
          )
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "home_office_outside_scope",
            });
          if (input.role === "accountant" && input.offices.length > 1 && !homeOffice)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "employee_office_required",
            });
          const nextVersion = (old?.version ?? 0) + 1;
          if (!old)
            await tx.insert(memberRoles).values({
              userId: input.userId,
              role: input.role,
              offices: input.offices,
              homeOffice,
              version: nextVersion,
            });
          else
            await tx
              .update(memberRoles)
              .set({
                role: input.role,
                offices: input.offices,
                homeOffice,
                version: nextVersion,
              })
              .where(eq(memberRoles.userId, input.userId));
          await appendAudit(tx, {
            actor: actor(ctx.user, "admin"),
            entity: "member_membership",
            recordId: String(input.userId),
            action: "membership_assign",
            before: old
              ? {
                  role: old.role,
                  offices: old.offices,
                  homeOffice: old.homeOffice ?? null,
                  version: old.version,
                }
              : null,
            after: {
              role: input.role,
              offices: input.offices,
              homeOffice,
              version: nextVersion,
            },
            beforeVersion: old?.version ?? 0,
            afterVersion: nextVersion,
            requestKey: `member:${input.userId}:${nextVersion}`,
          });
          return {
            userId: input.userId,
            name: target[0].name ?? "",
            email: target[0].email ?? "",
            role: input.role,
            offices: input.offices,
            homeOffice,
            version: nextVersion,
          };
        });
      }),
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
  finance: router({
    snapshot: protectedProcedure
      .input(z.object({ clientUserId: z.string().min(1).max(128) }).optional())
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
  operations: router({
    access: protectedProcedure.query(async ({ ctx }) => {
      const db = await dbOrThrow();
      const scope = await readOfficeScope(db, ctx.user);
      return {
        role: scope.role,
        userId: ctx.user.id,
        offices: scope.offices,
        homeOffice: scope.homeOffice,
      };
    }),

    snapshot: protectedProcedure.query(async ({ ctx }) => {
      const role = await effectiveRole(ctx.user);
      if (!role) throw forbidden();
      if (role === "viewer" || role === "tracking_staff") return emptyState();
      const db = await dbOrThrow();
      const scope = await readOfficeScope(db, ctx.user);
      const rows = await db.select().from(records);
      const state: LocalState = {
        accounts: [],
        shipments: [],
        invoices: [],
        lastSyncedAt: new Date().toISOString(),
      };
      for (const row of rows) {
        if (
          !canReadScopedRecord(
            scope.role,
            scope.offices,
            row.entity as Entity,
            row.data as EntityRecord
          )
        )
          continue;
        // Supervisors receive cargo only; financial/account entities stay out of the operations snapshot.
        if (role === "supervisor" && row.entity !== "shipment") continue;
        if (row.entity === "invoice" && !canViewFinance(role)) continue;
        const record = hideForOfficeScope(
          hiddenCurrent(row, role),
          role,
          scope.offices
        );
        if (row.entity === "account")
          state.accounts.push({
            ...record,
            scope: "shared",
            version: row.version,
          } as LocalState["accounts"][number]);
        else if (row.entity === "shipment")
          state.shipments.push({
            ...record,
            scope: "shared",
            version: row.version,
          } as LocalState["shipments"][number]);
        else
          state.invoices.push({
            ...record,
            scope: "shared",
            version: row.version,
          } as LocalState["invoices"][number]);
      }
      return state;
    }),

    members: protectedProcedure.query(async ({ ctx }) => {
      const role = await effectiveRole(ctx.user);
      if (role !== "admin") throw forbidden();
      const db = await dbOrThrow();
      const rows = await db
        .select({
          userId: users.id,
          openId: users.openId,
          rootRole: users.role,
          name: users.name,
          email: users.email,
          accountType: users.accountType,
          loginMethod: users.loginMethod,
          mustChangePassword: users.mustChangePassword,
          role: memberRoles.role,
        })
        .from(users)
        .leftJoin(memberRoles, eq(memberRoles.userId, users.id));
      return rows.map(row => ({
        userId: row.userId,
        name: row.name ?? "",
        email: row.email ?? "",
        accountType: row.accountType,
        isLocalAccount: row.loginMethod === "email",
        mustChangePassword: Boolean(row.mustChangePassword),
        role:
          row.role ??
          ((ENV.ownerOpenId && row.openId === ENV.ownerOpenId) ||
          row.rootRole === "admin"
            ? "admin"
            : null),
      }));
    }),

    resetPassword: protectedProcedure
      .input(z.object({
        userId: z.number().int().positive(),
        temporaryPassword: z.string().min(8).max(128),
      }).strict())
      .mutation(({ ctx, input }) => resetAccountPassword(ctx, input.userId, input.temporaryPassword)),

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
        const role = await effectiveRole(ctx.user);
        if (!role) throw forbidden();
        // These roles have command-specific APIs and must never receive generic write/replay receipts.
        if (
          role === "viewer" ||
          role === "tracking_staff" ||
          role === "supervisor"
        )
          throw forbidden("Use the tracking API for this role");
        const db = await dbOrThrow();
        const scope = await readOfficeScope(db, ctx.user);
        const output: SyncResult = { applied: [], conflicts: [] };
        await db.transaction(async tx => {
          const office =
            role === "admin" ||
            (role === "accountant" &&
              (scope.offices === null || scope.offices.includes("nouakchott")))
              ? await readOfficeSettings(tx)
              : null;
          for (const rawChange of input.changes) {
            const change = parseChange(rawChange);
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
            if (
              scopeCurrent &&
              !canReadScopedRecord(
                scope.role,
                scope.offices,
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
              if (
                (replay.applied ?? []).some(
                  item =>
                    item.entity !== change.entity ||
                    item.record.id !== change.recordId ||
                    !canReadScopedRecord(
                      scope.role,
                      scope.offices,
                      item.entity,
                      item.record
                    )
                )
              ) {
                output.conflicts.push({
                  changeId: change.id,
                  reason: "previously_applied_access_changed",
                  current: null,
                });
                continue;
              }
              for (const acknowledged of replay.applied ?? []) {
                if (acknowledged.entity === "invoice" && !canViewFinance(role))
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
                    canReadScopedRecord(
                      scope.role,
                      scope.offices,
                      change.entity,
                      item.current
                    )
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
            const currentPublic = current
              ? hideForOfficeScope(
                  hiddenCurrent(current, role),
                  role,
                  scope.offices
                )
              : null;
            let result: SyncResult;
            let financeShipment: Shipment | null = null;
            if (!canWrite(role, change.entity))
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
              try {
                let candidate: EntityRecord = change.data as EntityRecord;
                if (
                  change.entity === "invoice" &&
                  (candidate as any).payment &&
                  !office
                )
                  throw new Error("payment_office_scope_forbidden");
                if (
                  change.entity === "invoice" &&
                  (candidate as any).payment &&
                  (candidate as any).officeId &&
                  (candidate as any).officeId !== "nouakchott"
                )
                  throw new Error("payment_office_mismatch");
                if (
                  change.entity === "invoice" &&
                  office &&
                  (candidate as any).payment !== undefined
                ) {
                  const currentInvoice = current
                    ? (asEntityRecord(current.data) as any)
                    : null;
                  const payment = canonicalInvoicePayment(
                    (candidate as any).payment,
                    currentInvoice,
                    office
                  );
                  candidate = (
                    payment
                      ? ({ ...candidate, payment } as EntityRecord)
                      : candidate
                  ) as EntityRecord;
                }
                nextData = prepareRecordForWrite(
                  role,
                  candidate,
                  current ? asEntityRecord(current.data) : null,
                  change.action
                );
                if (change.entity === "shipment")
                  financeShipment = nextData as Shipment;
                assertOfficeRecordWrite(
                  role,
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
                await tx
                  .insert(syncReceipts)
                  .values({ userId: ctx.user.id, changeId: change.id, result });
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
                  await tx.insert(recordKeys).ignore().values({
                    keyType: idKeyType,
                    keyValue: change.recordId,
                    entity: change.entity,
                    recordId: change.recordId,
                  });
                  if (change.entity === "shipment")
                    await tx
                      .insert(recordKeys)
                      .ignore()
                      .values({
                        keyType: "shipment-tracking",
                        keyValue: normalizeTracking(
                          (nextData as Shipment).tracking
                        ),
                        entity: change.entity,
                        recordId: change.recordId,
                      });
                  await tx.insert(records).ignore().values({
                    entity: change.entity,
                    recordId: change.recordId,
                    version: nextVersion,
                    data: nextData,
                    updatedBy: ctx.user.id,
                  });
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
                          current: after ? hiddenCurrent(after, role) : null,
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
                          record: hiddenCurrent(after, role),
                        },
                      ],
                      conflicts: [],
                    };
                  }
                }
              } else {
                await tx
                  .update(records)
                  .set({
                    version: nextVersion,
                    data: nextData,
                    updatedBy: ctx.user.id,
                  })
                  .where(eq(records.id, current.id));
                const after = (
                  await tx
                    .select()
                    .from(records)
                    .where(eq(records.id, current.id))
                    .limit(1)
                )[0];
                await appendAudit(tx, {
                  actor: actor(ctx.user, role),
                  entity: change.entity,
                  recordId: change.recordId,
                  action: "update",
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
                      record: hiddenCurrent(after, role),
                    },
                  ],
                  conflicts: [],
                };
              }
            }
            if (result.conflicts.length === 0 && financeShipment)
              await maybePostShipmentRevenue(
                tx,
                financeShipment,
                ctx.user,
                undefined,
                scope.role
              );
            await tx
              .insert(syncReceipts)
              .values({ userId: ctx.user.id, changeId: change.id, result });
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
        const search = input.search?.toLocaleLowerCase("ar");
        const rows = await db.select().from(records);
        const matching = rows.filter(row => {
          if (row.entity !== "shipment") return false;
          if (
            !canReadScopedRecord(
              scope.role,
              scope.offices,
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
        if (!canTrackingDetails(role))
          throw forbidden("Tracking detail is not available to viewers");
        const db = await dbOrThrow();
        const scope = await readOfficeScope(db, ctx.user);
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
        if (!row)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Shipment not found",
          });
        if (
          !canReadScopedRecord(
            scope.role,
            scope.offices,
            "shipment",
            row.data as Shipment
          )
        )
          throw branchForbidden();
        return hideForOfficeScope(
          { ...(row.data as Shipment), scope: "shared", version: row.version },
          role,
          scope.offices
        );
      }),

    commit: protectedProcedure
      .input(trackingRequestSchema)
      .mutation(async ({ ctx, input }) => {
        const role = await effectiveRole(ctx.user);
        if (!role || !canTrackingDetails(role))
          throw forbidden("Tracking command is not available to viewers");
        const request = parseTrackingRequest(input);
        if (role === "office_manager" && request.command.type === "transfer")
          throw forbidden("Only the general manager may transfer shipments for this role");
        const db = await dbOrThrow();
        const scope = await readOfficeScope(db, ctx.user);
        try {
          return await db.transaction(async tx => {
            const receiptKey = trackingReceiptKey(request.requestId);
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
            if (!scopeRows[0]) throw new Error("tracking_not_found");
            if (
              !canReadScopedRecord(
                scope.role,
                scope.offices,
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
                  eq(syncReceipts.userId, ctx.user.id),
                  eq(syncReceipts.changeId, receiptKey)
                )
              )
              .limit(1)
              .for("update");
            if (existing[0]) {
              const old = existing[0].result as {
                requestId: string;
                shipment: Shipment;
                version: number;
              };
              if (
                old.shipment.id !== request.shipmentId ||
                !canReadScopedRecord(
                  scope.role,
                  scope.offices,
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
              !canReadScopedRecord(
                scope.role,
                scope.offices,
                "shipment",
                row.data as Shipment
              )
            )
              throw new Error("tracking_forbidden");
            if (
              scope.role !== "admin" &&
              scope.offices !== null &&
              !canWriteOfficeRecord(
                scope.role,
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
              actor(ctx.user, role)
            );
            const nextVersion = row.version + 1;
            await tx
              .update(records)
              .set({
                version: nextVersion,
                data: mutation.shipment,
                updatedBy: ctx.user.id,
              })
              .where(eq(records.id, row.id));
            await maybePostShipmentRevenue(
              tx,
              mutation.shipment,
              ctx.user,
              undefined,
              role
            );
            await appendAudit(tx, {
              actor: actor(ctx.user, role),
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
            await tx
              .insert(syncReceipts)
              .values({ userId: ctx.user.id, changeId: receiptKey, result });
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
        if (!canSuperviseTracking(role)) throw forbidden();
        const db = await dbOrThrow();
        const scope = await readOfficeScope(db, ctx.user);
        const search = input.search?.toLocaleLowerCase("ar");
        const rows = await db.select().from(records);
        return rows
          .filter(
            row =>
              row.entity === "shipment" &&
              canReadScopedRecord(
                scope.role,
                scope.offices,
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
        if (role !== "admin" && role !== "supervisor" && role !== "office_manager")
          throw forbidden("Audit access is restricted");
        const db = await dbOrThrow();
        if (role !== "admin") {
          if (!input.shipmentId)
            throw forbidden("Shipment-specific audit access is required");
          const scope = await readOfficeScope(db, ctx.user);
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
            !canReadScopedRecord(
              scope.role,
              scope.offices,
              "shipment",
              row.data as Shipment
            )
          )
            throw forbidden();
        }
        return readAudit(db, role, input);
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
        if (role !== "admin" && role !== "supervisor" && role !== "office_manager")
          throw forbidden("Audit access is restricted");
        const db = await dbOrThrow();
        if (role !== "admin") {
          if (!input.shipmentId)
            throw forbidden("Shipment-specific audit access is required");
          const scope = await readOfficeScope(db, ctx.user);
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
            !canReadScopedRecord(
              scope.role,
              scope.offices,
              "shipment",
              row.data as Shipment
            )
          )
            throw forbidden();
        }
        return readAudit(db, role, input);
      }),
  }),

  office: router({
    public: publicProcedure.query(async () => {
      const db = await dbOrThrow();
      return publicOfficeSettings(await readOfficeSettings(db));
    }),
    get: protectedProcedure.query(async ({ ctx }) => {
      const role = await effectiveRole(ctx.user);
      if (!role || role === "viewer" || role === "tracking_staff")
        throw forbidden();
      const db = await dbOrThrow();
      const scope = await readOfficeScope(db, ctx.user);
      if (
        role !== "admin" &&
        scope.offices !== null &&
        !scope.offices.includes("nouakchott")
      )
        throw forbidden("Nouakchott accounting scope required");
      return readOfficeSettings(db);
    }),
    update: protectedProcedure
      .input(officeUpdateSchema)
      .mutation(async ({ ctx, input }) => {
        const role = await effectiveRole(ctx.user);
        if (role !== "admin") throw forbidden();
        const db = await dbOrThrow();
        return db.transaction(async tx => {
          const rows = await tx
            .select()
            .from(officeSettings)
            .where(eq(officeSettings.id, 1))
            .limit(1)
            .for("update");
          const current = rows[0];
          if (current && current.version !== input.expectedVersion) {
            const currentSettings = settingsWithVersion(current);
            if (
              currentSettings.office === input.office &&
              sameOfficeMethods(currentSettings.methods, input.methods)
            )
              return {
                office: currentSettings.office,
                methods: currentSettings.methods,
                version: currentSettings.version,
              };
            throw new TRPCError({
              code: "CONFLICT",
              message: "office_settings_version_conflict",
            });
          }
          if (!current && input.expectedVersion !== 0)
            throw new TRPCError({
              code: "CONFLICT",
              message: "office_settings_version_conflict",
            });
          const oldSettings = current
            ? settingsWithVersion(current)
            : { office: "nouakchott" as const, methods: [], version: 0 };
          if (current) {
            const ids = new Set(
              (current.methods as any[]).map(method => method.id)
            );
            if (
              [...ids].some(
                id => !input.methods.some(method => method.id === id)
              )
            )
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "payment_method_removal_forbidden",
              });
          }
          const nextVersion = (current?.version ?? 0) + 1;
          if (!current)
            await tx.insert(officeSettings).values({
              id: 1,
              office: input.office,
              methods: input.methods,
              version: nextVersion,
              updatedBy: ctx.user.id,
            });
          else
            await tx
              .update(officeSettings)
              .set({
                office: input.office,
                methods: input.methods,
                version: nextVersion,
                updatedBy: ctx.user.id,
              })
              .where(eq(officeSettings.id, 1));
          await appendAudit(tx, {
            actor: actor(ctx.user, "admin"),
            entity: "office_settings",
            recordId: "nouakchott",
            action: "office_settings_update",
            before: oldSettings,
            after: {
              office: input.office,
              methods: input.methods,
              version: nextVersion,
            },
            beforeVersion: current?.version ?? 0,
            afterVersion: nextVersion,
            requestKey: `office:${nextVersion}:${ctx.user.id}`,
          });
          return {
            office: input.office,
            methods: input.methods,
            version: nextVersion,
          };
        });
      }),
  }),
});

export type AppRouter = typeof appRouter;
