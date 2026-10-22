import { localAccountSchema } from "./localValidation";
import { canWrite, type Account, type AppRole } from "./operations";
import { canWriteOfficeRecord, type OfficeId } from "./branches";

export function prepareCustomerAccount(
  account: Account,
  existing: Account | null,
  role: AppRole | null,
  offices: OfficeId[] | null
): Account {
  if (!canWrite(role, "account")) throw new Error("account_forbidden");
  const candidate = localAccountSchema.parse({
    ...account,
    name: account.name.trim(),
    phone: account.phone.trim(),
    city: account.city.trim(),
    ...(existing
      ? {
          balance: existing.balance,
          shipments: existing.shipments,
          ...(existing.officeId ? { officeId: existing.officeId } : {}),
        }
      : {}),
  });
  if (!candidate.phone || (!existing && !candidate.officeId))
    throw new Error("account_fields_required");
  if (
    !canWriteOfficeRecord(role, offices, "account", existing ?? candidate) ||
    !canWriteOfficeRecord(role, offices, "account", candidate)
  )
    throw new Error("account_forbidden");
  if (!existing && (candidate.balance !== 0 || candidate.shipments !== 0))
    throw new Error("opening_balance_requires_review");
  return candidate;
}

export function isSharedCustomerAccount(
  account: Account | null | undefined
): boolean {
  return Boolean(
    account && (account.scope === "shared" || (account.version ?? 0) > 0)
  );
}
