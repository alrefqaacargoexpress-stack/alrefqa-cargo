CREATE TABLE `member_roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`role` enum('admin','staff','accountant','viewer') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `member_roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `member_roles_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `record_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`keyType` enum('account-id','shipment-id','shipment-tracking','invoice-id') NOT NULL,
	`keyValue` varchar(128) NOT NULL,
	`entity` enum('account','shipment','invoice') NOT NULL,
	`recordId` varchar(128) NOT NULL,
	CONSTRAINT `record_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `record_keys_type_value_unique` UNIQUE(`keyType`,`keyValue`)
);
--> statement-breakpoint
CREATE TABLE `records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entity` enum('account','shipment','invoice') NOT NULL,
	`recordId` varchar(128) NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`data` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`updatedBy` int NOT NULL,
	CONSTRAINT `records_id` PRIMARY KEY(`id`),
	CONSTRAINT `records_entity_record_unique` UNIQUE(`entity`,`recordId`)
);
--> statement-breakpoint
CREATE TABLE `sync_receipts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`changeId` varchar(128) NOT NULL,
	`result` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sync_receipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `sync_receipts_user_change_unique` UNIQUE(`userId`,`changeId`)
);
--> statement-breakpoint
ALTER TABLE `member_roles` ADD CONSTRAINT `member_roles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sync_receipts` ADD CONSTRAINT `sync_receipts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;