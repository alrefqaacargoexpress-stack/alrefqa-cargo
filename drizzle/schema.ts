import {
  integer,
  jsonb,
  pgTable,
  boolean,
  decimal,
  text,
  timestamp,
  varchar,
  index,
  uniqueIndex,
  serial,
} from "drizzle-orm/pg-core";

const int = integer;

/** PostgreSQL keeps the application enums type-safe in TypeScript while migrations remain additive. */
function enumText<const T extends readonly [string, ...string[]]>(
  name: string,
  values: T
) {
  void values;
  return text(name).$type<T[number]>();
}

import { sql } from "drizzle-orm";

import type { PermissionMap } from "../shared/permissions";
/** Core user table backing auth flow. */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  loginMethod: varchar("loginMethod", { length: 64 }),
  accountType: enumText("accountType", ["customer", "employee"])
    .default("employee")
    .notNull(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  mustChangePassword: boolean("mustChangePassword").default(false).notNull(),
  role: enumText("role", ["user", "admin"]).default("user").notNull(),
  /** Employee-controlled public contact; never used for authentication. */
  publicPhone: varchar("publicPhone", { length: 40 }),
  publicPhoneVisible: boolean("publicPhoneVisible").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** Application-owned email sessions. Manus OAuth sessions remain in webdev_app_session. */
export const localSessions = pgTable(
  "local_sessions",
  {
    id: serial("id").primaryKey(),
    tokenHash: varchar("tokenHash", { length: 64 }).notNull(),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("local_sessions_token_unique").on(table.tokenHash)]
);

/** Owner-approved one-time enrollment capabilities, never regular login sessions. */
export const emailEnrollments = pgTable("email_enrollments", {
  tokenHash: varchar("tokenHash", { length: 64 }).primaryKey(),
  userId: int("userId")
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp("expiresAt").notNull(),
  consumedAt: timestamp("consumedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const recordEntityValues = ["account", "shipment", "invoice"] as const;
export const appRoleValues = [
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

/** Durable application role assignments. The users.role column remains the root admin flag. */
export const memberRoles = pgTable(
  "member_roles",
  {
    id: serial("id").primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    role: enumText("role", appRoleValues).notNull(),
    /** null preserves legacy unrestricted membership; JSON is an explicit office allow-list. */
    offices: jsonb("offices"),
    /** Optional finance home office; null preserves legacy unrestricted membership. */
    homeOffice: varchar("homeOffice", { length: 32 }),
    /** Explicit opt-in for source-warehouse stage updates; never grants financial access. */
    canUpdateTracking: boolean("canUpdateTracking").notNull().default(false),
    permissions: jsonb("permissions").$type<PermissionMap>(),
    delegatedBy: int("delegatedBy"),
    /** Optimistic-concurrency version for admin membership edits. */
    version: int("version").notNull().default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("member_roles_user_unique").on(table.userId)]
);

/** Four public office profiles; profile JSON is validated by shared/branches.ts at the API boundary. */
export const officeProfiles = pgTable(
  "office_profiles",
  {
    officeId: varchar("officeId", { length: 32 }).primaryKey(),
    version: int("version").notNull().default(0),
    profile: jsonb("profile").notNull(),
    updatedBy: int("updatedBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("office_profiles_office_unique").on(table.officeId)]
);

/** Generic records preserve the shared contract while keeping writes additive and versioned. */
export const records = pgTable(
  "records",
  {
    id: serial("id").primaryKey(),
    entity: enumText("entity", recordEntityValues).notNull(),
    recordId: varchar("recordId", { length: 128 }).notNull(),
    version: int("version").notNull().default(1),
    data: jsonb("data").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
    updatedBy: int("updatedBy").notNull(),
  },
  table => [
    uniqueIndex("records_entity_record_unique").on(
      table.entity,
      table.recordId
    ),
  ]
);

export const marketStageValues = [
  "registered",
  "in_transit",
  "arrived_destination",
  "ready_for_pickup",
  "delivered",
] as const;
export const marketEventTypeValues = ["registered", "stage"] as const;

/** Append-only operational timeline for the Market Warehouse inquiry view. */
export const shipmentTrackingEvents = pgTable(
  "shipment_tracking_events",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    shipmentId: varchar("shipmentId", { length: 128 }).notNull(),
    goodsId: varchar("goodsId", { length: 128 }),
    eventType: enumText("eventType", marketEventTypeValues).notNull(),
    stage: enumText("stage", marketStageValues).notNull(),
    status: varchar("status", { length: 128 }).notNull(),
    actorId: int("actorId")
      .notNull()
      .references(() => users.id),
    actorName: varchar("actorName", { length: 320 }).notNull(),
    actorRole: enumText("actorRole", appRoleValues).notNull(),
    officeId: varchar("officeId", { length: 32 }),
    reason: varchar("reason", { length: 500 }),
    requestKey: varchar("requestKey", { length: 128 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("shipment_tracking_events_request_unique").on(table.requestKey),
    index("shipment_tracking_events_shipment_created_idx").on(
      table.shipmentId,
      table.createdAt
    ),
    index("shipment_tracking_events_goods_created_idx").on(
      table.goodsId,
      table.createdAt
    ),
    index("shipment_tracking_events_office_created_idx").on(
      table.officeId,
      table.createdAt
    ),
  ]
);

/** One row per user/changeId makes sync retries safe and replayable. */
export const syncReceipts = pgTable(
  "sync_receipts",
  {
    id: serial("id").primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    changeId: varchar("changeId", { length: 128 }).notNull(),
    result: jsonb("result").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("sync_receipts_user_change_unique").on(
      table.userId,
      table.changeId
    ),
  ]
);

/** Unique identity/tracking keys are separate so a tracking-number collision is atomic. */
export const recordKeys = pgTable(
  "record_keys",
  {
    id: serial("id").primaryKey(),
    keyType: enumText("keyType", [
      "account-id",
      "shipment-id",
      "shipment-tracking",
      "invoice-id",
    ]).notNull(),
    keyValue: varchar("keyValue", { length: 128 }).notNull(),
    entity: enumText("entity", recordEntityValues).notNull(),
    recordId: varchar("recordId", { length: 128 }).notNull(),
  },
  table => [
    uniqueIndex("record_keys_type_value_unique").on(
      table.keyType,
      table.keyValue
    ),
  ]
);

/** Singleton office payment-method settings. A missing row means the version-zero defaults apply. */
export const officeSettings = pgTable("office_settings", {
  id: int("id").primaryKey().default(1),
  office: varchar("office", { length: 32 }).notNull(),
  methods: jsonb("methods").notNull(),
  version: int("version").notNull().default(0),
  updatedBy: int("updatedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

/** Hash-chained append-only audit events; immutability is enforced by application transactions (TiDB has no unsupported triggers here). */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: serial("id").primaryKey(),
    sequence: int("sequence").notNull(),
    actorId: int("actorId").notNull(),
    actorName: varchar("actorName", { length: 320 }).notNull(),
    role: enumText("role", appRoleValues).notNull(),
    entity: varchar("entity", { length: 64 }).notNull(),
    recordId: varchar("recordId", { length: 128 }).notNull(),
    action: varchar("action", { length: 64 }).notNull(),
    beforeData: jsonb("beforeData"),
    afterData: jsonb("afterData"),
    beforeVersion: int("beforeVersion"),
    afterVersion: int("afterVersion"),
    requestKey: varchar("requestKey", { length: 128 }).notNull(),
    previousHash: varchar("previousHash", { length: 64 }).notNull(),
    eventHash: varchar("eventHash", { length: 64 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("audit_events_sequence_unique").on(table.sequence)]
);

/** Singleton chain head locked by every audit append. */
export const auditHeads = pgTable("audit_heads", {
  id: int("id").primaryKey().default(1),
  sequence: int("sequence").notNull().default(0),
  lastHash: varchar("lastHash", { length: 64 }).notNull().default(""),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const financeEntryKinds = [
  "opening_balance",
  "daily_expense",
  "monthly_expense",
  "shipment_cost",
  "shipment_revenue",
  "invoice_revenue",
  "customer_debt",
  "debt_payment",
  "collection",
  "customer_credit",
  "customer_debit",
  "profit_withdrawal",
] as const;
export const financeCurrencies = [
  "MRU",
  "AED",
  "TRY",
  "CNY",
  "USD",
  "EUR",
] as const;

/** Immutable finance facts. The complete contract object is retained in data. */
export const financeEntries = pgTable(
  "finance_entries",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    kind: enumText("kind", financeEntryKinds).notNull(),
    officeId: varchar("officeId", { length: 32 }).notNull(),
    currency: enumText("currency", financeCurrencies).notNull(),
    data: jsonb("data").notNull(),
    invoiceId: varchar("invoiceId", { length: 128 }),
    shipmentId: varchar("shipmentId", { length: 128 }),
    actorId: int("actorId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("finance_entries_id_unique").on(table.id)]
);

/** Command receipts are actor-scoped and hash-bound, so replay with altered payload is rejected. */
export const financeReceipts = pgTable(
  "finance_receipts",
  {
    id: serial("id").primaryKey(),
    actorId: int("actorId")
      .notNull()
      .references(() => users.id),
    commandId: varchar("commandId", { length: 128 }).notNull(),
    payloadHash: varchar("payloadHash", { length: 64 }).notNull(),
    result: jsonb("result").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("finance_receipts_actor_command_unique").on(
      table.actorId,
      table.commandId
    ),
  ]
);

/** Claimed shipment goods prevent a good from being invoiced twice. */
export const financeGoods = pgTable(
  "finance_goods",
  {
    id: serial("id").primaryKey(),
    shipmentId: varchar("shipmentId", { length: 128 }).notNull(),
    goodsId: varchar("goodsId", { length: 128 }).notNull(),
    invoiceId: varchar("invoiceId", { length: 128 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("finance_goods_shipment_goods_unique").on(
      table.shipmentId,
      table.goodsId
    ),
  ]
);

/** Append-only delegation history. Existing member_roles permissions remain the compatibility source. */
export const permissionDelegations = pgTable(
  "permission_delegations",
  {
    id: serial("id").primaryKey(),
    targetUserId: int("targetUserId")
      .notNull()
      .references(() => users.id),
    officeId: varchar("officeId", { length: 32 }),
    permissionKey: varchar("permissionKey", { length: 64 }).notNull(),
    level: enumText("level", ["none", "view", "manage"]).notNull(),
    delegatedBy: int("delegatedBy")
      .notNull()
      .references(() => users.id),
    status: enumText("status", ["active", "revoked"])
      .notNull()
      .default("active"),
    reason: varchar("reason", { length: 500 }),
    version: int("version").notNull().default(1),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    revokedAt: timestamp("revokedAt"),
  },
  table => [
    index("permission_delegations_target_idx").on(table.targetUserId),
    index("permission_delegations_office_idx").on(table.officeId),
  ]
);

/** Independent invoice correction facts; original invoice data is never rewritten. */
export const invoiceAdjustments = pgTable(
  "invoice_adjustments",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    invoiceId: varchar("invoiceId", { length: 128 }).notNull(),
    officeId: varchar("officeId", { length: 32 }).notNull(),
    direction: enumText("direction", ["increase", "decrease"]).notNull(),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    actorId: int("actorId")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("invoice_adjustments_invoice_idx").on(table.invoiceId),
    index("invoice_adjustments_office_idx").on(table.officeId),
  ]
);

export const cashRegisterStatuses = ["open", "closed"] as const;
export const cashMovementKinds = [
  "receipt",
  "expense",
  "closing_adjustment",
] as const;

/** One cash register session per office/currency; historical sessions are retained. */
export const cashRegisters = pgTable(
  "cash_registers",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    officeId: varchar("officeId", { length: 32 }).notNull(),
    currency: enumText("currency", financeCurrencies).notNull(),
    openingBalance: decimal("openingBalance", {
      precision: 18,
      scale: 2,
    }).notNull(),
    status: enumText("status", cashRegisterStatuses).notNull().default("open"),
    openedBy: int("openedBy")
      .notNull()
      .references(() => users.id),
    closedBy: int("closedBy").references(() => users.id),
    openedAt: timestamp("openedAt").defaultNow().notNull(),
    closedAt: timestamp("closedAt"),
    version: int("version").notNull().default(1),
  },
  table => [
    index("cash_registers_office_status_idx").on(table.officeId, table.status),
  ]
);

/** Append-only cash movements linked to a register and optionally an invoice. */
export const cashMovements = pgTable(
  "cash_movements",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    registerId: varchar("registerId", { length: 128 }).notNull(),
    officeId: varchar("officeId", { length: 32 }).notNull(),
    kind: enumText("kind", cashMovementKinds).notNull(),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
    currency: enumText("currency", financeCurrencies).notNull(),
    invoiceId: varchar("invoiceId", { length: 128 }),
    actorId: int("actorId")
      .notNull()
      .references(() => users.id),
    data: jsonb("data"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("cash_movements_register_idx").on(table.registerId),
    index("cash_movements_office_idx").on(table.officeId),
  ]
);

/** Immutable tariff snapshot captured when a shipment is created or repriced. */
export const shipmentTariffSnapshots = pgTable(
  "shipment_tariff_snapshots",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    shipmentId: varchar("shipmentId", { length: 128 }).notNull(),
    officeId: varchar("officeId", { length: 32 }).notNull(),
    serviceType: varchar("serviceType", { length: 64 }).notNull(),
    currency: enumText("currency", financeCurrencies).notNull(),
    pricePerKg: decimal("pricePerKg", { precision: 18, scale: 2 }).notNull(),
    pricePerKgMRU: decimal("pricePerKgMRU", { precision: 18, scale: 2 }),
    capturedBy: int("capturedBy")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    data: jsonb("data"),
  },
  table => [
    index("shipment_tariff_snapshots_shipment_idx").on(table.shipmentId),
    index("shipment_tariff_snapshots_office_idx").on(table.officeId),
  ]
);

/** Append-only warehouse placement events; the current shelf is derived from the latest event. */
export const warehouseLocationEvents = pgTable(
  "warehouse_location_events",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    shipmentId: varchar("shipmentId", { length: 128 }).notNull(),
    goodsId: varchar("goodsId", { length: 128 }).notNull(),
    officeId: varchar("officeId", { length: 32 }).notNull(),
    warehouseCode: varchar("warehouseCode", { length: 32 }).notNull(),
    shelfCode: varchar("shelfCode", { length: 32 }).notNull(),
    locationCode: varchar("locationCode", { length: 80 }).notNull(),
    action: enumText("action", ["shelve", "release", "deliver"]).notNull(),
    expectedVersion: int("expectedVersion").notNull(),
    actorId: int("actorId")
      .notNull()
      .references(() => users.id),
    requestKey: varchar("requestKey", { length: 128 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("warehouse_location_events_goods_idx").on(table.goodsId),
    index("warehouse_location_events_shipment_idx").on(table.shipmentId),
    uniqueIndex("warehouse_location_events_request_unique").on(
      table.requestKey
    ),
  ]
);

export type MemberRole = typeof memberRoles.$inferSelect;
export type LocalSession = typeof localSessions.$inferSelect;
export type RecordRow = typeof records.$inferSelect;
export type SyncReceipt = typeof syncReceipts.$inferSelect;
export type OfficeSettingsRow = typeof officeSettings.$inferSelect;
export type AuditEventRow = typeof auditEvents.$inferSelect;
export type FinanceEntryRow = typeof financeEntries.$inferSelect;
export type FinanceReceiptRow = typeof financeReceipts.$inferSelect;
export type FinanceGoodsRow = typeof financeGoods.$inferSelect;
export type PermissionDelegationRow = typeof permissionDelegations.$inferSelect;
export type InvoiceAdjustmentRow = typeof invoiceAdjustments.$inferSelect;
export type CashRegisterRow = typeof cashRegisters.$inferSelect;
export type CashMovementRow = typeof cashMovements.$inferSelect;
export type ShipmentTariffSnapshotRow =
  typeof shipmentTariffSnapshots.$inferSelect;
export type WarehouseLocationEventRow =
  typeof warehouseLocationEvents.$inferSelect;

/** Append-only published rate versions, used to verify creation-time tariffs. */
export const officeTariffHistory = pgTable(
  "office_tariff_history",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    officeId: varchar("officeId", { length: 32 }).notNull(),
    profileVersion: int("profileVersion").notNull(),
    announcedAt: timestamp("announcedAt", { precision: 3 }).notNull(),
    shippingRates: jsonb("shippingRates"),
    sourceShippingRates: jsonb("sourceShippingRates"),
    recordedBy: int("recordedBy"),
    recordedAt: timestamp("recordedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("office_tariff_history_version_unique").on(
      table.officeId,
      table.profileVersion
    ),
    index("office_tariff_history_effective_idx").on(
      table.officeId,
      table.announcedAt
    ),
  ]
);
export type OfficeTariffHistoryRow = typeof officeTariffHistory.$inferSelect;

/** Permanent operational tombstones. Originals remain untouched for forensic audit. */
export const entityLifecycle = pgTable(
  "entity_lifecycle",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    entity: enumText("entity", [
      "shipment",
      "invoice",
      "finance_entry",
      "employee",
      "public_employee",
      "account",
    ]).notNull(),
    recordId: varchar("recordId", { length: 128 }).notNull(),
    action: enumText("action", ["delete", "void", "disable"]).notNull(),
    officeId: varchar("officeId", { length: 32 }),
    reason: varchar("reason", { length: 500 }).notNull(),
    expectedVersion: int("expectedVersion").notNull(),
    actorId: int("actorId")
      .notNull()
      .references(() => users.id),
    requestKey: varchar("requestKey", { length: 128 }).notNull(),
    snapshot: jsonb("snapshot"),
    createdAt: timestamp("createdAt", { precision: 3 })
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .notNull(),
  },
  table => [
    uniqueIndex("entity_lifecycle_record_unique").on(
      table.entity,
      table.recordId
    ),
    uniqueIndex("entity_lifecycle_request_unique").on(
      table.actorId,
      table.requestKey
    ),
    index("entity_lifecycle_office_idx").on(table.officeId),
  ]
);

/** Signed contra effects linked to immutable original entries; never delete posted facts. */
export const financeReversals = pgTable(
  "finance_reversals",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    lifecycleId: varchar("lifecycleId", { length: 128 }).notNull(),
    originalEntryId: varchar("originalEntryId", { length: 128 }).notNull(),
    originalKind: varchar("originalKind", { length: 64 }).notNull(),
    officeId: varchar("officeId", { length: 32 }).notNull(),
    currency: enumText("currency", financeCurrencies).notNull(),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
    invoiceId: varchar("invoiceId", { length: 128 }),
    shipmentId: varchar("shipmentId", { length: 128 }),
    customerId: varchar("customerId", { length: 128 }),
    actorId: int("actorId")
      .notNull()
      .references(() => users.id),
    data: jsonb("data").notNull(),
    createdAt: timestamp("createdAt", { precision: 3 })
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .notNull(),
  },
  table => [
    uniqueIndex("finance_reversals_original_unique").on(table.originalEntryId),
    index("finance_reversals_lifecycle_idx").on(table.lifecycleId),
    index("finance_reversals_office_currency_idx").on(
      table.officeId,
      table.currency
    ),
  ]
);

/** Frozen per-good charge components; export and destination charges are not billed twice. */
export const shipmentChargeComponents = pgTable(
  "shipment_charge_components",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    shipmentId: varchar("shipmentId", { length: 128 }).notNull(),
    goodsId: varchar("goodsId", { length: 128 }).notNull(),
    chargeKey: varchar("chargeKey", { length: 128 }).notNull(),
    kind: enumText("kind", ["export", "destination_local"]).notNull(),
    officeId: varchar("officeId", { length: 32 }).notNull(),
    currency: enumText("currency", financeCurrencies).notNull(),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
    actorId: int("actorId")
      .notNull()
      .references(() => users.id),
    requestKey: varchar("requestKey", { length: 128 }).notNull(),
    data: jsonb("data").notNull(),
    createdAt: timestamp("createdAt", { precision: 3 })
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .notNull(),
  },
  table => [
    uniqueIndex("shipment_charge_component_unique").on(
      table.shipmentId,
      table.goodsId,
      table.chargeKey
    ),
    index("shipment_charge_components_office_idx").on(
      table.officeId,
      table.currency
    ),
    index("shipment_charge_components_shipment_idx").on(table.shipmentId),
  ]
);

/** Append-only billing/payment/void allocations, not a replacement for old goods claims. */
export const shipmentChargeAllocations = pgTable(
  "shipment_charge_allocations",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    componentId: varchar("componentId", { length: 128 }).notNull(),
    invoiceId: varchar("invoiceId", { length: 128 }).notNull(),
    kind: enumText("kind", ["invoice", "payment", "void"]).notNull(),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
    actorId: int("actorId")
      .notNull()
      .references(() => users.id),
    requestKey: varchar("requestKey", { length: 128 }).notNull(),
    data: jsonb("data"),
    createdAt: timestamp("createdAt", { precision: 3 })
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .notNull(),
  },
  table => [
    uniqueIndex("shipment_charge_allocation_request_unique").on(
      table.componentId,
      table.kind,
      table.requestKey
    ),
    index("shipment_charge_allocations_invoice_idx").on(table.invoiceId),
    index("shipment_charge_allocations_component_idx").on(table.componentId),
  ]
);

/** Explicit availability events; role and office snapshots never grant authority. */
export const dutyEvents = pgTable(
  "duty_events",
  {
    id: serial("id").primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    actorId: int("actorId")
      .notNull()
      .references(() => users.id),
    role: enumText("role", appRoleValues).notNull(),
    officeId: varchar("officeId", { length: 32 }).notNull(),
    status: enumText("status", ["on", "off"]).notNull(),
    reason: varchar("reason", { length: 64 }).notNull(),
    membershipVersion: int("membershipVersion").notNull(),
    expiresAt: timestamp("expiresAt", { precision: 3 }),
    requestKey: varchar("requestKey", { length: 128 }).notNull(),
    createdAt: timestamp("createdAt", { precision: 3 })
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .notNull(),
  },
  table => [
    uniqueIndex("duty_events_request_unique").on(
      table.userId,
      table.requestKey
    ),
    index("duty_events_user_id_idx").on(table.userId, table.id),
    index("duty_events_office_id_idx").on(table.officeId, table.id),
  ]
);
export type EntityLifecycleRow = typeof entityLifecycle.$inferSelect;
export type FinanceReversalRow = typeof financeReversals.$inferSelect;
export type ShipmentChargeComponentRow =
  typeof shipmentChargeComponents.$inferSelect;
export type ShipmentChargeAllocationRow =
  typeof shipmentChargeAllocations.$inferSelect;
export type DutyEventRow = typeof dutyEvents.$inferSelect;

/** Root-approved delegation ceilings; a policy applies only to its membership version. */
export const officeDelegationPolicies = pgTable(
  "office_delegation_policies",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    managerUserId: int("managerUserId")
      .notNull()
      .references(() => users.id),
    officeId: varchar("officeId", { length: 32 }).notNull(),
    managerMembershipVersion: int("managerMembershipVersion").notNull(),
    policyVersion: int("policyVersion").notNull(),
    permissions: jsonb("permissions").$type<PermissionMap>().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    actorId: int("actorId")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("createdAt", { precision: 3 })
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .notNull(),
  },
  table => [
    uniqueIndex("office_delegation_policy_version_unique").on(
      table.managerUserId,
      table.officeId,
      table.policyVersion
    ),
    index("office_delegation_policy_manager_idx").on(
      table.managerUserId,
      table.officeId
    ),
  ]
);

/** Explicit, revocable customer ownership. Names, phone numbers and self-claims never grant access. */
export const customerShipmentAccess = pgTable(
  "customer_shipment_access",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    customerAccountId: varchar("customerAccountId", { length: 128 }).notNull(),
    shipmentId: varchar("shipmentId", { length: 128 }).notNull(),
    goodsId: varchar("goodsId", { length: 128 }).notNull(),
    officeId: varchar("officeId", { length: 32 }).notNull(),
    status: enumText("status", ["active", "revoked"])
      .notNull()
      .default("active"),
    version: int("version").notNull().default(1),
    grantedBy: int("grantedBy")
      .notNull()
      .references(() => users.id),
    updatedBy: int("updatedBy")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("createdAt", { precision: 3 })
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .notNull(),
    updatedAt: timestamp("updatedAt", { precision: 3 })
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .notNull(),
  },
  table => [
    uniqueIndex("customer_shipment_access_goods_unique").on(
      table.shipmentId,
      table.goodsId
    ),
    index("customer_shipment_access_user_idx").on(table.userId, table.status),
    index("customer_shipment_access_account_idx").on(
      table.customerAccountId,
      table.officeId
    ),
  ]
);

/** One immutable expense fact per explicitly approved shipment-cost reference. */
export const shipmentCostApprovals = pgTable(
  "shipment_cost_approvals",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    shipmentId: varchar("shipmentId", { length: 128 }).notNull(),
    officeId: varchar("officeId", { length: 32 }).notNull(),
    currency: enumText("currency", financeCurrencies).notNull(),
    referenceKey: varchar("referenceKey", { length: 128 }).notNull(),
    financeEntryId: varchar("financeEntryId", { length: 128 }).notNull(),
    actorId: int("actorId")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("createdAt", { precision: 3 })
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .notNull(),
  },
  table => [
    uniqueIndex("shipment_cost_approval_reference_unique").on(
      table.shipmentId,
      table.officeId,
      table.referenceKey
    ),
    index("shipment_cost_approval_entry_idx").on(table.financeEntryId),
  ]
);

/** Per-source payment settings; legacy Nouakchott office_settings is not rewritten. */
export const officePaymentSettings = pgTable("office_payment_settings", {
  officeId: varchar("officeId", { length: 32 }).primaryKey(),
  methods: jsonb("methods").notNull(),
  version: int("version").notNull().default(1),
  updatedBy: int("updatedBy")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("createdAt", { precision: 3 })
    .default(sql`CURRENT_TIMESTAMP(3)`)
    .notNull(),
  updatedAt: timestamp("updatedAt", { precision: 3 })
    .default(sql`CURRENT_TIMESTAMP(3)`)
    .notNull(),
});

/** Actual wallet cash effects. Voiding an invoice alone never implies a refund. */
export const walletMovements = pgTable(
  "wallet_movements",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    officeId: varchar("officeId", { length: 32 }).notNull(),
    methodId: varchar("methodId", { length: 64 }).notNull(),
    currency: enumText("currency", financeCurrencies).notNull(),
    kind: enumText("kind", ["receipt", "refund"]).notNull(),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
    invoiceId: varchar("invoiceId", { length: 128 }).notNull(),
    financeEntryId: varchar("financeEntryId", { length: 128 }).notNull(),
    actorId: int("actorId")
      .notNull()
      .references(() => users.id),
    data: jsonb("data"),
    createdAt: timestamp("createdAt", { precision: 3 })
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .notNull(),
  },
  table => [
    uniqueIndex("wallet_movement_entry_unique").on(table.financeEntryId),
    index("wallet_movements_office_wallet_idx").on(
      table.officeId,
      table.methodId,
      table.currency
    ),
    index("wallet_movements_invoice_idx").on(table.invoiceId),
  ]
);

export type OfficeDelegationPolicyRow =
  typeof officeDelegationPolicies.$inferSelect;
export type CustomerShipmentAccessRow =
  typeof customerShipmentAccess.$inferSelect;
export type ShipmentCostApprovalRow = typeof shipmentCostApprovals.$inferSelect;
export type OfficePaymentSettingsRow =
  typeof officePaymentSettings.$inferSelect;
export type WalletMovementRow = typeof walletMovements.$inferSelect;

/** Append-only explicit price overrides; original shipment and announcement remain immutable. */
export const shipmentPriceOverrides = pgTable(
  "shipment_price_overrides",
  {
    id: varchar("id", { length: 190 }).primaryKey(),
    shipmentId: varchar("shipmentId", { length: 128 }).notNull(),
    officeId: varchar("officeId", { length: 32 }).notNull(),
    side: enumText("side", ["source", "destination"]).notNull(),
    currency: enumText("currency", financeCurrencies).notNull(),
    pricePerKg: decimal("pricePerKg", { precision: 18, scale: 2 }).notNull(),
    revision: int("revision").notNull(),
    recordVersion: int("recordVersion").notNull(),
    reason: text("reason").notNull(),
    previousOverrideId: varchar("previousOverrideId", { length: 190 }),
    requestKey: varchar("requestKey", { length: 190 }).notNull(),
    approvedBy: int("approvedBy")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("createdAt", { precision: 3 })
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .notNull(),
  },
  table => [
    uniqueIndex("shipment_price_override_request_unique").on(table.requestKey),
    uniqueIndex("shipment_price_override_revision_unique").on(
      table.shipmentId,
      table.officeId,
      table.revision
    ),
    index("shipment_price_override_shipment_idx").on(table.shipmentId),
  ]
);
export type ShipmentPriceOverrideRow =
  typeof shipmentPriceOverrides.$inferSelect;

/** Transactional mutex for opening cash sessions; no legacy register is rewritten. */
export const cashRegisterLocks = pgTable(
  "cash_register_locks",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    officeId: varchar("officeId", { length: 32 }).notNull(),
    currency: enumText("currency", financeCurrencies).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("cash_register_locks_office_currency_uq").on(
      table.officeId,
      table.currency
    ),
  ]
);
