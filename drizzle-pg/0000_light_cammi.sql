CREATE TABLE "audit_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"sequence" integer NOT NULL,
	"actorId" integer NOT NULL,
	"actorName" varchar(320) NOT NULL,
	"role" text NOT NULL,
	"entity" varchar(64) NOT NULL,
	"recordId" varchar(128) NOT NULL,
	"action" varchar(64) NOT NULL,
	"beforeData" jsonb,
	"afterData" jsonb,
	"beforeVersion" integer,
	"afterVersion" integer,
	"requestKey" varchar(128) NOT NULL,
	"previousHash" varchar(64) NOT NULL,
	"eventHash" varchar(64) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_heads" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"lastHash" varchar(64) DEFAULT '' NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_movements" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"registerId" varchar(128) NOT NULL,
	"officeId" varchar(32) NOT NULL,
	"kind" text NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" text NOT NULL,
	"invoiceId" varchar(128),
	"actorId" integer NOT NULL,
	"data" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_register_locks" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"officeId" varchar(32) NOT NULL,
	"currency" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_registers" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"officeId" varchar(32) NOT NULL,
	"currency" text NOT NULL,
	"openingBalance" numeric(18, 2) NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"openedBy" integer NOT NULL,
	"closedBy" integer,
	"openedAt" timestamp DEFAULT now() NOT NULL,
	"closedAt" timestamp,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_shipment_access" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"customerAccountId" varchar(128) NOT NULL,
	"shipmentId" varchar(128) NOT NULL,
	"goodsId" varchar(128) NOT NULL,
	"officeId" varchar(32) NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"grantedBy" integer NOT NULL,
	"updatedBy" integer NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP(3) NOT NULL,
	"updatedAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "duty_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"actorId" integer NOT NULL,
	"role" text NOT NULL,
	"officeId" varchar(32) NOT NULL,
	"status" text NOT NULL,
	"reason" varchar(64) NOT NULL,
	"membershipVersion" integer NOT NULL,
	"expiresAt" timestamp (3),
	"requestKey" varchar(128) NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_enrollments" (
	"tokenHash" varchar(64) PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"consumedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_lifecycle" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"recordId" varchar(128) NOT NULL,
	"action" text NOT NULL,
	"officeId" varchar(32),
	"reason" varchar(500) NOT NULL,
	"expectedVersion" integer NOT NULL,
	"actorId" integer NOT NULL,
	"requestKey" varchar(128) NOT NULL,
	"snapshot" jsonb,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_entries" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"officeId" varchar(32) NOT NULL,
	"currency" text NOT NULL,
	"data" jsonb NOT NULL,
	"invoiceId" varchar(128),
	"shipmentId" varchar(128),
	"actorId" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_goods" (
	"id" serial PRIMARY KEY NOT NULL,
	"shipmentId" varchar(128) NOT NULL,
	"goodsId" varchar(128) NOT NULL,
	"invoiceId" varchar(128) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"actorId" integer NOT NULL,
	"commandId" varchar(128) NOT NULL,
	"payloadHash" varchar(64) NOT NULL,
	"result" jsonb NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_reversals" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"lifecycleId" varchar(128) NOT NULL,
	"originalEntryId" varchar(128) NOT NULL,
	"originalKind" varchar(64) NOT NULL,
	"officeId" varchar(32) NOT NULL,
	"currency" text NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"invoiceId" varchar(128),
	"shipmentId" varchar(128),
	"customerId" varchar(128),
	"actorId" integer NOT NULL,
	"data" jsonb NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_adjustments" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"invoiceId" varchar(128) NOT NULL,
	"officeId" varchar(32) NOT NULL,
	"direction" text NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"reason" varchar(500) NOT NULL,
	"actorId" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "local_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tokenHash" varchar(64) NOT NULL,
	"userId" integer NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"role" text NOT NULL,
	"offices" jsonb,
	"homeOffice" varchar(32),
	"canUpdateTracking" boolean DEFAULT false NOT NULL,
	"permissions" jsonb,
	"delegatedBy" integer,
	"version" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "office_delegation_policies" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"managerUserId" integer NOT NULL,
	"officeId" varchar(32) NOT NULL,
	"managerMembershipVersion" integer NOT NULL,
	"policyVersion" integer NOT NULL,
	"permissions" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"actorId" integer NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "office_payment_settings" (
	"officeId" varchar(32) PRIMARY KEY NOT NULL,
	"methods" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updatedBy" integer NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP(3) NOT NULL,
	"updatedAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "office_profiles" (
	"officeId" varchar(32) PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"profile" jsonb NOT NULL,
	"updatedBy" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "office_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"office" varchar(32) NOT NULL,
	"methods" jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"updatedBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "office_tariff_history" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"officeId" varchar(32) NOT NULL,
	"profileVersion" integer NOT NULL,
	"announcedAt" timestamp (3) NOT NULL,
	"shippingRates" jsonb,
	"sourceShippingRates" jsonb,
	"recordedBy" integer,
	"recordedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permission_delegations" (
	"id" serial PRIMARY KEY NOT NULL,
	"targetUserId" integer NOT NULL,
	"officeId" varchar(32),
	"permissionKey" varchar(64) NOT NULL,
	"level" text NOT NULL,
	"delegatedBy" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"reason" varchar(500),
	"version" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"revokedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "record_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"keyType" text NOT NULL,
	"keyValue" varchar(128) NOT NULL,
	"entity" text NOT NULL,
	"recordId" varchar(128) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "records" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"recordId" varchar(128) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"data" jsonb NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"updatedBy" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipment_charge_allocations" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"componentId" varchar(128) NOT NULL,
	"invoiceId" varchar(128) NOT NULL,
	"kind" text NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"actorId" integer NOT NULL,
	"requestKey" varchar(128) NOT NULL,
	"data" jsonb,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipment_charge_components" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"shipmentId" varchar(128) NOT NULL,
	"goodsId" varchar(128) NOT NULL,
	"chargeKey" varchar(128) NOT NULL,
	"kind" text NOT NULL,
	"officeId" varchar(32) NOT NULL,
	"currency" text NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"actorId" integer NOT NULL,
	"requestKey" varchar(128) NOT NULL,
	"data" jsonb NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipment_cost_approvals" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"shipmentId" varchar(128) NOT NULL,
	"officeId" varchar(32) NOT NULL,
	"currency" text NOT NULL,
	"referenceKey" varchar(128) NOT NULL,
	"financeEntryId" varchar(128) NOT NULL,
	"actorId" integer NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipment_price_overrides" (
	"id" varchar(190) PRIMARY KEY NOT NULL,
	"shipmentId" varchar(128) NOT NULL,
	"officeId" varchar(32) NOT NULL,
	"side" text NOT NULL,
	"currency" text NOT NULL,
	"pricePerKg" numeric(18, 2) NOT NULL,
	"revision" integer NOT NULL,
	"recordVersion" integer NOT NULL,
	"reason" text NOT NULL,
	"previousOverrideId" varchar(190),
	"requestKey" varchar(190) NOT NULL,
	"approvedBy" integer NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipment_tariff_snapshots" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"shipmentId" varchar(128) NOT NULL,
	"officeId" varchar(32) NOT NULL,
	"serviceType" varchar(64) NOT NULL,
	"currency" text NOT NULL,
	"pricePerKg" numeric(18, 2) NOT NULL,
	"pricePerKgMRU" numeric(18, 2),
	"capturedBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"data" jsonb
);
--> statement-breakpoint
CREATE TABLE "sync_receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"changeId" varchar(128) NOT NULL,
	"result" jsonb NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"accountType" text DEFAULT 'employee' NOT NULL,
	"passwordHash" varchar(255),
	"mustChangePassword" boolean DEFAULT false NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "wallet_movements" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"officeId" varchar(32) NOT NULL,
	"methodId" varchar(64) NOT NULL,
	"currency" text NOT NULL,
	"kind" text NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"invoiceId" varchar(128) NOT NULL,
	"financeEntryId" varchar(128) NOT NULL,
	"actorId" integer NOT NULL,
	"data" jsonb,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_location_events" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"shipmentId" varchar(128) NOT NULL,
	"goodsId" varchar(128) NOT NULL,
	"officeId" varchar(32) NOT NULL,
	"warehouseCode" varchar(32) NOT NULL,
	"shelfCode" varchar(32) NOT NULL,
	"locationCode" varchar(80) NOT NULL,
	"action" text NOT NULL,
	"expectedVersion" integer NOT NULL,
	"actorId" integer NOT NULL,
	"requestKey" varchar(128) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_actorId_users_id_fk" FOREIGN KEY ("actorId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_openedBy_users_id_fk" FOREIGN KEY ("openedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_closedBy_users_id_fk" FOREIGN KEY ("closedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_shipment_access" ADD CONSTRAINT "customer_shipment_access_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_shipment_access" ADD CONSTRAINT "customer_shipment_access_grantedBy_users_id_fk" FOREIGN KEY ("grantedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_shipment_access" ADD CONSTRAINT "customer_shipment_access_updatedBy_users_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty_events" ADD CONSTRAINT "duty_events_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty_events" ADD CONSTRAINT "duty_events_actorId_users_id_fk" FOREIGN KEY ("actorId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_enrollments" ADD CONSTRAINT "email_enrollments_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_lifecycle" ADD CONSTRAINT "entity_lifecycle_actorId_users_id_fk" FOREIGN KEY ("actorId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_receipts" ADD CONSTRAINT "finance_receipts_actorId_users_id_fk" FOREIGN KEY ("actorId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_reversals" ADD CONSTRAINT "finance_reversals_actorId_users_id_fk" FOREIGN KEY ("actorId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_adjustments" ADD CONSTRAINT "invoice_adjustments_actorId_users_id_fk" FOREIGN KEY ("actorId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_sessions" ADD CONSTRAINT "local_sessions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_roles" ADD CONSTRAINT "member_roles_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_delegation_policies" ADD CONSTRAINT "office_delegation_policies_managerUserId_users_id_fk" FOREIGN KEY ("managerUserId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_delegation_policies" ADD CONSTRAINT "office_delegation_policies_actorId_users_id_fk" FOREIGN KEY ("actorId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_payment_settings" ADD CONSTRAINT "office_payment_settings_updatedBy_users_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_delegations" ADD CONSTRAINT "permission_delegations_targetUserId_users_id_fk" FOREIGN KEY ("targetUserId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_delegations" ADD CONSTRAINT "permission_delegations_delegatedBy_users_id_fk" FOREIGN KEY ("delegatedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_charge_allocations" ADD CONSTRAINT "shipment_charge_allocations_actorId_users_id_fk" FOREIGN KEY ("actorId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_charge_components" ADD CONSTRAINT "shipment_charge_components_actorId_users_id_fk" FOREIGN KEY ("actorId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_cost_approvals" ADD CONSTRAINT "shipment_cost_approvals_actorId_users_id_fk" FOREIGN KEY ("actorId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_price_overrides" ADD CONSTRAINT "shipment_price_overrides_approvedBy_users_id_fk" FOREIGN KEY ("approvedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_tariff_snapshots" ADD CONSTRAINT "shipment_tariff_snapshots_capturedBy_users_id_fk" FOREIGN KEY ("capturedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_receipts" ADD CONSTRAINT "sync_receipts_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_movements" ADD CONSTRAINT "wallet_movements_actorId_users_id_fk" FOREIGN KEY ("actorId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_location_events" ADD CONSTRAINT "warehouse_location_events_actorId_users_id_fk" FOREIGN KEY ("actorId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audit_events_sequence_unique" ON "audit_events" USING btree ("sequence");--> statement-breakpoint
CREATE INDEX "cash_movements_register_idx" ON "cash_movements" USING btree ("registerId");--> statement-breakpoint
CREATE INDEX "cash_movements_office_idx" ON "cash_movements" USING btree ("officeId");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_register_locks_office_currency_uq" ON "cash_register_locks" USING btree ("officeId","currency");--> statement-breakpoint
CREATE INDEX "cash_registers_office_status_idx" ON "cash_registers" USING btree ("officeId","status");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_shipment_access_goods_unique" ON "customer_shipment_access" USING btree ("shipmentId","goodsId");--> statement-breakpoint
CREATE INDEX "customer_shipment_access_user_idx" ON "customer_shipment_access" USING btree ("userId","status");--> statement-breakpoint
CREATE INDEX "customer_shipment_access_account_idx" ON "customer_shipment_access" USING btree ("customerAccountId","officeId");--> statement-breakpoint
CREATE UNIQUE INDEX "duty_events_request_unique" ON "duty_events" USING btree ("userId","requestKey");--> statement-breakpoint
CREATE INDEX "duty_events_user_id_idx" ON "duty_events" USING btree ("userId","id");--> statement-breakpoint
CREATE INDEX "duty_events_office_id_idx" ON "duty_events" USING btree ("officeId","id");--> statement-breakpoint
CREATE UNIQUE INDEX "entity_lifecycle_record_unique" ON "entity_lifecycle" USING btree ("entity","recordId");--> statement-breakpoint
CREATE UNIQUE INDEX "entity_lifecycle_request_unique" ON "entity_lifecycle" USING btree ("actorId","requestKey");--> statement-breakpoint
CREATE INDEX "entity_lifecycle_office_idx" ON "entity_lifecycle" USING btree ("officeId");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_entries_id_unique" ON "finance_entries" USING btree ("id");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_goods_shipment_goods_unique" ON "finance_goods" USING btree ("shipmentId","goodsId");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_receipts_actor_command_unique" ON "finance_receipts" USING btree ("actorId","commandId");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_reversals_original_unique" ON "finance_reversals" USING btree ("originalEntryId");--> statement-breakpoint
CREATE INDEX "finance_reversals_lifecycle_idx" ON "finance_reversals" USING btree ("lifecycleId");--> statement-breakpoint
CREATE INDEX "finance_reversals_office_currency_idx" ON "finance_reversals" USING btree ("officeId","currency");--> statement-breakpoint
CREATE INDEX "invoice_adjustments_invoice_idx" ON "invoice_adjustments" USING btree ("invoiceId");--> statement-breakpoint
CREATE INDEX "invoice_adjustments_office_idx" ON "invoice_adjustments" USING btree ("officeId");--> statement-breakpoint
CREATE UNIQUE INDEX "local_sessions_token_unique" ON "local_sessions" USING btree ("tokenHash");--> statement-breakpoint
CREATE UNIQUE INDEX "member_roles_user_unique" ON "member_roles" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "office_delegation_policy_version_unique" ON "office_delegation_policies" USING btree ("managerUserId","officeId","policyVersion");--> statement-breakpoint
CREATE INDEX "office_delegation_policy_manager_idx" ON "office_delegation_policies" USING btree ("managerUserId","officeId");--> statement-breakpoint
CREATE UNIQUE INDEX "office_profiles_office_unique" ON "office_profiles" USING btree ("officeId");--> statement-breakpoint
CREATE UNIQUE INDEX "office_tariff_history_version_unique" ON "office_tariff_history" USING btree ("officeId","profileVersion");--> statement-breakpoint
CREATE INDEX "office_tariff_history_effective_idx" ON "office_tariff_history" USING btree ("officeId","announcedAt");--> statement-breakpoint
CREATE INDEX "permission_delegations_target_idx" ON "permission_delegations" USING btree ("targetUserId");--> statement-breakpoint
CREATE INDEX "permission_delegations_office_idx" ON "permission_delegations" USING btree ("officeId");--> statement-breakpoint
CREATE UNIQUE INDEX "record_keys_type_value_unique" ON "record_keys" USING btree ("keyType","keyValue");--> statement-breakpoint
CREATE UNIQUE INDEX "records_entity_record_unique" ON "records" USING btree ("entity","recordId");--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_charge_allocation_request_unique" ON "shipment_charge_allocations" USING btree ("componentId","kind","requestKey");--> statement-breakpoint
CREATE INDEX "shipment_charge_allocations_invoice_idx" ON "shipment_charge_allocations" USING btree ("invoiceId");--> statement-breakpoint
CREATE INDEX "shipment_charge_allocations_component_idx" ON "shipment_charge_allocations" USING btree ("componentId");--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_charge_component_unique" ON "shipment_charge_components" USING btree ("shipmentId","goodsId","chargeKey");--> statement-breakpoint
CREATE INDEX "shipment_charge_components_office_idx" ON "shipment_charge_components" USING btree ("officeId","currency");--> statement-breakpoint
CREATE INDEX "shipment_charge_components_shipment_idx" ON "shipment_charge_components" USING btree ("shipmentId");--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_cost_approval_reference_unique" ON "shipment_cost_approvals" USING btree ("shipmentId","officeId","referenceKey");--> statement-breakpoint
CREATE INDEX "shipment_cost_approval_entry_idx" ON "shipment_cost_approvals" USING btree ("financeEntryId");--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_price_override_request_unique" ON "shipment_price_overrides" USING btree ("requestKey");--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_price_override_revision_unique" ON "shipment_price_overrides" USING btree ("shipmentId","officeId","revision");--> statement-breakpoint
CREATE INDEX "shipment_price_override_shipment_idx" ON "shipment_price_overrides" USING btree ("shipmentId");--> statement-breakpoint
CREATE INDEX "shipment_tariff_snapshots_shipment_idx" ON "shipment_tariff_snapshots" USING btree ("shipmentId");--> statement-breakpoint
CREATE INDEX "shipment_tariff_snapshots_office_idx" ON "shipment_tariff_snapshots" USING btree ("officeId");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_receipts_user_change_unique" ON "sync_receipts" USING btree ("userId","changeId");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_movement_entry_unique" ON "wallet_movements" USING btree ("financeEntryId");--> statement-breakpoint
CREATE INDEX "wallet_movements_office_wallet_idx" ON "wallet_movements" USING btree ("officeId","methodId","currency");--> statement-breakpoint
CREATE INDEX "wallet_movements_invoice_idx" ON "wallet_movements" USING btree ("invoiceId");--> statement-breakpoint
CREATE INDEX "warehouse_location_events_goods_idx" ON "warehouse_location_events" USING btree ("goodsId");--> statement-breakpoint
CREATE INDEX "warehouse_location_events_shipment_idx" ON "warehouse_location_events" USING btree ("shipmentId");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_location_events_request_unique" ON "warehouse_location_events" USING btree ("requestKey");