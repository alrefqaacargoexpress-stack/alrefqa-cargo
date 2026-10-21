import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
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
import { canViewFinance, canWrite, EMPTY_STATE } from "@shared/operations";
import { officeSettingsSchema } from "@shared/office";
import {
  memberRoles,
  recordKeys,
  records,
  syncReceipts,
  users,
  officeSettings,
} from "../drizzle/schema";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { ENV } from "./_core/env";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
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
  readOfficeSettings,
  settingsWithVersion,
} from "./office";
import { emptyState } from "./operations";

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
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  operations: router({
    access: protectedProcedure.query(async ({ ctx }) => ({
      role: await effectiveRole(ctx.user),
      userId: ctx.user.id,
    })),

    snapshot: protectedProcedure.query(async ({ ctx }) => {
      const role = await effectiveRole(ctx.user);
      if (!role) throw forbidden();
      if (role === "viewer" || role === "tracking_staff") return emptyState();
      const db = await dbOrThrow();
      const rows = await db.select().from(records);
      const state: LocalState = {
        accounts: [],
        shipments: [],
        invoices: [],
        lastSyncedAt: new Date().toISOString(),
      };
      for (const row of rows) {
        // Supervisors receive cargo only; financial/account entities stay out of the operations snapshot.
        if (role === "supervisor" && row.entity !== "shipment") continue;
        if (row.entity === "invoice" && !canViewFinance(role)) continue;
        const record = hiddenCurrent(row, role);
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
          role: memberRoles.role,
        })
        .from(users)
        .leftJoin(memberRoles, eq(memberRoles.userId, users.id));
      return rows.map(row => ({
        userId: row.userId,
        name: row.name ?? "",
        email: row.email ?? "",
        role:
          row.role ??
          ((ENV.ownerOpenId && row.openId === ENV.ownerOpenId) ||
          row.rootRole === "admin"
            ? "admin"
            : null),
      }));
    }),

    setRole: protectedProcedure
      .input(setRoleInputSchema)
      .mutation(async ({ ctx, input }) => {
        const actorRole = await effectiveRole(ctx.user);
        if (!canManageMembers(ctx.user, actorRole))
          throw forbidden("Only the owner or an admin may assign roles");
        const db = await dbOrThrow();
        return db.transaction(async tx => {
          const target = await tx
            .select({ id: users.id, openId: users.openId, role: users.role })
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
            throw forbidden("The project owner/root admin cannot be changed");
          const previous = await tx
            .select({ role: memberRoles.role })
            .from(memberRoles)
            .where(eq(memberRoles.userId, input.userId))
            .limit(1);
          await tx
            .insert(memberRoles)
            .values({ userId: input.userId, role: input.role })
            .onDuplicateKeyUpdate({ set: { role: input.role } });
          await appendAudit(tx, {
            actor: actor(ctx.user, "admin"),
            entity: "member_role",
            recordId: String(input.userId),
            action: "role_set",
            before: { role: previous[0]?.role ?? null },
            after: { role: input.role },
            requestKey: `role:${input.userId}:${input.role}:${Date.now()}`,
          });
          return { userId: input.userId, role: input.role };
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
        const output: SyncResult = { applied: [], conflicts: [] };
        await db.transaction(async tx => {
          const office =
            role === "admin" || role === "accountant"
              ? await readOfficeSettings(tx)
              : null;
          for (const rawChange of input.changes) {
            const change = parseChange(rawChange);
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
                    record: hideFinance(item.record, role),
                  }))
              );
              output.conflicts.push(
                ...(replay.conflicts ?? []).map(item => ({
                  ...item,
                  current:
                    item.current &&
                    (change.entity !== "invoice" || canViewFinance(role))
                      ? hideFinance(item.current, role)
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
            const currentPublic = current ? hiddenCurrent(current, role) : null;
            let result: SyncResult;
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
                let candidate = change.data;
                if (change.entity === "invoice" && office) {
                  const currentInvoice = current
                    ? (asEntityRecord(current.data) as any)
                    : null;
                  const payment = canonicalInvoicePayment(
                    (candidate as any).payment,
                    currentInvoice,
                    office
                  );
                  candidate = payment
                    ? ({ ...candidate, payment } as EntityRecord)
                    : ({ ...candidate, payment: undefined } as EntityRecord);
                }
                nextData = prepareRecordForWrite(
                  role,
                  candidate,
                  current ? asEntityRecord(current.data) : null,
                  change.action
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
        const search = input.search?.toLocaleLowerCase("ar");
        const rows = await db.select().from(records);
        const matching = rows.filter(row => {
          if (row.entity !== "shipment") return false;
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
        return hideFinance(
          { ...(row.data as Shipment), scope: "shared", version: row.version },
          role
        );
      }),

    commit: protectedProcedure
      .input(trackingRequestSchema)
      .mutation(async ({ ctx, input }) => {
        const role = await effectiveRole(ctx.user);
        if (!role || !canTrackingDetails(role))
          throw forbidden("Tracking command is not available to viewers");
        const request = parseTrackingRequest(input);
        const db = await dbOrThrow();
        try {
          return await db.transaction(async tx => {
            const receiptKey = trackingReceiptKey(request.requestId);
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
              return {
                requestId: old.requestId,
                shipment: hideFinance(old.shipment, role),
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
              shipment: hideFinance(result.shipment, role),
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
        const search = input.search?.toLocaleLowerCase("ar");
        const rows = await db.select().from(records);
        return rows
          .filter(
            row =>
              row.entity === "shipment" &&
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
        if (role !== "admin" && role !== "supervisor")
          throw forbidden("Audit access is restricted");
        return readAudit(await dbOrThrow(), role, input);
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
        if (role !== "admin" && role !== "supervisor")
          throw forbidden("Audit access is restricted");
        const db = await dbOrThrow();
        return readAudit(db, role, input);
      }),
  }),

  office: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const role = await effectiveRole(ctx.user);
      if (!role || role === "viewer" || role === "tracking_staff")
        throw forbidden();
      return readOfficeSettings(await dbOrThrow());
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
          if (current && current.version !== input.expectedVersion)
            throw new TRPCError({
              code: "CONFLICT",
              message: "office_settings_version_conflict",
            });
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
