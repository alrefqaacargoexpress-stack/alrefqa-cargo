import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import PublicTrackingForm from "@/components/publicTracking/PublicTrackingForm";
import PublicTrackingResult from "@/components/publicTracking/PublicTrackingResult";
import { useLanguage } from "@/contexts/LanguageContext";
import { publicTrackingCopy } from "@/lib/publicTrackingCopy";
import { trpc } from "@/lib/trpc";
import type { PublicTrackingResult as PublicTrackingResponse } from "@shared/publicTracking";

function isRateLimited(error: unknown) {
  const candidate = error as {
    data?: { code?: string; httpStatus?: number };
    message?: string;
  } | null;
  return (
    candidate?.data?.code === "TOO_MANY_REQUESTS" ||
    candidate?.data?.httpStatus === 429 ||
    /429|too.?many|rate.?limit|cooldown/i.test(candidate?.message ?? "")
  );
}

function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export default function PublicTracking() {
  const { language, dir } = useLanguage();
  const copy = publicTrackingCopy[language];
  const [tracking, setTracking] = useState("");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<PublicTrackingResponse | null>(null);
  const [errorKind, setErrorKind] = useState<
    "required" | "notFound" | "offline" | "cooldown" | "generic" | null
  >(null);
  const requestToken = useRef(0);
  const mounted = useRef(true);
  const lookup = trpc.publicTracking.lookup.useMutation({
    gcTime: 0,
    retry: false,
  });
  const Arrow = dir === "rtl" ? ArrowRight : ArrowLeft;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestToken.current += 1;
    };
  }, []);

  const clearResult = () => {
    requestToken.current += 1;
    if (mounted.current) {
      setResult(null);
      setErrorKind(null);
    }
    lookup.reset();
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanTracking = tracking.trim();
    const cleanPhone = phone.trim();
    if (!cleanTracking || !cleanPhone) {
      setResult(null);
      setErrorKind("required");
      return;
    }

    const token = ++requestToken.current;
    setResult(null);
    setErrorKind(null);
    if (isOffline()) {
      setErrorKind("offline");
      return;
    }
    try {
      const response = await lookup.mutateAsync({
        tracking: cleanTracking,
        phone: cleanPhone,
      });
      if (!mounted.current || token !== requestToken.current) return;
      if (response.found) {
        setResult(response);
        setErrorKind(null);
      } else {
        setResult(null);
        setErrorKind("notFound");
      }
    } catch (error) {
      if (!mounted.current || token !== requestToken.current) return;
      setResult(null);
      setErrorKind(
        isRateLimited(error) ? "cooldown" : isOffline() ? "offline" : "generic"
      );
    } finally {
      if (mounted.current && token === requestToken.current) lookup.reset();
    }
  };

  const onTrackingChange = (value: string) => {
    setTracking(value);
    clearResult();
  };
  const onPhoneChange = (value: string) => {
    setPhone(value);
    clearResult();
  };
  const errorMessage =
    errorKind === "required"
      ? copy.required
      : errorKind === "notFound"
        ? copy.notFound
        : errorKind === "offline"
          ? copy.offlineError
          : errorKind === "cooldown"
            ? copy.cooldownError
            : errorKind === "generic"
              ? copy.genericError
              : null;

  return (
    <div dir={dir} className="min-h-screen bg-[#f4f8f7] text-[#112c43]">
      <div className="bg-[#092d50] px-5 py-2.5 text-center text-xs text-white/80">
        <span className="inline-flex items-center gap-2">
          <ShieldCheck
            size={14}
            className="shrink-0 text-[#d9a441]"
            aria-hidden="true"
          />
          {copy.subtitle}
        </span>
      </div>
      <header className="border-b border-[#dce7e5] bg-[#f8fbfa]/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <Link
            href="/"
            className="flex min-w-0 items-center gap-3 text-[#092d50]"
          >
            <img
              src="/icons/logo.webp"
              alt=""
              className="h-11 w-11 shrink-0 rounded-xl object-contain"
            />
            <span className="truncate text-sm font-bold sm:text-base">
              {copy.brand}
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link
              href="/"
              className="hidden items-center gap-1 text-sm font-semibold text-[#267b7b] sm:inline-flex"
            >
              <Arrow size={16} aria-hidden="true" />
              {copy.backHome}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10 sm:py-14 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-3xl">
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#bcd8d5] bg-white px-3.5 py-2 text-xs font-bold text-[#267b7b]">
              <CheckCircle2 size={15} aria-hidden="true" />
              {copy.status}
            </div>
            <h1 className="text-4xl font-black leading-tight tracking-tight text-[#092d50] sm:text-5xl">
              {copy.title}
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-[#5e7479] sm:text-lg">
              {copy.subtitle}
            </p>
          </div>

          <div className="rounded-[2rem] border border-[#d9e5e4] bg-white p-5 shadow-[0_20px_55px_rgba(9,45,80,0.08)] sm:p-8">
            <PublicTrackingForm
              copy={copy}
              tracking={tracking}
              phone={phone}
              loading={lookup.isPending}
              onTrackingChange={onTrackingChange}
              onPhoneChange={onPhoneChange}
              onSubmit={submit}
            />
            {errorMessage && (
              <p
                role="alert"
                className="mt-4 rounded-2xl bg-[#fff3ee] px-4 py-3 text-sm font-semibold leading-6 text-[#a34747]"
              >
                {errorMessage}
              </p>
            )}
          </div>

          {result?.found && (
            <div className="mt-8">
              <PublicTrackingResult
                copy={copy}
                language={language}
                shipment={result.shipment}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
