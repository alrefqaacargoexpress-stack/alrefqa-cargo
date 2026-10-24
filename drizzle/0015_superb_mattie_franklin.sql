CREATE TABLE `duty_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`actorId` int NOT NULL,
	`role` enum('admin','office_manager','staff','accountant','general_accountant','cashier','source_warehouse','destination_warehouse','viewer','tracking_staff','supervisor') NOT NULL,
	`officeId` varchar(32) NOT NULL,
	`status` enum('on','off') NOT NULL,
	`reason` varchar(64) NOT NULL,
	`membershipVersion` int NOT NULL,
	`expiresAt` timestamp(3),
	`requestKey` varchar(128) NOT NULL,
	`createdAt` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `duty_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `duty_events_request_unique` UNIQUE(`userId`,`requestKey`)
);
--> statement-breakpoint
CREATE TABLE `entity_lifecycle` (
	`id` varchar(128) NOT NULL,
	`entity` enum('shipment','invoice','finance_entry','employee','public_employee','account') NOT NULL,
	`recordId` varchar(128) NOT NULL,
	`action` enum('delete','void','disable') NOT NULL,
	`officeId` varchar(32),
	`reason` varchar(500) NOT NULL,
	`expectedVersion` int NOT NULL,
	`actorId` int NOT NULL,
	`requestKey` varchar(128) NOT NULL,
	`snapshot` json,
	`createdAt` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `entity_lifecycle_id` PRIMARY KEY(`id`),
	CONSTRAINT `entity_lifecycle_record_unique` UNIQUE(`entity`,`recordId`),
	CONSTRAINT `entity_lifecycle_request_unique` UNIQUE(`actorId`,`requestKey`)
);
--> statement-breakpoint
CREATE TABLE `finance_reversals` (
	`id` varchar(128) NOT NULL,
	`lifecycleId` varchar(128) NOT NULL,
	`originalEntryId` varchar(128) NOT NULL,
	`originalKind` varchar(64) NOT NULL,
	`officeId` varchar(32) NOT NULL,
	`currency` enum('MRU','AED','TRY','CNY','USD','EUR') NOT NULL,
	`amount` decimal(18,2) NOT NULL,
	`invoiceId` varchar(128),
	`shipmentId` varchar(128),
	`customerId` varchar(128),
	`actorId` int NOT NULL,
	`data` json NOT NULL,
	`createdAt` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `finance_reversals_id` PRIMARY KEY(`id`),
	CONSTRAINT `finance_reversals_original_unique` UNIQUE(`originalEntryId`)
);
--> statement-breakpoint
CREATE TABLE `shipment_charge_allocations` (
	`id` varchar(128) NOT NULL,
	`componentId` varchar(128) NOT NULL,
	`invoiceId` varchar(128) NOT NULL,
	`kind` enum('invoice','payment','void') NOT NULL,
	`amount` decimal(18,2) NOT NULL,
	`actorId` int NOT NULL,
	`requestKey` varchar(128) NOT NULL,
	`data` json,
	`createdAt` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `shipment_charge_allocations_id` PRIMARY KEY(`id`),
	CONSTRAINT `shipment_charge_allocation_request_unique` UNIQUE(`componentId`,`kind`,`requestKey`)
);
--> statement-breakpoint
CREATE TABLE `shipment_charge_components` (
	`id` varchar(128) NOT NULL,
	`shipmentId` varchar(128) NOT NULL,
	`goodsId` varchar(128) NOT NULL,
	`chargeKey` varchar(128) NOT NULL,
	`kind` enum('export','destination_local') NOT NULL,
	`officeId` varchar(32) NOT NULL,
	`currency` enum('MRU','AED','TRY','CNY','USD','EUR') NOT NULL,
	`amount` decimal(18,2) NOT NULL,
	`actorId` int NOT NULL,
	`requestKey` varchar(128) NOT NULL,
	`data` json NOT NULL,
	`createdAt` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `shipment_charge_components_id` PRIMARY KEY(`id`),
	CONSTRAINT `shipment_charge_component_unique` UNIQUE(`shipmentId`,`goodsId`,`chargeKey`)
);
--> statement-breakpoint
ALTER TABLE `duty_events` ADD CONSTRAINT `duty_events_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `duty_events` ADD CONSTRAINT `duty_events_actorId_users_id_fk` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `entity_lifecycle` ADD CONSTRAINT `entity_lifecycle_actorId_users_id_fk` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_reversals` ADD CONSTRAINT `finance_reversals_actorId_users_id_fk` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shipment_charge_allocations` ADD CONSTRAINT `shipment_charge_allocations_actorId_users_id_fk` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shipment_charge_components` ADD CONSTRAINT `shipment_charge_components_actorId_users_id_fk` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `duty_events_user_id_idx` ON `duty_events` (`userId`,`id`);--> statement-breakpoint
CREATE INDEX `duty_events_office_id_idx` ON `duty_events` (`officeId`,`id`);--> statement-breakpoint
CREATE INDEX `entity_lifecycle_office_idx` ON `entity_lifecycle` (`officeId`);--> statement-breakpoint
CREATE INDEX `finance_reversals_lifecycle_idx` ON `finance_reversals` (`lifecycleId`);--> statement-breakpoint
CREATE INDEX `finance_reversals_office_currency_idx` ON `finance_reversals` (`officeId`,`currency`);--> statement-breakpoint
CREATE INDEX `shipment_charge_allocations_invoice_idx` ON `shipment_charge_allocations` (`invoiceId`);--> statement-breakpoint
CREATE INDEX `shipment_charge_allocations_component_idx` ON `shipment_charge_allocations` (`componentId`);--> statement-breakpoint
CREATE INDEX `shipment_charge_components_office_idx` ON `shipment_charge_components` (`officeId`,`currency`);--> statement-breakpoint
CREATE INDEX `shipment_charge_components_shipment_idx` ON `shipment_charge_components` (`shipmentId`);