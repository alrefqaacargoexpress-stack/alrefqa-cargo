import { useEffect, useMemo, useRef, useState } from "react";
import { Save, Trash2 } from "lucide-react";
import {
  officeProfileSchema,
  type OfficeProfile,
  type OfficeId,
  type VersionedOfficeProfile,
} from "@shared/branches";
import { useLanguage } from "@/contexts/LanguageContext";
import { branchSettingsCopyFor } from "@/lib/branchSettingsCopy";
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
  days: DraftDay[];
  employees: OfficeProfile["employees"];
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
    expectedVersion: number
  ) => Promise<VersionedOfficeProfile | null>;
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

function draftFrom(profile: VersionedOfficeProfile): Draft {
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
    days,
    employees: profile.employees.map(employee => ({ ...employee })),
  };
}

function toProfile(draft: Draft, officeId: OfficeId): OfficeProfile {
  return {
    officeId,
    address: draft.address.trim(),
    phone: draft.phone.trim(),
    timezone: draft.timezone,
    mapUrl: draft.mapUrl.trim() || null,
    gps: null,
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
    employees: draft.employees.map(employee => ({
      id: employee.id,
      name: employee.name.trim(),
      phone: employee.phone.trim(),
    })),
  };
}

function validRange(start: string, end: string) {
  return timePattern.test(start) && timePattern.test(end) && start < end;
}

function validPhone(value: string) {
  return phonePattern.test(value) && (value.match(/[0-9]/g)?.length ?? 0) >= 5;
}

export default function OfficeProfileEditor({
  profile,
  canEdit,
  online,
  pending = false,
  onSave,
  onDirtyChange,
}: OfficeProfileEditorProps) {
  const { language } = useLanguage();
  const c = branchSettingsCopyFor(language);
  const [draft, setDraft] = useState(() => draftFrom(profile));
  const [dirty, setDirty] = useState(false);
  const [baseVersion, setBaseVersion] = useState(profile.version);
  const officeDrafts = useRef(
    new Map<OfficeId, { draft: Draft; dirty: boolean; version: number }>()
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const officeRef = useRef(profile.officeId);

  useEffect(() => {
    if (officeRef.current !== profile.officeId) {
      officeDrafts.current.set(officeRef.current, {
        draft,
        dirty,
        version: baseVersion,
      });
      officeRef.current = profile.officeId;
      const cached = officeDrafts.current.get(profile.officeId);
      setDraft(cached?.dirty ? cached.draft : draftFrom(profile));
      setDirty(cached?.dirty ?? false);
      setBaseVersion(cached?.dirty ? cached.version : profile.version);
      setError("");
      setNotice("");
    } else if (!dirty && !pending) {
      setDraft(draftFrom(profile));
      setBaseVersion(profile.version);
    }
  }, [profile, dirty, pending]);

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const setChanged = (next: Draft) => {
    setDraft(next);
    setDirty(true);
    setError("");
    setNotice("");
  };

  const summary = useMemo(
    () =>
      draft.employees
        .map(employee => `${employee.name.trim()} — ${employee.phone.trim()}`)
        .filter(Boolean)
        .join("\n"),
    [draft.employees]
  );

  const updateDay = (index: number, patch: Partial<DraftDay>) => {
    setChanged({
      ...draft,
      days: draft.days.map((day, dayIndex) =>
        dayIndex === index ? { ...day, ...patch } : day
      ),
    });
  };

  const addContact = () => {
    const name = window.prompt(c.employeeName) ?? "";
    const phone = window.prompt(c.employeePhone) ?? "";
    if (!name.trim() || !phone.trim()) {
      setError(c.contactRequired);
      return;
    }
    if (!validPhone(phone.trim())) {
      setError(c.phoneInvalid);
      return;
    }
    if (
      !window.confirm(
        `${c.contactPayload}\n${name.trim()} — ${phone.trim()}\n\n${c.confirm}?`
      )
    )
      return;
    setChanged({
      ...draft,
      employees: [
        ...draft.employees,
        { id: crypto.randomUUID(), name: name.trim(), phone: phone.trim() },
      ],
    });
  };

  const deleteContact = (id: string) => {
    const contact = draft.employees.find(employee => employee.id === id);
    if (!contact) return;
    if (
      !window.confirm(
        `${c.deleteContact}\n${c.contactPayload}\n${contact.name} — ${contact.phone}\n\n${c.confirm}?`
      )
    )
      return;
    setChanged({
      ...draft,
      employees: draft.employees.filter(employee => employee.id !== id),
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
    for (const employee of draft.employees) {
      if (!employee.name.trim() || !validPhone(employee.phone.trim()))
        return c.phoneInvalid;
    }
    return "";
  };

  const save = async () => {
    if (pending || !canEdit) return;
    if (!online) {
      setError(c.onlineRequired);
      return;
    }
    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }
    const next = toProfile(draft, profile.officeId);
    const parsed = officeProfileSchema.safeParse(next);
    if (!parsed.success) {
      setError(c.hoursInvalid);
      return;
    }
    if (!window.confirm(`${c.saveConfirm}\n\n${summary || c.noSchedule}`))
      return;
    const result = await onSave(parsed.data, baseVersion);
    if (result && officeRef.current !== result.officeId) {
      officeDrafts.current.set(result.officeId, {
        draft: draftFrom(result),
        dirty: false,
        version: result.version,
      });
      return;
    }
    if (result) {
      setDraft(draftFrom(result));
      setBaseVersion(result.version);
      setDirty(false);
      setNotice(c.saved);
      setError("");
    } else setError(c.conflictDetail);
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

      <div className="mt-6 rounded-2xl border border-[#edf1f1] bg-[#fbfcfb] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-black text-[#092d50]">{c.employees}</h3>
            <p className="mt-1 text-xs text-[#718088]">
              {c.publicContactsNotice}
            </p>
          </div>
          <button
            type="button"
            className={packingSecondaryClass}
            disabled={!canEdit || pending}
            onClick={addContact}
          >
            {c.addContact}
          </button>
        </div>
        <div className="mt-4 grid gap-3">
          {draft.employees.map(employee => (
            <div
              key={employee.id}
              className="grid gap-3 rounded-xl border border-[#e5ecee] bg-white p-3 md:grid-cols-[1fr_1fr_auto] md:items-end"
            >
              <PackingField label={c.employeeName}>
                <input
                  className={packingInputClass}
                  value={employee.name}
                  disabled={!canEdit || pending}
                  onChange={event =>
                    setChanged({
                      ...draft,
                      employees: draft.employees.map(item =>
                        item.id === employee.id
                          ? { ...item, name: event.target.value }
                          : item
                      ),
                    })
                  }
                />
              </PackingField>
              <PackingField label={c.employeePhone}>
                <input
                  dir="ltr"
                  className={packingInputClass}
                  value={employee.phone}
                  disabled={!canEdit || pending}
                  onChange={event =>
                    setChanged({
                      ...draft,
                      employees: draft.employees.map(item =>
                        item.id === employee.id
                          ? { ...item, phone: event.target.value }
                          : item
                      ),
                    })
                  }
                />
              </PackingField>
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center rounded-xl p-2 text-red-700 hover:bg-red-50"
                aria-label={c.deleteContact}
                disabled={!canEdit || pending}
                onClick={() => deleteContact(employee.id)}
              >
                <Trash2 size={17} />
              </button>
            </div>
          ))}
          {draft.employees.length === 0 && (
            <p className="text-sm text-[#718088]">{c.noSchedule}</p>
          )}
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
        {canEdit && (
          <button
            className={packingPrimaryClass}
            disabled={!dirty || pending || !online}
            onClick={() => void save()}
          >
            <Save size={16} className="me-2" />
            {pending ? c.saving : c.saveProfile}
          </button>
        )}
      </div>
    </section>
  );
}
