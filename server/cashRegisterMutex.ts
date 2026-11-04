import { eq } from "drizzle-orm";
import type { FinanceCurrency } from "@shared/finance";
import type { OfficeId } from "@shared/branches";
import { cashRegisterLocks } from "../drizzle/schema";

/** Stable lock identity: one row is shared by every actor for an office/currency. */
export function cashRegisterMutexId(
  officeId: OfficeId,
  currency: FinanceCurrency
) {
  return `cash-lock:${officeId}:${currency}`;
}

function isDuplicateInsert(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /duplicate|unique|1062/i.test(message);
}

/**
 * Materialize the mutex row idempotently, then lock that row for this
 * transaction. The compatibility branch is only for the repository's
 * in-memory transaction fakes; MySQL uses INSERT IGNORE.
 */
export async function lockCashRegisterMutex(
  tx: any,
  officeId: OfficeId,
  currency: FinanceCurrency
) {
  const id = cashRegisterMutexId(officeId, currency);
  const values = { id, officeId, currency };
  const insert = tx.insert(cashRegisterLocks);
  if (typeof insert.ignore === "function") {
    try {
      await insert.ignore().values(values);
    } catch (error) {
      // MySQL INSERT IGNORE suppresses the duplicate-key branch. Some fake
      // builders expose ignore() but still throw, so preserve that contract.
      if (!isDuplicateInsert(error)) throw error;
    }
  } else {
    // Drizzle's PostgreSQL builder exposes onConflictDoNothing() on the
    // statement returned by values(), not on the initial insert builder.
    const statement = insert.values(values);
    if (statement && typeof statement.onConflictDoNothing === "function") {
      await statement.onConflictDoNothing();
    } else {
      // Compatibility fallback for isolated in-memory fakes whose values()
      // executes immediately and returns no conflict builder. A real Pg
      // statement always takes the branch above, so duplicate errors from the
      // database are never swallowed here.
      try {
        await statement;
      } catch (error) {
        if (!isDuplicateInsert(error)) throw error;
      }
    }
  }

  const rows = await tx
    .select()
    .from(cashRegisterLocks)
    .where(eq(cashRegisterLocks.id, id))
    .limit(1)
    .for("update");
  if (!rows[0]) throw new Error("cash_register_mutex_missing");
  return rows[0];
}
