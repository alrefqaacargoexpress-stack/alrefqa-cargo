import { randomUUID } from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { users, localSessions, type User } from "../drizzle/schema";
import { getDb } from "./db";
import { rootAdmin, readOfficeScope } from "./branches";
import { appendAudit } from "./audit";
import { getSessionCookieOptions } from "./_core/cookies";
import type { TrpcContext } from "./_core/context";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import {
  createSessionToken, hashSessionToken, hashPassword, verifyPassword,
  LOCAL_SESSION_COOKIE, normalizeEmail, publicUser,
} from "./localAuth";

type SecurityContext = TrpcContext & { user: NonNullable<TrpcContext["user"]> };
const denied = (message: string) => new TRPCError({ code: "FORBIDDEN", message });
const invalid = (message: string) => new TRPCError({ code: "BAD_REQUEST", message });
async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "database_unavailable" });
  return db;
}
async function lockedUser(tx: any, userId: number): Promise<User> {
  const rows = await tx.select().from(users).where(eq(users.id, userId)).limit(1).for("update");
  if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "user_not_found" });
  return rows[0];
}
async function assertUniqueEmail(tx: any, user: User) {
  if (!user.email) throw invalid("account_email_required");
  const email = normalizeEmail(user.email);
  const others = await tx.select({ id: users.id }).from(users)
    .where(and(sql`LOWER(${users.email}) = ${email}`, ne(users.id, user.id))).limit(1);
  if (others.length) throw new TRPCError({ code: "CONFLICT", message: "account_email_conflict" });
  return email;
}
async function rotateSessions(tx: any, userId: number) {
  const token = createSessionToken();
  await tx.delete(localSessions).where(eq(localSessions.userId, userId));
  await tx.insert(localSessions).values({ userId, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + ONE_YEAR_MS) });
  return token;
}
export function setEmailSession(ctx: Pick<TrpcContext, "req" | "res">, token: string) {
  const options = getSessionCookieOptions(ctx.req);
  ctx.res.cookie(LOCAL_SESSION_COOKIE, token, { ...options, maxAge: ONE_YEAR_MS });
  ctx.res.clearCookie(COOKIE_NAME, { ...options, maxAge: -1 });
}
async function securityAudit(tx: any, actor: User, target: User, action: string, required: boolean) {
  // Never persist passwords or their hashes in the audit event.
  const scope = await readOfficeScope(tx, actor);
  await appendAudit(tx, {
    actor: { id: actor.id, name: actor.name?.trim() || `user-${actor.id}`, role: scope.role ?? "viewer" },
    entity: "user_account", recordId: String(target.id), action,
    before: { email: target.email, mustChangePassword: Boolean(target.mustChangePassword) },
    after: { email: target.email, mustChangePassword: required, emailLoginEnabled: true },
    requestKey: `account-security:${randomUUID()}`,
  });
}

/** The caller must lock this existing user before invoking the enrollment transaction. */
export async function enrollGeneralManagerInTransaction(tx: any, current: User, password: string, action = "general_manager_email_enrollment") {
  if (!rootAdmin(current)) throw denied("general_manager_required");
  if (current.passwordHash) throw invalid("email_login_already_configured");
  const email = await assertUniqueEmail(tx, current);
  const next = { ...current, email, loginMethod: "email", accountType: "employee" as const,
    passwordHash: await hashPassword(password), mustChangePassword: false };
  await tx.update(users).set({ email, loginMethod: next.loginMethod, accountType: next.accountType,
    passwordHash: next.passwordHash, mustChangePassword: false }).where(eq(users.id, current.id));
  const token = await rotateSessions(tx, current.id);
  await securityAudit(tx, current, current, action, false);
  return { user: publicUser(next), token };
}

/** One-time self-enrollment, only for an already authenticated existing general manager. */
export async function configureGeneralManagerEmail(ctx: SecurityContext, password: string) {
  if (!rootAdmin(ctx.user)) throw denied("general_manager_required");
  const db = await database();
  const result = await db.transaction(async (tx: any) => {
    const current = await lockedUser(tx, ctx.user.id);
    return enrollGeneralManagerInTransaction(tx, current, password);
  });
  setEmailSession(ctx, result.token);
  return { user: result.user };
}

/** General manager assigns a temporary password to an existing non-root account, in place. */
export async function resetAccountPassword(ctx: SecurityContext, userId: number, temporaryPassword: string) {
  if (!rootAdmin(ctx.user)) throw denied("general_manager_required");
  const db = await database();
  return db.transaction(async (tx: any) => {
    const target = await lockedUser(tx, userId);
    if (rootAdmin(target)) throw denied("general_manager_use_own_security_settings");
    if (target.accountType !== "employee") throw denied("employee_account_required");
    const email = await assertUniqueEmail(tx, target);
    await tx.update(users).set({ email, passwordHash: await hashPassword(temporaryPassword),
      loginMethod: "email", mustChangePassword: true }).where(eq(users.id, userId));
    await tx.delete(localSessions).where(eq(localSessions.userId, userId));
    await securityAudit(tx, ctx.user, target, "password_reset_by_general_manager", true);
    return { userId, name: target.name ?? "", email, mustChangePassword: true };
  });
}

/** A normal password change requires the current password. Temporary sessions may only replace it. */
export async function changeAccountPassword(ctx: SecurityContext, input: { newPassword: string; currentPassword?: string }) {
  const db = await database();
  const result = await db.transaction(async (tx: any) => {
    const current = await lockedUser(tx, ctx.user.id);
    if (!current.passwordHash || current.loginMethod !== "email") throw invalid("email_account_required");
    if (current.passwordHash !== ctx.user.passwordHash) throw denied("session_changed");
    if (!current.mustChangePassword && (!input.currentPassword || !(await verifyPassword(input.currentPassword, current.passwordHash))))
      throw denied("current_password_incorrect");
    if (await verifyPassword(input.newPassword, current.passwordHash)) throw invalid("new_password_must_differ");
    const passwordHash = await hashPassword(input.newPassword);
    await tx.update(users).set({ passwordHash, mustChangePassword: false }).where(eq(users.id, current.id));
    const token = await rotateSessions(tx, current.id);
    await securityAudit(tx, current, current, "password_changed", false);
    return { user: publicUser({ ...current, passwordHash, mustChangePassword: false }), token };
  });
  setEmailSession(ctx, result.token);
  return { user: result.user, success: true as const };
}
