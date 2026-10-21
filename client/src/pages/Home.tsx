import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  ArrowUpLeft,
  Check,
  ChevronLeft,
  Clock3,
  Copy,
  Globe2,
  MapPin,
  Menu,
  Package,
  Phone,
  Plane,
  Search,
  Ship,
  ShieldCheck,
  Truck,
  X,
  Zap,
} from "lucide-react";

const logo = "https://www.alrefqaacargo.space/manus-storage/alrafkah-logo-final_cabb0750.webp";

const services = [
  { icon: Truck, eyebrow: "الاختيار اليومي", title: "الشحن العادي", text: "نقل آمن وموثوق للبضائع والطرود مع متابعة واضحة لكل مرحلة.", tone: "blue" },
  { icon: Zap, eyebrow: "للطلبات العاجلة", title: "الشحن السريع", text: "مسارات جوية أسرع من الإمارات وتركيا إلى موريتانيا حسب الجدول المتاح.", tone: "gold" },
  { icon: Ship, eyebrow: "للبضائع الكبيرة", title: "الشحن البحري", text: "خيار اقتصادي للشحنات الكبيرة من مكاتبنا ونقاط الاستلام إلى موريتانيا.", tone: "sand" },
];

const offices = [
  { name: "نواكشوط", label: "المكتب الرئيسي", phone: "+222 333 31818", color: "bg-[#e7f0f5]" },
  { name: "دبي", label: "مركز التجميع", phone: "+971 422 20199", color: "bg-[#f8eed6]" },
  { name: "إسطنبول", label: "نقطة الاستلام", phone: "تواصل مع الفريق", color: "bg-[#e9efe6]" },
];

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [tracking, setTracking] = useState("");
  const [tracked, setTracked] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const trackingResult = useMemo(() => tracked ? { code: tracked, status: "في الطريق", location: "مركز الفرز — دبي", eta: "24 أكتوبر 2026" } : null, [tracked]);

  const copy = async (value: string, key: string) => {
    try { await navigator.clipboard.writeText(value); } catch { /* clipboard may be blocked offline */ }
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1600);
  };

  const submitTracking = (event: React.FormEvent) => {
    event.preventDefault();
    const value = tracking.trim().toUpperCase() || "RQ-2026-1842";
    setTracked(value);
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f7f8f5] text-[#112c43]">
      <div className="bg-[#092d50] px-5 py-2.5 text-center text-xs text-white/80">
        <span className="inline-flex items-center gap-2"><ShieldCheck size={14} className="text-[#e4b556]" /> هذه نسخة مستقلة — بياناتها منفصلة عن الموقع الأصلي ولا تُنقل تلقائيًا</span>
      </div>
      <header className="sticky top-0 z-40 border-b border-[#dce4e7] bg-[#f7f8f5]/95 backdrop-blur-lg">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <a href="#top" className="flex items-center gap-3" aria-label="الرفكة">
            <img src={logo} alt="شعار مؤسسة الرفكة" className="h-11 w-11 rounded-xl object-cover shadow-sm" />
            <div className="leading-tight"><div className="font-bold text-[#092d50]">مؤسسة الرفكة</div><div className="text-[11px] tracking-[0.14em] text-[#7b8991]">للشحن والنقل</div></div>
          </a>
          <nav className="hidden items-center gap-7 text-sm font-medium text-[#52636e] md:flex">
            <a href="#services" className="transition hover:text-[#092d50]">الخدمات</a>
            <a href="#about" className="transition hover:text-[#092d50]">عن الرفكة</a>
            <a href="#tracking" className="transition hover:text-[#092d50]">التتبع</a>
            <a href="#contact" className="transition hover:text-[#092d50]">اتصل بنا</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/operations" className="hidden rounded-full bg-[#092d50] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#123f68] sm:inline-flex">مركز العمليات <ArrowUpLeft size={15} className="mr-2" /></Link>
            <button onClick={() => setMenuOpen(!menuOpen)} className="rounded-xl border border-[#d9e1e3] p-2.5 text-[#092d50] md:hidden" aria-label="فتح القائمة">{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
          </div>
        </div>
        {menuOpen && <div className="border-t border-[#dce4e7] bg-[#f7f8f5] px-5 py-4 md:hidden"><div className="flex flex-col gap-4 text-sm font-medium"><a href="#services" onClick={() => setMenuOpen(false)}>الخدمات</a><a href="#about" onClick={() => setMenuOpen(false)}>عن الرفكة</a><a href="#tracking" onClick={() => setMenuOpen(false)}>تتبع شحنتك</a><Link href="/operations" onClick={() => setMenuOpen(false)}>مركز العمليات</Link></div></div>}
      </header>

      <main id="top">
        <section className="relative mx-auto grid max-w-7xl gap-12 px-5 pb-20 pt-16 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:px-8 lg:pb-28 lg:pt-24">
          <div className="pointer-events-none absolute -left-36 top-10 h-96 w-96 rounded-full bg-[#e3eef2] blur-3xl" />
          <div className="relative z-10">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#cfdde3] bg-white/70 px-3.5 py-2 text-xs font-semibold text-[#315c76]"><span className="h-2 w-2 rounded-full bg-[#d9a441]" /> من الصحراء إلى باب منزلك</div>
            <h1 className="max-w-2xl text-5xl font-bold leading-[1.13] tracking-tight text-[#092d50] sm:text-6xl">نقل آمن،<br /><span className="text-[#c28d2b]">وصول مضمون.</span></h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-[#5b6a73]">نجمع بين الخبرة المحلية والربط العالمي لنقدم لك تجربة شحن واضحة، مرنة، ويمكن الاعتماد عليها — من أول استلام إلى آخر تسليم.</p>
            <div className="mt-9 flex flex-wrap gap-3"><a href="#services" className="inline-flex items-center gap-2 rounded-full bg-[#092d50] px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#092d50]/15 transition hover:-translate-y-0.5 hover:bg-[#123f68]">استكشف الخدمات <ArrowLeft size={17} /></a><a href="#tracking" className="inline-flex items-center gap-2 rounded-full border border-[#c6d4da] bg-white px-5 py-3.5 text-sm font-bold text-[#092d50] transition hover:border-[#092d50]">تتبع شحنتك <Search size={17} /></a></div>
            <div className="mt-10 flex flex-wrap items-center gap-7 text-sm text-[#65747b]"><div className="flex items-center gap-2"><Check size={17} className="text-[#2b7b63]" /> شحن موثوق</div><div className="flex items-center gap-2"><Check size={17} className="text-[#2b7b63]" /> متابعة واضحة</div><div className="flex items-center gap-2"><Check size={17} className="text-[#2b7b63]" /> مسارات متعددة</div></div>
          </div>
          <div className="relative min-h-[420px] lg:min-h-[520px]">
            <div className="absolute inset-5 rounded-[2.25rem] bg-[#092d50] shadow-2xl shadow-[#092d50]/20" />
            <div className="route-line absolute right-0 top-16 h-52 w-52 rounded-full border border-[#d9a441]/50" />
            <div className="route-line absolute left-3 top-28 h-72 w-72 rounded-full border border-white/20" />
            <div className="absolute inset-x-12 top-12 bottom-12 flex flex-col justify-between overflow-hidden rounded-[1.75rem] border border-white/15 bg-gradient-to-br from-[#153f61] via-[#0d3557] to-[#071f38] p-7 text-white">
              <div className="flex items-center justify-between"><span className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/70">AL-RAFQAH / ROUTE 01</span><Globe2 size={22} className="text-[#e0af4e]" /></div>
              <div><div className="mb-5 text-sm text-white/60">الرحلة الحالية</div><div className="flex items-end justify-between gap-4"><div><div className="text-4xl font-bold tracking-tight">دبي</div><div className="mt-1 text-sm text-white/60">مركز التجميع</div></div><div className="mb-2 flex-1"><div className="relative h-px bg-white/25"><span className="absolute -top-1.5 right-0 h-3 w-3 rounded-full bg-[#d9a441] shadow-[0_0_0_5px_rgba(217,164,65,.2)]" /><span className="absolute -top-1.5 left-0 h-3 w-3 rounded-full bg-white/60" /></div><div className="mt-3 text-center text-xs text-white/50">جوي · 06:30</div></div><div className="text-left"><div className="text-4xl font-bold tracking-tight">نواكشوط</div><div className="mt-1 text-sm text-white/60">الوصول المتوقع</div></div></div></div>
              <div className="grid grid-cols-3 gap-3 border-t border-white/10 pt-5 text-xs"><div><div className="text-white/50">رقم الرحلة</div><div className="mt-1 font-semibold">RQ-2026-1842</div></div><div><div className="text-white/50">الحالة</div><div className="mt-1 flex items-center gap-1.5 font-semibold text-[#e6c16d]"><span className="h-1.5 w-1.5 rounded-full bg-[#e6c16d]" /> في الطريق</div></div><div><div className="text-white/50">التحديث</div><div className="mt-1 font-semibold">منذ 12 دقيقة</div></div></div>
            </div>
            <div className="absolute -bottom-1 -left-1 flex items-center gap-3 rounded-2xl border border-[#e0e7e8] bg-white p-4 shadow-xl"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#e8f3ee] text-[#2b7b63]"><ShieldCheck size={22} /></div><div><div className="text-xs text-[#7a878c]">شبكة موثوقة</div><div className="mt-0.5 font-bold text-[#092d50]">متابعة في كل خطوة</div></div></div>
            <div className="absolute -right-1 top-24 flex items-center gap-3 rounded-2xl border border-[#e0e7e8] bg-white p-3.5 shadow-xl"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fbf1d9] text-[#ba8223]"><Plane size={20} /></div><div><div className="text-[11px] text-[#7a878c]">مساراتنا</div><div className="font-bold text-[#092d50]">الصين · دبي · تركيا</div></div></div>
          </div>
        </section>

        <section id="services" className="border-y border-[#e1e7e8] bg-white px-5 py-20 lg:px-8"><div className="mx-auto max-w-7xl"><div className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><div className="mb-3 text-xs font-bold tracking-[0.18em] text-[#b17b1f]">خدماتنا المتميزة</div><h2 className="text-3xl font-bold text-[#092d50] sm:text-4xl">الخيار المناسب لكل رحلة.</h2></div><p className="max-w-md leading-7 text-[#718088]">نصمم خياراتنا لتناسب طبيعة بضاعتك وموعدك وميزانيتك، مع فريق يتابع التفاصيل معك.</p></div><div className="grid gap-4 md:grid-cols-3">{services.map(service => <article key={service.title} className="group rounded-3xl border border-[#e2e8e9] bg-[#fbfcfb] p-6 transition hover:-translate-y-1 hover:border-[#b9cbd3] hover:shadow-lg"><div className={`mb-10 flex h-12 w-12 items-center justify-center rounded-2xl ${service.tone === "gold" ? "bg-[#fbf0d5] text-[#b27b1f]" : service.tone === "sand" ? "bg-[#edf1e9] text-[#58735e]" : "bg-[#e7f0f5] text-[#2e6280]"}`}><service.icon size={23} /></div><div className="text-xs font-bold text-[#9aabb1]">{service.eyebrow}</div><h3 className="mt-2 text-xl font-bold text-[#092d50]">{service.title}</h3><p className="mt-3 leading-7 text-[#6c7b82]">{service.text}</p><a href="#contact" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#2e6280]">اطلب التفاصيل <ChevronLeft size={16} /></a></article>)}</div></div></section>

        <section id="tracking" className="mx-auto max-w-7xl px-5 py-20 lg:px-8"><div className="grid gap-8 rounded-[2rem] bg-[#e8eff1] p-7 md:p-10 lg:grid-cols-[.85fr_1.15fr] lg:items-center"><div><div className="mb-3 text-xs font-bold tracking-[0.18em] text-[#b17b1f]">تتبع شحنتك</div><h2 className="text-3xl font-bold text-[#092d50]">كل تحديث في مكانه.</h2><p className="mt-4 max-w-md leading-7 text-[#62737d]">أدخل رقم التتبع الخاص بك لتعرف آخر محطة وصلت إليها شحنتك. جرّب الرقم الموجود كمثال.</p><div className="mt-7 flex flex-wrap items-center gap-2 text-xs text-[#5c6f78]"><span className="rounded-full bg-white px-3 py-2">مثال: RQ-2026-1842</span><span className="rounded-full bg-white px-3 py-2">متاح قريبًا للعامة</span></div></div><div className="rounded-3xl bg-white p-5 shadow-sm md:p-7"><form onSubmit={submitTracking} className="flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Package className="absolute right-4 top-1/2 -translate-y-1/2 text-[#91a1a8]" size={19} /><input value={tracking} onChange={event => setTracking(event.target.value)} placeholder="أدخل رقم الشحنة" className="h-14 w-full rounded-2xl border border-[#d8e1e4] bg-[#fbfcfb] pr-12 text-sm outline-none transition placeholder:text-[#9aa8ad] focus:border-[#2d6380] focus:ring-4 focus:ring-[#2d6380]/10" /></div><button className="h-14 rounded-2xl bg-[#092d50] px-6 font-bold text-white transition hover:bg-[#123f68]">تتبع الآن</button></form>{trackingResult && <div className="mt-5 rounded-2xl border border-[#d7e8df] bg-[#f4fbf7] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs text-[#74917f]">رقم الشحنة</div><div className="mt-1 font-bold text-[#173d34]">{trackingResult.code}</div></div><div className="rounded-full bg-[#d9f1e2] px-3 py-1.5 text-xs font-bold text-[#2b7656]">{trackingResult.status}</div></div><div className="mt-4 grid gap-3 border-t border-[#d7e8df] pt-4 text-sm sm:grid-cols-2"><div><span className="text-[#7f958a]">آخر موقع</span><div className="mt-1 font-semibold text-[#173d34]">{trackingResult.location}</div></div><div><span className="text-[#7f958a]">الوصول المتوقع</span><div className="mt-1 font-semibold text-[#173d34]">{trackingResult.eta}</div></div></div></div>}</div></div></section>

        <section id="about" className="bg-[#092d50] px-5 py-20 text-white lg:px-8"><div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1fr_.9fr] lg:items-center"><div><div className="mb-3 text-xs font-bold tracking-[0.18em] text-[#e2b557]">عن الرفكة</div><h2 className="max-w-xl text-3xl font-bold leading-tight sm:text-4xl">نربط تجارتك بالعالم،<br />ونبقي التفاصيل قريبة منك.</h2><p className="mt-5 max-w-xl leading-8 text-white/65">من الصين ودبي وتركيا إلى موريتانيا، نوفر خيارات شحن جوية وبحرية مدروسة للتجار والأفراد. فريقنا يساعدك في الشراء، الاستلام، المتابعة، والوصول إلى الخطوة التالية بوضوح.</p><div className="mt-8 flex flex-wrap gap-3"><div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"><div className="text-2xl font-bold">3</div><div className="mt-1 text-xs text-white/55">مسارات أساسية</div></div><div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"><div className="text-2xl font-bold">24/7</div><div className="mt-1 text-xs text-white/55">وضوح في الحالة</div></div><div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"><div className="text-2xl font-bold">1:1</div><div className="mt-1 text-xs text-white/55">متابعة مباشرة</div></div></div></div><div className="rounded-3xl border border-white/10 bg-white/5 p-6"><div className="mb-5 flex items-center justify-between"><div className="font-bold">خطوطنا اللوجستية</div><MapPin size={20} className="text-[#e2b557]" /></div>{["الصين → موريتانيا", "دبي → موريتانيا", "تركيا → موريتانيا"].map((route, index) => <div key={route} className="flex items-center gap-4 border-t border-white/10 py-4"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e2b557]/15 text-sm font-bold text-[#e2b557]">0{index + 1}</span><span className="font-semibold">{route}</span><ArrowLeft size={16} className="mr-auto text-white/35" /></div>)}</div></div></section>

        <section id="contact" className="mx-auto max-w-7xl px-5 py-20 lg:px-8"><div className="grid gap-8 lg:grid-cols-[.7fr_1.3fr]"><div><div className="mb-3 text-xs font-bold tracking-[0.18em] text-[#b17b1f]">نحن متاحون لخدمتك</div><h2 className="text-3xl font-bold text-[#092d50]">تواصل مع فريق الرفكة.</h2><p className="mt-4 leading-7 text-[#6e7c82]">اختر المكتب الأقرب، وأرسل لنا تفاصيل شحنتك قبل الإرسال لنتأكد من العنوان والخدمة المناسبة.</p><div className="mt-7 flex items-center gap-3 rounded-2xl bg-[#f1f5f2] p-4"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#2d7660]"><Phone size={19} /></div><div><div className="text-xs text-[#81928f]">للاستفسارات العاجلة</div><a href="tel:+22233331818" className="font-bold text-[#173e35]">+222 333 31818</a></div></div></div><div className="grid gap-3 sm:grid-cols-3">{offices.map(office => <article key={office.name} className={`rounded-3xl ${office.color} p-5`}><div className="flex items-center justify-between"><MapPin size={19} className="text-[#2e6280]" /><span className="text-xs text-[#65757b]">{office.label}</span></div><h3 className="mt-12 text-xl font-bold text-[#092d50]">{office.name}</h3><div className="mt-2 text-sm text-[#63737a]">{office.phone}</div><a href="#contact" className="mt-5 inline-flex items-center gap-1 text-xs font-bold text-[#2e6280]">عرض التفاصيل <ChevronLeft size={14} /></a></article>)}</div></div><div className="mt-8 grid gap-3 rounded-3xl border border-[#e1e7e8] bg-white p-5 sm:grid-cols-4 sm:p-6"><div className="sm:col-span-4"><div className="mb-3 text-sm font-bold text-[#092d50]">المحافظ الإلكترونية في موريتانيا</div><div className="text-xs text-[#7b898e]">اختر المحفظة، انسخ الرقم، ثم أرسل إيصال الدفع إلى المكتب.</div></div>{[{ name: "بنكيلي", value: "20066062" }, { name: "مصرفي", value: "20066062" }, { name: "غزة باي", value: "20066062" }, { name: "السداد", value: "22106435" }].map(wallet => <button key={wallet.name} onClick={() => copy(wallet.value, wallet.name)} className="flex items-center justify-between rounded-2xl bg-[#f7f8f5] p-4 text-right transition hover:bg-[#edf2ef]"><div><div className="font-bold text-[#092d50]">{wallet.name}</div><div className="mt-1 text-xs text-[#77868b]">{wallet.value}</div></div>{copied === wallet.name ? <Check size={17} className="text-[#2b7b63]" /> : <Copy size={16} className="text-[#8d9aa0]" />}</button>)}</div></section>
      </main>
      <footer className="border-t border-[#dce4e7] bg-white px-5 py-8 lg:px-8"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 text-sm text-[#7c898e] sm:flex-row sm:items-center"><div className="flex items-center gap-3"><img src={logo} alt="" className="h-8 w-8 rounded-lg object-cover" /><span>© 2026 مؤسسة الرفكة للشحن والنقل</span></div><div className="flex items-center gap-5"><Link href="/operations" className="font-semibold text-[#2e6280]">مركز العمليات</Link><span>الاثنين – السبت · 08:00 – 18:30</span></div></div></footer>
    </div>
  );
}
