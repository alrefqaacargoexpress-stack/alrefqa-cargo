CREATE TABLE `shipment_price_overrides` (
	`id` varchar(190) NOT NULL,
	`shipmentId` varchar(128) NOT NULL,
	`officeId` varchar(32) NOT NULL,
	`side` enum('source','destination') NOT NULL,
	`currency` enum('MRU','AED','TRY','CNY','USD','EUR') NOT NULL,
	`pricePerKg` decimal(18,2) NOT NULL,
	`revision` int NOT NULL,
	`recordVersion` int NOT NULL,
	`reason` text NOT NULL,
	`previousOverrideId` varchar(190),
	`requestKey` varchar(190) NOT NULL,
	`approvedBy` int NOT NULL,
	`createdAt` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `shipment_price_overrides_id` PRIMARY KEY(`id`),
	CONSTRAINT `shipment_price_override_request_unique` UNIQUE(`requestKey`),
	CONSTRAINT `shipment_price_override_revision_unique` UNIQUE(`shipmentId`,`officeId`,`revision`)
);
--> statement-breakpoint
ALTER TABLE `shipment_price_overrides` ADD CONSTRAINT `shipment_price_overrides_approvedBy_users_id_fk` FOREIGN KEY (`approvedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `shipment_price_override_shipment_idx` ON `shipment_price_overrides` (`shipmentId`);