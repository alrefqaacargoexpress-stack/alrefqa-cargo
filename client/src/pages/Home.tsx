import PublicWalletMethods from "@/components/offices/PublicWalletMethods";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Globe2,
  Mail,
  Menu,
  Package,
  Phone,
  ShieldCheck,
  X,
} from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLanguage } from "@/contexts/LanguageContext";
import { publicCopy } from "@/lib/publicCopy";
import { buildShipmentInquiryMessage } from "@/lib/shipmentInquiry";
import PublicOfficeCards from "@/components/offices/PublicOfficeCards";
import { trpc } from "@/lib/trpc";
import {
  branchDashboardCopy,
  cachePublicProfiles,
  readCachedPublicProfiles,
  weekdayLabel,
} from "@/lib/branchDashboardCopy";

const logo = "/icons/logo.webp";
const mainWhatsapp = "+22233331818";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function whatsappHref(message: string, number = mainWhatsapp) {
  return `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  const iosStandalone = Boolean(
    (navigator as Navigator & { standalone?: boolean }).standalone
  );
  return (
    window.matchMedia("(display-mode: standalone)").matches || iosStandalone
  );
}

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export default function Home() {
  const { language, dir } = useLanguage();
  const copy = publicCopy[language];
  const [menuOpen, setMenuOpen] = useState(false);
  const [inquiryName, setInquiryName] = useState("");
  const [inquiryPhone, setInquiryPhone] = useState("");
  const [inquiryError, setInquiryError] = useState(false);
  const [inquiryPrepared, setInquiryPrepared] = useState(false);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [installMessage, setInstallMessage] = useState("");
  const publicOffices = trpc.branches.public.useQuery();
  const [cachedProfiles, setCachedProfiles] = useState(
    readCachedPublicProfiles
  );
  useEffect(() => {
    if (publicOffices.data?.length) {
      cachePublicProfiles(publicOffices.data);
      setCachedProfiles(readCachedPublicProfiles());
    }
  }, [publicOffices.data]);
  const officeProfiles = publicOffices.data ?? cachedProfiles;
  const nouakchottProfile = officeProfiles.find(
    profile => profile.officeId === "nouakchott"
  );

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setInstallMessage(copy.install.installed);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [copy.install.installed]);

  const handleInstall = async () => {
    if (installed) return;
    if (!installPrompt) {
      setInstallMessage(isIos() ? copy.install.ios : copy.install.unavailable);
      return;
    }
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (result.outcome === "accepted") {
      setInstalled(true);
      setInstallMessage(copy.install.installed);
    } else {
      setInstallMessage(copy.install.dismissed);
    }
  };

  const inquiryMessage = buildShipmentInquiryMessage(
    copy.tracking,
    inquiryName,
    inquiryPhone
  );
  const submitInquiry = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inquiryName.trim() || !inquiryPhone.trim()) {
      setInquiryError(true);
      setInquiryPrepared(false);
      return;
    }
    setInquiryError(false);
    const href = whatsappHref(inquiryMessage);
    window.open(href, "_blank", "noopener,noreferrer");
    setInquiryPrepared(true);
  };

  const Arrow = dir === "rtl" ? ArrowLeft : ArrowRight;

  return (
    <div
      dir={dir}
      className="min-h-screen overflow-x-hidden bg-[#f7f8f5] text-[#112c43]"
    >
      <div className="bg-[#092d50] px-5 py-2.5 text-center text-xs text-white/80">
        <span className="inline-flex items-center gap-2">
          <ShieldCheck size={14} className="shrink-0 text-[#e4b556]" />
          {copy.topNotice}
        </span>
      </div>
      <header className="sticky top-0 z-40 border-b border-[#dce4e7] bg-[#f7f8f5]/95 backdrop-blur-lg">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-4 lg:px-8">
          <a
            href="#top"
            className="flex shrink-0 items-center gap-3"
            aria-label={copy.logoAlt}
          >
            <img
              src={logo}
              alt={copy.logoAlt}
              className="h-11 w-11 rounded-xl object-cover shadow-sm"
            />
            <div className="leading-tight">
              <div className="font-bold text-[#092d50]">
                {language === "ar"
                  ? "مؤسسة الرفكة للشحن"
                  : language === "en"
                    ? "Al-Rafqaa Shipping"
                    : language === "zh"
                      ? "Al-Rafqaa 运输"
                      : "Al-Rafqaa Kargo"}
              </div>
              <div className="text-[11px] tracking-[0.14em] text-[#7b8991]">
                {copy.brandTagline}
              </div>
            </div>
          </a>
          <nav
            className="hidden items-center gap-6 text-sm font-medium text-[#52636e] md:flex"
            aria-label={copy.a11y.mainNavigation}
          >
            <a href="/track" className="transition hover:text-[#092d50]">
              {copy.nav.tracking}
            </a>
            <details className="relative group">
              <summary className="flex cursor-pointer list-none items-center gap-1 transition hover:text-[#092d50]">
                {copy.nav.offices}
                <ChevronDown size={15} />
              </summary>
              <div className="absolute start-0 top-8 min-w-52 rounded-2xl border border-[#dce4e7] bg-white p-2 shadow-xl">
                <a
                  href="#offices"
                  className="block rounded-xl px-3 py-2 text-start hover:bg-[#f1f5f2]"
                >
                  {copy.offices.title}
                </a>
                <a
                  href={whatsappHref(copy.offices.requestAddress)}
                  className="block rounded-xl px-3 py-2 text-start hover:bg-[#f1f5f2]"
                >
                  {copy.offices.requestAddress}
                </a>
              </div>
            </details>
            <a href="#contact" className="transition hover:text-[#092d50]">
              {copy.nav.contact}
            </a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageSwitcher />
            <Link
              href="/operations"
              className="hidden rounded-full bg-[#092d50] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#123f68] sm:inline-flex"
            >
              {copy.nav.operations}
              <Arrow size={15} className="ms-2" />
            </Link>
            <button
              onClick={() => setMenuOpen(value => !value)}
              className="rounded-xl border border-[#d9e1e3] p-2.5 text-[#092d50] md:hidden"
              aria-label={menuOpen ? copy.a11y.closeMenu : copy.a11y.openMenu}
              aria-expanded={menuOpen}
            >
              <span className="sr-only">
                {menuOpen ? copy.a11y.closeMenu : copy.a11y.openMenu}
              </span>
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="border-t border-[#dce4e7] bg-[#f7f8f5] px-5 py-4 md:hidden">
            <div className="flex flex-col gap-3 text-sm font-medium">
              <a href="/track" onClick={() => setMenuOpen(false)}>
                {copy.nav.tracking}
              </a>
              <details>
                <summary className="flex cursor-pointer list-none items-center justify-between py-1">
                  {copy.nav.offices}
                  <ChevronDown size={15} />
                </summary>
                <div className="mt-2 flex flex-col gap-3 border-s-2 border-[#d9a441] ps-3">
                  <a href="#offices" onClick={() => setMenuOpen(false)}>
                    {copy.offices.title}
                  </a>
                  <a href={whatsappHref(copy.offices.requestAddress)}>
                    {copy.offices.requestAddress}
                  </a>
                </div>
              </details>
              <a href="#contact" onClick={() => setMenuOpen(false)}>
                {copy.nav.contact}
              </a>
              <Link href="/operations" onClick={() => setMenuOpen(false)}>
                {copy.nav.operations}
              </Link>
            </div>
          </div>
        )}
      </header>

      <main id="top">
        <section className="relative overflow-hidden bg-[#092d50]">
          <div className="relative">
            <img
              src="/images/alrefqa-camel-caravan.webp"
              alt={copy.hero.imageAlt}
              className="block h-auto w-full"
            />
            <div
              style={{ direction: "ltr" }}
              className={`absolute inset-0 hidden items-center lg:flex ${
                dir === "rtl" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`absolute inset-y-0 w-full max-w-2xl ${
                  dir === "rtl"
                    ? "right-0 bg-gradient-to-l from-[#092d50]/95 via-[#092d50]/75 to-transparent"
                    : "left-0 bg-gradient-to-r from-[#092d50]/95 via-[#092d50]/75 to-transparent"
                }`}
              />
              <div
                dir={dir}
                className={`relative z-10 w-full max-w-xl px-8 py-16 text-white xl:px-16 ${
                  dir === "rtl" ? "text-right" : "text-left"
                }`}
              >
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-[#092d50]/55 px-3.5 py-2 text-xs font-semibold text-white/85">
                  <span className="h-2 w-2 rounded-full bg-[#e0af4e]" />
                  {copy.hero.eyebrow}
                </div>
                <h1 className="text-5xl font-bold leading-[1.13] tracking-tight sm:text-6xl">
                  {copy.hero.title}
                  <br />
                  <span className="text-[#e0af4e]">
                    {copy.hero.titleAccent}
                  </span>
                </h1>
                <p className="mt-6 max-w-xl text-lg leading-8 text-white/85">
                  {copy.hero.description}
                </p>
                <p className="mt-4 max-w-xl text-base font-semibold leading-7 text-white/95">
                  {copy.hero.storyLine}
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <a
                    href="#offices"
                    className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#e0af4e] px-5 py-3.5 text-base font-bold text-[#092d50] transition hover:bg-[#f0c76f]"
                  >
                    {copy.hero.servicesCta}
                    <Arrow size={17} />
                  </a>
                  <a
                    href="/track"
                    className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/45 bg-[#092d50]/55 px-5 py-3.5 text-base font-bold text-white transition hover:border-white"
                  >
                    {copy.hero.trackingCta}
                    <Package size={17} />
                  </a>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-[#092d50] px-5 py-10 text-white lg:hidden">
            <div className="mx-auto max-w-2xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-semibold text-white/85">
                <span className="h-2 w-2 rounded-full bg-[#e0af4e]" />
                {copy.hero.eyebrow}
              </div>
              <h1 className="text-4xl font-bold leading-[1.15] tracking-tight sm:text-5xl">
                {copy.hero.title}
                <br />
                <span className="text-[#e0af4e]">{copy.hero.titleAccent}</span>
              </h1>
              <p className="mt-5 text-lg leading-8 text-white/85">
                {copy.hero.description}
              </p>
              <p className="mt-4 text-base font-semibold leading-7 text-white/95">
                {copy.hero.storyLine}
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <a
                  href="#offices"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#e0af4e] px-5 py-3.5 text-base font-bold text-[#092d50] transition hover:bg-[#f0c76f]"
                >
                  {copy.hero.servicesCta}
                  <Arrow size={17} />
                </a>
                <a
                  href="/track"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/45 bg-white/10 px-5 py-3.5 text-base font-bold text-white transition hover:border-white"
                >
                  {copy.hero.trackingCta}
                  <Package size={17} />
                </a>
              </div>
            </div>
          </div>
        </section>

        <section id="tracking" className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
          <div className="grid gap-8 rounded-[2rem] bg-[#e8eff1] p-7 md:p-10 lg:grid-cols-[.85fr_1.15fr] lg:items-center">
            <div>
              <h2 className="text-xl font-bold leading-relaxed text-[#092d50] sm:text-2xl">
                {copy.tracking.title}
              </h2>
              <ol className="mt-4 list-decimal space-y-3 ps-5 leading-7 text-[#62737d]">
                {copy.tracking.instructions.map(instruction => (
                  <li key={instruction}>{instruction}</li>
                ))}
              </ol>
            </div>
            <div className="rounded-3xl bg-white p-5 shadow-sm md:p-7">
              <form onSubmit={submitInquiry} className="space-y-4">
                <div>
                  <label
                    htmlFor="inquiry-name"
                    className="mb-2 block text-sm font-bold text-[#092d50]"
                  >
                    {copy.tracking.nameLabel}
                  </label>
                  <div className="relative">
                    <Package
                      className="absolute end-4 top-1/2 -translate-y-1/2 text-[#91a1a8]"
                      size={19}
                    />
                    <input
                      id="inquiry-name"
                      type="text"
                      required
                      maxLength={200}
                      autoComplete="off"
                      value={inquiryName}
                      onChange={event => {
                        setInquiryName(event.target.value);
                        setInquiryError(false);
                        setInquiryPrepared(false);
                      }}
                      placeholder={copy.tracking.namePlaceholder}
                      className="h-14 w-full rounded-2xl border border-[#d8e1e4] bg-[#fbfcfb] pe-12 ps-4 text-sm outline-none transition placeholder:text-[#9aa8ad] focus:border-[#2d6380] focus:ring-4 focus:ring-[#2d6380]/10"
                    />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="inquiry-phone"
                    className="mb-2 block text-sm font-bold text-[#092d50]"
                  >
                    {copy.tracking.phoneLabel}
                  </label>
                  <input
                    id="inquiry-phone"
                    type="tel"
                    dir="ltr"
                    required
                    maxLength={64}
                    autoComplete="off"
                    value={inquiryPhone}
                    onChange={event => {
                      setInquiryPhone(event.target.value);
                      setInquiryError(false);
                      setInquiryPrepared(false);
                    }}
                    placeholder={copy.tracking.phonePlaceholder}
                    className="h-14 w-full rounded-2xl border border-[#d8e1e4] bg-[#fbfcfb] px-4 text-sm outline-none transition placeholder:text-[#9aa8ad] focus:border-[#2d6380] focus:ring-4 focus:ring-[#2d6380]/10"
                  />
                </div>
                <button
                  type="submit"
                  className="h-14 w-full rounded-2xl bg-[#092d50] px-6 font-bold text-white transition hover:bg-[#123f68]"
                >
                  {copy.tracking.button}
                </button>
              </form>
              {inquiryError && (
                <p
                  role="alert"
                  className="mt-3 text-sm font-semibold text-[#a34747]"
                >
                  {copy.tracking.required}
                </p>
              )}
              {inquiryPrepared && (
                <p
                  role="status"
                  className="mt-3 text-sm font-semibold text-[#2b7656]"
                >
                  {copy.tracking.opened}
                  <a
                    href={whatsappHref(inquiryMessage)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ms-2 underline"
                  >
                    {copy.tracking.button}
                  </a>
                </p>
              )}
            </div>
          </div>
        </section>

        <section
          id="about"
          className="bg-[#092d50] px-5 py-20 text-white lg:px-8"
        >
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1fr_.9fr] lg:items-center">
            <div>
              <div className="mb-3 text-xs font-bold tracking-[0.18em] text-[#e2b557]">
                {copy.about.eyebrow}
              </div>
              <h2 className="max-w-xl text-3xl font-bold leading-tight sm:text-4xl">
                {copy.about.title}
              </h2>
              <p className="mt-5 max-w-xl leading-8 text-white/65">
                {copy.about.description}
              </p>
              <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-7 text-white/70">
                {copy.about.routeNote}
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div className="font-bold">{copy.about.routeTitle}</div>
                <Globe2 size={20} className="text-[#e2b557]" />
              </div>
              {copy.about.routes.map((route, index) => (
                <div
                  key={route}
                  className="flex items-center gap-4 border-t border-white/10 py-4"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e2b557]/15 text-sm font-bold text-[#e2b557]">
                    0{index + 1}
                  </span>
                  <span className="font-semibold">{route}</span>
                  <Arrow size={16} className="ms-auto text-white/35" />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="offices" className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
          <div className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <div className="mb-3 text-xs font-bold tracking-[0.18em] text-[#b17b1f]">
                {copy.offices.eyebrow}
              </div>
              <h2 className="text-3xl font-bold text-[#092d50] sm:text-4xl">
                {copy.offices.title}
              </h2>
            </div>
            <p className="max-w-xl leading-7 text-[#6e7c82]">
              {copy.offices.description}
            </p>
          </div>
          <PublicOfficeCards
            profiles={officeProfiles}
            loading={publicOffices.isLoading}
            error={Boolean(publicOffices.error)}
          />
          <PublicWalletMethods />
        </section>

        <section id="contact" className="mx-auto max-w-7xl px-5 pb-20 lg:px-8">
          <div className="grid gap-8">
            <div>
              <div className="mb-3 text-xs font-bold tracking-[0.18em] text-[#b17b1f]">
                {copy.contact.eyebrow}
              </div>
              <h2 className="text-3xl font-bold text-[#092d50]">
                {copy.contact.title}
              </h2>
              <p className="mt-4 leading-7 text-[#6e7c82]">
                {copy.contact.description}
              </p>
              <div className="mt-7 flex items-center gap-3 rounded-2xl bg-[#f1f5f2] p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#2d7660]">
                  <Phone size={19} />
                </div>
                <div>
                  <div className="text-xs text-[#81928f]">
                    {copy.contact.urgent}
                  </div>
                  <a
                    href={`https://wa.me/${mainWhatsapp.replace(/\D/g, "")}`}
                    className="font-bold text-[#173e35]"
                    dir="ltr"
                  >
                    {mainWhatsapp}
                  </a>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3 rounded-2xl border border-[#e1e7e8] bg-white p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eef3f0] text-[#2d7660]">
                  <Mail size={19} />
                </div>
                <div>
                  <div className="text-xs text-[#81928f]">
                    {copy.contact.email}
                  </div>
                  <a
                    href={`mailto:${copy.contact.emailValue}`}
                    className="break-all text-sm font-bold text-[#173e35]"
                  >
                    {copy.contact.emailValue}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#dce4e7] bg-white px-5 py-8 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-7">
          <div className="grid gap-5 md:grid-cols-[1fr_auto_auto] md:items-center">
            <div className="flex items-center gap-3">
              <img
                src={logo}
                alt=""
                className="h-8 w-8 rounded-lg object-cover"
              />
              <span className="text-sm text-[#7c898e]">
                {copy.footer.copyright}
              </span>
            </div>
            <div className="text-sm text-[#7c898e]">
              <div className="font-semibold text-[#092d50]">
                {copy.hours.title}
              </div>
              {nouakchottProfile?.hours.length ? (
                <div className="mt-1 space-y-0.5">
                  {[...nouakchottProfile.hours]
                    .sort((a, b) => a.day - b.day)
                    .map(day => (
                      <div key={day.day} className="flex gap-2">
                        <span>{weekdayLabel(day.day, language)}</span>
                        <span dir="ltr">
                          {day.closed || !day.work
                            ? branchDashboardCopy(language).closed
                            : `${day.work.start}–${day.work.end}`}
                        </span>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="mt-1">—</div>
              )}
            </div>
            <div className="flex flex-col items-start gap-2 text-sm">
              <Link href="/operations" className="font-semibold text-[#2e6280]">
                {copy.footer.operations}
              </Link>
              <span className="text-[#7c898e]">{copy.footer.privacy}</span>
            </div>
          </div>
          <div className="flex flex-col gap-3 rounded-2xl bg-[#f1f5f2] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-bold text-[#092d50]">
                {copy.install.title}
              </div>
              <div className="mt-1 text-xs leading-5 text-[#6c7b82]">
                {copy.install.description}
              </div>
            </div>
            <button
              type="button"
              onClick={handleInstall}
              disabled={installed}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#092d50] px-4 text-sm font-bold text-white transition hover:bg-[#123f68] disabled:cursor-default disabled:bg-[#668091]"
            >
              <DownloadIcon />
              {installed ? copy.install.installed : copy.install.button}
            </button>
          </div>
          {installMessage && (
            <p role="status" className="text-sm text-[#5f7078]">
              {installMessage}
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}

function MessageIcon() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#2b7656] text-[9px] font-bold text-white"
    >
      W
    </span>
  );
}

function DownloadIcon() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-4 w-4 items-center justify-center rounded border border-white/50 text-[10px]"
    >
      ↓
    </span>
  );
}
