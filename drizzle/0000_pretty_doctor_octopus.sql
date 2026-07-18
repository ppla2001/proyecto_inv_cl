CREATE TABLE `exchange_rates` (
	`fecha` text PRIMARY KEY NOT NULL,
	`tipo` text NOT NULL,
	`compra` real NOT NULL,
	`venta` real NOT NULL,
	`fuente` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inflation_index` (
	`mes` text PRIMARY KEY NOT NULL,
	`valor` real NOT NULL,
	`fuente` text NOT NULL
);
