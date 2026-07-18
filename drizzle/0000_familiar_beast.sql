CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`plataforma` text NOT NULL,
	`moneda_default` text NOT NULL,
	`origen` text NOT NULL,
	`identificador_externo` text,
	`activa` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `exchange_rates` (
	`fecha` text NOT NULL,
	`tipo` text NOT NULL,
	`compra` real NOT NULL,
	`venta` real NOT NULL,
	`fuente` text NOT NULL,
	PRIMARY KEY(`fecha`, `tipo`)
);
--> statement-breakpoint
CREATE TABLE `inflation_index` (
	`mes` text PRIMARY KEY NOT NULL,
	`valor` real NOT NULL,
	`fuente` text NOT NULL
);
