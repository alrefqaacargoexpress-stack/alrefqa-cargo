import type { PackingSession } from "./packing";
export type AppRole = "admin" | "staff" | "accountant" | "viewer";
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
  version?: number;
};
export type Shipment = {
  id: string;
  tracking: string;
  account: string;
  route: string;
  service: "جوي" | "بحري" | "سريع";
  status:
    | "في الطريق"
    | "وصلت للمكتب"
    | "جاهزة للتسليم"
    | "بانتظار الدفع"
    | "قيد التجهيز"
    | "مسلّمة";
  eta: string;
  amount: number;
  packing?: PackingSession;
  deleted?: { at: string; reason: string };
  scope?: DataScope;
  version?: number;
};
export type Invoice = {
  id: string;
  account: string;
  amount: number;
  status: "مدفوعة" | "بانتظار الدفع";
  issuedAt: string;
  scope?: DataScope;
  version?: number;
};
export type LocalState = {
  accounts: Account[];
  shipments: Shipment[];
  invoices: Invoice[];
  lastSyncedAt: string | null;
};
export type Entity = "account" | "shipment" | "invoice";
export type EntityRecord = Account | Shipment | Invoice;
export type PendingChange = {
  id: string;
  label: string;
  createdAt: string;
  entity: Entity;
  recordId: string;
  expectedVersion: number | null;
  data: EntityRecord;
  action?: "delete-shipment" | "restore-shipment";
};
export type SyncResult = {
  applied: { changeId: string; entity: Entity; record: EntityRecord }[];
  conflicts: {
    changeId: string;
    reason: string;
    current: EntityRecord | null;
  }[];
};
export const EMPTY_STATE: LocalState = {
  accounts: [],
  shipments: [],
  invoices: [],
  lastSyncedAt: null,
};
export function canWrite(role: AppRole | null, entity: Entity): boolean {
  return (
    role === "admin" ||
    (role === "staff" && entity !== "invoice") ||
    (role === "accountant" && entity !== "shipment")
  );
}
export function canViewFinance(role: AppRole | null): boolean {
  return role === "admin" || role === "accountant";
}
