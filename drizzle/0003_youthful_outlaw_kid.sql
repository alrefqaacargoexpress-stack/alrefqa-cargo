CREATE TABLE `office_profiles` (
	`officeId` varchar(32) NOT NULL,
	`version` int NOT NULL DEFAULT 0,
	`profile` json NOT NULL,
	`updatedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `office_profiles_officeId` PRIMARY KEY(`officeId`),
	CONSTRAINT `office_profiles_office_unique` UNIQUE(`officeId`)
);
--> statement-breakpoint
ALTER TABLE `member_roles` ADD `offices` json;--> statement-breakpoint
ALTER TABLE `member_roles` ADD `version` int DEFAULT 0 NOT NULL;