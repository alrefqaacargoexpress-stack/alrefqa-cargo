import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { AppRole } from "@shared/operations";
import type { OfficeId, OfficeMember } from "@shared/branches";
import {
  blankPermissions,
  defaultPermissions,
  intersectPermissions,
  permissionAllowed,
  permissionKeys,
  rootOnlyPermissions,
  type PermissionMap,
} from "@shared/permissions";
import { officeIds } from "@/lib/branchSettingsCopy";
import { useLanguage } from "@/contexts/LanguageContext";
import { branchSettingsCopyFor, officeName } from "@/lib/branchSettingsCopy";
import {
  packingInputClass,
  packingPrimaryClass,
} from "@/components/packing/PackingPrimitives";
import NewPermissionsMatrix from "./newPermissionsMatrix";

const assignableRoles = [
  "office_manager",
  "staff",
  "source_warehouse",
  "destination_warehouse",
  "accountant",
  "general_accountant",
  "cashier",
  "viewer",
  "tracking_staff",
  "supervisor",
] as const;
type AssignableRole = (typeof assignableRoles)[number];
const managerAssignableRoles = assignableRoles.filter(
  role => role !== "office_manager"
);
const officeManagerOfficeIds: OfficeId[] = [
  "nouakchott",
  "dubai",
  "china",
  "turkey",
];

type EditableOfficeMember = OfficeMember & {
  permissions?: PermissionMap | null;
  effectivePermissions?: PermissionMap;
  delegatedBy?: number | null;
};
type MemberDraft = {
  role: AssignableRole;
  offices: OfficeId[];
  homeOffice: OfficeId | null;
  canUpdateTracking: boolean;
  permissions: PermissionMap;
  permissionsMode: "automatic" | "manual";
  dirty: boolean;
  version: number;
};
type DisableDraft = {
  open: boolean;
  confirmation: string;
  reason: string;
};

const roleLabels = {
  ar: {
    admin: "المدير الجذري",
    office_manager: "مدير مكتب",
    staff: "موظف مستودع",
    source_warehouse: "موظف مخزن المصدر",
    destination_warehouse: "مسؤول مستودع نواكشوط",
    accountant: "محاسب فرع",
    general_accountant: "محاسب عام",
    cashier: "محاسب كاش",
    viewer: "مشاهد",
    tracking_staff: "موظف تتبع",
    supervisor: "مشرف",
  },
  en: {
    admin: "Root administrator",
    office_manager: "Office manager",
    staff: "Warehouse employee",
    source_warehouse: "Source warehouse employee",
    destination_warehouse: "Nouakchott warehouse officer",
    accountant: "Branch accountant",
    general_accountant: "General accountant",
    cashier: "Cashier",
    viewer: "Viewer",
    tracking_staff: "Tracking employee",
    supervisor: "Supervisor",
  },
  zh: {
    admin: "根管理员",
    office_manager: "办公室经理",
    staff: "仓库员工",
    source_warehouse: "始发仓员工",
    destination_warehouse: "努瓦克肖特仓库负责人",
    accountant: "分支会计",
    general_accountant: "总会计",
    cashier: "出纳",
    viewer: "查看者",
    tracking_staff: "追踪员工",
    supervisor: "主管",
  },
  tr: {
    admin: "Kök yönetici",
    office_manager: "Ofis müdürü",
    staff: "Depo çalışanı",
    source_warehouse: "Çıkış deposu çalışanı",
    destination_warehouse: "Nuakşot depo sorumlusu",
    accountant: "Şube muhasebecisi",
    general_accountant: "Genel muhasebeci",
    cashier: "Kasiyer",
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
  },
  en: {
    label: "Employee home office",
    none: "Use sole office / not specified",
    hint: "Debt is assigned to the employee's office. It must be one of the checked offices.",
  },
  zh: {
    label: "员工主办公室",
    none: "按唯一办公室 / 未指定",
    hint: "债务归属于员工办公室；该办公室必须在已勾选的办公室中。",
  },
  tr: {
    label: "Çalışanın ana ofisi",
    none: "Tek ofisi kullan / belirtilmemiş",
    hint: "Borç çalışanın ofisine atanır. Seçili ofislerden biri olmalıdır.",
  },
} as const;

const permissionCopy = {
  ar: {
    label: "تحديد أين وصلت الشحنة",
    hint: "يسمح لمستودع المصدر بتحديث المرحلة التالية فقط، دون حسابات أو تغيير المكتب. نواكشوط للتخزين والرف فقط.",
    required: "حدد مكتبًا واحدًا للموظف قبل منح الصلاحية.",
  },
  en: {
    label: "Update shipment location",
    hint: "Source warehouse staff may update the next stage only, with no finance or office transfers. Nouakchott staff manage storage and shelves only.",
    required: "Assign one office to the employee before granting access.",
  },
  zh: {
    label: "更新货物到达阶段",
    hint: "始发仓库仅可更新下一阶段，无财务或转移权限。努瓦克肖特员工仅管理仓库和货架。",
    required: "授权前必须指定一个办公室。",
  },
  tr: {
    label: "Gönderinin konumunu güncelle",
    hint: "Çıkış deposu yalnızca sonraki aşamayı günceller; finans veya ofis transferi yapamaz. Nuakşot çalışanı sadece depo ve rafı yönetir.",
    required: "Erişim vermeden önce bir ofis atayın.",
  },
} as const;

const automaticPermissionCopy = {
  ar: {
    label: "الصلاحيات الضرورية تُطبَّق تلقائيًا حسب الدور والمكتب.",
    details: "تعديل الصلاحيات المتقدم",
    hint: "افتح التفاصيل فقط إذا أردت مراجعة الصلاحيات يدويًا وتعديلها ضمن الحد المسموح.",
  },
  en: {
    label: "Required permissions are applied automatically by role and office.",
    details: "Advanced permission editing",
    hint: "Open the details only when you want to review or edit permissions within the allowed ceiling.",
  },
  zh: {
    label: "必要权限会根据角色和办公室自动应用。",
    details: "高级权限编辑",
    hint: "只有需要在允许上限内检查或修改权限时才打开详情。",
  },
  tr: {
    label: "Gerekli izinler rol ve ofise göre otomatik uygulanır.",
    details: "Gelişmiş izin düzenleme",
    hint: "Ayrıntıları yalnızca izinleri izin verilen sınır içinde incelemek veya değiştirmek istediğinizde açın.",
  },
} as const;

const singleOfficeRole = (role: string) =>
  [
    "office_manager",
    "staff",
    "source_warehouse",
    "destination_warehouse",
    "accountant",
    "general_accountant",
    "cashier",
  ].includes(role);
const completePermissions = (
  value: PermissionMap | null | undefined
): PermissionMap => ({ ...blankPermissions(), ...(value ?? {}) });
const managerOfficeIds = (home: OfficeId | null | undefined): OfficeId[] =>
  home && officeManagerOfficeIds.includes(home) ? [home] : [];
const roleOfficeIds = (role: string, allowed: readonly OfficeId[]) => {
  if (role === "office_manager")
    return allowed.filter(office => officeManagerOfficeIds.includes(office));
  if (role === "source_warehouse")
    return allowed.filter(office => office !== "nouakchott");
  if (role === "destination_warehouse")
    return allowed.filter(office => office === "nouakchott");
  return [...allowed];
};

export function automaticPermissionPreview(
  role: AssignableRole,
  offices: readonly OfficeId[],
  homeOffice: OfficeId | null,
  canUpdateTracking: boolean,
  ceiling: PermissionMap,
  retainedPermissions?: PermissionMap | null,
  previousRole?: AppRole | null
): PermissionMap {
  const defaults = defaultPermissions({
    role,
    offices,
    homeOffice,
    canUpdateTracking,
  });
  const retained = retainedPermissions
    ? completePermissions(retainedPermissions)
    : null;
  const intended = retained
    ? previousRole === role
      ? retained
      : intersectPermissions(retained, defaults)
    : defaults;
  return intersectPermissions(intended, ceiling);
}

export function permissionPayloadForSave(draft: {
  permissions: PermissionMap;
  permissionsMode: "automatic" | "manual";
}): PermissionMap | undefined {
  return draft.permissionsMode === "manual" ? draft.permissions : undefined;
}

function draftFrom(
  member: EditableOfficeMember,
  actorRole: AppRole | null,
  managerHomeOffice: OfficeId | null | undefined,
  ceiling: PermissionMap
): MemberDraft {
  const role = assignableRoles.includes(member.role as AssignableRole)
    ? (member.role as AssignableRole)
    : "staff";
  const allowed =
    actorRole === "office_manager"
      ? managerOfficeIds(managerHomeOffice)
      : [...officeIds];
  const source = member.offices ? [...member.offices] : [];
  const offices =
    role === "office_manager"
      ? source
          .filter(office => officeManagerOfficeIds.includes(office))
          .slice(0, 1)
      : singleOfficeRole(role)
        ? source
            .filter(office => roleOfficeIds(role, allowed).includes(office))
            .slice(0, 1)
        : source.filter(office => allowed.includes(office));
  const hasCustomizedPermissions = Boolean(member.permissionsCustomized);
  const raw = automaticPermissionPreview(
    role,
    offices,
    member.homeOffice && offices.includes(member.homeOffice)
      ? member.homeOffice
      : null,
    Boolean(member.canUpdateTracking),
    ceiling,
    member.permissions ??
      (hasCustomizedPermissions
        ? (member.effectivePermissions ?? blankPermissions())
        : null),
    member.role
  );
  return {
    role,
    offices,
    homeOffice:
      member.homeOffice && offices.includes(member.homeOffice)
        ? member.homeOffice
        : singleOfficeRole(role)
          ? (offices[0] ?? null)
          : null,
    canUpdateTracking: Boolean(
      member.canUpdateTracking &&
        ["staff", "source_warehouse"].includes(role) &&
        offices[0] !== "nouakchott"
    ),
    permissions: completePermissions(raw),
    permissionsMode: "automatic",
    dirty: false,
    version: member.version,
  };
}

type OfficeMembershipsProps = {
  members: EditableOfficeMember[];
  actorRole?: AppRole | null;
  actorUserId?: number | null;
  managerHomeOffice?: OfficeId | null;
  permissionCeiling?: PermissionMap;
  canEdit: boolean;
  online: boolean;
  pending?: boolean;
  onSave: (input: {
    userId: number;
    role: AssignableRole;
    offices: OfficeId[];
    homeOffice: OfficeId | null;
    canUpdateTracking: boolean;
    permissions?: PermissionMap;
    expectedVersion: number;
  }) => Promise<OfficeMember | null>;
  onResetPassword: (input: {
    userId: number;
    temporaryPassword: string;
  }) => Promise<boolean>;
  onDisable?: (input: {
    userId: number;
    confirmation: string;
    reason: string;
    expectedVersion: number;
  }) => Promise<boolean>;
};

export default function OfficeMemberships({
  members,
  actorRole = "admin",
  actorUserId = null,
  managerHomeOffice = null,
  permissionCeiling = blankPermissions("manage"),
  canEdit,
  online,
  pending = false,
  onSave,
  onResetPassword,
  onDisable = async () => false,
}: OfficeMembershipsProps) {
  const { language } = useLanguage();
  const c = branchSettingsCopyFor(language);
  const [drafts, setDrafts] = useState<Record<number, MemberDraft>>({});
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [temporaryPasswords, setTemporaryPasswords] = useState<
    Record<number, string>
  >({});
  const [disableDrafts, setDisableDrafts] = useState<
    Record<number, DisableDraft>
  >({});
  const availableRoles =
    actorRole === "office_manager" ? managerAssignableRoles : assignableRoles;
  const allowedOffices =
    actorRole === "office_manager"
      ? managerOfficeIds(managerHomeOffice)
      : [...officeIds];
  const canDisablePermission = permissionAllowed(
    {
      role: actorRole,
      offices:
        actorRole === "office_manager"
          ? managerOfficeIds(managerHomeOffice)
          : officeIds,
      permissions: permissionCeiling,
    },
    "employee_disable",
    "manage"
  );

  useEffect(() => {
    setDrafts(current => {
      const next = { ...current };
      for (const member of members)
        if (!next[member.userId]?.dirty)
          next[member.userId] = draftFrom(
            member,
            actorRole,
            managerHomeOffice,
            permissionCeiling
          );
      return next;
    });
  }, [members, actorRole, managerHomeOffice, permissionCeiling]);

  const patch = (member: EditableOfficeMember, value: Partial<MemberDraft>) => {
    setError("");
    setNotice("");
    setDrafts(current => ({
      ...current,
      [member.userId]: {
        ...(current[member.userId] ??
          draftFrom(member, actorRole, managerHomeOffice, permissionCeiling)),
        ...value,
        dirty: true,
      },
    }));
  };
  const isLocked = (member: EditableOfficeMember) =>
    member.role === "admin" ||
    (actorRole === "office_manager" &&
      (member.userId === actorUserId || member.role === "office_manager"));
  const canDisableMember = (member: EditableOfficeMember) =>
    canEdit &&
    canDisablePermission &&
    online &&
    member.accountType === "employee" &&
    member.userId !== actorUserId &&
    member.role !== "admin" &&
    (actorRole === "admin" ||
      (actorRole === "office_manager" &&
        member.role !== "office_manager" &&
        member.offices?.length === 1 &&
        member.offices[0] === managerHomeOffice));
  const disable = async (member: EditableOfficeMember) => {
    if (!canDisableMember(member)) return;
    const draft = disableDrafts[member.userId] ?? {
      open: true,
      confirmation: "",
      reason: "",
    };
    if (draft.confirmation.trim() !== String(member.userId)) {
      setError(c.disableConfirmationMismatch);
      return;
    }
    if (draft.reason.trim().length < 2) {
      setError(c.disableReasonRequired);
      return;
    }
    if (!window.confirm(`${c.disableConfirm}\n${member.name || member.email}?`))
      return;
    setError("");
    setNotice("");
    const ok = await onDisable({
      userId: member.userId,
      confirmation: draft.confirmation.trim(),
      reason: draft.reason.trim(),
      expectedVersion: member.version,
    });
    if (ok) {
      setDisableDrafts(current => ({
        ...current,
        [member.userId]: { ...draft, open: false },
      }));
      setNotice(c.disableSuccess);
    } else setError(c.disableError);
  };

  const save = async (member: EditableOfficeMember) => {
    const draft =
      drafts[member.userId] ??
      draftFrom(member, actorRole, managerHomeOffice, permissionCeiling);
    if (!canEdit || pending || isLocked(member)) return;
    if (!online) {
      setError(c.onlineRequired);
      return;
    }
    const validManager =
      draft.role !== "office_manager" ||
      (draft.offices.length === 1 &&
        officeManagerOfficeIds.includes(draft.offices[0]) &&
        draft.homeOffice === draft.offices[0]);
    if (
      !draft.offices.length ||
      !validManager ||
      (singleOfficeRole(draft.role) &&
        (draft.offices.length !== 1 ||
          draft.homeOffice !== draft.offices[0])) ||
      (actorRole === "office_manager" &&
        (draft.offices.length !== 1 || draft.offices[0] !== managerHomeOffice))
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
          ["staff", "source_warehouse"].includes(draft.role) &&
            draft.offices[0] !== "nouakchott" &&
            draft.canUpdateTracking
        ),
        ...(permissionPayloadForSave(draft)
          ? { permissions: permissionPayloadForSave(draft) }
          : {}),
        expectedVersion: draft.version,
      });
      if (result) {
        setDrafts(current => ({
          ...current,
          [member.userId]: draftFrom(
            result as EditableOfficeMember,
            actorRole,
            managerHomeOffice,
            permissionCeiling
          ),
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
          const draft =
            drafts[member.userId] ??
            draftFrom(member, actorRole, managerHomeOffice, permissionCeiling);
          const rootLocked = member.role === "admin";
          const locked = isLocked(member);
          const canEditMember = canEdit && !locked;
          const disableDraft = disableDrafts[member.userId] ?? {
            open: true,
            confirmation: "",
            reason: "",
          };
          const displayRole = rootLocked ? "admin" : draft.role;
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
              {(rootLocked ||
                (actorRole === "office_manager" &&
                  member.userId === actorUserId)) && (
                <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-700">
                  {c.rootAdminLocked}
                </p>
              )}
              {member.delegatedBy != null && (
                <p className="mt-3 text-xs font-semibold text-[#718088]">
                  {c.membershipsHint} · {member.delegatedBy}
                </p>
              )}
              <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_2fr]">
                <label className="grid gap-1.5 text-sm font-semibold text-[#243f52]">
                  <span>{c.role}</span>
                  <select
                    className={packingInputClass}
                    value={displayRole}
                    disabled={!canEditMember || pending}
                    onChange={event => {
                      const nextRole = event.target.value as AssignableRole;
                      const roleOffices = roleOfficeIds(
                        nextRole,
                        allowedOffices
                      );
                      const office =
                        draft.offices.find(id => roleOffices.includes(id)) ??
                        roleOffices[0];
                      const nextOffices = singleOfficeRole(nextRole)
                        ? office
                          ? [office]
                          : []
                        : draft.offices;
                      const nextHomeOffice = singleOfficeRole(nextRole)
                        ? (office ?? null)
                        : draft.homeOffice;
                      const nextCanUpdateTracking =
                        ["staff", "source_warehouse"].includes(nextRole) &&
                        office !== "nouakchott"
                          ? draft.canUpdateTracking
                          : false;
                      patch(member, {
                        role: nextRole,
                        offices: nextOffices,
                        homeOffice: nextHomeOffice,
                        canUpdateTracking: nextCanUpdateTracking,
                        permissions: automaticPermissionPreview(
                          nextRole,
                          nextOffices,
                          nextHomeOffice,
                          nextCanUpdateTracking,
                          permissionCeiling,
                          member.permissions,
                          member.role
                        ),
                        permissionsMode: "automatic",
                      });
                    }}
                  >
                    {rootLocked && (
                      <option value="admin">
                        {roleLabels[language].admin}
                      </option>
                    )}
                    {availableRoles.map(role => (
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
                    {roleOfficeIds(draft.role, allowedOffices).map(officeId => (
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
                          disabled={!canEditMember || pending}
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
                                ["staff", "source_warehouse"].includes(
                                  draft.role
                                )
                                  ? draft.canUpdateTracking
                                  : false,
                              permissions: automaticPermissionPreview(
                                draft.role,
                                singleOfficeRole(draft.role)
                                  ? [officeId]
                                  : event.target.checked
                                    ? [...draft.offices, officeId]
                                    : draft.offices.filter(
                                        id => id !== officeId
                                      ),
                                singleOfficeRole(draft.role)
                                  ? officeId
                                  : !event.target.checked &&
                                      draft.homeOffice === officeId
                                    ? null
                                    : draft.homeOffice,
                                officeId !== "nouakchott" &&
                                  ["staff", "source_warehouse"].includes(
                                    draft.role
                                  )
                                  ? draft.canUpdateTracking
                                  : false,
                                permissionCeiling,
                                member.permissions,
                                member.role
                              ),
                              permissionsMode: "automatic",
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
              <label className="mt-4 grid max-w-xl gap-1.5 text-sm font-semibold text-[#243f52]">
                <span>{homeOfficeCopy[language].label}</span>
                <select
                  className={packingInputClass}
                  value={draft.homeOffice ?? ""}
                  disabled={
                    !canEditMember ||
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
              <p className="mt-4 rounded-xl bg-[#f7faf9] p-3 text-sm font-semibold text-[#315b5a]">
                {automaticPermissionCopy[language].label}
              </p>
              <details className="mt-3 rounded-2xl border border-[#dce4e7] bg-[#fbfcfb] p-4">
                <summary className="cursor-pointer text-sm font-black text-[#243f52]">
                  {automaticPermissionCopy[language].details}
                </summary>
                <p className="mt-2 text-xs leading-5 text-[#718088]">
                  {automaticPermissionCopy[language].hint}
                </p>
                {["staff", "source_warehouse"].includes(draft.role) && (
                  <label className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.canUpdateTracking}
                      disabled={
                        !canEditMember ||
                        pending ||
                        draft.offices.length !== 1 ||
                        draft.offices[0] === "nouakchott"
                      }
                      onChange={event => {
                        const nextTracking = event.target.checked;
                        patch(member, {
                          canUpdateTracking: nextTracking,
                          permissions: automaticPermissionPreview(
                            draft.role,
                            draft.offices,
                            draft.homeOffice,
                            nextTracking,
                            permissionCeiling,
                            member.permissions,
                            member.role
                          ),
                          permissionsMode: "automatic",
                        });
                      }}
                    />
                    <span>
                      <strong>{permissionCopy[language].label}</strong>
                      <span className="mt-1 block text-xs leading-5 text-slate-600">
                        {permissionCopy[language].hint}
                      </span>
                    </span>
                  </label>
                )}
                <NewPermissionsMatrix
                  value={draft.permissions}
                  ceiling={permissionCeiling}
                  canEdit={canEditMember}
                  pending={pending}
                  onChange={permissions =>
                    patch(member, {
                      permissions,
                      permissionsMode: "manual",
                    })
                  }
                />
              </details>
              {canEditMember && (
                <div className="mt-4 flex justify-end">
                  <button
                    className={packingPrimaryClass}
                    disabled={
                      pending ||
                      !draft.dirty ||
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
              {canDisableMember(member) && disableDraft.open && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3">
                  <p className="text-sm font-black text-red-950">
                    {c.disableEmployee}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-red-900">
                    {c.disableHint} {c.disableConfirmationHint} {member.userId}
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-xs font-bold text-red-950">
                      <span>{c.disableConfirmation}</span>
                      <input
                        className={packingInputClass}
                        inputMode="numeric"
                        value={disableDraft.confirmation}
                        onChange={event =>
                          setDisableDrafts(current => ({
                            ...current,
                            [member.userId]: {
                              ...disableDraft,
                              confirmation: event.target.value,
                            },
                          }))
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-bold text-red-950">
                      <span>{c.disableReason}</span>
                      <textarea
                        className={packingInputClass}
                        rows={2}
                        value={disableDraft.reason}
                        placeholder={c.disableReasonPlaceholder}
                        onChange={event =>
                          setDisableDrafts(current => ({
                            ...current,
                            [member.userId]: {
                              ...disableDraft,
                              reason: event.target.value,
                            },
                          }))
                        }
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    className="mt-3 rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-bold text-red-800"
                    disabled={pending || !online}
                    onClick={() => void disable(member)}
                  >
                    {c.disableEmployee}
                  </button>
                </div>
              )}
              {actorRole === "admin" &&
                canEditMember &&
                member.accountType === "employee" &&
                (member.isLocalAccount || Boolean(member.email)) && (
                  <PasswordReset
                    member={member}
                    pending={pending}
                    online={online}
                    copy={c}
                    onResetPassword={onResetPassword}
                    setError={setError}
                    setNotice={setNotice}
                    temporaryPasswords={temporaryPasswords}
                    setTemporaryPasswords={setTemporaryPasswords}
                  />
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

function PasswordReset({
  member,
  pending,
  online,
  copy,
  onResetPassword,
  setError,
  setNotice,
  temporaryPasswords,
  setTemporaryPasswords,
}: {
  member: EditableOfficeMember;
  pending: boolean;
  online: boolean;
  copy: ReturnType<typeof branchSettingsCopyFor>;
  onResetPassword: (input: {
    userId: number;
    temporaryPassword: string;
  }) => Promise<boolean>;
  setError: (value: string) => void;
  setNotice: (value: string) => void;
  temporaryPasswords: Record<number, string>;
  setTemporaryPasswords: Dispatch<SetStateAction<Record<number, string>>>;
}) {
  const password = temporaryPasswords[member.userId] ?? "";
  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <p className="text-sm font-bold text-amber-950">
        {copy.resetPasswordTitle}
      </p>
      <p className="mt-1 text-xs leading-5 text-amber-900">
        {copy.resetPasswordHint}
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          type="password"
          minLength={8}
          maxLength={128}
          value={password}
          onChange={event =>
            setTemporaryPasswords(current => ({
              ...current,
              [member.userId]: event.target.value,
            }))
          }
          placeholder={copy.temporaryPassword}
          className={packingInputClass}
          dir="ltr"
        />
        <button
          type="button"
          className="rounded-xl border border-[#dce4e7] bg-white px-4 py-2 text-sm font-bold text-[#243f52]"
          disabled={pending || !online || password.length < 8}
          onClick={async () => {
            setError("");
            setNotice("");
            if (
              !window.confirm(
                `${copy.resetPasswordConfirm} ${member.name || member.email}?`
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
              setNotice(copy.resetPasswordSuccess);
            } else setError(copy.resetPasswordError);
          }}
        >
          {copy.resetPassword}
        </button>
      </div>
    </div>
  );
}

export type { AssignableRole, EditableOfficeMember };
export { assignableRoles, permissionKeys };
