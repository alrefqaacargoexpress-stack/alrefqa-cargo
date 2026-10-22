import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { emailEnrollments, users, type User } from "../drizzle/schema";
import { getDb } from "./db";
import { rootAdmin } from "./branches";
import { appendAudit } from "./audit";
import { hashSessionToken, normalizeEmail, needsInitialEmailSetup } from "./localAuth";
import { enrollGeneralManagerInTransaction, setEmailSession } from "./accountSecurity";
import type { TrpcContext } from "./_core/context";

export const INITIAL_SETUP_LIFETIME_MS = 60 * 60 * 1000;
export const INITIAL_SETUP_CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const unavailable = () => new TRPCError({ code: "FORBIDDEN", message: "initial_setup_unavailable" });
async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "database_unavailable" });
  return db;
}
function validCapability(row: any, now: number) {
  return Boolean(row && !row.consumedAt && new Date(row.expiresAt).valueOf() > now);
}
async function capability(db: any, token: string, lock = false) {
  if (!INITIAL_SETUP_CODE_PATTERN.test(token)) throw unavailable();
  const query = db.select().from(emailEnrollments).where(eq(emailEnrollments.tokenHash, hashSessionToken(token))).limit(1);
  const rows = lock ? await query.for("update") : await query;
  const row = rows[0];
  if (!validCapability(row, Date.now())) throw unavailable();
  return row;
}
async function existingManager(db: any, userId: number, lock = false): Promise<User> {
  const query = db.select().from(users).where(eq(users.id, userId)).limit(1);
  const rows = lock ? await query.for("update") : await query;
  const user = rows[0] as User | undefined;
  if (!user || !rootAdmin(user) || !needsInitialEmailSetup(user) || !user.email) throw unavailable();
  return user;
}

/** Called only by the owner-operated CLI after explicit approval, never exposed by any API. */
export async function issueInitialManagerSetup(db: any, userId: number, expectedEmail: string) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + INITIAL_SETUP_LIFETIME_MS);
  await db.transaction(async (tx: any) => {
    const user = await existingManager(tx, userId, true);
    if (normalizeEmail(user.email!) !== normalizeEmail(expectedEmail)) throw unavailable();
    await tx.update(emailEnrollments).set({ consumedAt: new Date() }).where(eq(emailEnrollments.userId, userId));
    await tx.insert(emailEnrollments).values({ tokenHash, userId, expiresAt });
    await appendAudit(tx, {
      actor: { id: userId, name: "إصدار خاص بواسطة مالك المشروع — بتفويض صريح", role: "admin" },
      entity: "user_account", recordId: String(userId), action: "initial_email_setup_issued_by_authorized_owner",
      after: { source: "approved_owner_operation", email: user.email, expiresAt: expiresAt.toISOString() },
      requestKey: `initial-email-setup:${randomUUID()}`,
    });
  });
  return { token, expiresAt };
}

/** POST-only info read: possession of the capability permits seeing only its bound account email. */
export async function initialManagerSetupInfo(token: string) {
  const db = await database();
  const row = await capability(db, token);
  const user = await existingManager(db, row.userId);
  return { email: user.email!, name: user.name ?? "", expiresAt: new Date(row.expiresAt).toISOString() };
}

/** The capability is consumed in the password/session/audit transaction, before any cookie is issued. */
export async function completeInitialManagerSetup(ctx: Pick<TrpcContext, "req" | "res">, input: { token: string; password: string }) {
  const db = await database();
  const first = await capability(db, input.token);
  const result = await db.transaction(async (tx: any) => {
    // Same lock order as issuance: user then capability. Revalidate after acquiring both locks.
    const user = await existingManager(tx, first.userId, true);
    const current = await capability(tx, input.token, true);
    if (current.userId !== user.id) throw unavailable();
    await tx.update(emailEnrollments).set({ consumedAt: new Date() }).where(eq(emailEnrollments.tokenHash, current.tokenHash));
    return enrollGeneralManagerInTransaction(tx, user, input.password, "general_manager_email_enrolled_via_private_setup");
  });
  setEmailSession(ctx, result.token);
  return { user: result.user };
}
