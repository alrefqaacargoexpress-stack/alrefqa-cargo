import NewPermissionsMatrix from "@/components/offices/newPermissionsMatrix";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import PackingLayout from "@/components/packing/PackingLayout";
import {
  PackingField,
  packingInputClass,
  packingPrimaryClass,
  packingSecondaryClass,
} from "@/components/packing/PackingPrimitives";
import OfficeProfileEditor from "@/components/offices/OfficeProfileEditor";
import OfficeMemberships, {
  type AssignableRole,
} from "@/components/offices/OfficeMemberships";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOperationsWorkspace } from "@/hooks/useOperationsWorkspace";
import { trpc } from "@/lib/trpc";
import {
  branchSettingsCopyFor,
  officeIds,
  officeName,
} from "@/lib/branchSettingsCopy";
import WalletMethodsEditor from "@/components/offices/WalletMethodsEditor";
import { canUseOperations } from "@shared/tracking";
import {
  permissionAllowed,
  permissionsFor,
  type PermissionMap,
  type PermissionSubject,
} from "@shared/permissions";
import type { AppRole } from "@shared/operations";
import type {
  OfficeId,
  OfficeMember,
  OfficeProfile,
  VersionedOfficeProfile,
} from "@shared/branches";

export default function OfficeSettings() {
  const { language } = useLanguage();
  const copy = branchSettingsCopyFor(language);
  const workspace = useOperationsWorkspace();
  const [location, navigate] = useLocation();
  const search = useSearch();
  const requestedOffice = new URLSearchParams(search).get(
    "office"
  ) as OfficeId | null;
  const [selectedOffice, setSelectedOffice] = useState<OfficeId>(
    requestedOffice && officeIds.includes(requestedOffice)
      ? requestedOffice
      : "nouakchott"
  );
  const [overrides, setOverrides] = useState<
    Record<OfficeId, VersionedOfficeProfile>
  >({} as Record<OfficeId, VersionedOfficeProfile>);
  const canOpenSettings =
    canUseOperations(workspace.role) ||
    workspace.role === "viewer" ||
    workspace.role === "tracking_staff";
  const canEditProfile =
    (workspace.role === "admin" || workspace.role === "office_manager") &&
    workspace.online &&
    !workspace.localOnly &&
    Boolean(workspace.userId);
  const canReadProfiles =
    canOpenSettings && workspace.online && Boolean(workspace.userId);
  const profilesQuery = trpc.branches.profiles.useQuery(undefined, {
    enabled: canReadProfiles,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const accessQuery = trpc.operations.access.useQuery(undefined, {
    enabled: Boolean(workspace.userId && workspace.online),
    retry: false,
    refetchOnWindowFocus: false,
  });
  type AccessWithPermissions = {
    role: AppRole | null;
    userId: number;
    offices: OfficeId[] | null;
    homeOffice: OfficeId | null;
    canUpdateTracking: boolean;
    permissions?: PermissionMap | null;
    delegatedBy?: number | null;
  };
  const access = accessQuery.data as AccessWithPermissions | undefined;
  const permissionScope: PermissionSubject = {
    role: access?.role ?? workspace.role,
    offices: access?.offices ?? workspace.offices,
    homeOffice: access?.homeOffice ?? null,
    canUpdateTracking: access?.canUpdateTracking ?? false,
    permissions: access?.permissions ?? null,
  };
  const permissionCeiling = permissionsFor(permissionScope);
  const canReadMemberships = permissionAllowed(
    permissionScope,
    "employees",
    "view"
  );
  const canEditMemberships =
    ["admin", "office_manager"].includes(permissionScope.role ?? "") &&
    permissionAllowed(permissionScope, "employees", "manage") &&
    workspace.online &&
    !workspace.localOnly;
  const managedOffice: OfficeId | null =
    workspace.role === "office_manager"
      ? (access?.homeOffice ?? workspace.offices?.[0] ?? null)
      : null;
  const selectableOffices: readonly OfficeId[] =
    workspace.role === "office_manager"
      ? managedOffice
        ? [managedOffice]
        : []
      : officeIds;
  const membersQuery = trpc.branches.members.useQuery(undefined, {
    enabled:
      canReadMemberships && workspace.online && Boolean(workspace.userId),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const updateProfile = trpc.branches.update.useMutation();
  const assignMember = trpc.branches.assignMember.useMutation();
  const resetPassword = trpc.operations.resetPassword.useMutation();
  const utils = trpc.useUtils();
  const profiles = useMemo(() => {
    const source = profilesQuery.data ?? [];
    return source.map(profile => {
      const local = overrides[profile.officeId];
      return local && local.version >= profile.version ? local : profile;
    });
  }, [profilesQuery.data, overrides]);
  const profile = profiles.find(item => item.officeId === selectedOffice);

  useEffect(() => {
    const requestedIsAllowed =
      requestedOffice && selectableOffices.includes(requestedOffice);
    const nextOffice = requestedIsAllowed
      ? requestedOffice
      : selectableOffices.includes(selectedOffice)
        ? selectedOffice
        : (selectableOffices[0] ?? "nouakchott");
    if (nextOffice !== selectedOffice) setSelectedOffice(nextOffice);
  }, [requestedOffice, selectableOffices, selectedOffice]);
  const chooseOffice = (officeId: OfficeId) => {
    setSelectedOffice(officeId);
    const path = location.split("?")[0] || "/operations/settings";
    navigate(`${path}?office=${officeId}`);
  };
  const saveProfile = async (
    next: OfficeProfile,
    expectedVersion: number,
    baseProfile?: OfficeProfile
  ): Promise<VersionedOfficeProfile | null> => {
    if (!canEditProfile) throw new Error("office_profile_access_denied");
    const result = await updateProfile.mutateAsync({
      ...next,
      expectedVersion,
      baseProfile,
    });
    setOverrides(current => ({ ...current, [result.officeId]: result }));
    // A failed follow-up refresh must not turn an acknowledged database save into a failure.
    void utils.branches.public.invalidate().catch(() => {});
    void utils.branches.profiles.invalidate().catch(() => {});
    return result;
  };
  const reloadProfile = async (): Promise<VersionedOfficeProfile | null> => {
    const officeId = selectedOffice;
    const result = await profilesQuery.refetch();
    if (result.isError) return null;
    const refreshed = result.data?.find(p => p.officeId === officeId);
    if (!refreshed) return null;
    setOverrides(current => ({ ...current, [officeId]: refreshed }));
    return refreshed;
  };
  const saveMember = async (input: {
    userId: number;
    role: AssignableRole;
    offices: OfficeId[];
    homeOffice: OfficeId | null;
    canUpdateTracking: boolean;
    permissions?: PermissionMap;
    expectedVersion: number;
  }): Promise<OfficeMember | null> => {
    if (!canEditMemberships) return null;
    try {
      const result = await (
        assignMember.mutateAsync as unknown as (
          value: typeof input
        ) => Promise<OfficeMember>
      )(input);
      await utils.invalidate();
      return result;
    } catch {
      return null;
    }
  };
  const resetMemberPassword = async (input: {
    userId: number;
    temporaryPassword: string;
  }) => {
    if (workspace.role !== "admin" || !workspace.online) return false;
    try {
      await resetPassword.mutateAsync(input);
      await utils.branches.members.invalidate();
      return true;
    } catch {
      return false;
    }
  };
  const roleCanSeeProfile =
    workspace.role === "admin" ||
    workspace.role === "office_manager" ||
    workspace.role === "accountant" ||
    workspace.role === "staff" ||
    workspace.role === "supervisor" ||
    workspace.role === "viewer" ||
    workspace.role === "tracking_staff";

  const canReadNouakchottPayments = permissionAllowed(
    permissionScope,
    "office_wallets",
    "view"
  );
  return (
    <PackingLayout
      title={copy.title}
      description={copy.description}
      workspace={workspace}
    >
      <section className="grid gap-5">
        {(workspace.role === "admin" ||
          workspace.role === "office_manager") && (
          <NewPermissionsMatrix
            value={permissionCeiling}
            ceiling={permissionCeiling}
            canEdit={false}
            showRootPermissions={workspace.role === "admin"}
          />
        )}
        <div className="rounded-2xl border border-[#dce4e7] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-[#718088]">
                {copy.chooseOffice}
              </p>
              <h2 className="mt-1 text-2xl font-black text-[#092d50]">
                {officeName(language, selectedOffice)}
              </h2>
            </div>
            <label className="grid min-w-64 gap-1.5 text-sm font-semibold text-[#243f52]">
              <span>{copy.office}</span>
              <select
                className={packingInputClass}
                value={selectedOffice}
                onChange={event => chooseOffice(event.target.value as OfficeId)}
                disabled={workspace.role === "office_manager"}
              >
                {selectableOffices.map(officeId => (
                  <option key={officeId} value={officeId}>
                    {officeName(language, officeId)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {!workspace.online && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-950">
            {copy.onlineRequired}
          </p>
        )}
        {profilesQuery.isLoading && (
          <p className="rounded-xl bg-white p-5 text-sm">{copy.loading}</p>
        )}
        {profilesQuery.isError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-900">
            {copy.loadError}
            <button
              className={`${packingSecondaryClass} mt-3`}
              onClick={() => void profilesQuery.refetch()}
            >
              {copy.retry}
            </button>
          </div>
        )}
        {!profilesQuery.isLoading &&
          !profilesQuery.isError &&
          roleCanSeeProfile &&
          (profile ? (
            <OfficeProfileEditor
              profile={profile}
              canEdit={canEditProfile}
              online={workspace.online}
              pending={updateProfile.isPending}
              onSave={saveProfile}
              onReload={reloadProfile}
            />
          ) : (
            <p className="rounded-xl bg-white p-5 text-sm">{copy.noProfile}</p>
          ))}
        {canReadMemberships && (
          <OfficeMemberships
            members={membersQuery.data ?? []}
            actorRole={access?.role ?? workspace.role}
            actorUserId={
              access?.userId ??
              (workspace.userId ? Number(workspace.userId) : null)
            }
            managerHomeOffice={managedOffice}
            permissionCeiling={permissionCeiling}
            canEdit={canEditMemberships}
            online={workspace.online}
            pending={assignMember.isPending}
            onSave={saveMember}
            onResetPassword={resetMemberPassword}
          />
        )}
        {!canReadMemberships && (
          <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-[#52636e]">
            {copy.noMemberAccess}
          </p>
        )}
        {selectedOffice === "nouakchott" && (
          <WalletMethodsEditor
            workspace={workspace}
            allowed={canReadNouakchottPayments}
          />
        )}
        <p className="text-xs text-[#718088]">
          {copy.publicProfile}: {copy.publicNotice}
        </p>
      </section>
    </PackingLayout>
  );
}
