export type DataScope = "shared" | "local" | "pending";

export type Account = {
  id: string;
  name: string;
  phone: string;
  city: string;
  shipments: number;
  balance: number;
  updatedAt: string;
  scope?: DataScope;
};

export type Shipment = {
  id: string;
  tracking: string;
  account: string;
  route: string;
  service: "جوي" | "بحري" | "سريع";
  status: "في الطريق" | "وصلت للمكتب" | "جاهزة للتسليم" | "بانتظار الدفع";
  eta: string;
  amount: number;
  scope?: DataScope;
};

export type Invoice = {
  id: string;
  account: string;
  amount: number;
  status: "مدفوعة" | "بانتظار الدفع";
  issuedAt: string;
};

export type LocalState = {
  accounts: Account[];
  shipments: Shipment[];
  invoices: Invoice[];
  lastSyncedAt: string | null;
};

export type PendingChange = {
  id: string;
  label: string;
  createdAt: string;
  entity: "account" | "shipment" | "invoice";
};

const STATE_KEY = "alrefqa-copy-state-v1";
const QUEUE_KEY = "alrefqa-copy-queue-v1";

const seedState: LocalState = {
  accounts: [
    { id: "AC-2048", name: "مؤسسة الأمانة للتجارة", phone: "+222 22 34 55 91", city: "نواكشوط", shipments: 18, balance: 12450, updatedAt: "منذ 12 دقيقة", scope: "shared" },
    { id: "AC-2031", name: "سوق المدينة", phone: "+222 46 10 28 72", city: "نواذيبو", shipments: 11, balance: 6200, updatedAt: "منذ ساعة", scope: "shared" },
    { id: "AC-2019", name: "خديجة بنت أحمد", phone: "+222 33 88 40 11", city: "روصو", shipments: 7, balance: 1850, updatedAt: "أمس", scope: "shared" },
  ],
  shipments: [
    { id: "sh-1", tracking: "RQ-2026-1842", account: "مؤسسة الأمانة للتجارة", route: "دبي → نواكشوط", service: "سريع", status: "في الطريق", eta: "24 أكتوبر", amount: 4250, scope: "shared" },
    { id: "sh-2", tracking: "RQ-2026-1837", account: "سوق المدينة", route: "إسطنبول → نواكشوط", service: "جوي", status: "وصلت للمكتب", eta: "اليوم", amount: 1980, scope: "shared" },
    { id: "sh-3", tracking: "RQ-2026-1819", account: "خديجة بنت أحمد", route: "الصين → نواكشوط", service: "بحري", status: "بانتظار الدفع", eta: "02 نوفمبر", amount: 7650, scope: "pending" },
    { id: "sh-4", tracking: "RQ-2026-1803", account: "مؤسسة الأمانة للتجارة", route: "دبي → نواكشوط", service: "جوي", status: "جاهزة للتسليم", eta: "اليوم", amount: 1240, scope: "shared" },
  ],
  invoices: [
    { id: "INV-1024", account: "مؤسسة الأمانة للتجارة", amount: 12450, status: "بانتظار الدفع", issuedAt: "20 أكتوبر 2026" },
    { id: "INV-1023", account: "سوق المدينة", amount: 6200, status: "مدفوعة", issuedAt: "19 أكتوبر 2026" },
    { id: "INV-1022", account: "خديجة بنت أحمد", amount: 1850, status: "مدفوعة", issuedAt: "18 أكتوبر 2026" },
  ],
  lastSyncedAt: "اليوم، 10:42",
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadLocalState(): LocalState {
  if (!canUseStorage()) return seedState;
  try {
    const raw = window.localStorage.getItem(STATE_KEY);
    if (!raw) return seedState;
    return { ...seedState, ...JSON.parse(raw) } as LocalState;
  } catch {
    return seedState;
  }
}

export function saveLocalState(state: LocalState) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

export function getPendingChanges(): PendingChange[] {
  if (!canUseStorage()) return [];
  try {
    return JSON.parse(window.localStorage.getItem(QUEUE_KEY) ?? "[]") as PendingChange[];
  } catch {
    return [];
  }
}

export function enqueueChange(change: Omit<PendingChange, "id" | "createdAt">) {
  const queue = getPendingChanges();
  const next = [...queue, { ...change, id: crypto.randomUUID(), createdAt: new Date().toISOString() }];
  if (canUseStorage()) window.localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
  return next;
}

export function clearPendingChanges() {
  if (canUseStorage()) window.localStorage.setItem(QUEUE_KEY, "[]");
}

export function formatMRU(value: number) {
  return new Intl.NumberFormat("ar-MR", { maximumFractionDigits: 0 }).format(value);
}
