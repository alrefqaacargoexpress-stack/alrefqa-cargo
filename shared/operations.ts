import type { OfficeId } from "./branches";
import type { PackingSession } from "./packing";
import type { ShipmentJourney } from "./tracking";
import type { InvoicePayment } from "./office";
import type { FinancialInvoiceDetails } from "./finance";
import type { DestinationStorageItem } from "./warehouse";
export const APP_ROLES = [
  "admin",
  "office_manager",
  "staff",
  "accountant",
  "general_accountant",
  "cashier",
  "source_warehouse",
  "destination_warehouse",
  "viewer",
  "tracking_staff",
  "supervisor",
] as const;
export type AppRole = (typeof APP_ROLES)[number];
export type DataScope = "shared" | "local" | "pending";
export type Account = {
  id: string;
  name: string;
  phone: string;
  city: string;
  shipments: number;
  balance: number;
  updatedAt: string;
  officeId?: OfficeId;
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
  journey?: ShipmentJourney;
  destinationStorage?: DestinationStorageItem[];
  deleted?: { at: string; reason: string };
  accountingModelVersion?: 2;
  officeId?: OfficeId;
  scope?: DataScope;
  version?: number;
};
export type Invoice = {
  id: string;
  account: string;
  amount: number;
  status: "مدفوعة" | "بانتظار الدفع" | "دين";
  issuedAt: string;
  payment?: InvoicePayment;
  finance?: FinancialInvoiceDetails;
  officeId?: OfficeId;
  scope?: DataScope;
  version?: number;
};
export type LocalState = {
  accounts: Account[];
  shipments: Shipment[];
  invoices: Invoice[];
  lastSyncedAt: string | null;
  retiredRecords?: { entity: Entity; recordId: string }[];
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
  // All invoices and monetary facts use the dedicated accountant command API.
  if (entity === "invoice") return false;
  if (entity === "account")
    return role === "accountant" || role === "general_accountant";
  return (
    role === "admin" ||
    role === "office_manager" ||
    role === "staff" ||
    role === "source_warehouse"
  );
}
export function canViewFinance(role: AppRole | null): boolean {
  return (
    role === "admin" ||
    role === "accountant" ||
    role === "general_accountant" ||
    role === "cashier" ||
    role === "office_manager"
  );
}
