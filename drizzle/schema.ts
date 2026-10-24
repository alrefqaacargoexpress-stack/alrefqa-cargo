import {
  int,
  json,
  mysqlEnum,
  mysqlTable,
  boolean,
  decimal,
  text,
  timestamp,
  varchar,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

import type { PermissionMap } from "../shared/permissions";
/** Core user table backing auth flow. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  loginMethod: varchar("loginMethod", { length: 64 }),
  accountType: mysqlEnum("accountType", ["customer", "employee"])
    .default("employee")
    .notNull(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  mustChangePassword: boolean("mustChangePassword").default(false).notNull(),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** Application-owned email sessions. Manus OAuth sessions remain in webdev_app_session. */
export const localSessions = mysqlTable(
  "local_sessions",
  {
    id: int("id").autoincrement().primaryKey(),
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
export const emailEnrollments = mysqlTable("email_enrollments", {
  tokenHash: varchar("tokenHash", { length: 64 }).primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
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
export const memberRoles = mysqlTable(
  "member_roles",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    role: mysqlEnum("role", appRoleValues).notNull(),
    /** null preserves legacy unrestricted membership; JSON is an explicit office allow-list. */
    offices: json("offices"),
    /** Optional finance home office; null preserves legacy unrestricted membership. */
    homeOffice: varchar("homeOffice", { length: 32 }),
    /** Explicit opt-in for source-warehouse stage updates; never grants financial access. */
    canUpdateTracking: boolean("canUpdateTracking").notNull().default(false),
    permissions: json("permissions").$type<PermissionMap>(),
    delegatedBy: int("delegatedBy"),
    /** Optimistic-concurrency version for admin membership edits. */
    version: int("version").notNull().default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("member_roles_user_unique").on(table.userId)]
);

/** Four public office profiles; profile JSON is validated by shared/branches.ts at the API boundary. */
export const officeProfiles = mysqlTable(
  "office_profiles",
  {
    officeId: varchar("officeId", { length: 32 }).primaryKey(),
    version: int("version").notNull().default(0),
    profile: json("profile").notNull(),
    updatedBy: int("updatedBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("office_profiles_office_unique").on(table.officeId)]
);

/** Generic records preserve the shared contract while keeping writes additive and versioned. */
export const records = mysqlTable(
  "records",
  {
    id: int("id").autoincrement().primaryKey(),
    entity: mysqlEnum("entity", recordEntityValues).notNull(),
    recordId: varchar("recordId", { length: 128 }).notNull(),
    version: int("version").notNull().default(1),
    data: json("data").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    updatedBy: int("updatedBy").notNull(),
  },
  table => [
    uniqueIndex("records_entity_record_unique").on(
      table.entity,
      table.recordId
    ),
  ]
);

/** One row per user/changeId makes sync retries safe and replayable. */
export const syncReceipts = mysqlTable(
  "sync_receipts",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    changeId: varchar("changeId", { length: 128 }).notNull(),
    result: json("result").notNull(),
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
export const recordKeys = mysqlTable(
  "record_keys",
  {
    id: int("id").autoincrement().primaryKey(),
    keyType: mysqlEnum("keyType", [
      "account-id",
      "shipment-id",
      "shipment-tracking",
      "invoice-id",
    ]).notNull(),
    keyValue: varchar("keyValue", { length: 128 }).notNull(),
    entity: mysqlEnum("entity", recordEntityValues).notNull(),
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
export const officeSettings = mysqlTable("office_settings", {
  id: int("id").primaryKey().default(1),
  office: varchar("office", { length: 32 }).notNull(),
  methods: json("methods").notNull(),
  version: int("version").notNull().default(0),
  updatedBy: int("updatedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Hash-chained append-only audit events; immutability is enforced by application transactions (TiDB has no unsupported triggers here). */
export const auditEvents = mysqlTable(
  "audit_events",
  {
    id: int("id").autoincrement().primaryKey(),
    sequence: int("sequence").notNull(),
    actorId: int("actorId").notNull(),
    actorName: varchar("actorName", { length: 320 }).notNull(),
    role: mysqlEnum("role", appRoleValues).notNull(),
    entity: varchar("entity", { length: 64 }).notNull(),
    recordId: varchar("recordId", { length: 128 }).notNull(),
    action: varchar("action", { length: 64 }).notNull(),
    beforeData: json("beforeData"),
    afterData: json("afterData"),
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
export const auditHeads = mysqlTable("audit_heads", {
  id: int("id").primaryKey().default(1),
  sequence: int("sequence").notNull().default(0),
  lastHash: varchar("lastHash", { length: 64 }).notNull().default(""),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
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
export const financeEntries = mysqlTable(
  "finance_entries",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    kind: mysqlEnum("kind", financeEntryKinds).notNull(),
    officeId: varchar("officeId", { length: 32 }).notNull(),
    currency: mysqlEnum("currency", financeCurrencies).notNull(),
    data: json("data").notNull(),
    invoiceId: varchar("invoiceId", { length: 128 }),
    shipmentId: varchar("shipmentId", { length: 128 }),
    actorId: int("actorId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("finance_entries_id_unique").on(table.id)]
);

/** Command receipts are actor-scoped and hash-bound, so replay with altered payload is rejected. */
export const financeReceipts = mysqlTable(
  "finance_receipts",
  {
    id: int("id").autoincrement().primaryKey(),
    actorId: int("actorId")
      .notNull()
      .references(() => users.id),
    commandId: varchar("commandId", { length: 128 }).notNull(),
    payloadHash: varchar("payloadHash", { length: 64 }).notNull(),
    result: json("result").notNull(),
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
export const financeGoods = mysqlTable(
  "finance_goods",
  {
    id: int("id").autoincrement().primaryKey(),
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
export const permissionDelegations = mysqlTable(
  "permission_delegations",
  {
    id: int("id").autoincrement().primaryKey(),
    targetUserId: int("targetUserId")
      .notNull()
      .references(() => users.id),
    officeId: varchar("officeId", { length: 32 }),
    permissionKey: varchar("permissionKey", { length: 64 }).notNull(),
    level: mysqlEnum("level", ["none", "view", "manage"]).notNull(),
    delegatedBy: int("delegatedBy")
      .notNull()
      .references(() => users.id),
    status: mysqlEnum("status", ["active", "revoked"]).notNull().default("active"),
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
export const invoiceAdjustments = mysqlTable(
  "invoice_adjustments",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    invoiceId: varchar("invoiceId", { length: 128 }).notNull(),
    officeId: varchar("officeId", { length: 32 }).notNull(),
    direction: mysqlEnum("direction", ["increase", "decrease"]).notNull(),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    actorId: int("actorId").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("invoice_adjustments_invoice_idx").on(table.invoiceId),
    index("invoice_adjustments_office_idx").on(table.officeId),
  ]
);

export const cashRegisterStatuses = ["open", "closed"] as const;
export const cashMovementKinds = ["receipt", "expense", "closing_adjustment"] as const;

/** One cash register session per office/currency; historical sessions are retained. */
export const cashRegisters = mysqlTable(
  "cash_registers",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    officeId: varchar("officeId", { length: 32 }).notNull(),
    currency: mysqlEnum("currency", financeCurrencies).notNull(),
    openingBalance: decimal("openingBalance", { precision: 18, scale: 2 }).notNull(),
    status: mysqlEnum("status", cashRegisterStatuses).notNull().default("open"),
    openedBy: int("openedBy").notNull().references(() => users.id),
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
export const cashMovements = mysqlTable(
  "cash_movements",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    registerId: varchar("registerId", { length: 128 }).notNull(),
    officeId: varchar("officeId", { length: 32 }).notNull(),
    kind: mysqlEnum("kind", cashMovementKinds).notNull(),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
    currency: mysqlEnum("currency", financeCurrencies).notNull(),
    invoiceId: varchar("invoiceId", { length: 128 }),
    actorId: int("actorId").notNull().references(() => users.id),
    data: json("data"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("cash_movements_register_idx").on(table.registerId),
    index("cash_movements_office_idx").on(table.officeId),
  ]
);

/** Immutable tariff snapshot captured when a shipment is created or repriced. */
export const shipmentTariffSnapshots = mysqlTable(
  "shipment_tariff_snapshots",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    shipmentId: varchar("shipmentId", { length: 128 }).notNull(),
    officeId: varchar("officeId", { length: 32 }).notNull(),
    serviceType: varchar("serviceType", { length: 64 }).notNull(),
    currency: mysqlEnum("currency", financeCurrencies).notNull(),
    pricePerKg: decimal("pricePerKg", { precision: 18, scale: 2 }).notNull(),
    pricePerKgMRU: decimal("pricePerKgMRU", { precision: 18, scale: 2 }),
    capturedBy: int("capturedBy").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    data: json("data"),
  },
  table => [
    index("shipment_tariff_snapshots_shipment_idx").on(table.shipmentId),
    index("shipment_tariff_snapshots_office_idx").on(table.officeId),
  ]
);

/** Append-only warehouse placement events; the current shelf is derived from the latest event. */
export const warehouseLocationEvents = mysqlTable(
  "warehouse_location_events",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    shipmentId: varchar("shipmentId", { length: 128 }).notNull(),
    goodsId: varchar("goodsId", { length: 128 }).notNull(),
    officeId: varchar("officeId", { length: 32 }).notNull(),
    warehouseCode: varchar("warehouseCode", { length: 32 }).notNull(),
    shelfCode: varchar("shelfCode", { length: 32 }).notNull(),
    locationCode: varchar("locationCode", { length: 80 }).notNull(),
    action: mysqlEnum("action", ["shelve", "release", "deliver"]).notNull(),
    expectedVersion: int("expectedVersion").notNull(),
    actorId: int("actorId").notNull().references(() => users.id),
    requestKey: varchar("requestKey", { length: 128 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("warehouse_location_events_goods_idx").on(table.goodsId),
    index("warehouse_location_events_shipment_idx").on(table.shipmentId),
    uniqueIndex("warehouse_location_events_request_unique").on(table.requestKey),
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
export type ShipmentTariffSnapshotRow = typeof shipmentTariffSnapshots.$inferSelect;
export type WarehouseLocationEventRow = typeof warehouseLocationEvents.$inferSelect;
