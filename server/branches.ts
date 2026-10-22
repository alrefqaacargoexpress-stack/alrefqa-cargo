import { protectOfficeShipmentFinance } from "@shared/officeFinanceVisibility";
import { createHash } from "node:crypto";
import {
  mergeOfficeProfile,
  sameOfficeProfile,
  OfficeProfileMergeConflict,
} from "@shared/officeProfileMerge";
import { journeySchema } from "@shared/tracking";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  defaultOfficeProfile,
  officeIdSchema,
  officeIds,
  officeMembershipSchema,
  officeProfileSchema,
  type OfficeId,
  type OfficeMember,
  type OfficeProfile,
  type VersionedOfficeProfile,
  ownerOffice,
} from "@shared/branches";
import type {
  AppRole,
  Entity,
  EntityRecord,
  Shipment,
  Account,
  Invoice,
} from "@shared/operations";
import { canViewFinance } from "@shared/operations";
import {
  records,
  memberRoles,
  officeProfiles,
  syncReceipts,
  users,
} from "../drizzle/schema";
import type { User } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { appendAudit } from "./audit";
import { hideFinance, publicRecord, roleForUser } from "./operations";
import { actorFromUser } from "./tracking";

export type OfficeScope = {
  role: AppRole | null;
  offices: OfficeId[] | null;
  homeOffice: OfficeId | null;
  membershipVersion: number;
  canUpdateTracking?: boolean;
};
export const officeProfileUpdateSchema = officeProfileSchema.safeExtend({
  expectedVersion: z.number().int().nonnegative(),
  baseProfile: officeProfileSchema.optional(),
});
export const assignRecordSchema = z
  .object({
    entity: z.enum(["account", "shipment", "invoice"]),
    recordId: z.string().trim().min(1).max(128),
    officeId: officeIdSchema,
    expectedVersion: z.number().int().positive(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
export const confirmArrivalSchema = z
  .object({
    shipmentId: z.string().trim().min(1).max(128),
    expectedVersion: z.number().int().positive(),
    requestId: z.string().trim().min(1).max(128).optional(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export function rootAdmin(user: Pick<User, "openId" | "role">): boolean {
  return Boolean(
    (ENV.ownerOpenId && user.openId === ENV.ownerOpenId) ||
      user.role === "admin"
  );
}

export async function readOfficeScope(
  db: any,
  user: Pick<User, "id" | "openId" | "role">
): Promise<OfficeScope> {
  const rows = await db
    .select()
    .from(memberRoles)
    .where(eq(memberRoles.userId, user.id))
    .limit(1);
  const membership = rows[0] as typeof memberRoles.$inferSelect | undefined;
  const role = roleForUser(user, membership?.role ?? null);
  // Root admins remain global even if a stale member row exists.
  if (role === "admin" || rootAdmin(user))
    return {
      role: "admin",
      offices: null,
      homeOffice: null,
      membershipVersion: membership?.version ?? 0,
      canUpdateTracking: true,
    };
  const offices = membership?.offices;
  if (role === "office_manager" || role === "staff" || role === "accountant") {
    const valid =
      Array.isArray(offices) &&
      offices.length === 1 &&
      officeIds.includes(offices[0]) &&
      (role !== "office_manager" || offices[0] !== "nouakchott") &&
      (!membership?.homeOffice || membership.homeOffice === offices[0]);
    return {
      role,
      offices: valid ? [offices[0] as OfficeId] : [],
      homeOffice: valid ? (offices[0] as OfficeId) : null,
      membershipVersion: membership?.version ?? 0,
      canUpdateTracking:
        role === "office_manager" ||
        Boolean(
          valid &&
            role === "staff" &&
            offices[0] !== "nouakchott" &&
            membership?.canUpdateTracking
        ),
    };
  }
  return {
    role,
    offices:
      offices === null || offices === undefined
        ? []
        : Array.isArray(offices)
          ? (offices as OfficeId[])
          : [],
    homeOffice:
      membership?.homeOffice &&
      officeIds.includes(membership.homeOffice as OfficeId)
        ? (membership.homeOffice as OfficeId)
        : Array.isArray(offices) && offices.length === 1
          ? (offices[0] as OfficeId)
          : null,
    membershipVersion: membership?.version ?? 0,
    canUpdateTracking: role === "tracking_staff" || role === "supervisor",
  };
}

export function officeIsAssigned(
  scope: OfficeScope,
  officeId: OfficeId
): boolean {
  return scope.role === "admin" || Boolean(scope.offices?.includes(officeId));
}
export function recordVisibleInOffice(
  scope: OfficeScope,
  officeId: OfficeId,
  entity: Entity,
  record: EntityRecord
): boolean {
  if (!scope.role) return false;
  if (scope.role === "staff" && entity !== "shipment") return false;
  if (!officeIsAssigned(scope, officeId)) return false;
  if (scope.role === "office_manager")
    return ownerOffice(entity, record) === officeId;
  if (entity === "shipment") {
    const shipment = record as Shipment;
    const offices = new Set<OfficeId>();
    if (shipment.officeId) offices.add(shipment.officeId);
    if (shipment.packing?.source)
      offices.add(shipment.packing.source as OfficeId);
    if (
      shipment.journey?.branch &&
      officeIds.includes(shipment.journey.branch as OfficeId)
    )
      offices.add(shipment.journey.branch as OfficeId);
    if (
      ["to_nouakchott", "arrived_office"].includes(
        shipment.journey?.stage ?? ""
      )
    )
      offices.add("nouakchott");
    return offices.has(officeId);
  }
  return record.officeId === officeId;
}
export function recordVisible(
  scope: OfficeScope,
  entity: Entity,
  record: EntityRecord
): boolean {
  if (!scope.role) return false;
  if (scope.role === "admin") return true;
  if (scope.offices === null) return false;
  return officeIds.some(
    id =>
      scope.offices?.includes(id) &&
      recordVisibleInOffice(scope, id, entity, record)
  );
}
export function recordWritable(
  scope: OfficeScope,
  entity: Entity,
  record: EntityRecord
): boolean {
  if (!scope.role) return false;
  if (scope.role === "admin") return true;
  if (scope.offices === null) return false;
  if (
    scope.role === "staff" &&
    (entity !== "shipment" || scope.homeOffice === "nouakchott")
  )
    return false;
  const home =
    record.officeId ??
    (entity === "shipment" ? (record as Shipment).packing?.source : undefined);
  return Boolean(home && scope.offices.includes(home as OfficeId));
}

export function hideForOfficeScope<T extends EntityRecord>(
  record: T,
  role: AppRole | null,
  offices: OfficeId[] | null
): T {
  if (
    (role === "accountant" || role === "office_manager") &&
    offices !== null &&
    "tracking" in record
  ) {
    return protectOfficeShipmentFinance(record as Shipment, role, offices) as T;
  }
  return hideFinance(record, role);
}

async function readProfileRows(db: any): Promise<VersionedOfficeProfile[]> {
  const rows = await db.select().from(officeProfiles);
  const byOffice = new Map<string, any>(rows.map((r: any) => [r.officeId, r]));
  return officeIds.map(officeId => {
    const row = byOffice.get(officeId);
    if (!row) return defaultOfficeProfile(officeId);
    try {
      const profile = officeProfileSchema.parse(row.profile);
      return { ...profile, officeId, version: row.version };
    } catch {
      throw new Error("invalid_office_profile");
    }
  });
}
export async function publicProfiles(
  db?: any
): Promise<VersionedOfficeProfile[]> {
  if (!db) return officeIds.map(defaultOfficeProfile);
  return readProfileRows(db);
}
export async function readProfile(
  db: any,
  officeId: OfficeId
): Promise<VersionedOfficeProfile> {
  const profiles = await readProfileRows(db);
  return profiles.find(p => p.officeId === officeId)!;
}

export function memberFromRow(row: any): OfficeMember {
  const legacyRoot =
    (ENV.ownerOpenId && row.openId === ENV.ownerOpenId) ||
    row.rootRole === "admin";
  const role = legacyRoot ? "admin" : (row.memberRole ?? null);
  return {
    userId: row.userId,
    name: row.name ?? "",
    email: row.email ?? "",
    accountType: row.accountType,
    isLocalAccount: row.loginMethod === "email" && Boolean(row.passwordHash),
    mustChangePassword: Boolean(row.mustChangePassword),
    role,
    offices:
      row.offices === null || row.offices === undefined
        ? null
        : (row.offices as OfficeId[]),
    homeOffice:
      row.homeOffice && officeIds.includes(row.homeOffice as OfficeId)
        ? (row.homeOffice as OfficeId)
        : null,
    canUpdateTracking: Boolean(row.canUpdateTracking),
    version: row.version ?? 0,
  };
}

export async function listMembers(db: any): Promise<OfficeMember[]> {
  const rows = await db
    .select({
      userId: users.id,
      openId: users.openId,
      rootRole: users.role,
      name: users.name,
      email: users.email,
      accountType: users.accountType,
      loginMethod: users.loginMethod,
      passwordHash: users.passwordHash,
      mustChangePassword: users.mustChangePassword,
      memberRole: memberRoles.role,
      offices: memberRoles.offices,
      homeOffice: memberRoles.homeOffice,
      canUpdateTracking: memberRoles.canUpdateTracking,
      version: memberRoles.version,
    })
    .from(users)
    .leftJoin(memberRoles, eq(memberRoles.userId, users.id));
  return rows.map(memberFromRow);
}

export function branchForbidden(message = "Insufficient branch scope") {
  return new TRPCError({ code: "FORBIDDEN", message });
}
export function branchConflict(message = "branch_version_conflict") {
  return new TRPCError({ code: "CONFLICT", message });
}

export async function dashboardData(
  db: any,
  scope: OfficeScope,
  officeId: OfficeId
) {
  if (!scope.role || scope.role === "viewer")
    throw branchForbidden("Dashboard is not available to viewers");
  if (!officeIsAssigned(scope, officeId)) throw branchForbidden();
  const profile = await readProfile(db, officeId);
  const rows = await db.select().from(records);
  const shipments: Shipment[] = [];
  const accounts: Account[] = [];
  const invoices: Invoice[] = [];
  for (const row of rows) {
    const data = row.data as EntityRecord;
    if (!recordVisibleInOffice(scope, officeId, row.entity as Entity, data))
      continue;
    if (row.entity === "shipment")
      shipments.push(
        hideForOfficeScope(
          { ...data, scope: "shared", version: row.version } as Shipment,
          scope.role,
          scope.offices
        )
      );
    else if (row.entity === "account" && canViewFinance(scope.role))
      accounts.push({
        ...data,
        scope: "shared",
        version: row.version,
      } as Account);
    else if (row.entity === "invoice" && canViewFinance(scope.role))
      invoices.push({
        ...data,
        scope: "shared",
        version: row.version,
      } as Invoice);
  }
  return {
    profile,
    shipments,
    accounts,
    invoices,
    financial: canViewFinance(scope.role),
  };
}

export async function updateProfile(
  db: any,
  user: User,
  input: z.infer<typeof officeProfileUpdateSchema>,
  actorRole: AppRole = "admin"
) {
  return db.transaction(async (tx: any) => {
    const rows = await tx
      .select()
      .from(officeProfiles)
      .where(eq(officeProfiles.officeId, input.officeId))
      .limit(1)
      .for("update");
    const current = rows[0];
    const expected = current?.version ?? 0;
    const {
      expectedVersion: _expectedVersion,
      baseProfile,
      ...profilePayload
    } = input;
    const requested = officeProfileSchema.parse(profilePayload);
    const { version: _defaultVersion, ...emptyProfile } = defaultOfficeProfile(
      input.officeId
    );
    const saved = current
      ? officeProfileSchema.parse(current.profile)
      : emptyProfile;
    if (
      expected !== input.expectedVersion &&
      !baseProfile &&
      !sameOfficeProfile(saved, requested)
    )
      throw branchConflict("office_profile_version_conflict");
    let profile: OfficeProfile;
    try {
      profile = baseProfile
        ? mergeOfficeProfile(saved, requested, baseProfile)
        : officeProfileSchema.parse({ ...saved, ...requested });
    } catch (error) {
      if (error instanceof OfficeProfileMergeConflict)
        throw branchConflict(
          `office_profile_version_conflict:${error.fields.join(",")}`
        );
      if (
        error instanceof Error &&
        error.message === "office_profile_base_mismatch"
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "office_profile_base_mismatch",
        });
      throw error;
    }
    if (current && sameOfficeProfile(saved, profile))
      return { ...saved, version: expected };
    const nextVersion = expected + 1;
    const values = {
      officeId: input.officeId,
      version: nextVersion,
      profile,
      updatedBy: user.id,
    };
    if (current)
      await tx
        .update(officeProfiles)
        .set(values)
        .where(eq(officeProfiles.officeId, input.officeId));
    else await tx.insert(officeProfiles).values(values);
    await appendAudit(tx, {
      actor: {
        id: user.id,
        name: user.name?.trim() || `user-${user.id}`,
        role: actorRole,
      },
      entity: "office_profile",
      recordId: input.officeId,
      action: "profile_update",
      before: current?.profile ?? defaultOfficeProfile(input.officeId),
      after: profile,
      beforeVersion: expected,
      afterVersion: nextVersion,
      requestKey: `office-profile:${input.officeId}:${nextVersion}`,
    });
    return { ...profile, version: nextVersion };
  });
}

export async function confirmArrival(
  db: any,
  user: User,
  scope: OfficeScope,
  input: z.infer<typeof confirmArrivalSchema>
) {
  if (!scope.role || (scope.role !== "admin" && scope.role !== "supervisor"))
    throw branchForbidden("Warehouse arrival is restricted");
  if (
    scope.role !== "admin" &&
    scope.offices !== null &&
    !scope.offices.includes("nouakchott")
  )
    throw branchForbidden("Nouakchott assignment required");
  return db.transaction(async (tx: any) => {
    const payloadHash = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
    const receiptKey = `arrival:${createHash("sha256")
      .update(input.requestId ?? `${input.shipmentId}:${input.expectedVersion}`)
      .digest("hex")}`;
    const prior = await tx
      .select()
      .from(syncReceipts)
      .where(
        and(
          eq(syncReceipts.userId, user.id),
          eq(syncReceipts.changeId, receiptKey)
        )
      )
      .limit(1)
      .for("update");
    if (prior[0]) {
      const replay = prior[0].result as any;
      if (replay.payloadHash !== payloadHash)
        throw new Error("arrival_request_reuse");
      if (replay?.shipment?.id !== input.shipmentId)
        throw new Error("arrival_receipt_mismatch");
      if (!recordVisible(scope, "shipment", replay.shipment))
        throw branchForbidden();
      return {
        requestId: replay.requestId,
        version: replay.version,
        shipment: hideForOfficeScope(
          replay.shipment,
          scope.role,
          scope.offices
        ),
      };
    }
    const rows = await tx
      .select()
      .from(records)
      .where(
        and(
          eq(records.entity, "shipment"),
          eq(records.recordId, input.shipmentId)
        )
      )
      .limit(1)
      .for("update");
    const row = rows[0];
    if (!row) throw new Error("tracking_not_found");
    const shipment = row.data as Shipment;
    if (!recordVisible(scope, "shipment", shipment)) throw branchForbidden();
    if (shipment.deleted) throw branchForbidden("shipment_deleted");
    if (row.version !== input.expectedVersion)
      throw branchConflict("tracking_version_conflict");
    if (
      !shipment.journey ||
      !["to_nouakchott", "arrived_office"].includes(shipment.journey.stage)
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "arrival_not_ready",
      });
    if (shipment.journey.stage === "arrived_office") {
      const result = {
        requestId: input.requestId,
        shipment,
        version: row.version,
      };
      await tx
        .insert(syncReceipts)
        .values({
          userId: user.id,
          changeId: receiptKey,
          result: { ...result, payloadHash },
        });
      return {
        ...result,
        shipment: hideForOfficeScope(
          result.shipment,
          scope.role,
          scope.offices
        ),
      };
    }
    const now = new Date().toISOString();
    const actorRole: AppRole =
      scope.role === "staff" ? "staff" : (scope.role ?? "admin");
    const acting = actorFromUser(user, actorRole);
    const mutation = {
      action: "tracking_arrival",
      shipment: {
        ...structuredClone(shipment),
        status: "وصلت للمكتب" as const,
        journey: {
          ...structuredClone(shipment.journey),
          stage: "arrived_office" as const,
          branch: "nouakchott" as const,
          updatedAt: now,
          notes: [
            ...shipment.journey.notes,
            {
              id: crypto.randomUUID(),
              text: input.reason,
              at: now,
              actorId: acting.id,
              actorName: acting.name,
            },
          ],
        },
      },
    };
    journeySchema.parse(mutation.shipment.journey);
    const nextVersion = row.version + 1;
    await tx
      .update(records)
      .set({
        version: nextVersion,
        data: mutation.shipment,
        updatedBy: user.id,
      })
      .where(eq(records.id, row.id));
    await appendAudit(tx, {
      actor: actorFromUser(user, actorRole),
      entity: "shipment",
      recordId: input.shipmentId,
      action: "tracking_arrival",
      before: shipment,
      after: mutation.shipment,
      beforeVersion: row.version,
      afterVersion: nextVersion,
      requestKey: receiptKey,
    });
    const result = {
      requestId: input.requestId,
      shipment: mutation.shipment,
      version: nextVersion,
    };
    await tx
      .insert(syncReceipts)
      .values({
        userId: user.id,
        changeId: receiptKey,
        result: { ...result, payloadHash },
      });
    return {
      ...result,
      shipment: hideForOfficeScope(result.shipment, scope.role, scope.offices),
    };
  });
}

export async function assignRecord(
  db: any,
  user: User,
  input: z.infer<typeof assignRecordSchema>
) {
  return db.transaction(async (tx: any) => {
    const rows = await tx
      .select()
      .from(records)
      .where(
        and(
          eq(records.entity, input.entity),
          eq(records.recordId, input.recordId)
        )
      )
      .limit(1)
      .for("update");
    const row = rows[0];
    if (!row)
      throw new TRPCError({ code: "NOT_FOUND", message: "Record not found" });
    if (row.version !== input.expectedVersion)
      throw branchConflict("record_version_conflict");
    const old = row.data as EntityRecord;
    if (
      input.entity === "invoice" &&
      ((old as Invoice).finance || (old as Invoice).status === "دين")
    )
      throw branchForbidden("finance_invoice_office_immutable");
    const next = { ...old, officeId: input.officeId } as EntityRecord;
    const nextVersion = row.version + 1;
    await tx
      .update(records)
      .set({ version: nextVersion, data: next, updatedBy: user.id })
      .where(eq(records.id, row.id));
    await appendAudit(tx, {
      actor: {
        id: user.id,
        name: user.name?.trim() || `user-${user.id}`,
        role: "admin",
      },
      entity: input.entity,
      recordId: input.recordId,
      action: "office_assign",
      before: old,
      after: next,
      beforeVersion: row.version,
      afterVersion: nextVersion,
      requestKey: `office-assign:${input.entity}:${input.recordId}:${nextVersion}`,
    });
    return publicRecord(
      {
        entity: input.entity,
        recordId: input.recordId,
        version: nextVersion,
        data: next,
      },
      "admin"
    );
  });
}
