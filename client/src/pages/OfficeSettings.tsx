import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Link } from "wouter";
import PackingLayout from "@/components/packing/PackingLayout";
import {
  PackingField,
  packingInputClass,
  packingPrimaryClass,
  packingSecondaryClass,
} from "@/components/packing/PackingPrimitives";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOperationsWorkspace } from "@/hooks/useOperationsWorkspace";
import { trpc } from "@/lib/trpc";
import { officeCopyFor } from "@/lib/officeCopy";
import type { PaymentMethod } from "@shared/office";

const ID_PATTERN = /^[a-z0-9_-]{1,64}$/;
const MAX_METHODS = 50;

type DraftMethod = PaymentMethod & { persisted: boolean };

function toDraft(methods: PaymentMethod[]): DraftMethod[] {
  return methods.map(method => ({ ...method, persisted: true }));
}

function errorText(error: unknown, c: ReturnType<typeof officeCopyFor>) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("conflict") || message.includes("version"))
    return c.conflict;
  if (message.includes("duplicate")) return c.duplicateMethod;
  if (message.includes("method") || message.includes("invalid"))
    return c.invalidMethods;
  return c.loadError;
}

export default function OfficeSettings() {
  const { language } = useLanguage();
  const c = officeCopyFor(language);
  const workspace = useOperationsWorkspace();
  const canRead = workspace.role === "admin" || workspace.role === "accountant";
  const canEdit =
    workspace.role === "admin" &&
    workspace.online &&
    !workspace.localOnly &&
    Boolean(workspace.userId);
  const settings = trpc.office.get.useQuery(undefined, {
    enabled:
      canRead &&
      workspace.online &&
      !workspace.localOnly &&
      Boolean(workspace.userId),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const update = trpc.office.update.useMutation();
  const [draft, setDraft] = useState<DraftMethod[] | null>(null);
  const [baseVersion, setBaseVersion] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!settings.data || dirty) return;
    setDraft(toDraft(settings.data.methods));
    setBaseVersion(settings.data.version);
    setConflict(false);
  }, [settings.data, dirty]);

  const methods = draft ?? [];
  const enabledCount = methods.filter(method => method.enabled).length;
  const summary = useMemo(
    () =>
      methods
        .map(
          method =>
            `${method.label} (${method.enabled ? c.enabled : c.disabled})`
        )
        .join(", "),
    [methods, c.enabled, c.disabled]
  );

  const updateMethod = (index: number, patch: Partial<PaymentMethod>) => {
    setNotice("");
    setValidationError("");
    setDirty(true);
    setDraft(current =>
      (current ?? []).map((method, itemIndex) =>
        itemIndex === index ? { ...method, ...patch } : method
      )
    );
  };

  const addMethod = () => {
    if (methods.length >= MAX_METHODS) {
      setValidationError(c.maxMethods);
      return;
    }
    const id = `method-${crypto
      .randomUUID()
      .replace(/[^a-z0-9]/gi, "")
      .slice(0, 12)
      .toLowerCase()}`;
    setDraft(current => [
      ...(current ?? []),
      { id, label: "", enabled: true, persisted: false },
    ]);
    setDirty(true);
    setValidationError("");
  };

  const removeMethod = (index: number) => {
    if (methods[index]?.persisted) return;
    setDraft(current =>
      (current ?? []).filter((_, itemIndex) => itemIndex !== index)
    );
    setDirty(true);
  };

  const validate = () => {
    if (!methods.length || methods.length > MAX_METHODS)
      return c.invalidMethods;
    const ids = new Set<string>();
    for (const method of methods) {
      if (!ID_PATTERN.test(method.id)) return c.invalidId;
      if (ids.has(method.id)) return c.duplicateMethod;
      ids.add(method.id);
      if (!method.label.trim() || method.label.trim().length > 120)
        return c.invalidLabel;
    }
    if (!enabledCount) return c.invalidMethods;
    return "";
  };

  const save = async () => {
    if (savingRef.current) return;
    if (!canEdit || baseVersion === null) {
      setNotice(c.connectionRequired);
      return;
    }
    const error = validate();
    if (error) {
      setValidationError(error);
      return;
    }
    const confirmation = `${c.saveSummary}\n\n${c.office}: ${c.nouakchott}\n${c.paymentMethods}: ${summary}\n\n${c.confirmSave}`;
    if (!window.confirm(confirmation)) return;
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
      setConflict(false);
      setNotice(c.saved);
      setValidationError("");
    } catch (error) {
      const message = errorText(error, c);
      if (message === c.conflict) setConflict(true);
      setNotice(message);
    } finally {
      savingRef.current = false;
    }
  };

  const reload = async () => {
    if (
      dirty &&
      !window.confirm(
        {
          ar: "إعادة تحميل إعدادات الخادم واستبدال التغييرات غير المحفوظة؟",
          en: "Reload server settings and replace your unsaved changes?",
          zh: "重新加载服务器设置并替换未保存的更改？",
          tr: "Sunucu ayarları yeniden yüklenip kaydedilmemiş değişiklikler değiştirilsin mi?",
        }[language]
      )
    )
      return;
    const result = await settings.refetch();
    if (result.error || !result.data) {
      setNotice(c.loadError);
      return;
    }
    setDraft(toDraft(result.data.methods));
    setBaseVersion(result.data.version);
    setNotice("");
    setConflict(false);
    setDirty(false);
  };

  return (
    <PackingLayout
      title={c.title}
      description={c.description}
      workspace={workspace}
    >
      {!canRead ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-950">
          <h2 className="text-lg font-black">{c.noAccess}</h2>
          <Link
            className="mt-3 inline-block font-bold underline"
            href="/operations/tracking"
          >
            {c.tracking}
          </Link>
        </section>
      ) : (
        <section className="grid gap-5">
          <div className="rounded-2xl border border-[#dce4e7] bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-[#718088]">
                  {c.office}
                </p>
                <h2 className="mt-1 text-2xl font-black text-[#092d50]">
                  {c.nouakchott}
                </h2>
                <p className="mt-2 text-sm text-[#718088]">{c.officeCaption}</p>
              </div>
              <div className="text-end text-xs text-[#718088]">
                {baseVersion !== null && (
                  <p>
                    {c.currentVersion}: {baseVersion}
                  </p>
                )}
                <p className="mt-1">{c.auditHint}</p>
              </div>
            </div>
          </div>

          {settings.isLoading && (
            <p className="rounded-xl bg-white p-5 text-sm">{c.loading}</p>
          )}
          {settings.isError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-950">
              <p className="font-bold">{c.loadError}</p>
              <button
                className={`${packingSecondaryClass} mt-3`}
                onClick={() => void settings.refetch()}
              >
                {c.retry}
              </button>
            </div>
          )}
          {!settings.isLoading && !settings.isError && draft && (
            <div className="rounded-2xl border border-[#dce4e7] bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#edf1f1] pb-4">
                <div>
                  <h2 className="text-lg font-black text-[#092d50]">
                    {c.paymentMethods}
                  </h2>
                  <p className="mt-1 text-sm text-[#718088]">
                    {canEdit ? c.adminOnly : c.readOnly}
                  </p>
                </div>
                {canEdit && (
                  <button
                    className={packingSecondaryClass}
                    onClick={addMethod}
                    disabled={methods.length >= MAX_METHODS || update.isPending}
                  >
                    <Plus size={16} className="me-2" />
                    {c.addMethod}
                  </button>
                )}
              </div>
              <div className="mt-5 grid gap-4">
                {methods.map((method, index) => (
                  <div
                    key={`${method.id}-${index}`}
                    className="rounded-2xl border border-[#edf1f1] bg-[#fbfcfb] p-4"
                  >
                    <div className="grid gap-4 md:grid-cols-[1fr_1.6fr_auto] md:items-end">
                      <PackingField label={c.methodId} required>
                        <input
                          className={packingInputClass}
                          value={method.id}
                          maxLength={64}
                          disabled={
                            !canEdit || method.persisted || update.isPending
                          }
                          onChange={event =>
                            updateMethod(index, { id: event.target.value })
                          }
                        />
                      </PackingField>
                      <PackingField label={c.methodLabel} required>
                        <input
                          className={packingInputClass}
                          value={method.label}
                          maxLength={120}
                          disabled={!canEdit || update.isPending}
                          onChange={event =>
                            updateMethod(index, { label: event.target.value })
                          }
                        />
                      </PackingField>
                      <div className="flex items-center gap-3 pb-1">
                        <label className="flex items-center gap-2 text-sm font-bold text-[#243f52]">
                          <input
                            type="checkbox"
                            checked={method.enabled}
                            disabled={!canEdit || update.isPending}
                            onChange={event =>
                              updateMethod(index, {
                                enabled: event.target.checked,
                              })
                            }
                          />
                          {method.enabled ? c.enabled : c.disabled}
                        </label>
                        {canEdit && !method.persisted && (
                          <button
                            type="button"
                            className="rounded-lg p-2 text-red-700 hover:bg-red-50"
                            aria-label={c.removeMethod}
                            onClick={() => removeMethod(index)}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                    {!method.enabled && (
                      <p className="mt-3 text-xs text-amber-800">
                        {c.methodDisabled}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              {validationError && (
                <p role="alert" className="mt-4 text-sm font-bold text-red-700">
                  {validationError}
                </p>
              )}
              {notice && (
                <p
                  role="status"
                  className={`mt-4 rounded-xl p-3 text-sm font-bold ${conflict ? "bg-red-50 text-red-900" : "bg-emerald-50 text-emerald-900"}`}
                >
                  {notice}
                </p>
              )}
              {conflict && (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                  <p>{c.conflictDetail}</p>
                  <button
                    className={`${packingSecondaryClass} mt-3`}
                    onClick={() => void reload()}
                  >
                    {c.reload}
                  </button>
                </div>
              )}
              {dirty && (
                <p className="mt-4 text-xs font-bold text-amber-800">
                  {c.dirty} · {c.connectionRequired}
                </p>
              )}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#edf1f1] pt-4">
                <p className="text-xs text-[#718088]">
                  {c.paymentMethods}: {methods.length} · {enabledCount}{" "}
                  {c.enabled}
                </p>
                {canEdit && (
                  <button
                    className={packingPrimaryClass}
                    disabled={!dirty || update.isPending || !workspace.online}
                    onClick={() => void save()}
                  >
                    <Save size={16} className="me-2" />
                    {update.isPending ? c.saving : c.save}
                  </button>
                )}
              </div>
            </div>
          )}
          {!settings.isLoading && !settings.isError && !draft && (
            <p className="rounded-xl bg-white p-5 text-sm">{c.noSettings}</p>
          )}
          {!workspace.online && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              {c.onlineRequired}
            </p>
          )}
        </section>
      )}
    </PackingLayout>
  );
}
