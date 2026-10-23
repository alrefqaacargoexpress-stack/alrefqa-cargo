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
import { compatibilityRoleForAction } from "@/lib/offlineAccess";

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
    navigate(
      `/operations/customers/${encodeURIComponent(account.id)}${suffix}`,
      {
        replace: true,
      }
    );
  }, [account, contextSearch, navigate]);
  const unassignedAccountWriteBlocked =
    base.role === "accountant" &&
    base.offices !== null &&
    base.offices.length === 0;
  const formBase = useMemo(
    () => ({
      ...base,
      role:
        compatibilityRoleForAction(
          {
            role: base.role,
            offices: base.offices,
            permissions: base.permissions,
          },
          "customers",
          "manage"
        ) ?? base.role,
    }),
    [base]
  );
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
        {unassignedAccountWriteBlocked && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            {language === "ar"
              ? "لا يوجد مكتب معيّن؛ أوقفنا الكتابة. عيّن المكتب قبل المتابعة."
              : language === "en"
                ? "No office is assigned; writing is paused. Assign an office before continuing."
                : language === "zh"
                  ? "未分配办公室，写入已暂停。请先分配办公室。"
                  : "Ofis atanmadı; yazma durduruldu. Devam etmeden önce ofis atayın."}
          </p>
        )}
        {base.role && !base.canEditAccounts && (
          <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-[#52636e]">
            {language === "ar"
              ? "هذه القائمة للقراءة فقط؛ إنشاء وتعديل حساب العميل للمحاسب المعيّن بمكتب واحد."
              : language === "en"
                ? "This list is read-only; customer account writes belong to a one-office accountant."
                : language === "zh"
                  ? "此列表为只读；客户账户写入仅限分配一个办公室的会计。"
                  : "Bu liste salt okunurdur; müşteri hesabı yazımı tek ofise atanmış muhasebeciye aittir."}
          </p>
        )}
        <CustomerAccountForm
          key={`${base.userId ?? "local"}:${office ?? ""}`}
          base={formBase}
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
