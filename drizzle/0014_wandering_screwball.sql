CREATE TABLE `office_tariff_history` (
	`id` varchar(128) NOT NULL,
	`officeId` varchar(32) NOT NULL,
	`profileVersion` int NOT NULL,
	`announcedAt` timestamp(3) NOT NULL,
	`shippingRates` json,
	`sourceShippingRates` json,
	`recordedBy` int,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `office_tariff_history_id` PRIMARY KEY(`id`),
	CONSTRAINT `office_tariff_history_version_unique` UNIQUE(`officeId`,`profileVersion`)
);
--> statement-breakpoint
CREATE INDEX `office_tariff_history_effective_idx` ON `office_tariff_history` (`officeId`,`announcedAt`);