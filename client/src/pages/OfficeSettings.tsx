import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
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
import { officeCopyFor } from "@/lib/officeCopy";
import { canUseOperations } from "@shared/tracking";
import type {
  OfficeId,
  OfficeMember,
  OfficeProfile,
  VersionedOfficeProfile,
} from "@shared/branches";
import type { PaymentMethod } from "@shared/office";

const ID_PATTERN = /^[a-z0-9_-]{1,64}$/;
const MAX_METHODS = 50;

type DraftMethod = PaymentMethod & { persisted: boolean };

function toDraft(methods: PaymentMethod[]): DraftMethod[] {
  return methods.map(method => ({ ...method, persisted: true }));
}
function paymentError(error: Error, c: ReturnType<typeof officeCopyFor>) {
  const message = error.message.toLowerCase();
  return message.includes("conflict") || message.includes("version")
    ? c.conflict
    : message.includes("duplicate") ||
        message.includes("method") ||
        message.includes("invalid")
      ? c.invalidMethods
      : c.loadError;
}

function PaymentMethodsSection({
  workspace,
  copy,
  allowed,
}: {
  workspace: ReturnType<typeof useOperationsWorkspace>;
  copy: ReturnType<typeof branchSettingsCopyFor>;
  allowed: boolean;
}) {
  const c = officeCopyFor("ar");
  const canRead =
    allowed && (workspace.role === "admin" || workspace.role === "accountant");
  const canEdit =
    workspace.role === "admin" &&
    workspace.online &&
    !workspace.localOnly &&
    Boolean(workspace.userId);
  const settings = trpc.office.get.useQuery(undefined, {
    enabled: canRead && workspace.online && Boolean(workspace.userId),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const update = trpc.office.update.useMutation();
  const [draft, setDraft] = useState<DraftMethod[] | null>(null);
  const [baseVersion, setBaseVersion] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const savingRef = useRef(false);
  useEffect(() => {
    if (!settings.data || dirty) return;
    setDraft(toDraft(settings.data.methods));
    setBaseVersion(settings.data.version);
  }, [settings.data, dirty]);
  const methods = draft ?? [];
  const enabledCount = methods.filter(method => method.enabled).length;
  const updateMethod = (index: number, patch: Partial<PaymentMethod>) => {
    setDraft(current =>
      (current ?? []).map((method, itemIndex) =>
        itemIndex === index ? { ...method, ...patch } : method
      )
    );
    setDirty(true);
    setError("");
    setNotice("");
  };
  const addMethod = () => {
    if (methods.length >= MAX_METHODS) return setError(copy.paymentInvalid);
    setDraft(current => [
      ...(current ?? []),
      {
        id: `method-${crypto
          .randomUUID()
          .replace(/[^a-z0-9]/gi, "")
          .slice(0, 12)
          .toLowerCase()}`,
        label: "",
        enabled: true,
        persisted: false,
      },
    ]);
    setDirty(true);
  };
  const validate = () => {
    if (!methods.length || methods.length > MAX_METHODS || !enabledCount)
      return copy.paymentInvalid;
    const ids = new Set<string>();
    for (const method of methods) {
      if (
        !ID_PATTERN.test(method.id) ||
        ids.has(method.id) ||
        !method.label.trim() ||
        method.label.trim().length > 120
      )
        return copy.paymentInvalid;
      ids.add(method.id);
    }
    return "";
  };
  const save = async () => {
    if (savingRef.current || !canEdit || baseVersion === null) return;
    const validation = validate();
    if (validation) return setError(validation);
    if (!window.confirm(copy.paymentSaveConfirm)) return;
    savingRef.current = true;
    try {
      const result = await update.mutateAsync({
        expectedVersion: baseVersion,
        office: "nouakchott",
        methods: methods.map(({ persisted: _persisted, ...method }) => ({
          ...method,
          label: method.label.trim(),
        })),
      });
      setDraft(toDraft(result.methods));
      setBaseVersion(result.version);
      setDirty(false);
      setNotice(copy.paymentSaved);
    } catch (caught) {
      setError(
        paymentError(caught instanceof Error ? caught : new Error("unknown"), c)
      );
    } finally {
      savingRef.current = false;
    }
  };
  const reload = async () => {
    if (dirty && !window.confirm(copy.reloadConfirm)) return;
    const result = await settings.refetch();
    if (!result.data) return setError(copy.loadError);
    setDraft(toDraft(result.data.methods));
    setBaseVersion(result.data.version);
    setDirty(false);
    setError("");
  };
  if (!canRead) return null;
  return (
    <section className="rounded-2xl border border-[#dce4e7] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#edf1f1] pb-4">
        <div>
          <h2 className="text-lg font-black text-[#092d50]">
            {copy.paymentMethods}
          </h2>
          <p className="mt-1 text-sm text-[#718088]">
            {copy.paymentMethodsNouakchottOnly}
          </p>
        </div>
        {baseVersion !== null && (
          <span className="text-xs text-[#718088]">
            {copy.currentVersion}: {baseVersion}
          </span>
        )}
      </div>
      {settings.isLoading && <p className="mt-4 text-sm">{c.loading}</p>}
      {settings.isError && (
        <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">
          {copy.loadError}{" "}
          <button
            className={`${packingSecondaryClass} mt-2`}
            onClick={() => void settings.refetch()}
          >
            {copy.retry}
          </button>
        </div>
      )}
      {draft && (
        <>
          <div className="mt-5 flex justify-end">
            {canEdit && (
              <button
                className={packingSecondaryClass}
                onClick={addMethod}
                disabled={methods.length >= MAX_METHODS || update.isPending}
              >
                <Plus size={16} className="me-2" />
                {copy.addMethod}
              </button>
            )}
          </div>
          <div className="mt-4 grid gap-3">
            {methods.map((method, index) => (
              <div
                key={`${method.id}-${index}`}
                className="rounded-xl border border-[#edf1f1] bg-[#fbfcfb] p-4"
              >
                <div className="grid gap-3 md:grid-cols-[1fr_1.5fr_auto] md:items-end">
                  <PackingField label={copy.methodId}>
                    <input
                      className={packingInputClass}
                      value={method.id}
                      disabled={
                        !canEdit || method.persisted || update.isPending
                      }
                      onChange={event =>
                        updateMethod(index, { id: event.target.value })
                      }
                    />
                  </PackingField>
                  <PackingField label={copy.methodLabel}>
                    <input
                      className={packingInputClass}
                      value={method.label}
                      disabled={!canEdit || update.isPending}
                      onChange={event =>
                        updateMethod(index, { label: event.target.value })
                      }
                    />
                  </PackingField>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm font-bold">
                      <input
                        type="checkbox"
                        checked={method.enabled}
                        disabled={!canEdit || update.isPending}
                        onChange={event =>
                          updateMethod(index, { enabled: event.target.checked })
                        }
                      />
                      {method.enabled ? copy.enabled : copy.disabled}
                    </label>
                    {canEdit && !method.persisted && (
                      <button
                        type="button"
                        className="rounded-lg p-2 text-red-700"
                        aria-label={copy.removeMethod}
                        onClick={() => {
                          setDraft(current =>
                            (current ?? []).filter(
                              (_, itemIndex) => itemIndex !== index
                            )
                          );
                          setDirty(true);
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {!methods.length && (
              <p className="text-sm text-[#718088]">{copy.noPaymentSettings}</p>
            )}
          </div>
          {error && (
            <p role="alert" className="mt-4 text-sm font-bold text-red-700">
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
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#edf1f1] pt-4">
            <p className="text-xs text-[#718088]">
              {canEdit
                ? copy.paymentMethodsAdminOnly
                : copy.paymentMethodsReadOnly}{" "}
              · {methods.length} · {enabledCount} {copy.enabled}
            </p>
            <div className="flex gap-2">
              {dirty && (
                <button
                  className={packingSecondaryClass}
                  onClick={() => void reload()}
                >
                  {copy.paymentReload}
                </button>
              )}
              {canEdit && (
                <button
                  className={packingPrimaryClass}
                  disabled={!dirty || update.isPending || !workspace.online}
                  onClick={() => void save()}
                >
                  <Save size={16} className="me-2" />
                  {update.isPending ? copy.saving : copy.saveProfile}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

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
    workspace.role === "admin" &&
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
  const membersQuery = trpc.branches.members.useQuery(undefined, {
    enabled:
      workspace.role === "admin" &&
      workspace.online &&
      Boolean(workspace.userId),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const updateProfile = trpc.branches.update.useMutation();
  const assignMember = trpc.branches.assignMember.useMutation();
  const utils = trpc.useUtils();
  const profiles = useMemo(() => {
    const source = profilesQuery.data ?? [];
    return source.map(profile => overrides[profile.officeId] ?? profile);
  }, [profilesQuery.data, overrides]);
  const profile = profiles.find(item => item.officeId === selectedOffice);

  useEffect(() => {
    if (
      requestedOffice &&
      officeIds.includes(requestedOffice) &&
      requestedOffice !== selectedOffice
    )
      setSelectedOffice(requestedOffice);
  }, [requestedOffice, selectedOffice]);
  const chooseOffice = (officeId: OfficeId) => {
    setSelectedOffice(officeId);
    const path = location.split("?")[0] || "/operations/settings";
    navigate(`${path}?office=${officeId}`);
  };
  const saveProfile = async (
    next: OfficeProfile,
    expectedVersion: number
  ): Promise<VersionedOfficeProfile | null> => {
    if (!canEditProfile) return null;
    try {
      const result = await updateProfile.mutateAsync({
        ...next,
        expectedVersion,
      });
      setOverrides(current => ({ ...current, [result.officeId]: result }));
      await utils.branches.public.invalidate();
      return result;
    } catch {
      return null;
    }
  };
  const saveMember = async (input: {
    userId: number;
    role: AssignableRole;
    offices: OfficeId[];
    expectedVersion: number;
  }): Promise<OfficeMember | null> => {
    if (workspace.role !== "admin" || !workspace.online) return null;
    try {
      const result = await assignMember.mutateAsync(input);
      await utils.invalidate();
      return result;
    } catch {
      return null;
    }
  };
  const roleCanSeeProfile =
    workspace.role === "admin" ||
    workspace.role === "accountant" ||
    workspace.role === "staff" ||
    workspace.role === "supervisor" ||
    workspace.role === "viewer" ||
    workspace.role === "tracking_staff";

  const canReadNouakchottPayments =
    workspace.role === "admin" ||
    (workspace.role === "accountant" &&
      Boolean(accessQuery.data) &&
      (accessQuery.data?.offices === null ||
        accessQuery.data?.offices?.includes("nouakchott") === true));
  return (
    <PackingLayout
      title={copy.title}
      description={copy.description}
      workspace={workspace}
    >
      <section className="grid gap-5">
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
              >
                {officeIds.map(officeId => (
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
            />
          ) : (
            <p className="rounded-xl bg-white p-5 text-sm">{copy.noProfile}</p>
          ))}
        {workspace.role === "admin" && (
          <OfficeMemberships
            members={membersQuery.data ?? []}
            canEdit={canEditProfile}
            online={workspace.online}
            pending={assignMember.isPending}
            onSave={saveMember}
          />
        )}
        {workspace.role !== "admin" && (
          <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-[#52636e]">
            {copy.noMemberAccess}
          </p>
        )}
        {selectedOffice === "nouakchott" && (
          <PaymentMethodsSection
            workspace={workspace}
            copy={copy}
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
