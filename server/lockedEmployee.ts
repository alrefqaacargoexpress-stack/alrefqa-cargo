import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { users, type User } from "../drizzle/schema";
import { isEmployeeDisabled } from "./lifecycle";

/**
 * The request context is only a hint once a write transaction starts. Lock the
 * current database identity first, then use its authoritative role and
 * account type for every subsequent scope and audit decision.
 *
 * Deliberately project no password, password hash, session token, or token hash
 * columns. The returned value merges the non-authoritative context fields only
 * after the locked identity fields have been applied.
 */
export async function lockEmployee(
  tx: {
    select: (...args: any[]) => any;
  },
  contextUser: User
): Promise<User> {
  const rows = await tx
    .select({
      id: users.id,
      openId: users.openId,
      name: users.name,
      role: users.role,
      accountType: users.accountType,
    })
    .from(users)
    .where(eq(users.id, contextUser.id))
    .limit(1)
    .for("update");
  const current = rows[0] as
    | Pick<User, "id" | "openId" | "name" | "role" | "accountType">
    | undefined;
  if (!current)
    throw new TRPCError({ code: "UNAUTHORIZED", message: "user_not_found" });
  if (current.accountType !== "employee")
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "employee_account_required",
    });
  if (await isEmployeeDisabled(tx as any, current.id))
    throw new TRPCError({ code: "FORBIDDEN", message: "employee_disabled" });

  return {
    ...contextUser,
    id: current.id,
    openId: current.openId,
    name: current.name,
    role: current.role,
    accountType: current.accountType,
  };
}
