import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Download, Search, UserRound } from "lucide-react";
import * as XLSX from "xlsx";
import { officeNames } from "@shared/branches";
import type { Account } from "@shared/operations";
import { searchableCustomerAccounts } from "@shared/customerAccounts";
import { useLanguage } from "@/contexts/LanguageContext";
import { customerAccountCopyFor } from "@/lib/customerAccountCopy";
import { packingSecondaryClass } from "@/components/packing/PackingPrimitives";

function exportAccounts(accounts: Account[]) {
  const rows = accounts.map(account => ({
    ID: account.id,
    Name: account.name,
    Phone: account.phone,
    City: account.city,
    Office: account.officeId ?? "",
    Scope: account.scope ?? "local",
    Updated: account.updatedAt,
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Customer accounts");
  XLSX.writeFile(
    workbook,
    `customer-accounts-${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}

export default function CustomerAccountList({
  accounts,
  contextSearch = "",
}: {
  accounts: Account[];
  contextSearch?: string;
}) {
  const { language, dir } = useLanguage();
  const c = customerAccountCopyFor(language);
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () => searchableCustomerAccounts(accounts, query),
    [accounts, query]
  );
  const scopeLabel = (scope: Account["scope"]) =>
    scope === "shared" ? c.shared : scope === "pending" ? c.pending : c.local;
  return (
    <section
      dir={dir}
      className="overflow-hidden rounded-2xl border border-[#dce4e7] bg-white shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1f1] p-5">
        <div>
          <h2 className="text-lg font-black text-[#092d50]">{c.title}</h2>
          <p className="mt-1 text-xs text-[#718088]">
            {accounts.length} · {c.description}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={packingSecondaryClass}
            onClick={() => exportAccounts(filtered)}
          >
            <Download size={16} />
            {c.export}
          </button>
          <Link
            href="/operations/advanced?tab=accounts"
            className={packingSecondaryClass}
          >
            {c.oldAccounts}
          </Link>
        </div>
      </div>
      <label className="m-5 flex min-h-11 items-center gap-2 rounded-xl border border-[#dce4e7] px-3 text-sm">
        <Search size={16} className="text-[#718088]" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={c.search}
          aria-label={c.search}
          className="w-full bg-transparent outline-none"
        />
      </label>
      <div>
        {filtered.map(account => (
          <Link
            key={account.id}
            href={`/operations/customers/${encodeURIComponent(account.id)}${contextSearch ? `?${contextSearch}` : ""}`}
            className="flex flex-wrap items-center gap-3 border-t border-[#edf1f1] px-5 py-4 transition hover:bg-[#f5f9fa]"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e6f0f3] text-[#092d50]">
              <UserRound size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-[#092d50]">
                {account.name}
              </strong>
              <span
                dir="ltr"
                className="mt-1 block truncate text-xs text-[#718088]"
              >
                {account.phone || c.phoneMissing}
              </span>
            </span>
            <span className="text-end text-xs text-[#718088]">
              <span className="block font-bold">
                {scopeLabel(account.scope)}
              </span>
              <span className="mt-1 block">
                {account.officeId ? officeNames[language][account.officeId] : "—"}
              </span>
              <span className="mt-1 block font-mono">{account.id}</span>
            </span>
          </Link>
        ))}
        {!filtered.length && (
          <p className="p-10 text-center text-sm text-[#718088]">
            {accounts.length ? c.noResults : c.noAccounts}
          </p>
        )}
      </div>
    </section>
  );
}
