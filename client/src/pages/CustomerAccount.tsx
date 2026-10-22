import { useEffect, useState } from "react";
import { Link, useParams, useSearch } from "wouter";
import { ArrowLeft, ArrowRight, Phone, UserRound } from "lucide-react";
import { canUseFinance } from "@shared/finance";
import { customerAccountStatement } from "@shared/customerAccounts";
import { isSharedCustomerAccount } from "@shared/customerAccountCreation";
import { officeIds, officeNames, type OfficeId } from "@shared/branches";
import PackingLayout from "@/components/packing/PackingLayout";
import CustomerMovementForm from "@/components/customers/CustomerMovementForm";
import CustomerStatement from "@/components/customers/CustomerStatement";
import { useFinanceWorkspace } from "@/hooks/useFinanceWorkspace";
import { useLanguage } from "@/contexts/LanguageContext";
import { customerAccountCopyFor } from "@/lib/customerAccountCopy";

export default function CustomerAccount() {
  const { language, dir } = useLanguage();
  const c = customerAccountCopyFor(language);
  const params = useParams<{ id: string }>();
  const search = useSearch();
  const workspace = useFinanceWorkspace();
  const [notice, setNotice] = useState<string | null>(null);
  const [movementOffice, setMovementOffice] = useState<OfficeId | null>(null);
  const [publishing, setPublishing] = useState(false);
  const rawId = params.id ?? "";
  const account =
    workspace.base.state.accounts.find(item => item.id === rawId) ??
    (() => {
      try {
        const decoded = decodeURIComponent(rawId);
        return workspace.base.state.accounts.find(item => item.id === decoded);
      } catch {
        return undefined;
      }
    })();
  useEffect(() => setNotice(null), [account?.id, workspace.base.userId]);
  const financial = canUseFinance(workspace.role);
  const permitted =
    workspace.base.offices === null ? [...officeIds] : workspace.base.offices;
  const fixedOffice =
    workspace.homeOffice && permitted.includes(workspace.homeOffice)
      ? workspace.homeOffice
      : permitted.length === 1
        ? permitted[0]
        : null;
  const needsOfficeSelection = financial && !fixedOffice && permitted.length > 1;
  useEffect(() => {
    setMovementOffice(fixedOffice);
  }, [account?.id, fixedOffice]);
  const accountHasSharedOrigin = Boolean(
    account && isSharedCustomerAccount(account)
  );
  const accountNeedsPublish = Boolean(account && account.scope !== "shared");
  const statement =
    account && financial
      ? customerAccountStatement(
          account.id,
          workspace.invoices,
          workspace.entries
        )
    : null;
  const publishAccount = async () => {
    if (!account || !workspace.base.syncRecords || publishing) return;
    setPublishing(true);
    try {
      const result = await workspace.base.syncRecords([
        { entity: "account", recordId: account.id },
      ]);
      const applied =
        result &&
        Array.isArray(result.applied) &&
        result.applied.some(item => item.record?.id === account.id);
      setNotice(applied ? c.accountPublished : c.publishFailed);
    } catch {
      setNotice(c.publishFailed);
    } finally {
      setPublishing(false);
    }
  };
  const Back = language === "ar" ? ArrowRight : ArrowLeft;
  return (
    <PackingLayout
      title={c.detail}
      description={c.description}
      workspace={workspace.base}
    >
      <div dir={dir} className="space-y-5">
        <Link
          href={`/operations/customers${search ? `?${search}` : ""}`}
          className="inline-flex items-center gap-2 text-sm font-bold text-[#2d6380]"
        >
          <Back size={16} />
          {c.back}
        </Link>
        {!account ? (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm font-bold text-red-800">
            {c.accountNotFound}
          </section>
        ) : (
          <>
            <section className="rounded-2xl border border-[#dce4e7] bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-12 place-items-center rounded-2xl bg-[#e6f0f3] text-[#092d50]">
                    <UserRound size={22} />
                  </span>
                  <div>
                    <h1 className="text-2xl font-black text-[#092d50]">
                      {account.name}
                    </h1>
                    <p
                      dir="ltr"
                      className="mt-1 flex items-center gap-1 text-sm text-[#718088]"
                    >
                      <Phone size={14} />
                      {account.phone}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  {accountNeedsPublish && workspace.base.canEditAccounts && (
                    <button
                      id="publish-account"
                      type="button"
                      disabled={publishing || !workspace.base.syncRecords}
                      onClick={publishAccount}
                      className="rounded-xl border border-[#dce4e7] px-3 py-2 text-sm font-bold text-[#2d6380] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {publishing ? c.saving : c.publishAccount}
                    </button>
                  )}
                  {financial && (
                    accountHasSharedOrigin ? (
                      <Link
                        href={`/operations/billing?customer=${encodeURIComponent(account.id)}`}
                        className="rounded-xl border border-[#dce4e7] px-3 py-2 text-sm font-bold text-[#2d6380]"
                      >
                        {c.invoices}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled
                        aria-describedby="publish-account"
                        title={c.publishAccount}
                        className="rounded-xl border border-[#dce4e7] px-3 py-2 text-sm font-bold text-[#2d6380] opacity-60"
                      >
                        {c.invoices}
                      </button>
                    )
                  )}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#718088]">
                <span className="rounded-full bg-[#f5f9fa] px-3 py-1">
                  {account.id}
                </span>
                <span className="rounded-full bg-[#f5f9fa] px-3 py-1">
                  {account.scope === "shared"
                    ? c.shared
                    : account.scope === "pending"
                      ? c.pending
                      : c.local}
                </span>
              </div>
            </section>
            {!financial ? (
              <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <p className="font-black text-amber-950">
                  {c.noFinancialAccess}
                </p>
                <p className="mt-1 text-sm text-amber-900">{c.staffHint}</p>
              </section>
            ) : (
              <>
                {needsOfficeSelection && (
                  <section className="rounded-2xl border border-[#dce4e7] bg-white p-5 shadow-sm">
                    <label className="block text-sm font-bold text-[#23445d]">
                      {c.office}
                      <select
                        value={movementOffice ?? ""}
                        onChange={event =>
                          setMovementOffice(
                            (event.target.value as OfficeId) || null
                          )
                        }
                        className="mt-1 w-full min-h-11 rounded-xl border border-[#dce4e7] bg-white px-3 font-normal"
                      >
                        <option value="">{c.selectOffice}</option>
                        {permitted.map(id => (
                          <option key={id} value={id}>
                            {officeNames[language][id]}
                          </option>
                        ))}
                      </select>
                    </label>
                    {!movementOffice && (
                      <p className="mt-2 text-sm text-[#718088]">
                        {c.selectOfficeHint}
                      </p>
                    )}
                  </section>
                )}
                {movementOffice && (
                  <CustomerMovementForm
                    key={`${workspace.base.userId}:${account.id}:${movementOffice}`}
                    workspace={workspace}
                    customerId={account.id}
                    officeId={movementOffice}
                    onNotice={setNotice}
                  />
                )}
                {notice && (
                  <p
                    role="status"
                    className="rounded-xl border border-[#cfe0e5] bg-[#f5f9fa] p-3 text-sm font-bold text-[#23445d]"
                  >
                    {notice}
                  </p>
                )}
                <CustomerStatement
                  invoices={statement?.invoices ?? []}
                  rows={statement?.rows ?? []}
                  balances={statement?.balances ?? []}
                  previousBalance={account.balance}
                />
              </>
            )}
          </>
        )}
      </div>
    </PackingLayout>
  );
}
