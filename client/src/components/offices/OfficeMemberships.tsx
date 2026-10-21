import { useEffect, useState } from "react";
import type { AppRole } from "@shared/operations";
import type { OfficeId, OfficeMember } from "@shared/branches";
import { officeIds } from "@/lib/branchSettingsCopy";
import { useLanguage } from "@/contexts/LanguageContext";
import { branchSettingsCopyFor, officeName } from "@/lib/branchSettingsCopy";
import {
  packingInputClass,
  packingPrimaryClass,
} from "@/components/packing/PackingPrimitives";

const assignableRoles = [
  "staff",
  "accountant",
  "viewer",
  "tracking_staff",
  "supervisor",
] as const;
type AssignableRole = (typeof assignableRoles)[number];
type MemberDraft = {
  role: AssignableRole;
  offices: OfficeId[];
  dirty: boolean;
  version: number;
};

const roleLabels = {
  ar: {
    staff: "موظف مستودع",
    accountant: "موظف حسابات",
    viewer: "مشاهد",
    tracking_staff: "موظف تتبع",
    supervisor: "مشرف",
  },
  en: {
    staff: "Warehouse employee",
    accountant: "Accounts employee",
    viewer: "Viewer",
    tracking_staff: "Tracking employee",
    supervisor: "Supervisor",
  },
  zh: {
    staff: "仓库员工",
    accountant: "会计员工",
    viewer: "查看者",
    tracking_staff: "追踪员工",
    supervisor: "主管",
  },
  tr: {
    staff: "Depo çalışanı",
    accountant: "Muhasebe çalışanı",
    viewer: "Görüntüleyici",
    tracking_staff: "Takip çalışanı",
    supervisor: "Süpervizör",
  },
} as const;

type OfficeMembershipsProps = {
  members: OfficeMember[];
  canEdit: boolean;
  online: boolean;
  pending?: boolean;
  onSave: (input: {
    userId: number;
    role: AssignableRole;
    offices: OfficeId[];
    expectedVersion: number;
  }) => Promise<OfficeMember | null>;
};

function draftFrom(member: OfficeMember): MemberDraft {
  return {
    role: assignableRoles.includes(member.role as AssignableRole)
      ? (member.role as AssignableRole)
      : "staff",
    offices: member.offices ? [...member.offices] : [],
    dirty: false,
    version: member.version,
  };
}

export default function OfficeMemberships({
  members,
  canEdit,
  online,
  pending = false,
  onSave,
}: OfficeMembershipsProps) {
  const { language } = useLanguage();
  const c = branchSettingsCopyFor(language);
  const [drafts, setDrafts] = useState<Record<number, MemberDraft>>({});
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setDrafts(current => {
      const next = { ...current };
      for (const member of members)
        if (!next[member.userId]?.dirty)
          next[member.userId] = draftFrom(member);
      return next;
    });
  }, [members]);

  const patch = (member: OfficeMember, value: Partial<MemberDraft>) => {
    setError("");
    setNotice("");
    setDrafts(current => ({
      ...current,
      [member.userId]: {
        ...(current[member.userId] ?? draftFrom(member)),
        ...value,
        dirty: true,
      },
    }));
  };

  const save = async (member: OfficeMember) => {
    const draft = drafts[member.userId] ?? draftFrom(member);
    if (!canEdit || pending || member.role === "admin") return;
    if (!online) {
      setError(c.onlineRequired);
      return;
    }
    if (
      !window.confirm(
        `${c.saveMember}\n${member.name || member.email}\n${c.role}: ${roleLabels[language][draft.role]}\n${c.offices}: ${draft.offices.map(id => officeName(language, id)).join(", ") || c.noOfficeAccess}\n\n${c.confirm}?`
      )
    )
      return;
    try {
      const result = await onSave({
        userId: member.userId,
        role: draft.role,
        offices: [...draft.offices],
        expectedVersion: draft.version,
      });
      if (result) {
        setDrafts(current => ({
          ...current,
          [member.userId]: draftFrom(result),
        }));
        setNotice(c.memberSaved);
      } else setError(c.memberSaveError);
    } catch {
      setError(c.memberSaveError);
    }
  };

  return (
    <section className="rounded-2xl border border-[#dce4e7] bg-white p-5 shadow-sm">
      <div className="border-b border-[#edf1f1] pb-4">
        <h2 className="text-lg font-black text-[#092d50]">{c.memberships}</h2>
        <p className="mt-1 text-sm text-[#718088]">{c.membershipsHint}</p>
        <p className="mt-2 text-xs text-[#718088]">
          {c.employeeLoginRequired}. {c.contactNoAccess}
        </p>
      </div>
      {!canEdit && (
        <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm font-semibold text-[#52636e]">
          {c.noMemberAccess}
        </p>
      )}
      <div className="mt-5 grid gap-4">
        {members.map(member => {
          const draft = drafts[member.userId] ?? draftFrom(member);
          const locked = member.role === "admin";
          return (
            <article
              key={member.userId}
              className="rounded-2xl border border-[#edf1f1] bg-[#fbfcfb] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-black text-[#092d50]">
                    {member.name ||
                      member.email ||
                      `${c.member} #${member.userId}`}
                  </h3>
                  <p className="mt-1 text-sm text-[#718088]">
                    {member.email || "—"}
                  </p>
                </div>
                <span className="text-xs text-[#718088]">
                  {c.currentVersion}: {member.version}
                </span>
              </div>
              {member.offices === null && (
                <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-950">
                  {c.globalLegacy}
                </p>
              )}
              {locked && (
                <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-700">
                  {c.rootAdminLocked}
                </p>
              )}
              <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_2fr]">
                <label className="grid gap-1.5 text-sm font-semibold text-[#243f52]">
                  <span>{c.role}</span>
                  <select
                    className={packingInputClass}
                    value={draft.role}
                    disabled={!canEdit || locked || pending}
                    onChange={event =>
                      patch(member, {
                        role: event.target.value as AssignableRole,
                      })
                    }
                  >
                    {assignableRoles.map(role => (
                      <option key={role} value={role}>
                        {roleLabels[language][role]}
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset>
                  <legend className="text-sm font-semibold text-[#243f52]">
                    {c.offices}
                  </legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {officeIds.map(officeId => (
                      <label
                        key={officeId}
                        className="flex items-center gap-2 rounded-lg border border-[#e5ecee] bg-white px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={draft.offices.includes(officeId)}
                          disabled={!canEdit || locked || pending}
                          onChange={event =>
                            patch(member, {
                              offices: event.target.checked
                                ? [...draft.offices, officeId]
                                : draft.offices.filter(id => id !== officeId),
                            })
                          }
                        />
                        {officeName(language, officeId)}
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-[#718088]">
                    {c.contactNoAccess}
                  </p>
                </fieldset>
              </div>
              {canEdit && (
                <div className="mt-4 flex justify-end">
                  <button
                    className={packingPrimaryClass}
                    disabled={locked || !draft.dirty || pending || !online}
                    onClick={() => void save(member)}
                  >
                    {c.saveMember}
                  </button>
                </div>
              )}
            </article>
          );
        })}
        {members.length === 0 && (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-[#718088]">
            {c.noMemberAccess}
          </p>
        )}
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
    </section>
  );
}

export type { AssignableRole };
export type { AppRole };
