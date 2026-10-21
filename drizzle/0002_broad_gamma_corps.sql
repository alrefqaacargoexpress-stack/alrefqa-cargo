CREATE TABLE IF NOT EXISTS `audit_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sequence` int NOT NULL,
	`actorId` int NOT NULL,
	`actorName` varchar(320) NOT NULL,
	`role` enum('admin','staff','accountant','viewer','tracking_staff','supervisor') NOT NULL,
	`entity` varchar(64) NOT NULL,
	`recordId` varchar(128) NOT NULL,
	`action` varchar(64) NOT NULL,
	`beforeData` json,
	`afterData` json,
	`beforeVersion` int,
	`afterVersion` int,
	`requestKey` varchar(128) NOT NULL,
	`previousHash` varchar(64) NOT NULL,
	`eventHash` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `audit_events_sequence_unique` UNIQUE(`sequence`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `audit_heads` (
	`id` int NOT NULL DEFAULT 1,
	`sequence` int NOT NULL DEFAULT 0,
	`lastHash` varchar(64) NOT NULL DEFAULT '',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `audit_heads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `office_settings` (
	`id` int NOT NULL DEFAULT 1,
	`office` varchar(32) NOT NULL,
	`methods` json NOT NULL,
	`version` int NOT NULL DEFAULT 0,
	`updatedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `office_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `member_roles` MODIFY COLUMN `role` enum('admin','staff','accountant','viewer','tracking_staff','supervisor') NOT NULL;
-- TiDB does not support triggers. Audit events have no UPDATE/DELETE application path.
-- Every event and the serialized head are hash-chained; read-time verification detects tampering.
-- Direct infrastructure/database owner access is outside the application's guarantee.
