CREATE TABLE `customer_shipment_access` (
	`id` varchar(128) NOT NULL,
	`userId` int NOT NULL,
	`customerAccountId` varchar(128) NOT NULL,
	`shipmentId` varchar(128) NOT NULL,
	`goodsId` varchar(128) NOT NULL,
	`officeId` varchar(32) NOT NULL,
	`status` enum('active','revoked') NOT NULL DEFAULT 'active',
	`version` int NOT NULL DEFAULT 1,
	`grantedBy` int NOT NULL,
	`updatedBy` int NOT NULL,
	`createdAt` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updatedAt` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	CONSTRAINT `customer_shipment_access_id` PRIMARY KEY(`id`),
	CONSTRAINT `customer_shipment_access_goods_unique` UNIQUE(`shipmentId`,`goodsId`)
);
--> statement-breakpoint
CREATE TABLE `office_delegation_policies` (
	`id` varchar(128) NOT NULL,
	`managerUserId` int NOT NULL,
	`officeId` varchar(32) NOT NULL,
	`managerMembershipVersion` int NOT NULL,
	`policyVersion` int NOT NULL,
	`permissions` json NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`actorId` int NOT NULL,
	`createdAt` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `office_delegation_policies_id` PRIMARY KEY(`id`),
	CONSTRAINT `office_delegation_policy_version_unique` UNIQUE(`managerUserId`,`officeId`,`policyVersion`)
);
--> statement-breakpoint
CREATE TABLE `office_payment_settings` (
	`officeId` varchar(32) NOT NULL,
	`methods` json NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`updatedBy` int NOT NULL,
	`createdAt` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updatedAt` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	CONSTRAINT `office_payment_settings_officeId` PRIMARY KEY(`officeId`)
);
--> statement-breakpoint
CREATE TABLE `shipment_cost_approvals` (
	`id` varchar(128) NOT NULL,
	`shipmentId` varchar(128) NOT NULL,
	`officeId` varchar(32) NOT NULL,
	`currency` enum('MRU','AED','TRY','CNY','USD','EUR') NOT NULL,
	`referenceKey` varchar(128) NOT NULL,
	`financeEntryId` varchar(128) NOT NULL,
	`actorId` int NOT NULL,
	`createdAt` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `shipment_cost_approvals_id` PRIMARY KEY(`id`),
	CONSTRAINT `shipment_cost_approval_reference_unique` UNIQUE(`shipmentId`,`officeId`,`referenceKey`)
);
--> statement-breakpoint
CREATE TABLE `wallet_movements` (
	`id` varchar(128) NOT NULL,
	`officeId` varchar(32) NOT NULL,
	`methodId` varchar(64) NOT NULL,
	`currency` enum('MRU','AED','TRY','CNY','USD','EUR') NOT NULL,
	`kind` enum('receipt','refund') NOT NULL,
	`amount` decimal(18,2) NOT NULL,
	`invoiceId` varchar(128) NOT NULL,
	`financeEntryId` varchar(128) NOT NULL,
	`actorId` int NOT NULL,
	`data` json,
	`createdAt` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `wallet_movements_id` PRIMARY KEY(`id`),
	CONSTRAINT `wallet_movement_entry_unique` UNIQUE(`financeEntryId`)
);
--> statement-breakpoint
ALTER TABLE `customer_shipment_access` ADD CONSTRAINT `customer_shipment_access_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_shipment_access` ADD CONSTRAINT `customer_shipment_access_grantedBy_users_id_fk` FOREIGN KEY (`grantedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_shipment_access` ADD CONSTRAINT `customer_shipment_access_updatedBy_users_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `office_delegation_policies` ADD CONSTRAINT `office_delegation_policies_managerUserId_users_id_fk` FOREIGN KEY (`managerUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `office_delegation_policies` ADD CONSTRAINT `office_delegation_policies_actorId_users_id_fk` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `office_payment_settings` ADD CONSTRAINT `office_payment_settings_updatedBy_users_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shipment_cost_approvals` ADD CONSTRAINT `shipment_cost_approvals_actorId_users_id_fk` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wallet_movements` ADD CONSTRAINT `wallet_movements_actorId_users_id_fk` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `customer_shipment_access_user_idx` ON `customer_shipment_access` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `customer_shipment_access_account_idx` ON `customer_shipment_access` (`customerAccountId`,`officeId`);--> statement-breakpoint
CREATE INDEX `office_delegation_policy_manager_idx` ON `office_delegation_policies` (`managerUserId`,`officeId`);--> statement-breakpoint
CREATE INDEX `shipment_cost_approval_entry_idx` ON `shipment_cost_approvals` (`financeEntryId`);--> statement-breakpoint
CREATE INDEX `wallet_movements_office_wallet_idx` ON `wallet_movements` (`officeId`,`methodId`,`currency`);--> statement-breakpoint
CREATE INDEX `wallet_movements_invoice_idx` ON `wallet_movements` (`invoiceId`);
