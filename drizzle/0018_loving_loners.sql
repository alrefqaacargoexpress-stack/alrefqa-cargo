CREATE TABLE `cash_register_locks` (
	`id` varchar(128) NOT NULL,
	`officeId` varchar(32) NOT NULL,
	`currency` enum('MRU','AED','TRY','CNY','USD','EUR') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cash_register_locks_id` PRIMARY KEY(`id`),
	CONSTRAINT `cash_register_locks_office_currency_uq` UNIQUE(`officeId`,`currency`)
);
