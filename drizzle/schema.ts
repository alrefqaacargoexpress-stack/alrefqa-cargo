import { int, json, mysqlEnum, mysqlTable, text, timestamp, varchar, uniqueIndex } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
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
export const appRoleValues = ["admin", "staff", "accountant", "viewer"] as const;

/** Durable application role assignments. The users.role column remains the root admin flag. */
export const memberRoles = mysqlTable("member_roles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  role: mysqlEnum("role", appRoleValues).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("member_roles_user_unique").on(table.userId)]);

/** Generic records preserve the shared contract while keeping writes additive and versioned. */
export const records = mysqlTable("records", {
  id: int("id").autoincrement().primaryKey(),
  entity: mysqlEnum("entity", recordEntityValues).notNull(),
  recordId: varchar("recordId", { length: 128 }).notNull(),
  version: int("version").notNull().default(1),
  data: json("data").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  updatedBy: int("updatedBy").notNull(),
}, table => [uniqueIndex("records_entity_record_unique").on(table.entity, table.recordId)]);

/** One row per user/changeId makes sync retries safe and replayable. */
export const syncReceipts = mysqlTable("sync_receipts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  changeId: varchar("changeId", { length: 128 }).notNull(),
  result: json("result").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("sync_receipts_user_change_unique").on(table.userId, table.changeId)]);

/** Unique identity/tracking keys are separate so a tracking-number collision is atomic. */
export const recordKeys = mysqlTable("record_keys", {
  id: int("id").autoincrement().primaryKey(),
  keyType: mysqlEnum("keyType", ["account-id", "shipment-id", "shipment-tracking", "invoice-id"]).notNull(),
  keyValue: varchar("keyValue", { length: 128 }).notNull(),
  entity: mysqlEnum("entity", recordEntityValues).notNull(),
  recordId: varchar("recordId", { length: 128 }).notNull(),
}, table => [uniqueIndex("record_keys_type_value_unique").on(table.keyType, table.keyValue)]);

export type MemberRole = typeof memberRoles.$inferSelect;
export type RecordRow = typeof records.$inferSelect;
export type SyncReceipt = typeof syncReceipts.$inferSelect;
