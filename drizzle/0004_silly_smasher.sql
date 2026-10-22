CREATE TABLE `finance_entries` (
	`id` varchar(128) NOT NULL,
	`kind` enum('daily_expense','monthly_expense','shipment_cost','shipment_revenue','invoice_revenue','customer_debt','debt_payment','collection') NOT NULL,
	`officeId` varchar(32) NOT NULL,
	`currency` enum('MRU','AED','TRY','CNY','USD','EUR') NOT NULL,
	`data` json NOT NULL,
	`invoiceId` varchar(128),
	`shipmentId` varchar(128),
	`actorId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `finance_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `finance_entries_id_unique` UNIQUE(`id`)
);
--> statement-breakpoint
CREATE TABLE `finance_goods` (
	`id` int AUTO_INCREMENT NOT NULL,
	`shipmentId` varchar(128) NOT NULL,
	`goodsId` varchar(128) NOT NULL,
	`invoiceId` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `finance_goods_id` PRIMARY KEY(`id`),
	CONSTRAINT `finance_goods_shipment_goods_unique` UNIQUE(`shipmentId`,`goodsId`)
);
--> statement-breakpoint
CREATE TABLE `finance_receipts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorId` int NOT NULL,
	`commandId` varchar(128) NOT NULL,
	`payloadHash` varchar(64) NOT NULL,
	`result` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `finance_receipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `finance_receipts_actor_command_unique` UNIQUE(`actorId`,`commandId`)
);
--> statement-breakpoint
ALTER TABLE `member_roles` ADD `homeOffice` varchar(32);--> statement-breakpoint
ALTER TABLE `finance_receipts` ADD CONSTRAINT `finance_receipts_actorId_users_id_fk` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;