import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { walletCopyFor } from "@/lib/walletCopy";

export default function PublicWalletMethods() {
  const { language, dir } = useLanguage();
  const copy = walletCopyFor(language);
  const methods = trpc.office.public.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const copyNumber = async (id: string, value: string) => {
    setCopied(null);
    setCopyError(null);
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(value);
      setCopied(id);
    } catch {
      setCopyError(id);
    }
  };
  if (methods.isLoading)
    return (
      <section
        dir={dir}
        className="rounded-2xl border border-[#dce4e7] bg-white p-5"
      >
        <p className="text-sm">{copy.loading}</p>
      </section>
    );
  if (methods.isError) return null;
  const visibleMethods = methods.data?.methods ?? [];
  if (!visibleMethods.length) return null;
  return (
    <section
      dir={dir}
      className="rounded-2xl border border-[#dce4e7] bg-white p-5 shadow-sm"
    >
      <div className="mb-4 border-b border-[#edf1f1] pb-4">
        <h2 className="text-lg font-black text-[#092d50]">{copy.title}</h2>
        <p className="mt-1 text-sm text-[#718088]">{copy.description}</p>
        <p className="mt-2 text-xs font-bold text-[#7b5a1d]">
          {copy.manualOnly}
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {visibleMethods.map(method => (
          <article
            key={method.id}
            className="rounded-xl border border-[#edf1f1] bg-[#fbfcfb] p-4"
          >
            <h3 className="font-black text-[#092d50]">
              {copy.names[method.id] ?? method.label}
            </h3>
            {method.accountNumber && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-3">
                <span
                  dir="ltr"
                  className="font-mono text-base font-bold text-[#092d50]"
                >
                  {method.accountNumber}
                </span>
                <button
                  type="button"
                  className="rounded-lg border border-[#dce4e7] px-3 py-2 text-xs font-bold text-[#2e6280]"
                  onClick={() =>
                    void copyNumber(method.id, method.accountNumber!)
                  }
                  aria-label={`${copy.copy} ${method.label}`}
                >
                  {copied === method.id ? (
                    <Check size={14} className="me-1 inline" />
                  ) : (
                    <Copy size={14} className="me-1 inline" />
                  )}
                  {copied === method.id ? copy.copied : copy.copy}
                </button>
              </div>
            )}
            {copyError === method.id && (
              <p role="alert" className="mt-2 text-xs font-bold text-red-700">
                {copy.copyFailed}
              </p>
            )}
            {method.accountName && (
              <p className="mt-3 text-sm text-[#63737a]">
                <strong>{copy.beneficiary}:</strong> {method.accountName}
              </p>
            )}
            {method.instructions && (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#63737a]">
                {method.instructions}
              </p>
            )}
          </article>
        ))}
      </div>
      <p className="mt-4 text-xs text-[#718088]">{copy.customerNote}</p>
    </section>
  );
}
