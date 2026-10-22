import { useState } from "react";
import { Link } from "wouter";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLanguage } from "@/contexts/LanguageContext";
import { accountSecurityCopy } from "@/lib/accountSecurityCopy";
import { trpc } from "@/lib/trpc";
import InitialManagerSetup, { readInitialSetupToken } from "@/components/InitialManagerSetup";

export default function AccountSecurity() {
  const { language, dir } = useLanguage();
  const c = accountSecurityCopy[language];
  const [initialToken] = useState(readInitialSetupToken);
  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const user = me.data;
  const enrollment = Boolean(user?.emailEnrollmentOnly);
  const required = Boolean(user?.mustChangePassword);
  const setup = trpc.auth.configureEmail.useMutation();
  const change = trpc.auth.changePassword.useMutation();
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => { utils.auth.me.setData(undefined, null); window.location.assign("/auth"); } });
  const pending = setup.isPending || change.isPending;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(""); setNotice("");
    if (password !== confirmation) { setError(c.mismatch); return; }
    if (!navigator.onLine) { setError(c.offline); return; }
    try {
      const result = enrollment
        ? await setup.mutateAsync({ password })
        : await change.mutateAsync({ newPassword: password, ...(!required ? { currentPassword } : {}) });
      utils.auth.me.setData(undefined, { ...result.user, emailEnrollmentOnly: false });
      await utils.invalidate();
      setCurrentPassword(""); setPassword(""); setConfirmation(""); setNotice(c.success);
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "";
      setError(message === "account_email_conflict" ? c.conflict : c.error);
    }
  };
  const inputClass = "w-full rounded-xl border border-[#d5e0e4] bg-[#fbfcfa] px-4 py-3 outline-none focus:border-[#092d50]";
  if (initialToken) return <InitialManagerSetup token={initialToken} />;
  return <main dir={dir} className="min-h-screen bg-[#f7f8f5] px-4 py-8 text-[#102f46]">
    <section className="mx-auto max-w-xl rounded-2xl border border-[#dce4e7] bg-white p-6 shadow-sm sm:p-8">
      <header className="mb-6 flex items-center justify-between gap-4"><Link href="/" className="font-bold">مؤسسة الرفكة للشحن</Link><LanguageSwitcher /></header>
      <h1 className="text-2xl font-black">{enrollment ? c.setup : c.title}</h1>
      {me.isLoading ? <p className="mt-4">{c.loading}</p> : !user ? <div className="mt-4 space-y-4"><p>{c.required}</p><Link href="/auth" className="font-bold underline">{c.login}</Link></div> : <>
        <p className="mt-3 text-sm leading-7 text-[#647986]">{enrollment ? c.setupHint : required ? c.temporary : c.emailLogin}</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block"><span className="mb-2 block text-sm font-bold">{c.email}</span><input type="email" value={user.email ?? ""} readOnly className={inputClass} dir="ltr" /></label>
          {!enrollment && !required && <label className="block"><span className="mb-2 block text-sm font-bold">{c.current}</span><input type="password" required minLength={8} maxLength={128} value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} autoComplete="current-password" className={inputClass} dir="ltr" /></label>}
          <label className="block"><span className="mb-2 block text-sm font-bold">{c.next}</span><input type="password" required minLength={8} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" className={inputClass} dir="ltr" /></label>
          <label className="block"><span className="mb-2 block text-sm font-bold">{c.confirm}</span><input type="password" required minLength={8} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="new-password" className={inputClass} dir="ltr" /></label>
          <p className="text-xs text-[#647986]">{c.length}</p>
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
          <button type="submit" disabled={pending || !user.email} className="w-full rounded-xl bg-[#092d50] px-4 py-3 font-bold text-white disabled:opacity-50">{pending ? c.saving : c.save}</button>
        </form>
        {!enrollment && !required && <Link href={user.accountType === "customer" ? "/" : "/operations"} className="mt-5 block text-center font-bold underline">{user.accountType === "customer" ? c.home : c.back}</Link>}
        <button type="button" onClick={() => logout.mutate()} disabled={logout.isPending} className="mt-4 w-full text-center text-sm underline">{c.logout}</button>
      </>}
      <p className="mt-6 rounded-xl bg-slate-50 p-3 text-xs leading-6 text-[#647986]">{c.recoveryHint}</p>
    </section>
  </main>;
}
