import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  Power,
  Users,
} from "lucide-react";
import type { OfficeId } from "@shared/branches";
import type { DutyAvailability as DutyAvailabilityRow } from "@shared/duty";
import { officeIds } from "@shared/branches";
import { useLanguage } from "@/contexts/LanguageContext";
import { officeName } from "@/lib/branchSettingsCopy";
import { trpc } from "@/lib/trpc";
import type { PackingWorkspace } from "./PackingLayout";
import {
  packingInputClass,
  packingPrimaryClass,
  packingSecondaryClass,
} from "./PackingPrimitives";

type DutyAction = "activate" | "deactivate";

type DutyCopy = {
  title: string;
  hint: string;
  current: string;
  roster: string;
  role: string;
  office: string;
  on: string;
  off: string;
  pending: string;
  activate: string;
  deactivate: string;
  selectOffice: string;
  acknowledged: string;
  offlinePending: string;
  offlineNotGreen: string;
  loading: string;
  unavailable: string;
  retry: string;
  error: string;
  noRoster: string;
  roles: Record<string, string>;
};

const dutyCopies: Record<"ar" | "en" | "zh" | "tr", DutyCopy> = {
  ar: {
    title: "حالة العمل",
    hint: "التفعيل المعلن لمدة لا تتجاوز 8 ساعات؛ ليس حضورًا ماديًا ولا GPS ولا اتصالًا لحظيًا.",
    current: "تعيينك الحالي",
    roster: "الموظفون المفعّلون في نطاق المؤسسة",
    role: "الوظيفة",
    office: "المكتب",
    on: "مفعّل للعمل",
    off: "غير مفعّل",
    pending: "طلب محلي معلّق",
    activate: "تفعيل حالة العمل الآن",
    deactivate: "إيقاف حالة العمل",
    selectOffice: "اختر مكتبًا من تعييناتك",
    acknowledged: "أقرّ الخادم حالة العمل. الشارة مبنية على هذا الإقرار فقط.",
    offlinePending:
      "الطلب محفوظ كحالة معلّقة محليًا. لن تظهر الشارة خضراء قبل إقرار الخادم.",
    offlineNotGreen:
      "دون اتصال: الحالة المشتركة ليست خضراء ولا تمثل تفعيلًا مؤكدًا.",
    loading: "جارٍ تحميل حالة العمل…",
    unavailable: "تعذر تحميل حالة العمل المشتركة.",
    retry: "إعادة المحاولة",
    error: "تعذر إقرار حالة العمل. بقيت الحالة غير مفعّلة.",
    noRoster: "لا يوجد موظف معيّن ظاهر في هذا النطاق.",
    roles: {
      admin: "المدير الجذري",
      office_manager: "مدير مكتب",
      staff: "موظف مستودع",
      source_warehouse: "موظف مخزن المصدر",
      destination_warehouse: "مسؤول مستودع نواكشوط",
      accountant: "محاسب فرع",
      general_accountant: "محاسب عام",
      cashier: "محاسب كاش",
      viewer: "مشاهد",
      tracking_staff: "موظف تتبع",
      supervisor: "مشرف",
    },
  },
  en: {
    title: "Work duty",
    hint: "The acknowledged duty window lasts no more than 8 hours; it is not physical presence, GPS, or a live connection.",
    current: "Your current assignment",
    roster: "Active employees in the institution scope",
    role: "Role",
    office: "Office",
    on: "Active for duty",
    off: "Not active",
    pending: "Local request pending",
    activate: "Activate duty now",
    deactivate: "Deactivate duty",
    selectOffice: "Choose an office from your assignments",
    acknowledged:
      "The server acknowledged the duty state. The badge uses that acknowledgement only.",
    offlinePending:
      "The request is locally pending. It will not become green before server acknowledgement.",
    offlineNotGreen:
      "Offline: the shared state is not green and does not represent confirmed activation.",
    loading: "Loading duty status…",
    unavailable: "The shared duty status is unavailable.",
    retry: "Retry",
    error: "The duty state was not acknowledged. It remains inactive.",
    noRoster: "No assigned employee is visible in this scope.",
    roles: {
      admin: "Root administrator",
      office_manager: "Office manager",
      staff: "Warehouse employee",
      source_warehouse: "Source warehouse employee",
      destination_warehouse: "Nouakchott warehouse officer",
      accountant: "Branch accountant",
      general_accountant: "General accountant",
      cashier: "Cashier",
      viewer: "Viewer",
      tracking_staff: "Tracking employee",
      supervisor: "Supervisor",
    },
  },
  zh: {
    title: "工作状态",
    hint: "已确认的工作窗口最长 8 小时；这不是实际出勤、GPS 或实时连接证明。",
    current: "当前分配",
    roster: "机构范围内已激活员工",
    role: "职位",
    office: "办公室",
    on: "已激活工作",
    off: "未激活",
    pending: "本地请求待处理",
    activate: "立即激活工作状态",
    deactivate: "停用工作状态",
    selectOffice: "从已分配办公室中选择",
    acknowledged: "服务器已确认工作状态。绿色标记仅依据此确认。",
    offlinePending: "请求已在本地待处理。服务器确认前不会显示绿色。",
    offlineNotGreen: "离线：共享状态不会变绿，也不代表已确认激活。",
    loading: "正在加载工作状态…",
    unavailable: "无法加载共享工作状态。",
    retry: "重试",
    error: "服务器未确认工作状态，状态保持未激活。",
    noRoster: "此范围内没有可见的已分配员工。",
    roles: {
      admin: "根管理员",
      office_manager: "办公室经理",
      staff: "仓库员工",
      source_warehouse: "始发仓员工",
      destination_warehouse: "努瓦克肖特仓库负责人",
      accountant: "分支会计",
      general_accountant: "总会计",
      cashier: "出纳",
      viewer: "查看者",
      tracking_staff: "追踪员工",
      supervisor: "主管",
    },
  },
  tr: {
    title: "Çalışma durumu",
    hint: "Onaylanan görev penceresi en fazla 8 saattir; fiziksel mevcudiyet, GPS veya canlı bağlantı kanıtı değildir.",
    current: "Mevcut atamanız",
    roster: "Kurum kapsamındaki aktif çalışanlar",
    role: "Rol",
    office: "Ofis",
    on: "Görev için aktif",
    off: "Aktif değil",
    pending: "Yerel istek bekliyor",
    activate: "Çalışma durumunu şimdi etkinleştir",
    deactivate: "Çalışma durumunu kapat",
    selectOffice: "Atamalarınızdan bir ofis seçin",
    acknowledged:
      "Sunucu çalışma durumunu onayladı. Rozet yalnızca bu onaya dayanır.",
    offlinePending:
      "İstek yerelde bekliyor. Sunucu onayından önce yeşile dönmez.",
    offlineNotGreen:
      "Çevrimdışı: ortak durum yeşil değildir ve onaylı etkinliği göstermez.",
    loading: "Çalışma durumu yükleniyor…",
    unavailable: "Ortak çalışma durumu kullanılamıyor.",
    retry: "Tekrar dene",
    error:
      "Çalışma durumu sunucu tarafından onaylanmadı; etkin değil olarak kaldı.",
    noRoster: "Bu kapsamda atanmış görünür çalışan yok.",
    roles: {
      admin: "Kök yönetici",
      office_manager: "Ofis müdürü",
      staff: "Depo çalışanı",
      source_warehouse: "Çıkış deposu çalışanı",
      destination_warehouse: "Nuakşot depo sorumlusu",
      accountant: "Şube muhasebecisi",
      general_accountant: "Genel muhasebeci",
      cashier: "Kasiyer",
      viewer: "Görüntüleyici",
      tracking_staff: "Takip çalışanı",
      supervisor: "Süpervizör",
    },
  },
};

function copyFor(language: string) {
  return dutyCopies[
    (Object.keys(dutyCopies) as string[]).includes(language)
      ? (language as keyof typeof dutyCopies)
      : "ar"
  ];
}

function requestKey(action: DutyAction) {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `client-duty-${action}-${random}`;
}

function visibleOffice(
  row: DutyAvailabilityRow,
  offices: readonly OfficeId[],
  isAdmin: boolean
) {
  return row.office !== null && (isAdmin || offices.includes(row.office));
}

export default function DutyAvailability({
  workspace,
}: {
  workspace: PackingWorkspace;
}) {
  const { language } = useLanguage();
  const c = copyFor(language);
  const isAdmin = workspace.role === "admin";
  const assignedOffices = isAdmin ? [...officeIds] : (workspace.offices ?? []);
  const enabled = Boolean(
    workspace.userId &&
      workspace.role &&
      workspace.online &&
      !workspace.localOnly
  );
  const dutyQuery = trpc.duty.list.useQuery(undefined, {
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const activate = trpc.duty.activate.useMutation();
  const deactivate = trpc.duty.deactivate.useMutation();
  const utils = trpc.useUtils();
  const [selectedOffice, setSelectedOffice] = useState<OfficeId | "">(
    assignedOffices[0] ?? ""
  );
  const [pendingAction, setPendingAction] = useState<DutyAction | null>(null);
  const [acknowledgedStatus, setAcknowledgedStatus] = useState<
    "on" | "off" | null
  >(null);
  const [message, setMessage] = useState<{
    text: string;
    kind: "ok" | "pending" | "error";
  } | null>(null);

  useEffect(() => {
    if (!assignedOffices.includes(selectedOffice as OfficeId))
      setSelectedOffice(assignedOffices[0] ?? "");
  }, [assignedOffices.join(","), selectedOffice]);

  if (!workspace.userId || !workspace.role) return null;
  const roster = (dutyQuery.data ?? []).filter(row =>
    visibleOffice(row, assignedOffices, isAdmin)
  );
  const current = roster.find(row => row.id === Number(workspace.userId));
  const currentRole = current?.role ?? null;
  const currentOffice = current?.office ?? null;
  const serverStatus = current?.status ?? "off";
  const effectiveStatus = acknowledgedStatus ?? serverStatus;
  const acknowledgedOn = Boolean(
    effectiveStatus === "on" && workspace.online && !pendingAction
  );
  const currentStatus = pendingAction
    ? "pending"
    : acknowledgedOn
      ? "on"
      : "off";
  const nextAction: DutyAction =
    pendingAction ?? (acknowledgedOn ? "deactivate" : "activate");
  const busy = activate.isPending || deactivate.isPending;

  const submit = async (action: DutyAction) => {
    setMessage(null);
    if (!current || !currentRole || !selectedOffice) return;
    if (!workspace.online || workspace.localOnly) {
      setPendingAction(action);
      setMessage({ text: c.offlinePending, kind: "pending" });
      return;
    }
    const key = requestKey(action);
    const input = {
      id: key,
      requestKey: key,
      officeId: selectedOffice as OfficeId,
      role: currentRole,
      reason: `duty.${action}`,
    };
    try {
      const result =
        action === "activate"
          ? await activate.mutateAsync(input)
          : await deactivate.mutateAsync(input);
      setAcknowledgedStatus(result.status === "on" ? "on" : "off");
      setPendingAction(null);
      setMessage({ text: c.acknowledged, kind: "ok" });
      try {
        await utils.duty.list.invalidate();
      } catch {
        // The mutation acknowledgement remains authoritative; a failed
        // follow-up refresh must not turn it into a false error state.
      }
    } catch {
      setPendingAction(null);
      setMessage({ text: c.error, kind: "error" });
    }
  };

  return (
    <section
      className="mb-5 rounded-2xl border border-[#dce4e7] bg-white p-4 shadow-sm sm:p-5"
      aria-labelledby="duty-availability-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#e8eff1] text-[#092d50]">
            <Power size={18} />
          </span>
          <div>
            <h2
              id="duty-availability-title"
              className="font-black text-[#092d50]"
            >
              {c.title}
            </h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-[#718088]">
              {c.hint}
            </p>
          </div>
        </div>
        {!workspace.online && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-900">
            <CloudOff size={13} />
            {c.offlineNotGreen}
          </span>
        )}
      </div>
      {dutyQuery.isLoading && (
        <p className="mt-4 text-sm text-[#52636e]">{c.loading}</p>
      )}
      {dutyQuery.isError && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <AlertTriangle size={16} />
          {c.unavailable}
          <button
            className={packingSecondaryClass}
            onClick={() => void dutyQuery.refetch()}
          >
            {c.retry}
          </button>
        </div>
      )}
      {!dutyQuery.isLoading && !dutyQuery.isError && !current && (
        <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-[#52636e]">
          {c.noRoster}
        </p>
      )}
      {current && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="rounded-xl border border-[#edf1f1] bg-[#fbfcfb] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[#718088]">
              {c.current}
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-black text-[#092d50]">{current.name}</p>
                <p className="mt-1 text-sm text-[#52636e]">
                  {c.role}: {c.roles[current.role] ?? current.role}
                </p>
                <p className="text-sm text-[#52636e]">
                  {c.office}:{" "}
                  {currentOffice ? officeName(language, currentOffice) : "—"}
                </p>
              </div>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${currentStatus === "on" ? "bg-emerald-50 text-emerald-800" : currentStatus === "pending" ? "bg-amber-50 text-amber-900" : "bg-slate-100 text-slate-700"}`}
              >
                {currentStatus === "on" ? (
                  <CheckCircle2 size={13} />
                ) : currentStatus === "pending" ? (
                  <CloudOff size={13} />
                ) : (
                  <Power size={13} />
                )}
                {currentStatus === "on"
                  ? c.on
                  : currentStatus === "pending"
                    ? c.pending
                    : c.off}
              </span>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <label className="grid gap-1 text-xs font-bold text-[#52636e]">
                <span>{c.selectOffice}</span>
                <select
                  className={packingInputClass}
                  value={selectedOffice}
                  onChange={event =>
                    setSelectedOffice(event.target.value as OfficeId)
                  }
                  disabled={busy}
                >
                  {assignedOffices.map(office => (
                    <option key={office} value={office}>
                      {officeName(language, office)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className={packingPrimaryClass}
                disabled={busy || !selectedOffice}
                onClick={() => void submit(nextAction)}
              >
                {nextAction === "deactivate" ? c.deactivate : c.activate}
              </button>
            </div>
            {message && (
              <p
                role={message.kind === "error" ? "alert" : "status"}
                className={`mt-3 rounded-lg p-2 text-xs font-semibold ${message.kind === "ok" ? "bg-emerald-50 text-emerald-800" : message.kind === "pending" ? "bg-amber-50 text-amber-950" : "bg-red-50 text-red-800"}`}
              >
                {message.text}
              </p>
            )}
          </div>
          <div className="rounded-xl border border-[#edf1f1] bg-white p-4">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-[#267b7b]" />
              <h3 className="font-black text-[#092d50]">{c.roster}</h3>
            </div>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {roster.map(row => {
                const green =
                  row.status === "on" &&
                  workspace.online &&
                  row.id !== current.id
                    ? true
                    : row.id === current.id && acknowledgedOn;
                return (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-[#edf1f1] px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate font-semibold text-[#243f52]">
                      {row.name}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${green ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}
                    >
                      {green ? c.on : c.off}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
