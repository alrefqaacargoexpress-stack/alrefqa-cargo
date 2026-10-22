import { useEffect, useMemo, useState } from "react";
import { officeIds, officeNames, type OfficeId } from "@shared/branches";
import type { Account } from "@shared/operations";
import { useLanguage } from "@/contexts/LanguageContext";
import { customerAccountCopyFor } from "@/lib/customerAccountCopy";
import {
  packingPrimaryClass,
  packingSecondaryClass,
} from "@/components/packing/PackingPrimitives";

type Base = {
  userId: string | null;
  offices: OfficeId[] | null;
  role: string | null;
  canEditAccounts?: boolean;
  saveRecord?: (
    entity: "account",
    record: Account,
    label?: string
  ) => Promise<boolean>;
  syncRecords?: (
    records: Array<{ entity: "account"; recordId: string }>
  ) => Promise<unknown | null>;
};

type Props = {
  base: Base;
  homeOffice: OfficeId | null;
  initialOpen?: boolean;
  initialOffice?: OfficeId | null;
  onSaved?: () => void;
};

function idForAccount() {
  return `account-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

export default function CustomerAccountForm({
  base,
  homeOffice,
  initialOpen = false,
  initialOffice = null,
  onSaved,
}: Props) {
  const { language, dir } = useLanguage();
  const c = customerAccountCopyFor(language);
  const allowed = useMemo(
    () => (base.offices === null ? [...officeIds] : base.offices),
    [base.offices]
  );
  const defaultOffice =
    initialOffice && allowed.includes(initialOffice)
      ? initialOffice
      : homeOffice && allowed.includes(homeOffice)
        ? homeOffice
        : (allowed[0] ?? "nouakchott");
  const [open, setOpen] = useState(initialOpen);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [office, setOffice] = useState<OfficeId>(defaultOffice);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingAccount, setPendingAccount] = useState<Account | null>(null);

  useEffect(() => {
    if (!allowed.includes(office)) setOffice(defaultOffice);
  }, [allowed, office, defaultOffice]);
  useEffect(() => {
    if (initialOpen) setOpen(true);
  }, [initialOpen]);
  if (
    base.canEditAccounts === false ||
    !allowed.length ||
    !base.saveRecord ||
    !base.userId ||
    !["admin", "staff", "accountant"].includes(base.role ?? "")
  )
    return null;
  const saveRecord = base.saveRecord;
  const syncRecords = base.syncRecords;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!name.trim() || !phone.trim()) return setNotice(c.required);
    setNotice("");
    setSaving(true);
    const account: Account = {
      id: pendingAccount?.id ?? idForAccount(),
      name: name.trim(),
      phone: phone.trim(),
      city: city.trim(),
      balance: 0,
      shipments: 0,
      updatedAt: new Date().toISOString(),
      officeId: office,
    };
    setPendingAccount(account);
    try {
      const ok = await saveRecord(
        "account",
        account,
        `${c.newAccount}: ${account.name}`
      );
      if (!ok) return setNotice(c.saveFailed);
      if (!syncRecords) {
        setNotice(c.createSuccess);
        return;
      }
      const result = await syncRecords([
        { entity: "account", recordId: account.id },
      ]);
      const applied =
        result &&
        typeof result === "object" &&
        "applied" in result &&
        Array.isArray((result as { applied?: unknown }).applied) &&
        (
          result as {
            applied: Array<{ record?: { id?: string }; recordId?: string }>;
          }
        ).applied.some(
          item => item.record?.id === account.id || item.recordId === account.id
        );
      if (!applied) return setNotice(c.saveFailed);
      setNotice(c.accountShared);
      setName("");
      setPhone("");
      setCity("");
      setOpen(false);
      setPendingAccount(null);
      onSaved?.();
    } catch {
      setNotice(c.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      dir={dir}
      className="rounded-2xl border border-[#dce4e7] bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-[#092d50]">{c.newAccount}</h2>
          <p className="mt-1 text-xs text-[#718088]">{c.description}</p>
        </div>
        <button
          type="button"
          className={packingPrimaryClass}
          disabled={saving}
          onClick={() => {
            setOpen(value => !value);
            setNotice("");
          }}
        >
          {open ? c.cancel : c.newAccount}
        </button>
      </div>
      {notice && (
        <p
          role="status"
          className="mt-3 rounded-xl bg-[#f5f9fa] p-3 text-sm font-bold text-[#2d6380]"
        >
          {notice}
        </p>
      )}
      {open && (
        <form onSubmit={submit}>
          <fieldset
            disabled={saving}
            className="mt-5 grid gap-3 sm:grid-cols-2"
          >
            <label className="text-sm font-bold text-[#23445d]">
              {c.name}
              <input
                required
                maxLength={240}
                value={name}
                onChange={e => setName(e.target.value)}
                className="mt-1 w-full min-h-11 rounded-xl border border-[#dce4e7] px-3 font-normal outline-none focus:border-[#2d6380]"
              />
            </label>
            <label className="text-sm font-bold text-[#23445d]">
              {c.phone}
              <input
                required
                type="tel"
                maxLength={64}
                value={phone}
                onChange={e => setPhone(e.target.value)}
                dir="ltr"
                className="mt-1 w-full min-h-11 rounded-xl border border-[#dce4e7] px-3 font-normal outline-none focus:border-[#2d6380]"
              />
            </label>
            <label className="text-sm font-bold text-[#23445d]">
              {c.office}
              <select
                value={office}
                onChange={e => setOffice(e.target.value as OfficeId)}
                className="mt-1 w-full min-h-11 rounded-xl border border-[#dce4e7] bg-white px-3 font-normal"
              >
                {allowed.map(id => (
                  <option key={id} value={id}>
                    {officeNames[language][id]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-bold text-[#23445d]">
              {c.city}
              <input
                maxLength={160}
                value={city}
                onChange={e => setCity(e.target.value)}
                className="mt-1 w-full min-h-11 rounded-xl border border-[#dce4e7] px-3 font-normal outline-none focus:border-[#2d6380]"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <button disabled={saving} className={packingPrimaryClass}>
                {saving ? c.saving : c.save}
              </button>
              <button
                type="button"
                disabled={saving}
                className={packingSecondaryClass}
                onClick={() => setOpen(false)}
              >
                {c.cancel}
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  );
}
