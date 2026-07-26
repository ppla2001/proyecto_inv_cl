CREATE TABLE `tracked_assets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cuenta_id` integer NOT NULL,
	`red` text NOT NULL,
	`tipo` text NOT NULL,
	`activo` text NOT NULL,
	`nombre` text,
	`contract_address` text,
	`token_id` text,
	`decimals` integer,
	FOREIGN KEY (`cuenta_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
