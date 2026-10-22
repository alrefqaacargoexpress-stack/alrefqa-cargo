import { describe, expect, it } from "vitest";
import {
  hashPassword,
  hashSessionToken,
  normalizeEmail,
  verifyPassword,
  needsInitialEmailSetup,
} from "./localAuth";

describe("local email authentication", () => {
  it("normalizes email addresses for account lookup", () => {
    expect(normalizeEmail("  Person@Example.COM ")).toBe("person@example.com");
  });

  it("stores passwords as salted hashes and verifies them", async () => {
    const first = await hashPassword("correct horse battery staple");
    const second = await hashPassword("correct horse battery staple");
    expect(first).not.toBe(second);
    await expect(verifyPassword("correct horse battery staple", first)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", first)).resolves.toBe(false);
  });

  it("hashes session tokens deterministically without exposing the token", () => {
    const token = "private-session-token";
    const hash = hashSessionToken(token);
    expect(hash).toHaveLength(64);
    expect(hash).toBe(hashSessionToken(token));
    expect(hash).not.toContain(token);
  });
  it("allows private setup for unsupported legacy credentials but preserves existing email accounts", async () => {
    expect(needsInitialEmailSetup({ loginMethod: "google", passwordHash: "legacy-fixture" })).toBe(true);
    expect(needsInitialEmailSetup({ loginMethod: "email", passwordHash: "invalid-fixture" })).toBe(false);
    expect(needsInitialEmailSetup({ loginMethod: "google", passwordHash: await hashPassword("unit-test-only-password") })).toBe(false);
    expect(needsInitialEmailSetup({ loginMethod: "google", passwordHash: "scrypt$salt$aa11" })).toBe(false);
  });
});
