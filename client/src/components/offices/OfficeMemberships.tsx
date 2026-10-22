import { useEffect, useState } from "react";
import type { AppRole } from "@shared/operations";
import type { OfficeId, OfficeMember } from "@shared/branches";
import { officeIds } from "@/lib/branchSettingsCopy";
import { useLanguage } from "@/contexts/LanguageContext";
import { branchSettingsCopyFor, officeName } from "@/lib/branchSettingsCopy";
import {
  packingInputClass,
  packingPrimaryClass,
  packingSecondaryClass,
} from "@/components/packing/PackingPrimitives";

const assignableRoles = [
  "office_manager",
  "staff",
  "accountant",
  "viewer",
  "tracking_staff",
  "supervisor",
] as const;
type AssignableRole = (typeof assignableRoles)[number];
const officeManagerOfficeIds: OfficeId[] = ["dubai", "china", "turkey"];
type MemberDraft = {
  role: AssignableRole;
  offices: OfficeId[];
  homeOffice: OfficeId | null;
  canUpdateTracking: boolean;
  dirty: boolean;
  version: number;
};

const roleLabels = {
  ar: {
    office_manager: "مدير مكتب",
    staff: "موظف مستودع",
    accountant: "موظف حسابات",
    viewer: "مشاهد",
    tracking_staff: "موظف تتبع",
    supervisor: "مشرف",
  },
  en: {
    office_manager: "Office manager",
    staff: "Warehouse employee",
    accountant: "Accounts employee",
    viewer: "Viewer",
    tracking_staff: "Tracking employee",
    supervisor: "Supervisor",
  },
  zh: {
    office_manager: "办公室经理",
    staff: "仓库员工",
    accountant: "会计员工",
    viewer: "查看者",
    tracking_staff: "追踪员工",
    supervisor: "主管",
  },
  tr: {
    office_manager: "Ofis müdürü",
    staff: "Depo çalışanı",
    accountant: "Muhasebe çalışanı",
    viewer: "Görüntüleyici",
    tracking_staff: "Takip çalışanı",
    supervisor: "Süpervizör",
  },
} as const;

const homeOfficeCopy = {
  ar: {
    label: "مكتب الموظف الأساسي",
    none: "حسب المكتب الوحيد / غير محدد",
    hint: "يُسند الدين إلى مكتب الموظف. يجب أن يكون المكتب ضمن المكاتب المحددة.",
    required:
      "حدد مكتبًا للموظف قبل منح الصلاحية، ومكتبًا أساسيًا للمحاسب متعدد المكاتب.",
  },
  en: {
    label: "Employee home office",
    none: "Use sole office / not specified",
    hint: "Debt is assigned to the employee's office. It must be one of the checked offices.",
    required:
      "Select an office before granting access, and a home office for a multi-office accountant.",
  },
  zh: {
    label: "员工主办公室",
    none: "按唯一办公室 / 未指定",
    hint: "债务归属于员工办公室；该办公室必须在已勾选的办公室中。",
    required: "授权前必须选择办公室，多办公室会计还需选择主办公室。",
  },
  tr: {
    label: "Çalışanın ana ofisi",
    none: "Tek ofisi kullan / belirtilmemiş",
    hint: "Borç çalışanın ofisine atanır. Seçili ofislerden biri olmalıdır.",
    required:
      "Yetki vermeden önce ofis ve çok ofisli muhasebeci için ana ofis seçin.",
  },
} as const;

const singleOfficeRole = (role: string) =>
  ["office_manager", "staff", "accountant"].includes(role);
const permissionCopy = {
  ar: {
    label: "تحديد أين وصلت الشحنة",
    hint: "يسمح لمستودع المصدر بتحديث المرحلة التالية فقط، دون حسابات أو تغيير المكتب. نواكشوط للتخزين والرف فقط.",
    required: "حدد مكتبًا واحدًا للمستودع أو المحاسب أو مدير المكتب.",
  },
  en: {
    label: "Update shipment location",
    hint: "Source warehouse staff may update the next stage only, with no finance or office transfers. Nouakchott staff manage storage and shelves only.",
    required:
      "Assign one office to a warehouse worker, accountant or office manager.",
  },
  zh: {
    label: "更新货物到达阶段",
    hint: "始发仓库仅可更新下一阶段，无财务或转移权限。努瓦克肖特员工仅管理仓库和货架。",
    required: "为仓库员工、会计或办公室经理指定一个办公室。",
  },
  tr: {
    label: "Gönderinin konumunu güncelle",
    hint: "Çıkış deposu yalnızca sonraki aşamayı günceller; finans veya ofis transferi yapamaz. Nuakşot çalışanı sadece depo ve rafı yönetir.",
    required: "Depo çalışanı, muhasebeci veya müdür için tek ofis atayın.",
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
    homeOffice: OfficeId | null;
    canUpdateTracking: boolean;
    expectedVersion: number;
  }) => Promise<OfficeMember | null>;
  onResetPassword: (input: {
    userId: number;
    temporaryPassword: string;
  }) => Promise<boolean>;
};

function draftFrom(member: OfficeMember): MemberDraft {
  const role = assignableRoles.includes(member.role as AssignableRole)
    ? (member.role as AssignableRole)
    : "staff";
  const offices = member.offices ? [...member.offices] : [];
  const normalizedOffices =
    role === "office_manager"
      ? offices
          .filter(office => officeManagerOfficeIds.includes(office))
          .slice(0, 1)
      : singleOfficeRole(role)
        ? offices.slice(0, 1)
        : offices;
  return {
    role,
    offices: normalizedOffices,
    homeOffice:
      member.homeOffice && normalizedOffices.includes(member.homeOffice)
        ? member.homeOffice
        : singleOfficeRole(role)
          ? (normalizedOffices[0] ?? null)
          : null,
    canUpdateTracking: Boolean(
      member.canUpdateTracking &&
        role === "staff" &&
        normalizedOffices[0] !== "nouakchott"
    ),
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
  onResetPassword,
}: OfficeMembershipsProps) {
  const { language } = useLanguage();
  const c = branchSettingsCopyFor(language);
  const [drafts, setDrafts] = useState<Record<number, MemberDraft>>({});
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [temporaryPasswords, setTemporaryPasswords] = useState<
    Record<number, string>
  >({});

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
    const validOfficeManagerScope =
      draft.role !== "office_manager" ||
      (draft.offices.length === 1 &&
        officeManagerOfficeIds.includes(draft.offices[0]) &&
        draft.homeOffice === draft.offices[0]);
    if (
      !draft.offices.length ||
      !validOfficeManagerScope ||
      (singleOfficeRole(draft.role) &&
        (draft.offices.length !== 1 || draft.homeOffice !== draft.offices[0]))
    ) {
      setError(permissionCopy[language].required);
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
        homeOffice: draft.homeOffice,
        canUpdateTracking: Boolean(
          draft.role === "staff" &&
            draft.offices[0] !== "nouakchott" &&
            draft.canUpdateTracking
        ),
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
                    onChange={event => {
                      const nextRole = event.target.value as AssignableRole;
                      const office =
                        nextRole === "office_manager"
                          ? draft.offices.find(id =>
                              officeManagerOfficeIds.includes(id)
                            )
                          : draft.offices[0];
                      patch(member, {
                        role: nextRole,
                        offices: singleOfficeRole(nextRole)
                          ? office
                            ? [office]
                            : []
                          : draft.offices,
                        homeOffice: singleOfficeRole(nextRole)
                          ? (office ?? null)
                          : draft.homeOffice,
                        canUpdateTracking:
                          nextRole === "staff" && office !== "nouakchott"
                            ? draft.canUpdateTracking
                            : false,
                      });
                    }}
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
                    {(draft.role === "office_manager"
                      ? officeManagerOfficeIds
                      : officeIds
                    ).map(officeId => (
                      <label
                        key={officeId}
                        className="flex items-center gap-2 rounded-lg border border-[#e5ecee] bg-white px-3 py-2 text-sm"
                      >
                        <input
                          type={
                            singleOfficeRole(draft.role) ? "radio" : "checkbox"
                          }
                          name={`member-office-${member.userId}`}
                          checked={draft.offices.includes(officeId)}
                          disabled={!canEdit || locked || pending}
                          onChange={event =>
                            patch(member, {
                              offices: singleOfficeRole(draft.role)
                                ? [officeId]
                                : event.target.checked
                                  ? [...draft.offices, officeId]
                                  : draft.offices.filter(id => id !== officeId),
                              homeOffice: singleOfficeRole(draft.role)
                                ? officeId
                                : !event.target.checked &&
                                    draft.homeOffice === officeId
                                  ? null
                                  : draft.homeOffice,
                              canUpdateTracking:
                                officeId !== "nouakchott" &&
                                draft.role === "staff"
                                  ? draft.canUpdateTracking
                                  : false,
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
              {draft.role === "staff" && (
                <label className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.canUpdateTracking}
                    disabled={
                      !canEdit ||
                      locked ||
                      pending ||
                      draft.offices.length !== 1 ||
                      draft.offices[0] === "nouakchott"
                    }
                    onChange={event =>
                      patch(member, { canUpdateTracking: event.target.checked })
                    }
                  />
                  <span>
                    <strong>{permissionCopy[language].label}</strong>
                    <span className="mt-1 block text-xs leading-5 text-slate-600">
                      {permissionCopy[language].hint}
                    </span>
                  </span>
                </label>
              )}
              <label className="mt-4 grid max-w-xl gap-1.5 text-sm font-semibold text-[#243f52]">
                <span>{homeOfficeCopy[language].label}</span>
                <select
                  className={packingInputClass}
                  value={draft.homeOffice ?? ""}
                  disabled={
                    !canEdit ||
                    locked ||
                    pending ||
                    !draft.offices.length ||
                    singleOfficeRole(draft.role)
                  }
                  onChange={event =>
                    patch(member, {
                      homeOffice: event.target.value
                        ? (event.target.value as OfficeId)
                        : null,
                    })
                  }
                >
                  {!singleOfficeRole(draft.role) && (
                    <option value="">{homeOfficeCopy[language].none}</option>
                  )}
                  {draft.offices.map(officeId => (
                    <option key={officeId} value={officeId}>
                      {officeName(language, officeId)}
                    </option>
                  ))}
                </select>
                <span className="text-xs font-normal text-[#718088]">
                  {homeOfficeCopy[language].hint}
                </span>
              </label>
              {canEdit && (
                <div className="mt-4 flex justify-end">
                  <button
                    className={packingPrimaryClass}
                    disabled={
                      locked ||
                      !draft.dirty ||
                      pending ||
                      !online ||
                      !draft.offices.length ||
                      (draft.role === "office_manager" &&
                        (draft.offices.length !== 1 ||
                          draft.homeOffice !== draft.offices[0])) ||
                      (singleOfficeRole(draft.role) &&
                        (draft.offices.length !== 1 ||
                          draft.homeOffice !== draft.offices[0]))
                    }
                    onClick={() => void save(member)}
                  >
                    {c.saveMember}
                  </button>
                </div>
              )}
              {canEdit &&
                !locked &&
                member.accountType === "employee" &&
                (member.isLocalAccount || Boolean(member.email)) && (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-sm font-bold text-amber-950">
                      {c.resetPasswordTitle}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-amber-900">
                      {c.resetPasswordHint}
                    </p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <input
                        type="password"
                        minLength={8}
                        maxLength={128}
                        value={temporaryPasswords[member.userId] ?? ""}
                        onChange={event =>
                          setTemporaryPasswords(current => ({
                            ...current,
                            [member.userId]: event.target.value,
                          }))
                        }
                        placeholder={c.temporaryPassword}
                        className={packingInputClass}
                        dir="ltr"
                      />
                      <button
                        type="button"
                        className={packingSecondaryClass}
                        disabled={
                          pending ||
                          !online ||
                          (temporaryPasswords[member.userId] ?? "").length < 8
                        }
                        onClick={async () => {
                          setError("");
                          setNotice("");
                          const password =
                            temporaryPasswords[member.userId] ?? "";
                          if (
                            !window.confirm(
                              `${c.resetPasswordConfirm} ${member.name || member.email}?`
                            )
                          )
                            return;
                          const ok = await onResetPassword({
                            userId: member.userId,
                            temporaryPassword: password,
                          });
                          if (ok) {
                            setTemporaryPasswords(current => ({
                              ...current,
                              [member.userId]: "",
                            }));
                            setNotice(c.resetPasswordSuccess);
                          } else setError(c.resetPasswordError);
                        }}
                      >
                        {c.resetPassword}
                      </button>
                    </div>
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
