import { useEffect, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { officeIds, type OfficeId } from "@shared/branches";
import type { Account } from "@shared/operations";
import PackingLayout from "@/components/packing/PackingLayout";
import CustomerAccountForm from "@/components/customers/CustomerAccountForm";
import CustomerAccountList from "@/components/customers/CustomerAccountList";
import { useFinanceWorkspace } from "@/hooks/useFinanceWorkspace";
import { useLanguage } from "@/contexts/LanguageContext";
import { customerAccountCopyFor } from "@/lib/customerAccountCopy";

type AccountBase = ReturnType<typeof useFinanceWorkspace>["base"] & {
  saveRecord?: (
    entity: "account",
    record: import("@shared/operations").Account,
    label?: string
  ) => Promise<boolean>;
};

export function accountForRouteId(accounts: Account[], rawId: string | null) {
  if (!rawId) return undefined;
  const direct = accounts.find(account => account.id === rawId);
  if (direct) return direct;
  try {
    const decoded = decodeURIComponent(rawId);
    return accounts.find(account => account.id === decoded);
  } catch {
    return undefined;
  }
}

export default function Customers() {
  const { language } = useLanguage();
  const c = customerAccountCopyFor(language);
  const workspace = useFinanceWorkspace();
  const base = workspace.base as AccountBase;
  const [, navigate] = useLocation();
  const search = useSearch();
  const query = useMemo(() => new URLSearchParams(search), [search]);
  const accounts = useMemo(() => base.state.accounts, [base.state.accounts]);
  const requestedOffice = query.get("office");
  const permittedOffices =
    base.offices === null ? [...officeIds] : base.offices;
  const office =
    officeIds.includes(requestedOffice as OfficeId) &&
    permittedOffices.includes(requestedOffice as OfficeId)
    ? (requestedOffice as OfficeId)
    : null;
  const contextSearch = useMemo(() => {
    const params = new URLSearchParams(search);
    params.delete("account");
    params.delete("new");
    return params.toString();
  }, [search]);
  const account = useMemo(
    () => accountForRouteId(accounts, query.get("account")),
    [accounts, query]
  );
  useEffect(() => {
    if (!account) return;
    const suffix = contextSearch ? `?${contextSearch}` : "";
    navigate(`/operations/customers/${encodeURIComponent(account.id)}${suffix}`, {
      replace: true,
    });
  }, [account, contextSearch, navigate]);
  const visibleAccounts = useMemo(
    () =>
      office
        ? accounts.filter(account => account.officeId === office)
        : accounts,
    [accounts, office]
  );
  return (
    <PackingLayout title={c.title} description={c.description} workspace={base}>
      <div className="space-y-5">
        <CustomerAccountForm
          key={`${base.userId ?? "local"}:${office ?? ""}`}
          base={base}
          homeOffice={workspace.homeOffice}
          initialOpen={query.get("new") === "1"}
          initialOffice={office}
        />
        <CustomerAccountList
          accounts={visibleAccounts}
          contextSearch={contextSearch}
        />
      </div>
    </PackingLayout>
  );
}
