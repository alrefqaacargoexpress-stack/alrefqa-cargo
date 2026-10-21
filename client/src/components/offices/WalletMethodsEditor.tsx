import { useEffect, useRef, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { officeSettingsSchema, type PaymentMethod } from "@shared/office";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOperationsWorkspace } from "@/hooks/useOperationsWorkspace";
import { trpc } from "@/lib/trpc";
import { walletCopyFor } from "@/lib/walletCopy";

type Props = {
  workspace: ReturnType<typeof useOperationsWorkspace>;
  allowed: boolean;
};

const inputClass =
  "w-full rounded-lg border border-[#dce4e7] bg-white px-3 py-2 text-sm text-[#092d50]";
function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { data?: { code?: string }; message?: string };
  return candidate.data?.code ?? candidate.message;
}
function cloneMethods(methods: PaymentMethod[]): PaymentMethod[] {
  return methods.map(method => ({ ...method }));
}

export default function WalletMethodsEditor({ workspace, allowed }: Props) {
  const { language, dir } = useLanguage();
  const copy = walletCopyFor(language);
  const settings = trpc.office.get.useQuery(undefined, {
    enabled:
      allowed &&
      workspace.online &&
      Boolean(workspace.userId) &&
      !workspace.localOnly,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const update = trpc.office.update.useMutation();
  const [draft, setDraft] = useState<PaymentMethod[] | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const saveRef = useRef(false);
  const persistedIdsRef = useRef<Set<string> | null>(null);
  const canEdit =
    allowed &&
    workspace.role === "admin" &&
    workspace.online &&
    Boolean(workspace.userId) &&
    !workspace.localOnly;

  const replaceFromServer = (methods: PaymentMethod[], nextVersion: number) => {
    persistedIdsRef.current = new Set(methods.map(method => method.id));
    setDraft(cloneMethods(methods));
    setVersion(nextVersion);
    setDirty(false);
    setError("");
  };

  useEffect(() => {
    if (!settings.data || settings.data.version < (version ?? -1)) return;
    if (persistedIdsRef.current === null)
      persistedIdsRef.current = new Set(
        settings.data.methods.map(method => method.id)
      );
    if (!draft || !dirty)
      replaceFromServer(settings.data.methods, settings.data.version);
  }, [settings.data]);

  const updateMethod = (index: number, patch: Partial<PaymentMethod>) => {
    setDraft(
      current =>
        current?.map((method, itemIndex) =>
          itemIndex === index ? { ...method, ...patch } : method
        ) ?? current
    );
    setDirty(true);
    setNotice("");
  };
  const reload = async () => {
    if (saveRef.current || saving) return;
    if (dirty && !window.confirm(copy.reloadConfirm)) return;
    setNotice("");
    setError("");
    try {
      const result = await settings.refetch();
      if (result.error || !result.data) {
        setError(copy.loadError);
        return;
      }
      replaceFromServer(result.data.methods, result.data.version);
    } catch {
      setError(copy.loadError);
    }
  };
  const save = async () => {
    if (saveRef.current || !canEdit || !draft || version === null) return;
    if (!workspace.online) {
      setError(copy.offline);
      return;
    }
    const parsed = officeSettingsSchema.safeParse({
      office: "nouakchott",
      methods: draft,
    });
    if (!parsed.success) {
      setError(copy.invalid);
      return;
    }
    saveRef.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await update.mutateAsync({
        office: "nouakchott",
        methods: parsed.data.methods,
        expectedVersion: version,
      });
      replaceFromServer(result.methods, result.version);
      setNotice(copy.saved);
      try {
        const refreshed = await settings.refetch();
        if (refreshed.error || !refreshed.data) {
          setNotice(copy.saved + " · " + copy.loadError);
          setError("");
        } else {
          replaceFromServer(refreshed.data.methods, refreshed.data.version);
          setNotice(copy.saved);
        }
      } catch {
        setNotice(copy.saved + " · " + copy.loadError);
        setError("");
      }
    } catch (caught) {
      const code = errorCode(caught);
      if (code === "CONFLICT" || code === "office_settings_version_conflict")
        setError(copy.conflict);
      else if (code === "BAD_REQUEST") setError(copy.invalid);
      else setError(copy.serverError);
    } finally {
      saveRef.current = false;
      setSaving(false);
    }
  };

  const addMethod = () => {
    if (!canEdit || !draft || draft.length >= 50) return;
    const used = new Set(draft.map(method => method.id));
    let suffix = draft.length + 1;
    let id = `new_method_${suffix}`;
    while (used.has(id)) id = `new_method_${++suffix}`;
    setDraft(current => [
      ...(current ?? []),
      {
        id,
        label: `${copy.newMethod} ${suffix}`,
        enabled: true,
        showToCustomers: false,
      },
    ]);
    setDirty(true);
    setNotice("");
  };

  const removeMethod = (index: number) => {
    if (!canEdit || !draft || persistedIdsRef.current?.has(draft[index]?.id))
      return;
    setDraft(
      current =>
        current?.filter((_, itemIndex) => itemIndex !== index) ?? current
    );
    setDirty(true);
    setNotice("");
  };

  if (!allowed) return null;
  return (
    <section
      dir={dir}
      className="rounded-2xl border border-[#dce4e7] bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#edf1f1] pb-4">
        <div>
          <h2 className="text-lg font-black text-[#092d50]">{copy.title}</h2>
          <p className="mt-1 text-sm text-[#718088]">{copy.description}</p>
          <p className="mt-2 text-xs font-bold text-[#7b5a1d]">
            {copy.manualOnly}
          </p>
        </div>
        {version !== null && (
          <span className="text-xs text-[#718088]">v{version}</span>
        )}
      </div>
      {settings.isLoading && <p className="mt-4 text-sm">{copy.loading}</p>}
      {settings.isError && (
        <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">
          {copy.loadError}{" "}
          <button
            type="button"
            className="font-bold underline"
            onClick={() => void reload()}
          >
            {copy.retry}
          </button>
        </div>
      )}
      {draft && (
        <>
          {canEdit && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="rounded-lg border border-[#dce4e7] px-3 py-2 text-sm font-bold text-[#2e6280]"
                disabled={update.isPending || saving}
                onClick={addMethod}
              >
                <Plus size={16} className="me-2 inline" />
                {copy.addMethod}
              </button>
            </div>
          )}
          <div className="mt-4 grid gap-4">
            {draft.map((method, index) => {
              const isCash = method.id === "cash";
              const visible = method.showToCustomers === true;
              const persisted =
                persistedIdsRef.current?.has(method.id) ?? false;
              return (
                <article
                  key={method.id}
                  className="rounded-xl border border-[#edf1f1] bg-[#fbfcfb] p-4"
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                      {!persisted && (
                        <label className="text-xs font-bold text-[#718088]">
                          {copy.methodId}
                          <input
                            className={`${inputClass} mt-1`}
                            value={method.id}
                            disabled={!canEdit || update.isPending || saving}
                            onChange={event =>
                              updateMethod(index, { id: event.target.value })
                            }
                          />
                        </label>
                      )}
                      <label className="text-xs font-bold text-[#718088]">
                        {copy.methodLabel}
                        <input
                          className={`${inputClass} mt-1 font-black`}
                          value={method.label}
                          disabled={!canEdit || update.isPending || saving}
                          onChange={event =>
                            updateMethod(index, { label: event.target.value })
                          }
                        />
                      </label>
                    </div>
                    <label className="flex items-center gap-2 text-sm font-bold">
                      <input
                        type="checkbox"
                        checked={method.enabled}
                        disabled={!canEdit || update.isPending || saving}
                        onChange={event =>
                          updateMethod(index, { enabled: event.target.checked })
                        }
                      />
                      {method.enabled ? copy.enabled : copy.disabled}
                    </label>
                    {!persisted && canEdit && (
                      <button
                        type="button"
                        className="rounded-lg p-2 text-red-700"
                        aria-label={copy.removeMethod}
                        disabled={update.isPending || saving}
                        onClick={() => removeMethod(index)}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-sm font-bold text-[#092d50]">
                      {copy.accountNumber}
                      <input
                        className={`${inputClass} mt-1`}
                        value={method.accountNumber ?? ""}
                        disabled={
                          !canEdit || update.isPending || saving || isCash
                        }
                        dir="ltr"
                        inputMode="tel"
                        onChange={event =>
                          updateMethod(index, {
                            accountNumber: event.target.value || undefined,
                          })
                        }
                      />
                    </label>
                    <label className="text-sm font-bold text-[#092d50]">
                      {copy.accountName}
                      <input
                        className={`${inputClass} mt-1`}
                        value={method.accountName ?? ""}
                        disabled={!canEdit || update.isPending || saving}
                        onChange={event =>
                          updateMethod(index, {
                            accountName: event.target.value || undefined,
                          })
                        }
                      />
                    </label>
                    <label className="text-sm font-bold text-[#092d50] md:col-span-2">
                      {copy.instructions}
                      <textarea
                        className={`${inputClass} mt-1`}
                        rows={3}
                        value={method.instructions ?? ""}
                        disabled={!canEdit || update.isPending || saving}
                        onChange={event =>
                          updateMethod(index, {
                            instructions: event.target.value || undefined,
                          })
                        }
                      />
                    </label>
                  </div>
                  <label className="mt-3 flex items-start gap-2 text-sm font-bold text-[#092d50]">
                    <input
                      type="checkbox"
                      checked={visible}
                      disabled={!canEdit || update.isPending || saving}
                      onChange={event => {
                        if (
                          event.target.checked &&
                          !window.confirm(copy.confirmVisibility)
                        )
                          return;
                        updateMethod(index, {
                          showToCustomers: event.target.checked,
                        });
                      }}
                    />
                    <span>
                      {copy.showToCustomers}
                      <small className="block font-normal text-[#718088]">
                        {visible ? copy.visibleHint : copy.hiddenHint}
                        {isCash ? ` ${copy.manualOnly}` : ""}
                      </small>
                    </span>
                  </label>
                </article>
              );
            })}
          </div>
          {!draft.length && (
            <p className="mt-4 text-sm text-[#718088]">{copy.noMethods}</p>
          )}
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
          <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-[#edf1f1] pt-4">
            {!canEdit && (
              <span className="text-xs text-[#718088]">{copy.readOnly}</span>
            )}
            {dirty && canEdit && (
              <button
                type="button"
                className="rounded-lg bg-[#0c456a] px-4 py-2 text-sm font-bold text-white"
                disabled={update.isPending || saving || !workspace.online}
                onClick={() => void save()}
              >
                <Save size={16} className="me-2 inline" />
                {update.isPending || saving ? copy.saving : copy.save}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
