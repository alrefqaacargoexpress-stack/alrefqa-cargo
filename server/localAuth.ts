import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type { User } from "../drizzle/schema";

const scrypt = promisify(scryptCallback);

export const ACCOUNT_TYPES = ["customer", "employee"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
export const LOCAL_SESSION_COOKIE = "alrefqa_session";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createLocalOpenId(): string {
  return `local_${randomBytes(24).toString("hex")}`;
}

export function createSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derivedKey.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  encodedHash: string
): Promise<boolean> {
  const [algorithm, salt, encodedKey] = encodedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !encodedKey) return false;
  const expected = Buffer.from(encodedKey, "hex");
  if (expected.length === 0) return false;
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return (
    actual.length === expected.length && timingSafeEqual(actual, expected)
  );
}

export function publicUser(user: User): Omit<User, "passwordHash"> {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}
