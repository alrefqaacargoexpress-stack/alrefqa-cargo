import {
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

/** Core user table backing auth flow. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const recordEntityValues = ["account", "shipment", "invoice"] as const;
export const appRoleValues = [
  "admin",
  "staff",
  "accountant",
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

export type MemberRole = typeof memberRoles.$inferSelect;
export type RecordRow = typeof records.$inferSelect;
export type SyncReceipt = typeof syncReceipts.$inferSelect;
export type OfficeSettingsRow = typeof officeSettings.$inferSelect;
export type AuditEventRow = typeof auditEvents.$inferSelect;
export type FinanceEntryRow = typeof financeEntries.$inferSelect;
export type FinanceReceiptRow = typeof financeReceipts.$inferSelect;
export type FinanceGoodsRow = typeof financeGoods.$inferSelect;
