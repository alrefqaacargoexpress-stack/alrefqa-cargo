import { officeProfileSchema, type OfficeProfile } from "./branches";
import { emptyPublicShippingRates, shippingRateKeys } from "./publicShipping";

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, stable(v)])
    );
  return value;
}
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const fields = [
  "address",
  "phone",
  "timezone",
  "mapUrl",
  "gps",
  "hours",
  "employees",
  "seaAddress",
] as const;
function fieldValue(profile: OfficeProfile, field: (typeof fields)[number]) {
  if (field === "seaAddress") return profile.seaAddress ?? "";
  if (field === "mapUrl") return profile.mapUrl ?? null;
  return profile[field];
}
export class OfficeProfileMergeConflict extends Error {
  constructor(public readonly fields: string[]) {
    super("office_profile_version_conflict");
  }
}
export function sameOfficeProfile(a: OfficeProfile, b: OfficeProfile): boolean {
  return (
    a.officeId === b.officeId &&
    fields.every(field => equal(fieldValue(a, field), fieldValue(b, field))) &&
    shippingRateKeys.every(key =>
      equal(a.shippingRates?.[key] ?? null, b.shippingRates?.[key] ?? null)
    )
  );
}
/** Merge only the user's changes from the captured baseline, never silently replace a competing edit. */
export function mergeOfficeProfile(
  current: OfficeProfile,
  desired: OfficeProfile,
  base: OfficeProfile
): OfficeProfile {
  if (
    current.officeId !== desired.officeId ||
    base.officeId !== desired.officeId
  )
    throw new Error("office_profile_base_mismatch");
  const result: Record<string, unknown> = structuredClone(current);
  const conflicts: string[] = [];
  for (const field of fields) {
    const previous = fieldValue(base, field),
      next = fieldValue(desired, field),
      saved = fieldValue(current, field);
    if (equal(previous, next)) continue;
    if (!equal(saved, previous) && !equal(saved, next)) conflicts.push(field);
    else result[field] = structuredClone(next);
  }
  const rates = { ...emptyPublicShippingRates(), ...current.shippingRates };
  let changedRates = false;
  for (const key of shippingRateKeys) {
    const previous = base.shippingRates?.[key] ?? null;
    const next = desired.shippingRates?.[key] ?? null;
    const saved = current.shippingRates?.[key] ?? null;
    if (equal(previous, next)) continue;
    if (!equal(saved, previous) && !equal(saved, next))
      conflicts.push(`shippingRates.${key}`);
    else {
      rates[key] = structuredClone(next);
      changedRates = true;
    }
  }
  if (conflicts.length) throw new OfficeProfileMergeConflict(conflicts);
  if (changedRates) result.shippingRates = rates;
  return officeProfileSchema.parse(result);
}
