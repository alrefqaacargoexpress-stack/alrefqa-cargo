import { and, eq } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import { officeProfiles, officeTariffHistory } from "../drizzle/schema";
import {
  defaultOfficeProfile,
  officeIds,
  type OfficeId,
  type OfficeProfile,
  type VersionedOfficeProfile,
} from "@shared/branches";
import { tariffForPackingProfiles, type PackingSession } from "@shared/packing";

export async function rememberOfficeTariff(
  tx: any,
  profile: OfficeProfile,
  version: number,
  announcedAt: Date,
  recordedBy: number | null
) {
  if (!Number.isFinite(announcedAt.getTime()))
    throw new Error("tariff_history_unavailable");
  const data = {
    id: `office-tariff:${profile.officeId}:${version}`,
    officeId: profile.officeId,
    profileVersion: version,
    announcedAt,
    shippingRates: profile.shippingRates ?? null,
    sourceShippingRates: profile.sourceShippingRates ?? null,
    recordedBy,
  };
  const found = await tx
    .select()
    .from(officeTariffHistory)
    .where(
      and(
        eq(officeTariffHistory.officeId, profile.officeId),
        eq(officeTariffHistory.profileVersion, version)
      )
    )
    .limit(1);
  if (found[0]) {
    if (
      !isDeepStrictEqual(found[0].shippingRates ?? null, data.shippingRates) ||
      !isDeepStrictEqual(
        found[0].sourceShippingRates ?? null,
        data.sourceShippingRates
      )
    )
      throw new Error("office_tariff_history_conflict");
    return;
  }
  await tx.insert(officeTariffHistory).values(data);
}
export type TariffVersion = {
  officeId: string;
  profileVersion: number;
  announcedAt: Date | string;
  shippingRates: OfficeProfile["shippingRates"] | null;
  sourceShippingRates: OfficeProfile["sourceShippingRates"] | null;
};
/** Historical publication evidence, never a guessed exchange rate or client amount. */
export function profileTariffAt(
  current: VersionedOfficeProfile,
  currentPublishedAt: Date | string | undefined,
  history: readonly TariffVersion[],
  createdAt: Date
): VersionedOfficeProfile {
  const candidates = history
    .filter(
      row =>
        row.officeId === current.officeId &&
        new Date(row.announcedAt).getTime() <= createdAt.getTime()
    )
    .sort(
      (a, b) =>
        new Date(b.announcedAt).getTime() - new Date(a.announcedAt).getTime() ||
        b.profileVersion - a.profileVersion
    );
  const selected = candidates[0];
  const publishedTime =
    currentPublishedAt === undefined
      ? NaN
      : new Date(currentPublishedAt).getTime();
  const recordedCurrent = history.some(
    row =>
      row.officeId === current.officeId &&
      row.profileVersion === current.version
  );
  // Legacy updatedAt has only second precision. Do not invent which price
  // applied within that uncertain second when no precise history is recorded.
  if (
    !recordedCurrent &&
    current.version > 0 &&
    Number.isFinite(publishedTime) &&
    createdAt.getTime() >= publishedTime &&
    createdAt.getTime() < publishedTime + 1000
  )
    throw new Error("tariff_history_unavailable");
  // A current version can precede its new history row during a rolling deployment.
  if (
    current.version === 0 ||
    (!recordedCurrent &&
      Number.isFinite(publishedTime) &&
      publishedTime + 1000 <= createdAt.getTime() &&
      (!selected ||
        publishedTime > new Date(selected.announcedAt).getTime() ||
        current.version > selected.profileVersion))
  )
    return current;
  if (!selected) throw new Error("tariff_history_unavailable");
  return {
    ...current,
    version: selected.profileVersion,
    shippingRates: selected.shippingRates ?? undefined,
    sourceShippingRates: selected.sourceShippingRates ?? undefined,
  };
}
export async function creationTariff(
  tx: any,
  packing: PackingSession,
  now = new Date()
) {
  const createdAt = new Date(packing.createdAt);
  if (
    !Number.isFinite(createdAt.getTime()) ||
    createdAt.getTime() > now.getTime() + 120_000
  )
    throw new Error("shipment_creation_date_invalid");
  const profiles = await tx.select().from(officeProfiles);
  const history = await tx.select().from(officeTariffHistory);
  const at = (office: OfficeId) => {
    const row = profiles.find((value: any) => value.officeId === office);
    const current = row
      ? ({ ...row.profile, version: row.version } as VersionedOfficeProfile)
      : defaultOfficeProfile(office);
    return profileTariffAt(current, row?.updatedAt, history, createdAt);
  };
  if (!officeIds.includes(packing.source))
    throw new Error("shipment_source_office_mismatch");
  return tariffForPackingProfiles({
    source: packing.source,
    service: packing.service ?? "airRegular",
    sourceProfile: at(packing.source),
    nouakchottProfile: at("nouakchott"),
    capturedAt: packing.createdAt,
  });
}
