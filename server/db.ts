import { and, eq, gt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { InsertUser, localSessions, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: Pool | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (process.env.NODE_ENV === "test") return null;
  const connectionString = process.env.NEON_DATABASE_URL ??
    (process.env.DATABASE_URL?.startsWith("postgres") ? process.env.DATABASE_URL : undefined);
  if (!_db && connectionString) {
    try {
      _pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
      _db = drizzle(_pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available");
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod", "passwordHash"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet as Partial<InsertUser>,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(sql`LOWER(${users.email}) = ${email}`)
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByLocalSessionHash(tokenHash: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select({ user: users })
    .from(localSessions)
    .innerJoin(users, eq(localSessions.userId, users.id))
    .where(
      and(
        eq(localSessions.tokenHash, tokenHash),
        gt(localSessions.expiresAt, new Date())
      )
    )
    .limit(1);
  return result[0]?.user;
}

export async function createLocalSession(input: {
  tokenHash: string;
  userId: number;
  expiresAt: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(localSessions).values(input);
}

export async function deleteLocalSession(tokenHash: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(localSessions).where(eq(localSessions.tokenHash, tokenHash));
}

export async function deleteLocalSessionsForUser(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(localSessions).where(eq(localSessions.userId, userId));
}

// TODO: add feature queries here as your schema grows.
