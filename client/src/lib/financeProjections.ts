import type {
  FinanceCashProjection,
  FinanceCurrency,
  FinanceSnapshot,
} from "@shared/finance";
import type { OfficeId } from "@shared/branches";

export function financeCashProjectionFor(
  cashBalances: readonly FinanceCashProjection[] | undefined,
  officeId: OfficeId,
  currency: FinanceCurrency
): FinanceCashProjection | null {
  return (
    cashBalances?.find(
      projection =>
        projection.officeId === officeId && projection.currency === currency
    ) ?? null
  );
}

export function financeCashProjectionFromSnapshot(
  snapshot: Pick<FinanceSnapshot, "cashBalances"> | null | undefined,
  officeId: OfficeId,
  currency: FinanceCurrency
): FinanceCashProjection | null {
  return financeCashProjectionFor(snapshot?.cashBalances, officeId, currency);
}
