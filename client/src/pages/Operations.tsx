import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Bell,
  Check,
  ChevronDown,
  CircleDollarSign,
  Cloud,
  CloudOff,
  Download,
  FileSpreadsheet,
  Filter,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  Package,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Truck,
  Upload,
  Users,
  Wifi,
  X,
} from "lucide-react";
import { exportAccountsWorkbook, parseAccountsWorkbook } from "@/lib/excel";
import { enqueueChange, formatMRU, getPendingChanges, loadLocalState, saveLocalState, type Account, type DataScope, type LocalState } from "@/lib/offlineStore";

const logo = "https://www.alrefqaacargo.space/manus-storage/alrafkah-logo-final_cabb0750.webp";
type Tab = "overview" | "shipments" | "accounts" | "invoices" | "access";
type Role = "مدير النظام" | "الموظف" | "المحاسب" | "المشاهد";

function ScopeBadge({ scope }: { scope?: DataScope }) {
  const config = scope === "local" ? { label: "محلية", cls: "bg-[#eef3fb] text-[#456c9a]" } : scope === "pending" ? { label: "بانتظار المزامنة", cls: "bg-[#fff4dc] text-[#a56e18]" } : { label: "مشتركة", cls: "bg-[#e7f4ec] text-[#367558]" };
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${config.cls}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{config.label}</span>;
}

function StatusBadge({ label }: { label: string }) {
  const cls = label === "في الطريق" ? "bg-[#e7eff8] text-[#3b6590]" : label === "وصلت للمكتب" ? "bg-[#eef0fb] text-[#6466a1]" : label === "جاهزة للتسليم" ? "bg-[#e5f4ec] text-[#307553]" : "bg-[#fff2da] text-[#a66d13]";
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${cls}`}>{label}</span>;
}

export default function Operations() {
  const [tab, setTab] = useState<Tab>("overview");
  const [role, setRole] = useState<Role>("مدير النظام");
  const [state, setState] = useState<LocalState>(() => loadLocalState());
  const [queue, setQueue] = useState(getPendingChanges());
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [notice, setNotice] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [importReport, setImportReport] = useState<{ accepted: number; rejected: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const canEdit = role !== "المشاهد";
  const canFinance = role === "مدير النظام" || role === "المحاسب";

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);

  const showNotice = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 3000); };
  const updateState = (next: LocalState, entity: "account" | "shipment" | "invoice", label: string) => {
    setState(next);
    saveLocalState(next);
    const nextQueue = enqueueChange({ entity, label });
    setQueue(nextQueue);
  };
  const syncNow = () => {
    if (!online) { showNotice("لا يمكن المزامنة الآن — الجهاز غير متصل"); return; }
    setQueue([]);
    window.localStorage.setItem("alrefqa-copy-queue-v1", "[]");
    const next = { ...state, lastSyncedAt: "الآن" };
    setState(next);
    saveLocalState(next);
    showNotice("تمت مزامنة التغييرات المحلية بنجاح");
  };
  const createDraft = () => {
    if (!canEdit) { showNotice("دور المشاهد لا يسمح بإنشاء مسودات"); return; }
    const next = { ...state, shipments: [{ id: `sh-${Date.now()}`, tracking: `RQ-LOCAL-${String(state.shipments.length + 1).padStart(3, "0")}`, account: "مسودة محلية جديدة", route: "دبي → نواكشوط", service: "سريع" as const, status: "بانتظار الدفع" as const, eta: "غير محدد", amount: 0, scope: "pending" as const }, ...state.shipments] };
    updateState(next, "shipment", "إنشاء شحنة محلية جديدة");
    setTab("shipments");
    showNotice("حُفظت الشحنة كمسودة محلية وبانتظار المزامنة");
  };
  const handleImport = async (file?: File) => {
    if (!file) return;
    try {
      const result = await parseAccountsWorkbook(file);
      const next = { ...state, accounts: [...result.rows, ...state.accounts] };
      updateState(next, "account", `استيراد ${result.rows.length} حسابات من Excel`);
      setImportReport({ accepted: result.rows.length, rejected: result.rejected.length });
      showNotice(`تمت قراءة ${result.rows.length} حسابات — راجع حالة المزامنة قبل المشاركة`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "تعذر قراءة ملف Excel");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const filteredAccounts = useMemo(() => state.accounts.filter(account => `${account.id} ${account.name} ${account.phone}`.toLowerCase().includes(search.toLowerCase())), [state.accounts, search]);
  const filteredShipments = useMemo(() => state.shipments.filter(shipment => `${shipment.tracking} ${shipment.account} ${shipment.route}`.toLowerCase().includes(search.toLowerCase())), [state.shipments, search]);
  const totalReceivables = state.accounts.reduce((sum, account) => sum + account.balance, 0);
  const navItems: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: "overview", label: "نظرة عامة", icon: LayoutDashboard },
    { id: "shipments", label: "الشحنات", icon: Package },
    { id: "accounts", label: "الحسابات", icon: Users },
    { id: "invoices", label: "الفوترة", icon: CircleDollarSign },
    { id: "access", label: "الصلاحيات", icon: ShieldCheck },
  ];

  return <div className="min-h-screen bg-[#f6f8f7] text-[#102f45]">
    <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={event => void handleImport(event.target.files?.[0])} />
    {notice && <div className="fixed left-1/2 top-5 z-50 flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-[#092d50] px-4 py-3 text-sm font-semibold text-white shadow-xl"><Check size={16} className="text-[#e1b452]" />{notice}</div>}
    <aside className={`fixed inset-y-0 right-0 z-40 w-72 border-l border-[#dce4e7] bg-[#092d50] p-5 text-white transition-transform lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "translate-x-full"}`}>
      <div className="flex items-center justify-between"><Link href="/" className="flex items-center gap-3"><img src={logo} alt="" className="h-10 w-10 rounded-xl object-cover" /><div><div className="font-bold">مؤسسة الرفكة</div><div className="text-[10px] tracking-[.15em] text-white/50">مركز العمليات</div></div></Link><button className="rounded-lg p-1.5 text-white/60 lg:hidden" onClick={() => setSidebarOpen(false)}><X size={18} /></button></div>
      <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-3"><div className="flex items-center gap-2 text-xs text-white/55"><span className={`h-2 w-2 rounded-full ${online ? "bg-[#71c59a]" : "bg-[#e0a449]"}`} />{online ? "متصل بالخادم" : "وضع عدم الاتصال"}</div><div className="mt-3 flex items-center justify-between text-xs"><span className="text-white/45">طابور محلي</span><span className="font-bold text-[#e3b75c]">{queue.length} تغيير</span></div></div>
      <nav className="mt-8 space-y-1">{navItems.map(item => <button key={item.id} onClick={() => { setTab(item.id); setSidebarOpen(false); setSearch(""); }} className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-right text-sm font-semibold transition ${tab === item.id ? "bg-white text-[#092d50]" : "text-white/65 hover:bg-white/10 hover:text-white"}`}><item.icon size={18} />{item.label}{item.id === "access" && <span className="mr-auto rounded-full bg-[#e1b452]/15 px-2 py-0.5 text-[10px] text-[#eac776]">RBAC</span>}</button>)}</nav>
      <div className="absolute inset-x-5 bottom-5 rounded-2xl border border-white/10 p-3 text-xs text-white/50"><div className="flex items-center gap-2 text-white/75"><ShieldCheck size={15} className="text-[#e1b452]" /> مساحة مستقلة وآمنة</div><p className="mt-2 leading-5">هذه اللوحة لا تقرأ بيانات الموقع الأصلي ولا تنقلها تلقائيًا.</p></div>
    </aside>

    <div className="lg:mr-72"><header className="sticky top-0 z-30 border-b border-[#dce4e7] bg-[#f6f8f7]/95 px-5 py-4 backdrop-blur-lg lg:px-8"><div className="flex items-center justify-between gap-4"><div className="flex items-center gap-3"><button className="rounded-xl border border-[#dce4e7] bg-white p-2.5 lg:hidden" onClick={() => setSidebarOpen(true)}><Menu size={19} /></button><div><div className="text-xs font-semibold text-[#8a999d]">الأربعاء، 21 أكتوبر 2026</div><h1 className="mt-1 text-xl font-bold text-[#092d50]">{tab === "overview" ? "صباح الخير، فريق الرفكة" : navItems.find(item => item.id === tab)?.label}</h1></div></div><div className="flex items-center gap-2 sm:gap-3"><div className={`hidden items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold sm:flex ${online ? "border-[#cde3d6] bg-[#eff9f3] text-[#38775c]" : "border-[#f0dba9] bg-[#fff8e7] text-[#a16f1d]"}`}>{online ? <Wifi size={14} /> : <CloudOff size={14} />}{online ? "متصل" : "دون اتصال"}</div><button className="rounded-xl border border-[#dce4e7] bg-white p-2.5 text-[#65757e]"><Bell size={18} /></button><div className="flex items-center gap-2 rounded-xl border border-[#dce4e7] bg-white px-2.5 py-2"><div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#e6edf1] text-xs font-bold text-[#315d78]">م</div><div className="hidden text-right sm:block"><div className="text-xs font-bold">محمد المدير</div><div className="text-[10px] text-[#879398]">{role}</div></div><ChevronDown size={14} className="text-[#8c999d]" /></div></div></div></header>
      <main className="p-5 lg:p-8">
        <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-center"><div><div className="flex items-center gap-2 text-xs text-[#7d8e94]"><Link href="/" className="hover:text-[#2e6280]">الموقع العام</Link><ArrowRight size={13} /><span>النسخة المستقلة</span></div></div><div className="flex flex-wrap gap-2"><button onClick={() => setTab("accounts")} className="inline-flex items-center gap-2 rounded-xl border border-[#d4e0e4] bg-white px-3.5 py-2.5 text-xs font-bold text-[#315d78]"><Download size={15} /> تصدير الحسابات</button><button onClick={createDraft} className="inline-flex items-center gap-2 rounded-xl bg-[#092d50] px-3.5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#123f68]"><Plus size={16} /> شحنة جديدة</button></div></div>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#d9e7dd] bg-[#f0f8f2] px-4 py-3"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#3a805f]">{online ? <Cloud size={18} /> : <CloudOff size={18} />}</div><div><div className="text-xs font-bold text-[#2e634a]">{online ? "مستعد للمزامنة" : "تعمل الآن دون اتصال"}</div><div className="mt-0.5 text-[11px] text-[#70887b]">آخر مزامنة: {state.lastSyncedAt ?? "لم تتم بعد"} · التغييرات المحلية لا تُشارك تلقائيًا</div></div></div><button onClick={syncNow} className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-[#367558] shadow-sm"><RefreshCw size={14} /> مزامنة الآن ({queue.length})</button></div>
        {tab === "overview" && <Overview state={state} totalReceivables={totalReceivables} setTab={setTab} />}
        {tab === "shipments" && <Shipments state={state} items={filteredShipments} search={search} setSearch={setSearch} />}
        {tab === "accounts" && <Accounts accounts={filteredAccounts} allAccounts={state.accounts} search={search} setSearch={setSearch} onImport={() => inputRef.current?.click()} onExport={() => exportAccountsWorkbook(state.accounts)} importReport={importReport} canEdit={canEdit} />}
        {tab === "invoices" && <Invoices state={state} canFinance={canFinance} />}
        {tab === "access" && <Access role={role} setRole={setRole} />}
      </main></div>
  </div>;
}

function Metric({ label, value, hint, icon: Icon, tone }: { label: string; value: string; hint: string; icon: typeof Package; tone: string }) { return <div className="rounded-2xl border border-[#dfe7e8] bg-white p-5"><div className="flex items-start justify-between"><div><div className="text-xs font-semibold text-[#87959a]">{label}</div><div className="mt-2 text-2xl font-bold text-[#092d50]">{value}</div></div><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}><Icon size={19} /></div></div><div className="mt-4 text-[11px] text-[#7b8a8f]">{hint}</div></div>; }

function Overview({ state, totalReceivables, setTab }: { state: LocalState; totalReceivables: number; setTab: (tab: Tab) => void }) { return <>
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="الشحنات النشطة" value="36" hint="+8.4% مقارنة بالأسبوع السابق" icon={Package} tone="bg-[#e7eff8] text-[#3b6590]" /><Metric label="في الطريق" value="18" hint="12 شحنة جوية · 6 بحرية" icon={Truck} tone="bg-[#eef0fb] text-[#6568a0]" /><Metric label="الحسابات" value={String(state.accounts.length + 124)} hint="3 حسابات بانتظار المزامنة" icon={Users} tone="bg-[#e8f4ec] text-[#39765a]" /><Metric label="مستحقات اليوم" value={`${formatMRU(totalReceivables)} أوقية`} hint="4 فواتير تحتاج متابعة" icon={CircleDollarSign} tone="bg-[#fff2da] text-[#a46d16]" /></div>
  <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_.65fr]"><section className="rounded-2xl border border-[#dfe7e8] bg-white"><div className="flex items-center justify-between border-b border-[#edf0f1] px-5 py-4"><div><h2 className="font-bold text-[#092d50]">آخر الشحنات</h2><p className="mt-1 text-xs text-[#87959a]">مرئية للفريق حسب الصلاحيات</p></div><button onClick={() => setTab("shipments")} className="text-xs font-bold text-[#3a6680]">عرض الكل</button></div><div className="divide-y divide-[#edf0f1]">{state.shipments.slice(0, 4).map(shipment => <div key={shipment.id} className="flex flex-wrap items-center gap-4 px-5 py-4"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eef3f5] text-[#3d6c84]"><Package size={17} /></div><div className="min-w-[150px] flex-1"><div className="text-sm font-bold text-[#173e55]">{shipment.tracking}</div><div className="mt-1 text-xs text-[#869499]">{shipment.account} · {shipment.route}</div></div><StatusBadge label={shipment.status} /><ScopeBadge scope={shipment.scope} /></div>)}</div></section><section className="rounded-2xl border border-[#dfe7e8] bg-[#092d50] p-5 text-white"><div className="flex items-center justify-between"><div className="text-xs font-bold text-white/55">حدود البيانات</div><ShieldCheck size={18} className="text-[#e1b452]" /></div><h2 className="mt-4 text-xl font-bold">ما تراه هنا<br />لا يغيّر موقعك الأصلي.</h2><p className="mt-3 text-sm leading-6 text-white/60">هذه مساحة مستقلة. البيانات المشتركة تُحفظ في قاعدة النسخة، أما المسودات المحلية فتظل على هذا الجهاز حتى تضغط «مزامنة الآن».</p><div className="mt-7 space-y-3"><div className="flex items-center gap-3 rounded-xl bg-white/8 px-3 py-2.5 text-xs"><span className="h-2 w-2 rounded-full bg-[#6fca9a]" /> بيانات مشتركة بين الموظفين</div><div className="flex items-center gap-3 rounded-xl bg-white/8 px-3 py-2.5 text-xs"><span className="h-2 w-2 rounded-full bg-[#e1b452]" /> مسودة محلية بانتظار المراجعة</div></div></section></div>
  <div className="mt-6 rounded-2xl border border-[#dfe7e8] bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-[#092d50]">اختصارات التشغيل</h2><p className="mt-1 text-xs text-[#87959a]">ابدأ من الإجراء الذي تحتاجه الآن</p></div><div className="flex flex-wrap gap-2"><button onClick={() => setTab("shipments")} className="inline-flex items-center gap-2 rounded-xl bg-[#f0f4f5] px-3.5 py-2.5 text-xs font-bold text-[#3a647c]"><Plus size={15} /> إضافة شحنة</button><button onClick={() => setTab("accounts")} className="inline-flex items-center gap-2 rounded-xl bg-[#f0f4f5] px-3.5 py-2.5 text-xs font-bold text-[#3a647c]"><FileSpreadsheet size={15} /> مراجعة Excel</button><button onClick={() => setTab("access")} className="inline-flex items-center gap-2 rounded-xl bg-[#f0f4f5] px-3.5 py-2.5 text-xs font-bold text-[#3a647c]"><Settings2 size={15} /> إدارة الأدوار</button></div></div></div>
</>; }

function Toolbar({ search, setSearch, placeholder }: { search: string; setSearch: (value: string) => void; placeholder: string }) { return <div className="flex flex-wrap gap-2"><div className="relative min-w-[220px] flex-1"><Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#97a5aa]" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder={placeholder} className="h-10 w-full rounded-xl border border-[#dfe7e8] bg-[#fbfcfb] pr-9 text-xs outline-none focus:border-[#2e6280]" /></div><button className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#dfe7e8] bg-white px-3 text-xs font-bold text-[#6e7d83]"><Filter size={15} /> تصفية</button></div>; }

function Shipments({ state, items, search, setSearch }: { state: LocalState; items: LocalState["shipments"]; search: string; setSearch: (value: string) => void }) { return <section className="rounded-2xl border border-[#dfe7e8] bg-white"><div className="flex flex-col gap-4 border-b border-[#edf0f1] p-5 md:flex-row md:items-center md:justify-between"><div><h2 className="font-bold text-[#092d50]">سجل الشحنات</h2><p className="mt-1 text-xs text-[#87959a]">{state.shipments.length} شحنات في هذه النسخة</p></div><Toolbar search={search} setSearch={setSearch} placeholder="ابحث برقم الشحنة أو الحساب" /></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-right text-sm"><thead className="bg-[#fafbfb] text-xs text-[#89969b]"><tr><th className="px-5 py-3 font-semibold">رقم الشحنة</th><th className="px-5 py-3 font-semibold">الحساب</th><th className="px-5 py-3 font-semibold">المسار</th><th className="px-5 py-3 font-semibold">الخدمة</th><th className="px-5 py-3 font-semibold">الحالة</th><th className="px-5 py-3 font-semibold">المصدر</th><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-[#edf0f1]">{items.map(shipment => <tr key={shipment.id} className="hover:bg-[#fbfcfc]"><td className="px-5 py-4 font-bold text-[#173e55]">{shipment.tracking}<div className="mt-1 text-[11px] font-normal text-[#9aa6aa]">الوصول: {shipment.eta}</div></td><td className="px-5 py-4 text-xs text-[#536a74]">{shipment.account}</td><td className="px-5 py-4 text-xs text-[#536a74]">{shipment.route}</td><td className="px-5 py-4 text-xs text-[#536a74]">{shipment.service}</td><td className="px-5 py-4"><StatusBadge label={shipment.status} /></td><td className="px-5 py-4"><ScopeBadge scope={shipment.scope} /></td><td className="px-5 py-4"><button className="text-[#89969b]"><MoreHorizontal size={17} /></button></td></tr>)}</tbody></table></div></section>; }

function Accounts({ accounts, allAccounts, search, setSearch, onImport, onExport, importReport, canEdit }: { accounts: Account[]; allAccounts: Account[]; search: string; setSearch: (value: string) => void; onImport: () => void; onExport: () => void; importReport: { accepted: number; rejected: number } | null; canEdit: boolean }) { return <section className="rounded-2xl border border-[#dfe7e8] bg-white"><div className="flex flex-col gap-4 border-b border-[#edf0f1] p-5"><div className="flex flex-col justify-between gap-3 md:flex-row md:items-center"><div><h2 className="font-bold text-[#092d50]">الحسابات</h2><p className="mt-1 text-xs text-[#87959a]">استيراد وتصدير صريح — لا اتصال تلقائي بالموقع الأصلي</p></div><div className="flex flex-wrap gap-2"><button disabled={!canEdit} onClick={onImport} className="inline-flex items-center gap-2 rounded-xl border border-[#dfe7e8] bg-white px-3 py-2.5 text-xs font-bold text-[#3a647c] disabled:cursor-not-allowed disabled:opacity-45"><Upload size={15} /> استيراد Excel</button><button onClick={onExport} className="inline-flex items-center gap-2 rounded-xl bg-[#092d50] px-3 py-2.5 text-xs font-bold text-white"><ArrowDownToLine size={15} /> تصدير XLSX</button></div></div><Toolbar search={search} setSearch={setSearch} placeholder="ابحث باسم الحساب أو الهاتف" />{importReport && <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[#fff8e8] px-3 py-2.5 text-xs text-[#96661b]"><FileSpreadsheet size={15} /><span>آخر استيراد: {importReport.accepted} مقبولة و{importReport.rejected} مرفوضة. تم إبقاؤها محلية حتى المراجعة والمزامنة.</span></div>}</div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-right text-sm"><thead className="bg-[#fafbfb] text-xs text-[#89969b]"><tr><th className="px-5 py-3 font-semibold">الحساب</th><th className="px-5 py-3 font-semibold">الهاتف</th><th className="px-5 py-3 font-semibold">المدينة</th><th className="px-5 py-3 font-semibold">الشحنات</th><th className="px-5 py-3 font-semibold">الرصيد</th><th className="px-5 py-3 font-semibold">المصدر</th></tr></thead><tbody className="divide-y divide-[#edf0f1]">{accounts.map(account => <tr key={`${account.id}-${account.name}`}><td className="px-5 py-4"><div className="font-bold text-[#173e55]">{account.name}</div><div className="mt-1 text-[11px] text-[#9aa6aa]">{account.id} · {account.updatedAt}</div></td><td className="px-5 py-4 text-xs text-[#536a74]">{account.phone}</td><td className="px-5 py-4 text-xs text-[#536a74]">{account.city}</td><td className="px-5 py-4 font-semibold text-[#3a647c]">{account.shipments}</td><td className="px-5 py-4 font-semibold text-[#173e55]">{formatMRU(account.balance)} أوقية</td><td className="px-5 py-4"><ScopeBadge scope={account.scope} /></td></tr>)}</tbody></table></div>{accounts.length === 0 && <div className="p-10 text-center text-sm text-[#87959a]">لا توجد حسابات مطابقة للبحث.</div>}<div className="border-t border-[#edf0f1] px-5 py-3 text-[11px] text-[#99a5a9]">عرض {accounts.length} من {allAccounts.length} حسابات في مساحة النسخة الجديدة</div></section>; }

function Invoices({ state, canFinance }: { state: LocalState; canFinance: boolean }) { return <section className="rounded-2xl border border-[#dfe7e8] bg-white"><div className="flex items-center justify-between border-b border-[#edf0f1] p-5"><div><h2 className="font-bold text-[#092d50]">الفوترة</h2><p className="mt-1 text-xs text-[#87959a]">الوصول المالي مقيد حسب الدور</p></div><button disabled={!canFinance} className="inline-flex items-center gap-2 rounded-xl bg-[#092d50] px-3 py-2.5 text-xs font-bold text-white disabled:opacity-40"><Plus size={15} /> فاتورة جديدة</button></div><div className="grid gap-4 p-5 sm:grid-cols-3"><div className="rounded-2xl bg-[#f5f8f7] p-4"><div className="text-xs text-[#829096]">إجمالي هذا الشهر</div><div className="mt-2 text-xl font-bold text-[#092d50]">{formatMRU(state.invoices.reduce((sum, invoice) => sum + invoice.amount, 0))}</div></div><div className="rounded-2xl bg-[#fff8e8] p-4"><div className="text-xs text-[#a17a32]">بانتظار الدفع</div><div className="mt-2 text-xl font-bold text-[#8a6118]">{state.invoices.filter(invoice => invoice.status === "بانتظار الدفع").length}</div></div><div className="rounded-2xl bg-[#eef8f2] p-4"><div className="text-xs text-[#5b8870]">مدفوعة</div><div className="mt-2 text-xl font-bold text-[#2d6e50]">{state.invoices.filter(invoice => invoice.status === "مدفوعة").length}</div></div></div><div className="divide-y divide-[#edf0f1]">{state.invoices.map(invoice => <div key={invoice.id} className="flex flex-wrap items-center gap-4 px-5 py-4"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eef3f5] text-[#3d6c84]"><CircleDollarSign size={17} /></div><div className="min-w-[150px] flex-1"><div className="text-sm font-bold text-[#173e55]">{invoice.id}</div><div className="mt-1 text-xs text-[#89969b]">{invoice.account} · {invoice.issuedAt}</div></div><div className="text-sm font-bold text-[#173e55]">{formatMRU(invoice.amount)} أوقية</div><StatusBadge label={invoice.status === "مدفوعة" ? "جاهزة للتسليم" : "بانتظار الدفع"} /></div>)}</div></section>; }

function Access({ role, setRole }: { role: Role; setRole: (role: Role) => void }) { const roles: { name: Role; desc: string; access: string }[] = [{ name: "مدير النظام", desc: "إدارة كل البيانات والأدوار والمزامنة", access: "كامل" }, { name: "الموظف", desc: "الشحنات والحسابات التشغيلية", access: "تشغيل" }, { name: "المحاسب", desc: "الفواتير والأرصدة والتقارير", access: "مالي" }, { name: "المشاهد", desc: "عرض دون تعديل أو استيراد", access: "قراءة" }]; return <section className="grid gap-6 xl:grid-cols-[1fr_.75fr]"><div className="rounded-2xl border border-[#dfe7e8] bg-white p-5"><div className="flex items-center justify-between"><div><h2 className="font-bold text-[#092d50]">الأدوار والصلاحيات</h2><p className="mt-1 text-xs text-[#87959a]">نموذج RBAC مستقل عن حسابات الموقع الأصلي</p></div><ShieldCheck size={22} className="text-[#2e7280]" /></div><div className="mt-5 space-y-3">{roles.map(item => <button key={item.name} onClick={() => setRole(item.name)} className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-right transition ${role === item.name ? "border-[#9bbcc7] bg-[#f1f7f8]" : "border-[#e5eaeb] bg-white hover:bg-[#fbfcfc]"}`}><div className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold ${role === item.name ? "bg-[#092d50] text-white" : "bg-[#edf2f4] text-[#64808c]"}`}>{item.name[0]}</div><div className="flex-1"><div className="font-bold text-[#173e55]">{item.name}</div><div className="mt-1 text-xs text-[#89969b]">{item.desc}</div></div><span className="rounded-full bg-[#f3f5f5] px-2.5 py-1 text-[11px] font-bold text-[#718188]">{item.access}</span></button>)}</div></div><div className="rounded-2xl bg-[#092d50] p-6 text-white"><div className="flex items-center gap-2 text-xs text-white/55"><ShieldCheck size={16} className="text-[#e1b452]" /> سياسة الوصول الحالية</div><h2 className="mt-5 text-xl font-bold">أنت تختبر دور<br />«{role}» الآن.</h2><p className="mt-4 text-sm leading-7 text-white/60">التغيير هنا يوضح تجربة الدور داخل النسخة. عند ربط الحسابات الفعلية، تُحفظ الأدوار في قاعدة بيانات النسخة ولا تمتد إلى الموقع الأصلي.</p><div className="mt-7 border-t border-white/10 pt-5 text-xs text-white/55"><div className="flex items-center justify-between py-2"><span>البيانات المشتركة</span><span className="font-bold text-[#77c99d]">مسموحة حسب الدور</span></div><div className="flex items-center justify-between py-2"><span>المسودات المحلية</span><span className="font-bold text-[#e1b452]">على هذا الجهاز</span></div></div></div></section>; }
