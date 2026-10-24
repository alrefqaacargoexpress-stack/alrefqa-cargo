CREATE TABLE `cash_movements` (
	`id` varchar(128) NOT NULL,
	`registerId` varchar(128) NOT NULL,
	`officeId` varchar(32) NOT NULL,
	`kind` enum('receipt','expense','closing_adjustment') NOT NULL,
	`amount` decimal(18,2) NOT NULL,
	`currency` enum('MRU','AED','TRY','CNY','USD','EUR') NOT NULL,
	`invoiceId` varchar(128),
	`actorId` int NOT NULL,
	`data` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cash_movements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cash_registers` (
	`id` varchar(128) NOT NULL,
	`officeId` varchar(32) NOT NULL,
	`currency` enum('MRU','AED','TRY','CNY','USD','EUR') NOT NULL,
	`openingBalance` decimal(18,2) NOT NULL,
	`status` enum('open','closed') NOT NULL DEFAULT 'open',
	`openedBy` int NOT NULL,
	`closedBy` int,
	`openedAt` timestamp NOT NULL DEFAULT (now()),
	`closedAt` timestamp,
	`version` int NOT NULL DEFAULT 1,
	CONSTRAINT `cash_registers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoice_adjustments` (
	`id` varchar(128) NOT NULL,
	`invoiceId` varchar(128) NOT NULL,
	`officeId` varchar(32) NOT NULL,
	`direction` enum('increase','decrease') NOT NULL,
	`amount` decimal(18,2) NOT NULL,
	`reason` varchar(500) NOT NULL,
	`actorId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invoice_adjustments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `permission_delegations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`targetUserId` int NOT NULL,
	`officeId` varchar(32),
	`permissionKey` varchar(64) NOT NULL,
	`level` enum('none','view','manage') NOT NULL,
	`delegatedBy` int NOT NULL,
	`status` enum('active','revoked') NOT NULL DEFAULT 'active',
	`reason` varchar(500),
	`version` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`revokedAt` timestamp,
	CONSTRAINT `permission_delegations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shipment_tariff_snapshots` (
	`id` varchar(128) NOT NULL,
	`shipmentId` varchar(128) NOT NULL,
	`officeId` varchar(32) NOT NULL,
	`serviceType` varchar(64) NOT NULL,
	`currency` enum('MRU','AED','TRY','CNY','USD','EUR') NOT NULL,
	`pricePerKg` decimal(18,2) NOT NULL,
	`pricePerKgMRU` decimal(18,2),
	`capturedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`data` json,
	CONSTRAINT `shipment_tariff_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `warehouse_location_events` (
	`id` varchar(128) NOT NULL,
	`shipmentId` varchar(128) NOT NULL,
	`goodsId` varchar(128) NOT NULL,
	`officeId` varchar(32) NOT NULL,
	`warehouseCode` varchar(32) NOT NULL,
	`shelfCode` varchar(32) NOT NULL,
	`locationCode` varchar(80) NOT NULL,
	`action` enum('shelve','release','deliver') NOT NULL,
	`expectedVersion` int NOT NULL,
	`actorId` int NOT NULL,
	`requestKey` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `warehouse_location_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `warehouse_location_events_request_unique` UNIQUE(`requestKey`)
);
--> statement-breakpoint
ALTER TABLE `audit_events` MODIFY COLUMN `role` enum('admin','office_manager','staff','accountant','general_accountant','cashier','source_warehouse','destination_warehouse','viewer','tracking_staff','supervisor') NOT NULL;--> statement-breakpoint
ALTER TABLE `member_roles` MODIFY COLUMN `role` enum('admin','office_manager','staff','accountant','general_accountant','cashier','source_warehouse','destination_warehouse','viewer','tracking_staff','supervisor') NOT NULL;--> statement-breakpoint
ALTER TABLE `cash_movements` ADD CONSTRAINT `cash_movements_actorId_users_id_fk` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_registers` ADD CONSTRAINT `cash_registers_openedBy_users_id_fk` FOREIGN KEY (`openedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_registers` ADD CONSTRAINT `cash_registers_closedBy_users_id_fk` FOREIGN KEY (`closedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_adjustments` ADD CONSTRAINT `invoice_adjustments_actorId_users_id_fk` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `permission_delegations` ADD CONSTRAINT `permission_delegations_targetUserId_users_id_fk` FOREIGN KEY (`targetUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `permission_delegations` ADD CONSTRAINT `permission_delegations_delegatedBy_users_id_fk` FOREIGN KEY (`delegatedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shipment_tariff_snapshots` ADD CONSTRAINT `shipment_tariff_snapshots_capturedBy_users_id_fk` FOREIGN KEY (`capturedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `warehouse_location_events` ADD CONSTRAINT `warehouse_location_events_actorId_users_id_fk` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `cash_movements_register_idx` ON `cash_movements` (`registerId`);--> statement-breakpoint
CREATE INDEX `cash_movements_office_idx` ON `cash_movements` (`officeId`);--> statement-breakpoint
CREATE INDEX `cash_registers_office_status_idx` ON `cash_registers` (`officeId`,`status`);--> statement-breakpoint
CREATE INDEX `invoice_adjustments_invoice_idx` ON `invoice_adjustments` (`invoiceId`);--> statement-breakpoint
CREATE INDEX `invoice_adjustments_office_idx` ON `invoice_adjustments` (`officeId`);--> statement-breakpoint
CREATE INDEX `permission_delegations_target_idx` ON `permission_delegations` (`targetUserId`);--> statement-breakpoint
CREATE INDEX `permission_delegations_office_idx` ON `permission_delegations` (`officeId`);--> statement-breakpoint
CREATE INDEX `shipment_tariff_snapshots_shipment_idx` ON `shipment_tariff_snapshots` (`shipmentId`);--> statement-breakpoint
CREATE INDEX `shipment_tariff_snapshots_office_idx` ON `shipment_tariff_snapshots` (`officeId`);--> statement-breakpoint
CREATE INDEX `warehouse_location_events_goods_idx` ON `warehouse_location_events` (`goodsId`);--> statement-breakpoint
CREATE INDEX `warehouse_location_events_shipment_idx` ON `warehouse_location_events` (`shipmentId`);