import {
  Clock3,
  Globe2,
  MapPin,
  MessageCircle,
  Phone,
  Users,
} from "lucide-react";
import type { OfficeId, VersionedOfficeProfile } from "@shared/branches";
import { mapsHref } from "@shared/branches";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  officeConfig,
  publicCopy,
  type Language,
  type PublicCopy,
} from "@/lib/publicCopy";
import {
  branchDashboardCopy,
  profileMap,
  safeTelHref,
  weekdayLabel,
} from "@/lib/branchDashboardCopy";
import { publicShippingCopyFor } from "@/lib/publicShippingCopy";
import { nouakchottRatesCopyFor } from "@/lib/nouakchottRatesCopy";
import {
  nouakchottRateSources,
  shippingRateKeys,
  type NouakchottRateSource,
} from "@shared/publicShipping";

type LegacyOffice = (typeof officeConfig)[number];

export default function PublicOfficeCards({
  profiles,
  loading = false,
  error = false,
}: {
  profiles?: VersionedOfficeProfile[];
  loading?: boolean;
  error?: boolean;
}) {
  const { language } = useLanguage();
  const copy = publicCopy[language];
  const c = branchDashboardCopy(language);
  const shippingCopy = publicShippingCopyFor(language);
  const nouakchottCopy = nouakchottRatesCopyFor(language);
  const confirmed = profiles ?? [];
  const byOffice = profileMap(confirmed);
  const hasConfirmedProfile = confirmed.some(profile =>
    Boolean(
      profile.address ||
        profile.phone ||
        profile.mapUrl ||
        profile.gps ||
        profile.hours.length ||
        profile.employees.length ||
        profile.seaAddress?.trim() ||
        (profile.shippingRates &&
          shippingRateKeys.some(
            key => profile.shippingRates?.[key] !== null
          )) ||
        (profile.sourceShippingRates &&
          nouakchottRateSources.some(source =>
            shippingRateKeys.some(
              key => profile.sourceShippingRates?.[source]?.[key] !== null
            )
          ))
    )
  );

  return (
    <div className="space-y-5">
      {loading && (
        <p
          className="rounded-2xl border border-[#dce4e7] bg-white px-4 py-3 text-sm text-[#63737a]"
          role="status"
        >
          {c.loading}
        </p>
      )}
      {error && (
        <p
          className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="alert"
        >
          {c.unavailable}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {officeConfig.map(office => (
          <PublicOfficeCard
            key={office.id}
            office={office}
            profile={byOffice.get(office.id)}
            copy={copy}
            c={c}
            shippingCopy={shippingCopy}
            nouakchottCopy={nouakchottCopy}
            language={language}
          />
        ))}
      </div>
      {(!hasConfirmedProfile || error) && <LegacyReference copy={copy} c={c} />}
    </div>
  );
}

function PublicOfficeCard({
  office,
  profile,
  copy,
  c,
  shippingCopy,
  nouakchottCopy,
  language,
}: {
  office: LegacyOffice;
  profile?: VersionedOfficeProfile;
  copy: PublicCopy;
  c: ReturnType<typeof branchDashboardCopy>;
  shippingCopy: ReturnType<typeof publicShippingCopyFor>;
  nouakchottCopy: ReturnType<typeof nouakchottRatesCopyFor>;
  language: Language;
}) {
  const address = profile?.address?.trim() || "";
  const legacyPhone = (office as LegacyOffice & { phone?: string | null })
    .phone;
  const phone = profile?.phone?.trim() || legacyPhone || "";
  const phoneHref = safeTelHref(phone);
  const map = mapsHref(profile?.mapUrl, profile?.gps);
  const hours = [...(profile?.hours ?? [])].sort((a, b) => a.day - b.day);
  const employees = profile?.employees ?? [];
  const legacyWhatsapp = (office as LegacyOffice & { whatsapp?: string | null })
    .whatsapp;
  const whatsappNumber = (legacyWhatsapp || legacyPhone || "").replace(
    /\D/g,
    ""
  );
  const seaAddress = profile?.seaAddress?.trim() || "";
  const savedRates = profile?.shippingRates;
  const hasSavedRates = Boolean(
    savedRates && shippingRateKeys.some(key => savedRates[key] !== null)
  );
  const sourceRates = profile?.sourceShippingRates;
  const savedSourceRates = office.id === "nouakchott" ? sourceRates : undefined;
  const hasSavedSourceRates = Boolean(
    savedSourceRates &&
      nouakchottRateSources.some(source =>
        shippingRateKeys.some(key => savedSourceRates[source]?.[key] !== null)
      )
  );

  return (
    <article className="rounded-3xl border border-[#e1e7e8] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-[#eef3f0] px-3 py-1 text-xs font-semibold text-[#456e61]">
          {office.id === "nouakchott"
            ? copy.offices.mainOffice
            : office.id === "dubai"
              ? copy.offices.collection
              : copy.offices.servicePoint}
        </span>
        <Globe2 size={19} className="text-[#2e6280]" aria-hidden="true" />
      </div>
      <h3 className="mt-7 text-xl font-bold text-[#092d50]">
        {copy.offices.names[office.id as OfficeId]}
      </h3>

      <div className="mt-3 flex items-start gap-2 text-sm leading-6 text-[#63737a]">
        <MapPin
          size={16}
          className="mt-1 shrink-0 text-[#2e6280]"
          aria-hidden="true"
        />
        <span>{address || c.addressUnknown}</span>
      </div>
      {map && (
        <a
          href={map}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-2 text-xs font-bold text-[#2e6280] underline underline-offset-2"
        >
          <MapPin size={14} aria-hidden="true" />
          {c.map}
        </a>
      )}

      <div className="mt-5 space-y-2 border-t border-[#edf0f0] pt-4">
        <div className="flex items-start gap-2 text-sm text-[#63737a]">
          <Phone
            size={15}
            className="mt-0.5 shrink-0 text-[#2e6280]"
            aria-hidden="true"
          />
          {phoneHref ? (
            <a
              href={phoneHref}
              dir="ltr"
              className="font-semibold text-[#2e6280]"
            >
              {phone}
            </a>
          ) : (
            <span>{c.noPhone}</span>
          )}
        </div>
        {whatsappNumber && (
          <a
            href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`${c.requestAddress}: ${copy.offices.names[office.id as OfficeId]}`)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-xs font-bold text-[#2b7656]"
          >
            <MessageCircle size={14} aria-hidden="true" />
            {c.requestAddress}
          </a>
        )}
      </div>

      {(profile?.timezone || hours.length > 0) && (
        <div className="mt-4 rounded-2xl bg-[#f5f8f6] p-3 text-xs leading-5 text-[#63737a]">
          <div className="mb-1 flex items-center gap-2 font-bold text-[#092d50]">
            <Clock3 size={14} aria-hidden="true" />
            {c.hours}
          </div>
          {profile?.timezone && (
            <div>
              {c.timezone}: <span dir="ltr">{profile.timezone}</span>
            </div>
          )}
          {hours.map(day => (
            <div key={day.day} className="flex justify-between gap-3">
              <span>{weekdayLabel(day.day, language)}</span>
              <span dir="ltr">
                {day.closed || !day.work
                  ? c.closed
                  : `${day.work.start}–${day.work.end}`}
              </span>
              {!day.closed && day.break && (
                <span className="text-[#8b6a28]">
                  {c.break}:{" "}
                  <span dir="ltr">
                    {day.break.start}–{day.break.end}
                  </span>
                </span>
              )}
            </div>
          ))}
          {!hours.length && <p>{c.hoursUnknown}</p>}
        </div>
      )}

      {employees.length > 0 && (
        <div className="mt-4 border-t border-[#edf0f0] pt-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold text-[#092d50]">
            <Users size={14} aria-hidden="true" />
            {c.employees}
          </div>
          <div className="space-y-1.5">
            {employees.map(employee => {
              const href = safeTelHref(employee.phone);
              return (
                <div
                  key={employee.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#63737a]"
                >
                  <span>{employee.name}</span>
                  {href ? (
                    <a
                      href={href}
                      dir="ltr"
                      className="font-semibold text-[#2e6280]"
                    >
                      {employee.phone}
                    </a>
                  ) : (
                    <span>{employee.phone}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {(seaAddress || hasSavedRates) && (
        <div className="mt-4 border-t border-[#edf0f0] pt-4">
          <div className="mb-2 text-xs font-bold text-[#092d50]">
            {shippingCopy.savedRates}
          </div>
          {seaAddress && (
            <div className="mb-3 text-sm text-[#63737a]">
              <span className="font-semibold">
                {shippingCopy.savedSeaAddress}:{" "}
              </span>
              {seaAddress}
            </div>
          )}
          {hasSavedRates && (
            <div className="space-y-1.5">
              {shippingRateKeys.map(key => {
                const rate = savedRates?.[key];
                if (!rate) return null;
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-3 text-xs text-[#63737a]"
                  >
                    <span>{shippingCopy.serviceLabels[key]}</span>
                    <span dir="ltr" className="font-semibold text-[#2e6280]">
                      {rate.amount.toLocaleString(language)}{" "}
                      {shippingCopy.currencies[rate.currency]} ·{" "}
                      {shippingCopy.units[rate.unit]}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <p className="mt-3 text-[11px] leading-5 text-[#6a542c]">
            {shippingCopy.invoiceNotice}
          </p>
        </div>
      )}
      {hasSavedSourceRates && (
        <NouakchottSourceRatesDisplay
          rates={savedSourceRates!}
          shippingCopy={shippingCopy}
          copy={nouakchottCopy}
          language={language}
        />
      )}
    </article>
  );
}

function NouakchottSourceRatesDisplay({
  rates,
  shippingCopy,
  copy,
  language,
}: {
  rates: NonNullable<VersionedOfficeProfile["sourceShippingRates"]>;
  shippingCopy: ReturnType<typeof publicShippingCopyFor>;
  copy: ReturnType<typeof nouakchottRatesCopyFor>;
  language: Language;
}) {
  return (
    <div className="mt-4 border-t border-[#edf0f0] pt-4">
      <div className="mb-2 text-xs font-bold text-[#092d50]">
        {copy.savedRates}
      </div>
      <div className="space-y-3">
        {nouakchottRateSources.map(source => {
          const sourceRates = rates[source];
          const saved = shippingRateKeys.filter(key => sourceRates[key]);
          if (!saved.length) return null;
          return (
            <div
              key={source}
              className="rounded-xl bg-[#f5f8f6] p-3"
              aria-label={`${copy.fromCountry}: ${copy.sourceLabels[source]}`}
            >
              <div className="mb-1 text-xs font-bold text-[#456e61]">
                {copy.fromCountry}: {copy.sourceLabels[source]}
              </div>
              <div className="space-y-1.5">
                {saved.map(key => {
                  const rate = sourceRates[key];
                  if (!rate) return null;
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-3 text-xs text-[#63737a]"
                    >
                      <span>{shippingCopy.serviceLabels[key]}</span>
                      <span dir="ltr" className="font-semibold text-[#2e6280]">
                        {rate.amount.toLocaleString(language)}{" "}
                        {shippingCopy.currencies[rate.currency]} ·{" "}
                        {shippingCopy.units[rate.unit]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LegacyReference({
  copy,
  c,
}: {
  copy: PublicCopy;
  c: ReturnType<typeof branchDashboardCopy>;
}) {
  const known = officeConfig.flatMap(office =>
    office.phone ? [{ id: office.id as OfficeId, phone: office.phone }] : []
  );
  return (
    <aside className="rounded-2xl border border-[#eadfc5] bg-[#fffaf0] px-4 py-3 text-sm text-[#6a542c]">
      <div className="font-bold text-[#7b5a1d]">{c.legacy}</div>
      <p className="mt-1 text-xs leading-5">{c.legacyDetail}</p>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
        {known.map(office => {
          const href = safeTelHref(office.phone);
          return href ? (
            <a
              key={office.id}
              href={href}
              dir="ltr"
              className="inline-flex items-center gap-1 font-semibold text-[#2e6280]"
            >
              <Phone size={13} aria-hidden="true" />
              {copy.offices.names[office.id as OfficeId]}: {office.phone}
            </a>
          ) : null;
        })}
      </div>
    </aside>
  );
}
