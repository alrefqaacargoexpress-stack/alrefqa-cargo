import { useEffect, useRef, useState } from "react";
import { Save } from "lucide-react";
import {
  officeProfileSchema,
  type OfficeProfile,
  type OfficeId,
  type VersionedOfficeProfile,
} from "@shared/branches";
import { useLanguage } from "@/contexts/LanguageContext";
import { branchSettingsCopyFor } from "@/lib/branchSettingsCopy";
import {
  publicShippingCopyFor,
  type PublicShippingCopy,
} from "@/lib/publicShippingCopy";
import { nouakchottRatesCopyFor } from "@/lib/nouakchottRatesCopy";
import PublicShippingRatesEditor, {
  shippingRateDraftsFrom,
  shippingRatesFromDrafts,
  type ShippingRateDrafts,
} from "@/components/offices/PublicShippingRatesEditor";
import NouakchottSourceRatesEditor, {
  nouakchottSourceRateDraftsFrom,
  nouakchottSourceRatesFromDrafts,
  type NouakchottSourceRateDrafts,
} from "@/components/offices/NouakchottSourceRatesEditor";
import {
  PackingField,
  packingInputClass,
  packingPrimaryClass,
  packingSecondaryClass,
} from "@/components/packing/PackingPrimitives";

type DraftDay = {
  enabled: boolean;
  closed: boolean;
  start: string;
  end: string;
  breakEnabled: boolean;
  breakStart: string;
  breakEnd: string;
};

type Draft = {
  address: string;
  phone: string;
  timezone: OfficeProfile["timezone"];
  mapUrl: string;
  seaAddress: string;
  shippingRates: ShippingRateDrafts;
  sourceRates: NouakchottSourceRateDrafts;
  days: DraftDay[];
};

type CachedOfficeDraft = {
  draft: Draft;
  dirty: boolean;
  baseVersion: number;
  baseProfile: OfficeProfile;
};

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const phonePattern = /^\+?[0-9 ()-]{5,40}$/;
const timezones: OfficeProfile["timezone"][] = [
  "Africa/Nouakchott",
  "Asia/Dubai",
  "Asia/Shanghai",
  "Europe/Istanbul",
];
const dayNames = {
  ar: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
  en: [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ],
  zh: ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"],
  tr: [
    "Pazar",
    "Pazartesi",
    "Salı",
    "Çarşamba",
    "Perşembe",
    "Cuma",
    "Cumartesi",
  ],
} as const;

export type OfficeProfileEditorProps = {
  profile: VersionedOfficeProfile;
  canEdit: boolean;
  online: boolean;
  pending?: boolean;
  onSave: (
    profile: OfficeProfile,
    expectedVersion: number,
    baseProfile: OfficeProfile
  ) => Promise<VersionedOfficeProfile | null>;
  onReload?: () => Promise<VersionedOfficeProfile | null>;
  onDirtyChange?: (dirty: boolean) => void;
};

function emptyDay(): DraftDay {
  return {
    enabled: false,
    closed: true,
    start: "",
    end: "",
    breakEnabled: false,
    breakStart: "",
    breakEnd: "",
  };
}

function profileWithoutVersion(profile: VersionedOfficeProfile): OfficeProfile {
  const { version: _version, ...base } = profile;
  return base;
}

function draftFrom(profile: VersionedOfficeProfile | OfficeProfile): Draft {
  const days = Array.from({ length: 7 }, emptyDay);
  for (const day of profile.hours) {
    const item = days[day.day];
    if (!item) continue;
    item.enabled = true;
    item.closed = day.closed;
    item.start = day.work?.start ?? "";
    item.end = day.work?.end ?? "";
    item.breakEnabled = Boolean(day.break);
    item.breakStart = day.break?.start ?? "";
    item.breakEnd = day.break?.end ?? "";
  }
  return {
    address: profile.address,
    phone: profile.phone,
    timezone: profile.timezone,
    mapUrl: profile.mapUrl ?? "",
    seaAddress: profile.seaAddress ?? "",
    shippingRates: shippingRateDraftsFrom(profile.shippingRates),
    sourceRates: nouakchottSourceRateDraftsFrom(profile.sourceShippingRates),
    days,
  };
}

function toProfile(draft: Draft, baseProfile: OfficeProfile): OfficeProfile {
  const next: OfficeProfile = {
    ...baseProfile,
    address: draft.address.trim(),
    phone: draft.phone.trim(),
    timezone: draft.timezone,
    mapUrl: draft.mapUrl.trim() || null,
    seaAddress: draft.seaAddress.trim(),
    shippingRates: shippingRatesFromDrafts(draft.shippingRates),
    hours: draft.days.flatMap((day, index) => {
      if (!day.enabled) return [];
      return [
        {
          day: index,
          closed: day.closed,
          work: day.closed ? null : { start: day.start, end: day.end },
          break:
            day.closed || !day.breakEnabled
              ? null
              : { start: day.breakStart, end: day.breakEnd },
        },
      ];
    }),
  };
  if (next.officeId === "nouakchott") {
    return {
      ...next,
      sourceShippingRates: nouakchottSourceRatesFromDrafts(draft.sourceRates),
    };
  }
  const { sourceShippingRates: _sourceShippingRates, ...withoutSourceRates } =
    next;
  return withoutSourceRates;
}

function validRange(start: string, end: string) {
  return timePattern.test(start) && timePattern.test(end) && start < end;
}

function validPhone(value: string) {
  return phonePattern.test(value) && (value.match(/[0-9]/g)?.length ?? 0) >= 5;
}

function errorCode(caught: unknown): string | undefined {
  if (!caught || typeof caught !== "object") return undefined;
  const value = caught as {
    code?: unknown;
    data?: { code?: unknown };
    shape?: { data?: { code?: unknown } };
  };
  for (const code of [value.data?.code, value.shape?.data?.code, value.code]) {
    if (typeof code === "string") return code;
  }
  return undefined;
}

function errorCopy(caught: unknown, c: PublicShippingCopy) {
  switch (errorCode(caught)) {
    case "CONFLICT":
      return c.conflictError;
    case "FORBIDDEN":
      return c.permissionError;
    case "BAD_REQUEST":
      return c.validationError;
    case "UNAUTHORIZED":
      return c.authError;
    default:
      return c.saveFailed;
  }
}

export default function OfficeProfileEditor({
  profile,
  canEdit,
  online,
  pending = false,
  onSave,
  onReload,
  onDirtyChange,
}: OfficeProfileEditorProps) {
  const { language } = useLanguage();
  const c = branchSettingsCopyFor(language);
  const shippingCopy = publicShippingCopyFor(language);
  const nouakchottCopy = nouakchottRatesCopyFor(language);
  const [draft, setDraft] = useState(() => draftFrom(profile));
  const [dirty, setDirty] = useState(false);
  const [baseVersion, setBaseVersion] = useState(profile.version);
  const [baseProfile, setBaseProfile] = useState<OfficeProfile>(() =>
    profileWithoutVersion(profile)
  );
  const officeDrafts = useRef(new Map<OfficeId, CachedOfficeDraft>());
  const trustedProfiles = useRef(new Map<OfficeId, VersionedOfficeProfile>());
  const saveLock = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const officeRef = useRef(profile.officeId);

  useEffect(() => {
    if (officeRef.current !== profile.officeId) {
      officeDrafts.current.set(officeRef.current, {
        draft,
        dirty,
        baseVersion,
        baseProfile,
      });
      officeRef.current = profile.officeId;
      const cached = officeDrafts.current.get(profile.officeId);
      if (cached) {
        setDraft(cached.draft);
        setDirty(cached.dirty);
        setBaseVersion(cached.baseVersion);
        setBaseProfile(cached.baseProfile);
      } else {
        setDraft(draftFrom(profile));
        setDirty(false);
        setBaseVersion(profile.version);
        setBaseProfile(profileWithoutVersion(profile));
      }
      setError("");
      setNotice("");
      return;
    }

    if (!dirty && !pending) {
      const trusted = trustedProfiles.current.get(profile.officeId);
      if (trusted && profile.version < trusted.version) return;
      if (trusted) trustedProfiles.current.delete(profile.officeId);
      setDraft(draftFrom(profile));
      setBaseVersion(profile.version);
      setBaseProfile(profileWithoutVersion(profile));
    }
  }, [profile, dirty, pending]);

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const setChanged = (next: Draft) => {
    setDraft(next);
    setDirty(true);
    setError("");
    setNotice("");
  };

  const updateDay = (index: number, patch: Partial<DraftDay>) => {
    setChanged({
      ...draft,
      days: draft.days.map((day, dayIndex) =>
        dayIndex === index ? { ...day, ...patch } : day
      ),
    });
  };

  const validate = () => {
    if (draft.phone.trim() && !validPhone(draft.phone.trim()))
      return c.phoneInvalid;
    if (draft.mapUrl.trim()) {
      try {
        const url = new URL(draft.mapUrl.trim());
        if (url.protocol !== "https:") return c.gpsInvalid;
      } catch {
        return c.gpsInvalid;
      }
    }
    for (const day of draft.days) {
      if (!day.enabled || day.closed) continue;
      if (!validRange(day.start, day.end)) return c.hoursInvalid;
      if (
        day.breakEnabled &&
        (!validRange(day.breakStart, day.breakEnd) ||
          day.breakStart < day.start ||
          day.breakEnd > day.end)
      )
        return c.hoursInvalid;
    }
    for (const rate of Object.values(
      shippingRatesFromDrafts(draft.shippingRates)
    )) {
      if (
        rate &&
        (!Number.isFinite(rate.amount) ||
          rate.amount < 0 ||
          rate.amount > 999999999)
      )
        return shippingCopy.validationError;
      if (
        rate &&
        Math.abs(rate.amount * 100 - Math.round(rate.amount * 100)) > 0.00001
      )
        return shippingCopy.validationError;
    }
    if (baseProfile.officeId === "nouakchott") {
      for (const source of Object.values(
        nouakchottSourceRatesFromDrafts(draft.sourceRates)
      )) {
        for (const rate of Object.values(source)) {
          if (
            rate &&
            (!Number.isFinite(rate.amount) ||
              rate.amount < 0 ||
              rate.amount > 999999999)
          )
            return shippingCopy.validationError;
          if (
            rate &&
            Math.abs(rate.amount * 100 - Math.round(rate.amount * 100)) >
              0.00001
          )
            return shippingCopy.validationError;
        }
      }
    }
    return "";
  };

  const save = async () => {
    if (saveLock.current || pending || !canEdit) return;
    if (!online) {
      setError(c.onlineRequired);
      return;
    }
    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }
    const next = toProfile(draft, baseProfile);
    const parsed = officeProfileSchema.safeParse(next);
    if (!parsed.success) {
      setError(shippingCopy.validationError);
      return;
    }
    if (!window.confirm(`${c.saveConfirm}\n\n${c.noSchedule}`)) return;
    saveLock.current = true;
    try {
      const result = await onSave(parsed.data, baseVersion, baseProfile);
      if (!result) {
        setError(shippingCopy.saveFailed);
        return;
      }
      trustedProfiles.current.set(result.officeId, result);
      officeDrafts.current.delete(result.officeId);
      setDraft(draftFrom(result));
      setBaseVersion(result.version);
      setBaseProfile(profileWithoutVersion(result));
      setDirty(false);
      setNotice(c.saved);
      setError("");
    } catch (caught) {
      setError(errorCopy(caught, shippingCopy));
    } finally {
      saveLock.current = false;
    }
  };

  const reload = async () => {
    if (saveLock.current || pending || !onReload) return;
    if (dirty && !window.confirm(shippingCopy.reloadLatestConfirm)) return;
    setNotice("");
    setError("");
    saveLock.current = true;
    try {
      const result = await onReload();
      if (!result) {
        setError(shippingCopy.reloadFailed);
        return;
      }
      trustedProfiles.current.set(result.officeId, result);
      officeDrafts.current.delete(result.officeId);
      setDraft(draftFrom(result));
      setBaseVersion(result.version);
      setBaseProfile(profileWithoutVersion(result));
      setDirty(false);
      setError("");
      setNotice(shippingCopy.reloadLatestDiscarded);
    } catch (caught) {
      setError(errorCopy(caught, shippingCopy));
    } finally {
      saveLock.current = false;
    }
  };

  return (
    <section className="rounded-2xl border border-[#dce4e7] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#edf1f1] pb-4">
        <div>
          <h2 className="text-lg font-black text-[#092d50]">{c.profile}</h2>
          <p className="mt-1 text-sm text-[#718088]">{c.profileHint}</p>
        </div>
        <span className="text-xs text-[#718088]">
          {c.currentVersion}: {profile.version}
        </span>
      </div>
      <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-950">
        {c.publicNotice}
      </p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <PackingField label={c.address}>
          <input
            className={packingInputClass}
            value={draft.address}
            disabled={!canEdit || pending}
            onChange={event =>
              setChanged({ ...draft, address: event.target.value })
            }
          />
        </PackingField>
        <PackingField label={c.phone}>
          <input
            className={packingInputClass}
            value={draft.phone}
            disabled={!canEdit || pending}
            onChange={event =>
              setChanged({ ...draft, phone: event.target.value })
            }
          />
        </PackingField>
        <PackingField label={c.timezone}>
          <select
            className={packingInputClass}
            value={draft.timezone}
            disabled={!canEdit || pending}
            onChange={event =>
              setChanged({
                ...draft,
                timezone: event.target.value as OfficeProfile["timezone"],
              })
            }
          >
            {timezones.map(timezone => (
              <option key={timezone} value={timezone}>
                {timezone}
              </option>
            ))}
          </select>
        </PackingField>
      </div>

      <div className="mt-5 rounded-2xl border border-[#dce4e7] bg-[#f7fbfa] p-4">
        <h3 className="font-black text-[#092d50]">
          {baseProfile.officeId === "nouakchott"
            ? shippingCopy.seaAddress
            : shippingCopy.sectionTitle}
        </h3>
        <p className="mt-1 text-xs text-[#718088]">
          {baseProfile.officeId === "nouakchott"
            ? shippingCopy.seaAddressHint
            : shippingCopy.sectionHint}
        </p>
        <div className="mt-4">
          <PackingField label={shippingCopy.seaAddress}>
            <input
              className={packingInputClass}
              value={draft.seaAddress}
              placeholder={shippingCopy.seaAddressHint}
              disabled={!canEdit || pending}
              onChange={event =>
                setChanged({ ...draft, seaAddress: event.target.value })
              }
            />
          </PackingField>
        </div>
        {baseProfile.officeId !== "nouakchott" && (
          <>
            <PublicShippingRatesEditor
              value={draft.shippingRates}
              copy={shippingCopy}
              disabled={!canEdit || pending}
              onChange={shippingRates =>
                setChanged({ ...draft, shippingRates })
              }
            />
            <p className="mt-3 text-xs font-semibold text-[#6a542c]">
              {shippingCopy.publicWarning}
            </p>
          </>
        )}
      </div>

      {baseProfile.officeId === "nouakchott" && (
        <NouakchottSourceRatesEditor
          value={draft.sourceRates}
          shippingCopy={shippingCopy}
          copy={nouakchottCopy}
          disabled={!canEdit || pending}
          onChange={sourceRates => setChanged({ ...draft, sourceRates })}
        />
      )}

      <div className="mt-6 rounded-2xl border border-[#edf1f1] bg-[#fbfcfb] p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-black text-[#092d50]">{c.gps}</h3>
            <p className="mt-1 text-xs text-[#718088]">{c.gpsHint}</p>
          </div>
          <span className="text-xs text-[#718088]">{c.manualGpsOnly}</span>
        </div>
        <PackingField label={c.mapLink}>
          <input
            dir="ltr"
            inputMode="url"
            type="url"
            placeholder="https://maps.google.com/..."
            className={packingInputClass}
            value={draft.mapUrl}
            disabled={!canEdit || pending}
            onChange={event =>
              setChanged({ ...draft, mapUrl: event.target.value })
            }
          />
        </PackingField>
      </div>

      <div className="mt-6 rounded-2xl border border-[#edf1f1] bg-[#fbfcfb] p-4">
        <h3 className="font-black text-[#092d50]">{c.workHours}</h3>
        <p className="mt-1 text-xs text-[#718088]">{c.workHoursHint}</p>
        <div className="mt-4 grid gap-3">
          {draft.days.map((day, index) => (
            <div
              key={index}
              className="rounded-xl border border-[#e5ecee] bg-white p-3"
            >
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex min-w-40 items-center gap-2 text-sm font-bold text-[#243f52]">
                  <input
                    type="checkbox"
                    checked={day.enabled}
                    disabled={!canEdit || pending}
                    onChange={event =>
                      updateDay(index, { enabled: event.target.checked })
                    }
                  />
                  {c.setSchedule}:{" "}
                  {dayNames[language as keyof typeof dayNames][index]}
                </label>
                {day.enabled && (
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={day.closed}
                      disabled={!canEdit || pending}
                      onChange={event =>
                        updateDay(index, { closed: event.target.checked })
                      }
                    />
                    {c.closed}
                  </label>
                )}
              </div>
              {day.enabled && !day.closed && (
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <PackingField label={c.start}>
                    <input
                      type="time"
                      step="60"
                      className={packingInputClass}
                      value={day.start}
                      disabled={!canEdit || pending}
                      onChange={event =>
                        updateDay(index, { start: event.target.value })
                      }
                    />
                  </PackingField>
                  <PackingField label={c.end}>
                    <input
                      type="time"
                      step="60"
                      className={packingInputClass}
                      value={day.end}
                      disabled={!canEdit || pending}
                      onChange={event =>
                        updateDay(index, { end: event.target.value })
                      }
                    />
                  </PackingField>
                  <div className="grid gap-2">
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <input
                        type="checkbox"
                        checked={day.breakEnabled}
                        disabled={!canEdit || pending}
                        onChange={event =>
                          updateDay(index, {
                            breakEnabled: event.target.checked,
                          })
                        }
                      />
                      {c.break}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        aria-label={c.start}
                        type="time"
                        step="60"
                        className={packingInputClass}
                        value={day.breakStart}
                        disabled={!canEdit || pending || !day.breakEnabled}
                        onChange={event =>
                          updateDay(index, { breakStart: event.target.value })
                        }
                      />
                      <input
                        aria-label={c.end}
                        type="time"
                        step="60"
                        className={packingInputClass}
                        value={day.breakEnd}
                        disabled={!canEdit || pending || !day.breakEnabled}
                        onChange={event =>
                          updateDay(index, { breakEnd: event.target.value })
                        }
                      />
                    </div>
                  </div>
                </div>
              )}
              {(!day.enabled || day.closed) && (
                <p className="mt-2 text-xs text-[#718088]">
                  {day.enabled ? c.closed : c.noSchedule}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800"
        >
          {notice}
        </p>
      )}
      {dirty && (
        <p className="mt-4 text-xs font-bold text-amber-800">
          {c.dirty} · {canEdit ? (online ? "" : c.onlineRequired) : c.readOnly}
        </p>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#edf1f1] pt-4">
        <p className="text-xs text-[#718088]">
          {canEdit ? c.adminOnly : c.readOnly}
        </p>
        <div className="flex flex-wrap gap-2">
          {onReload && (
            <button
              type="button"
              className={packingSecondaryClass}
              disabled={saveLock.current || pending}
              onClick={() => void reload()}
            >
              {shippingCopy.reloadLatest}
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              className={packingPrimaryClass}
              disabled={!dirty || pending || !online || saveLock.current}
              onClick={() => void save()}
            >
              <Save size={16} className="me-2" />
              {pending ? c.saving : c.saveProfile}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
