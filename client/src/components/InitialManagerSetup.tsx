import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { accountSecurityCopy } from "@/lib/accountSecurityCopy";
import { initialSetupCopy } from "@/lib/initialSetupCopy";

export function readInitialSetupToken(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get("setup");
  if (!token) return null;
  // Fragment never reaches the server and is removed before app navigation.
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return token;
}

export default function InitialManagerSetup({ token }: { token: string }) {
  const { language, dir } = useLanguage();
  const c = accountSecurityCopy[language];
  const setupCopy = initialSetupCopy[language];
  const info = trpc.auth.initialSetupInfo.useMutation();
  const complete = trpc.auth.completeInitialSetup.useMutation();
  const utils = trpc.useUtils();
  const started = useRef(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    info.mutate({ token });
  }, [token, info.mutate]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError("");
    if (!navigator.onLine) { setError(c.offline); return; }
    if (password !== confirm) { setError(c.mismatch); return; }
    try {
      const result = await complete.mutateAsync({ token, password });
      utils.auth.me.setData(undefined, { ...result.user, emailEnrollmentOnly: false });
      setPassword(""); setConfirm(""); setDone(true);
      void utils.invalidate();
    } catch (failure) {
      setError(failure instanceof Error && failure.message === "initial_setup_unavailable" ? setupCopy.expired : c.error);
    }
  };
  const fieldClass = "w-full rounded-xl border border-[#d5e0e4] bg-[#fbfcfa] px-4 py-3 outline-none focus:border-[#092d50]";
  return <main dir={dir} className="min-h-screen bg-[#f7f8f5] px-4 py-8 text-[#102f46]">
    <section className="mx-auto max-w-xl rounded-2xl border border-[#dce4e7] bg-white p-6 shadow-sm sm:p-8">
      <header className="mb-6 flex items-center justify-between gap-4"><span className="font-bold">مؤسسة الرفكة للشحن</span><LanguageSwitcher /></header>
      <h1 className="text-2xl font-black">{setupCopy.title}</h1>
      <p className="mt-3 text-sm leading-7 text-[#647986]">{setupCopy.hint}</p>
      {done ? <div className="mt-6 space-y-4"><p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{setupCopy.done}</p><Link href="/operations" className="block rounded-xl bg-[#092d50] p-3 text-center font-bold text-white">{c.back}</Link></div>
        : info.isError ? <p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-800">{setupCopy.expired}</p>
        : !info.data ? <p className="mt-6">{c.loading}</p>
        : <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block"><span className="mb-2 block text-sm font-bold">{c.email}</span><input readOnly type="email" value={info.data.email} className={fieldClass} dir="ltr" /></label>
          <label className="block"><span className="mb-2 block text-sm font-bold">{c.next}</span><input required minLength={8} maxLength={128} type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" className={fieldClass} dir="ltr" /></label>
          <label className="block"><span className="mb-2 block text-sm font-bold">{c.confirm}</span><input required minLength={8} maxLength={128} type="password" value={confirm} onChange={event => setConfirm(event.target.value)} autoComplete="new-password" className={fieldClass} dir="ltr" /></label>
          <p className="text-xs leading-6 text-[#647986]">{setupCopy.expires}: {new Date(info.data.expiresAt).toLocaleString(language)}</p>
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          <button type="submit" disabled={complete.isPending} className="w-full rounded-xl bg-[#092d50] p-3 font-bold text-white disabled:opacity-50">{complete.isPending ? c.saving : c.save}</button>
        </form>}
      <p className="mt-6 rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-950">{setupCopy.private}</p>
    </section>
  </main>;
}
