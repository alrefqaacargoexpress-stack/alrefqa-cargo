import { createHash } from "node:crypto";
import { parse as parseCookieHeader } from "cookie";
import { and, eq, gt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  dutyEvents,
  localSessions,
  syncReceipts,
  users,
  type DutyEventRow,
  type User,
} from "../drizzle/schema";
import {
  canonicalDutyCommand,
  dutyCommandSchema,
  isDutyEventCurrent,
  projectDutyAvailability,
  type DutyAvailability,
  type DutyCommand,
  type DutyEventSnapshot,
} from "@shared/duty";
import { type AppRole } from "@shared/operations";
import { getDb } from "./db";
import { hashSessionToken, LOCAL_SESSION_COOKIE } from "./localAuth";
import { readOfficeScope, type OfficeScope } from "./branches";
import { isEmployeeDisabled } from "./lifecycle";
import { appendAudit } from "./audit";
import { protectedProcedure, router } from "./_core/trpc";

const DUTY_DURATION_MS = 8 * 60 * 60 * 1000;
const DUTY_RECEIPT_PREFIX = "duty:";
const dutyActionSchema = z.enum(["activate", "deactivate"]);

type DutyDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type DutyTx = DutyDb | any;
type DutyAction = z.infer<typeof dutyActionSchema>;

type DutyMutationResult = {
  acknowledged: true;
  action: DutyAction | "logout";
  eventId: number;
  userId: number;
  officeId: DutyEventRow["officeId"];
  role: AppRole;
  status: DutyEventRow["status"];
  requestKey: string;
  activatedAt: string;
  expiresAt: string | null;
};

type ReceiptResult = DutyMutationResult & { payloadHash: string; kind: "duty" };

function unavailable(): never {
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Database is not available",
  });
}

async function dbOrThrow(): Promise<DutyDb> {
  const db = await getDb();
  if (!db) return unavailable();
  return db;
}

function forbidden(message: string): never {
  throw new TRPCError({ code: "FORBIDDEN", message });
}

function conflict(message: string): never {
  throw new TRPCError({ code: "CONFLICT", message });
}

function payloadHash(
  action: DutyAction | "logout",
  command: Pick<
    DutyCommand,
    "id" | "requestKey" | "officeId" | "role" | "reason"
  >,
  userId: number
): string {
  return createHash("sha256")
    .update(canonicalDutyCommand(action, command, userId))
    .digest("hex");
}

export function dutyPayloadHash(
  action: DutyAction,
  command: DutyCommand,
  userId: number
): string {
  return payloadHash(action, command, userId);
}

/** Eight hours is the hard upper bound; a proven local session can shorten it. */
export function resolveDutyExpiry(
  now: Date,
  sessionExpiresAt: Date | null | undefined
): Date {
  const bounded = new Date(now.getTime() + DUTY_DURATION_MS);
  if (
    sessionExpiresAt &&
    Number.isFinite(sessionExpiresAt.getTime()) &&
    sessionExpiresAt.getTime() > now.getTime() &&
    sessionExpiresAt.getTime() < bounded.getTime()
  )
    return new Date(sessionExpiresAt.getTime());
  return bounded;
}

function snapshot(row: DutyEventRow): DutyEventSnapshot {
  return {
    id: row.id,
    userId: row.userId,
    actorId: row.actorId,
    role: row.role as AppRole,
    officeId: row.officeId as DutyEventSnapshot["officeId"],
    status: row.status,
    reason: row.reason,
    membershipVersion: row.membershipVersion,
    expiresAt: row.expiresAt,
    requestKey: row.requestKey,
    createdAt: row.createdAt,
  };
}

function resultFromRow(
  row: DutyEventRow,
  action: DutyAction | "logout"
): DutyMutationResult {
  return {
    acknowledged: true,
    action,
    eventId: row.id,
    userId: row.userId,
    officeId: row.officeId,
    role: row.role as AppRole,
    status: row.status,
    requestKey: row.requestKey,
    activatedAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}

function resultFromReceipt(value: unknown): DutyMutationResult | null {
  if (!value || typeof value !== "object") return null;
  const result = value as Partial<ReceiptResult>;
  if (
    result.kind !== "duty" ||
    result.acknowledged !== true ||
    typeof result.eventId !== "number" ||
    typeof result.userId !== "number" ||
    typeof result.role !== "string" ||
    typeof result.officeId !== "string" ||
    typeof result.status !== "string" ||
    typeof result.requestKey !== "string" ||
    typeof result.activatedAt !== "string"
  )
    return null;
  return {
    acknowledged: true,
    action: result.action as DutyAction | "logout",
    eventId: result.eventId,
    userId: result.userId,
    officeId: result.officeId as DutyEventRow["officeId"],
    role: result.role as AppRole,
    status: result.status as DutyEventRow["status"],
    requestKey: result.requestKey,
    activatedAt: result.activatedAt,
    expiresAt: result.expiresAt ?? null,
  };
}

async function receiptFor(
  tx: DutyTx,
  userId: number,
  requestKey: string
): Promise<{ payloadHash: string; result: DutyMutationResult } | null> {
  const rows = await tx
    .select()
    .from(syncReceipts)
    .where(
      and(
        eq(syncReceipts.userId, userId),
        eq(syncReceipts.changeId, `${DUTY_RECEIPT_PREFIX}${requestKey}`)
      )
    )
    .limit(1)
    .for("update");
  const receipt = rows[0];
  if (!receipt) return null;
  const result = resultFromReceipt(receipt.result);
  if (!result || typeof (receipt.result as any).payloadHash !== "string")
    conflict("duty_receipt_requires_review");
  return {
    payloadHash: (receipt.result as any).payloadHash,
    result,
  };
}

async function sessionExpiry(
  tx: DutyTx,
  req: { headers: { cookie?: string } },
  userId: number,
  now: Date
): Promise<Date | null> {
  const raw = parseCookieHeader(req.headers.cookie ?? "")[LOCAL_SESSION_COOKIE];
  if (!raw) return null;
  const rows = await tx
    .select({ expiresAt: localSessions.expiresAt })
    .from(localSessions)
    .where(
      and(
        eq(localSessions.userId, userId),
        eq(localSessions.tokenHash, hashSessionToken(raw)),
        gt(localSessions.expiresAt, now)
      )
    )
    .limit(1)
    .for("update");
  return rows[0]?.expiresAt ?? null;
}

function assertSelection(scope: OfficeScope, input: DutyCommand): AppRole {
  if (!scope.role) forbidden("employee_membership_required");
  const role = input.role ?? scope.role;
  // Root admin is a distinct authority. It can choose an office, but a duty
  // command cannot use its role field to self-grant another application role.
  if (scope.role === "admin") {
    if (input.role && input.role !== "admin")
      forbidden("duty_role_self_grant_forbidden");
    return "admin";
  }
  if (role !== scope.role) forbidden("duty_role_must_match_assignment");
  if (!scope.offices?.includes(input.officeId))
    forbidden("duty_office_not_assigned");
  return scope.role;
}

export function validateDutySelection(
  scope: Pick<OfficeScope, "role" | "offices">,
  input: DutyCommand
): AppRole {
  return assertSelection(scope as OfficeScope, input);
}

async function lockedEmployee(tx: DutyTx, userId: number): Promise<User> {
  const rows = await tx
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .for("update");
  const user = rows[0] as User | undefined;
  if (!user)
    throw new TRPCError({ code: "UNAUTHORIZED", message: "user_not_found" });
  if (user.accountType !== "employee") forbidden("employee_account_required");
  return user;
}

async function eventByRequest(
  tx: DutyTx,
  userId: number,
  requestKey: string
): Promise<DutyEventRow | null> {
  const rows = await tx
    .select()
    .from(dutyEvents)
    .where(
      and(eq(dutyEvents.userId, userId), eq(dutyEvents.requestKey, requestKey))
    )
    .limit(1)
    .for("update");
  return (rows[0] as DutyEventRow | undefined) ?? null;
}

async function appendDuty(
  tx: DutyTx,
  user: User,
  scope: OfficeScope,
  input: DutyCommand,
  action: DutyAction,
  req: { headers: { cookie?: string } }
): Promise<DutyMutationResult> {
  const now = new Date();
  const hash = payloadHash(action, input, user.id);
  if (await isEmployeeDisabled(tx, user.id)) forbidden("employee_disabled");
  const role = assertSelection(scope, input);
  const existingReceipt = await receiptFor(tx, user.id, input.requestKey);
  if (existingReceipt) {
    if (existingReceipt.payloadHash !== hash)
      conflict("duty_request_replay_mismatch");
    const event = await eventByRequest(tx, user.id, input.requestKey);
    if (
      !event ||
      event.role !== role ||
      event.officeId !== input.officeId ||
      event.membershipVersion !== scope.membershipVersion ||
      (event.expiresAt && event.expiresAt.getTime() <= now.getTime())
    )
      conflict("duty_request_stale");
    return existingReceipt.result;
  }

  const expiresAt =
    action === "activate"
      ? resolveDutyExpiry(now, await sessionExpiry(tx, req, user.id, now))
      : null;
  const reason = input.reason ?? `duty.${action}`;
  await tx.insert(dutyEvents).values({
    userId: user.id,
    actorId: user.id,
    role,
    officeId: input.officeId,
    status: action === "activate" ? "on" : "off",
    reason,
    membershipVersion: scope.membershipVersion,
    expiresAt,
    requestKey: input.requestKey,
  });
  const row = await eventByRequest(tx, user.id, input.requestKey);
  if (!row) throw new Error("duty_event_insert_not_visible");
  const result = resultFromRow(row, action);

  await appendAudit(tx, {
    actor: { id: user.id, name: user.name ?? "Employee", role },
    entity: "duty",
    recordId: `${user.id}:${input.requestKey}`,
    action,
    after: {
      userId: user.id,
      officeId: row.officeId,
      role: row.role,
      status: row.status,
      membershipVersion: row.membershipVersion,
      expiresAt: row.expiresAt?.toISOString() ?? null,
    },
    requestKey: `duty:${input.requestKey}`,
  });

  const receipt: ReceiptResult = {
    kind: "duty",
    payloadHash: hash,
    ...result,
  };
  await tx.insert(syncReceipts).values({
    userId: user.id,
    changeId: `${DUTY_RECEIPT_PREFIX}${input.requestKey}`,
    result: receipt,
  });
  return result;
}

async function mutateDuty(
  ctx: { user: User; req: { headers: { cookie?: string } } },
  input: DutyCommand,
  action: DutyAction
): Promise<DutyMutationResult> {
  const db = await dbOrThrow();
  return db.transaction(async (tx: DutyTx) => {
    // Lock before replay lookup and before re-reading membership/lifecycle.
    const user = await lockedEmployee(tx, ctx.user.id);
    const scope = await readOfficeScope(tx, user);
    return appendDuty(tx, user, scope, input, action, ctx.req);
  });
}

function latestById(rows: DutyEventRow[]): DutyEventRow | null {
  return rows.reduce<DutyEventRow | null>(
    (latest, row) => (!latest || row.id > latest.id ? row : latest),
    null
  );
}

async function listDuty(db: DutyDb, actor: User): Promise<DutyAvailability[]> {
  if (actor.accountType !== "employee") forbidden("employee_account_required");
  const actorScope = await readOfficeScope(db, actor);
  if (!actorScope.role) forbidden("employee_membership_required");

  const employees = (await db
    .select()
    .from(users)
    .where(eq(users.accountType, "employee"))) as User[];
  const events = (await db.select().from(dutyEvents)) as DutyEventRow[];
  const output: DutyAvailability[] = [];

  for (const employee of employees) {
    if (await isEmployeeDisabled(db, employee.id)) continue;
    let scope: OfficeScope;
    try {
      scope = await readOfficeScope(db, employee);
    } catch (error) {
      // A lifecycle change can race the preliminary check above. A disabled
      // or revoked employee is simply absent from the current roster; one
      // such row must not abort visibility for the rest of the institution.
      if (
        error instanceof TRPCError &&
        ["employee_disabled", "membership_revoked"].includes(error.message)
      )
        continue;
      throw error;
    }
    if (!scope.role || employee.accountType !== "employee") continue;
    if (
      actorScope.role !== "admin" &&
      !scope.offices?.some(office => actorScope.offices?.includes(office))
    )
      continue;
    const latest = latestById(
      events.filter(event => event.userId === employee.id)
    );
    const projected = projectDutyAvailability(
      { id: employee.id, name: employee.name ?? "Employee" },
      latest ? snapshot(latest) : null,
      {
        accountType: employee.accountType,
        role: scope.role,
        offices: scope.offices,
        membershipVersion: scope.membershipVersion,
        disabled: false,
      },
      new Date()
    );
    if (projected) output.push(projected);
  }
  return output;
}

const dutyInput = dutyCommandSchema;

export const dutyRouter = router({
  list: protectedProcedure.query(async ({ ctx }) =>
    listDuty(await dbOrThrow(), ctx.user as User)
  ),
  activate: protectedProcedure
    .input(dutyInput)
    .mutation(({ ctx, input }) =>
      mutateDuty(
        ctx as { user: User; req: { headers: { cookie?: string } } },
        input,
        "activate"
      )
    ),
  deactivate: protectedProcedure
    .input(dutyInput)
    .mutation(({ ctx, input }) =>
      mutateDuty(
        ctx as { user: User; req: { headers: { cookie?: string } } },
        input,
        "deactivate"
      )
    ),
});

/**
 * Logout hook: append one safe off event before the caller removes a session.
 * It is intentionally no-op for employees with no prior duty event and is
 * idempotent under the caller-provided request key.
 */
export async function endDutyForLogout(
  db: DutyDb,
  userId: number,
  requestKey: string
): Promise<DutyMutationResult | null> {
  if (!requestKey.trim() || requestKey.length > 128)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "invalid_request_key",
    });
  return db.transaction(async (tx: DutyTx) => {
    const user = await lockedEmployee(tx, userId);
    const command = {
      id: `logout:${requestKey}`,
      requestKey,
      officeId: "nouakchott" as const,
      role: undefined,
      reason: "logout",
    } satisfies Pick<
      DutyCommand,
      "id" | "requestKey" | "officeId" | "role" | "reason"
    >;
    const hash = payloadHash("logout", command, userId);
    const existing = await receiptFor(tx, userId, requestKey);
    if (existing) {
      if (existing.payloadHash !== hash)
        conflict("duty_request_replay_mismatch");
      return existing.result;
    }

    const rows = (await tx
      .select()
      .from(dutyEvents)
      .where(eq(dutyEvents.userId, userId))) as DutyEventRow[];
    const latest = latestById(rows);
    if (!latest || latest.status !== "on") return null;

    const result = resultFromRow(
      {
        ...latest,
        id: latest.id,
        actorId: userId,
        status: "off",
        reason: "logout",
        requestKey,
        expiresAt: null,
        createdAt: new Date(),
      },
      "logout"
    );
    await tx.insert(dutyEvents).values({
      userId,
      actorId: userId,
      role: latest.role,
      officeId: latest.officeId,
      status: "off",
      reason: "logout",
      membershipVersion: latest.membershipVersion,
      expiresAt: null,
      requestKey,
    });
    const inserted = await eventByRequest(tx, userId, requestKey);
    if (!inserted) throw new Error("duty_logout_insert_not_visible");
    const finalResult = resultFromRow(inserted, "logout");
    await appendAudit(tx, {
      actor: { id: userId, name: user.name ?? "Employee", role: latest.role },
      entity: "duty",
      recordId: `${userId}:${requestKey}`,
      action: "logout",
      after: {
        userId,
        officeId: latest.officeId,
        role: latest.role,
        status: "off",
        membershipVersion: latest.membershipVersion,
        expiresAt: null,
      },
      requestKey: `duty:${requestKey}`,
    });
    await tx.insert(syncReceipts).values({
      userId,
      changeId: `${DUTY_RECEIPT_PREFIX}${requestKey}`,
      result: { kind: "duty", payloadHash: hash, ...finalResult },
    });
    return finalResult;
  });
}

export { isDutyEventCurrent };
