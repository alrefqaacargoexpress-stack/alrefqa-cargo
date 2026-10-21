import { and, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { normalizeTracking } from "@shared/packing";
import type { AppRole, Entity, EntityRecord, LocalState, SyncResult } from "@shared/operations";
import { canViewFinance } from "@shared/operations";
import { memberRoles, recordKeys, records, syncReceipts, users } from "../drizzle/schema";
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

const unavailable = () => new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available" });

async function dbOrThrow() {
  const db = await getDb();
  if (!db) throw unavailable();
  return db;
}

async function membershipRole(userId: number): Promise<AppRole | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select({ role: memberRoles.role }).from(memberRoles).where(eq(memberRoles.userId, userId)).limit(1);
  return result[0]?.role ?? null;
}

async function effectiveRole(user: Pick<User, "id" | "openId" | "role">): Promise<AppRole | null> {
  return roleForUser(user, await membershipRole(user.id));
}

function forbidden(message = "Insufficient application role") {
  return new TRPCError({ code: "FORBIDDEN", message });
}

function asEntityRecord(data: unknown): EntityRecord {
  return data as EntityRecord;
}

function hiddenCurrent(row: { entity: Entity; recordId: string; version: number; data: unknown }, role: AppRole | null): EntityRecord {
  return publicRecord({ entity: row.entity, recordId: row.recordId, version: row.version, data: asEntityRecord(row.data) }, role);
}

function oneResult(result: SyncResult, changeId: string, role: AppRole | null) {
  const applied = result.applied.find(item => item.changeId === changeId);
  const conflict = result.conflicts.find(item => item.changeId === changeId);
  return {
    applied: applied ? [{ ...applied, record: hideFinance(applied.record, role) }] : [],
    conflicts: conflict ? [{ ...conflict, current: conflict.current ? hideFinance(conflict.current, role) : null }] : [],
  } satisfies SyncResult;
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
      const db = await dbOrThrow();
      const rows = await db.select().from(records);
      const state: LocalState = { accounts: [], shipments: [], invoices: [], lastSyncedAt: new Date().toISOString() };
      for (const row of rows) {
        if (row.entity === "invoice" && !canViewFinance(role)) continue;
        const record = hiddenCurrent(row, role);
        if (row.entity === "account") state.accounts.push({ ...record, scope: "shared", version: row.version } as LocalState["accounts"][number]);
        else if (row.entity === "shipment") state.shipments.push({ ...record, scope: "shared", version: row.version } as LocalState["shipments"][number]);
        else state.invoices.push({ ...record, scope: "shared", version: row.version } as LocalState["invoices"][number]);
      }
      return state;
    }),

    members: protectedProcedure.query(async ({ ctx }) => {
      const role = await effectiveRole(ctx.user);
      if (role !== "admin") throw forbidden();
      const db = await dbOrThrow();
      const rows = await db.select({ userId: users.id, openId: users.openId, rootRole: users.role, name: users.name, email: users.email, role: memberRoles.role })
        .from(users).leftJoin(memberRoles, eq(memberRoles.userId, users.id));
      return rows.map(row => ({
        userId: row.userId,
        name: row.name ?? "",
        email: row.email ?? "",
        role: row.role ?? ((ENV.ownerOpenId && row.openId === ENV.ownerOpenId) || row.rootRole === "admin" ? "admin" : null),
      }));
    }),

    setRole: protectedProcedure.input(setRoleInputSchema).mutation(async ({ ctx, input }) => {
      const actorRole = await effectiveRole(ctx.user);
      if (!canManageMembers(ctx.user, actorRole)) throw forbidden("Only the owner or an admin may assign roles");
      const db = await dbOrThrow();
      const target = await db.select({ id: users.id, openId: users.openId, role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1);
      if (!target[0]) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      if ((ENV.ownerOpenId && target[0].openId === ENV.ownerOpenId) || target[0].role === "admin") {
        throw forbidden("The project owner/root admin cannot be changed");
      }
      await db.insert(memberRoles).values({ userId: input.userId, role: input.role }).onDuplicateKeyUpdate({ set: { role: input.role } });
      return { userId: input.userId, role: input.role };
    }),

    sync: protectedProcedure.input(syncInputSchema).mutation(async ({ ctx, input }) => {
      const role = await effectiveRole(ctx.user);
      if (!role) throw forbidden();
      const db = await dbOrThrow();
      const output: SyncResult = { applied: [], conflicts: [] };
      await db.transaction(async tx => {
        for (const rawChange of input.changes) {
          const change = parseChange(rawChange);
          const existingReceipt = await tx.select().from(syncReceipts)
            .where(and(eq(syncReceipts.userId, ctx.user.id), eq(syncReceipts.changeId, change.id))).limit(1).for("update");
          if (existingReceipt[0]) {
            const replay = existingReceipt[0].result as unknown as SyncResult;
            for (const acknowledged of replay.applied ?? []) {
              if (acknowledged.entity === "invoice" && !canViewFinance(role)) output.conflicts.push({ changeId: acknowledged.changeId, reason: "previously_applied_access_changed", current: null });
            }
            output.applied.push(...(replay.applied ?? []).filter(item => item.entity !== "invoice" || canViewFinance(role)).map(item => ({ ...item, record: hideFinance(item.record, role) })));
            output.conflicts.push(...(replay.conflicts ?? []).map(item => ({ ...item, current: item.current && (change.entity !== "invoice" || canViewFinance(role)) ? hideFinance(item.current, role) : null })));
            continue;
          }

          const currentRows = await tx.select().from(records).where(and(eq(records.entity, change.entity), eq(records.recordId, change.recordId))).limit(1).for("update");
          const current = currentRows[0] ?? null;
          const currentPublic = current && (change.entity !== "invoice" || canViewFinance(role)) ? hiddenCurrent(current, role) : null;
          let result: SyncResult;
          if (!role || !((role === "admin") || (role === "staff" && change.entity !== "invoice") || (role === "accountant" && change.entity !== "shipment"))) {
            result = { applied: [], conflicts: [{ changeId: change.id, reason: "forbidden", current: currentPublic }] };
          } else if (role === "staff" && isFinancialPayloadNonZero(change) && !current) {
            result = { applied: [], conflicts: [{ changeId: change.id, reason: "financial_write_forbidden", current: null }] };
          } else if (change.expectedVersion !== null && (!current || current.version !== change.expectedVersion)) {
            result = { applied: [], conflicts: [{ changeId: change.id, reason: "version_conflict", current: currentPublic }] };
          } else if (change.expectedVersion === null && current) {
            result = { applied: [], conflicts: [{ changeId: change.id, reason: "already_exists", current: currentPublic }] };
          } else if (current && change.entity === "shipment" && (current.data as { tracking?: string }).tracking !== (change.data as { tracking?: string }).tracking) {
            result = { applied: [], conflicts: [{ changeId: change.id, reason: "tracking_change_forbidden", current: currentPublic }] };
          } else {
            let nextData: EntityRecord;
            try { nextData = prepareRecordForWrite(role, change.data, current ? asEntityRecord(current.data) : null); }
            catch (error) {
              const rejection: SyncResult = { applied: [], conflicts: [{ changeId: change.id, reason: error instanceof Error ? error.message : "invalid_packing", current: currentPublic }] };
              await tx.insert(syncReceipts).values({ userId: ctx.user.id, changeId: change.id, result: rejection });
              output.conflicts.push(...rejection.conflicts);
              continue;
            }
            const nextVersion = current ? current.version + 1 : 1;
            if (!current) {
              const idKeyType = `${change.entity}-id` as "account-id" | "shipment-id" | "invoice-id";
              const keyConflict = await tx.select().from(recordKeys).where(and(eq(recordKeys.keyType, idKeyType), eq(recordKeys.keyValue, change.recordId))).limit(1).for("update");
              const trackingConflict = change.entity === "shipment" ? await tx.select().from(recordKeys).where(and(eq(recordKeys.keyType, "shipment-tracking"), sql`lower(trim(${recordKeys.keyValue})) = ${normalizeTracking((change.data as { tracking: string }).tracking)}`)).limit(1).for("update") : [];
              if ((keyConflict[0] && keyConflict[0].recordId !== change.recordId) || (trackingConflict[0] && trackingConflict[0].recordId !== change.recordId)) {
                result = { applied: [], conflicts: [{ changeId: change.id, reason: "identifier_conflict", current: null }] };
              } else {
                await tx.insert(recordKeys).ignore().values({ keyType: idKeyType, keyValue: change.recordId, entity: change.entity, recordId: change.recordId });
                if (change.entity === "shipment") {
                  await tx.insert(recordKeys).ignore().values({ keyType: "shipment-tracking", keyValue: normalizeTracking((change.data as { tracking: string }).tracking), entity: change.entity, recordId: change.recordId });
                }
                const verifiedKey = await tx.select().from(recordKeys).where(and(eq(recordKeys.keyType, idKeyType), eq(recordKeys.keyValue, change.recordId))).limit(1);
                const verifiedTracking = change.entity === "shipment" ? await tx.select().from(recordKeys).where(and(eq(recordKeys.keyType, "shipment-tracking"), sql`lower(trim(${recordKeys.keyValue})) = ${normalizeTracking((change.data as { tracking: string }).tracking)}`)).limit(1) : [];
                if ((verifiedKey[0] && verifiedKey[0].recordId !== change.recordId) || (verifiedTracking[0] && verifiedTracking[0].recordId !== change.recordId)) {
                  result = { applied: [], conflicts: [{ changeId: change.id, reason: "identifier_conflict", current: null }] };
                } else {
                await tx.insert(records).ignore().values({ entity: change.entity, recordId: change.recordId, version: nextVersion, data: nextData, updatedBy: ctx.user.id });
                const after = (await tx.select().from(records).where(and(eq(records.entity, change.entity), eq(records.recordId, change.recordId))).limit(1))[0];
                if (!after || after.updatedBy !== ctx.user.id) result = { applied: [], conflicts: [{ changeId: change.id, reason: "identifier_conflict", current: after ? hiddenCurrent(after, role) : null }] };
                else result = { applied: [{ changeId: change.id, entity: change.entity, record: hiddenCurrent(after, role) }], conflicts: [] };
                }
              }
            } else {
              await tx.update(records).set({ version: nextVersion, data: nextData, updatedBy: ctx.user.id }).where(eq(records.id, current.id));
              const after = (await tx.select().from(records).where(eq(records.id, current.id)).limit(1))[0];
              result = { applied: [{ changeId: change.id, entity: change.entity, record: hiddenCurrent(after, role) }], conflicts: [] };
            }
          }
          await tx.insert(syncReceipts).values({ userId: ctx.user.id, changeId: change.id, result });
          output.applied.push(...result.applied);
          output.conflicts.push(...result.conflicts);
        }
      });
      return output;
    }),
  }),
});

export type AppRouter = typeof appRouter;
