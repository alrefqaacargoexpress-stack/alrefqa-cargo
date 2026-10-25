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
  const insert = tx.insert(cashRegisterLocks);
  if (typeof insert.ignore === "function") {
    try {
      await insert
        .ignore()
        .values({ id, officeId, currency });
    } catch (error) {
      // MySQL INSERT IGNORE suppresses the duplicate-key branch. Some fake
      // builders expose ignore() but still throw, so preserve that contract.
      if (!isDuplicateInsert(error)) throw error;
    }
  } else {
    try {
      await insert.values({ id, officeId, currency });
    } catch (error) {
      if (!isDuplicateInsert(error)) throw error;
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
