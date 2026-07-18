CREATE TABLE `holdings_movements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cuenta_id` integer NOT NULL,
	`fecha` text NOT NULL,
	`activo` text NOT NULL,
	`tipo` text NOT NULL,
	`cantidad` real NOT NULL,
	`precio_unitario` real NOT NULL,
	`moneda` text NOT NULL,
	`valor_usd` real NOT NULL,
	`fuente` text NOT NULL,
	FOREIGN KEY (`cuenta_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `holdings_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cuenta_id` integer NOT NULL,
	`fecha` text NOT NULL,
	`activo` text NOT NULL,
	`cantidad` real NOT NULL,
	`valor_usd` real NOT NULL,
	`fuente` text NOT NULL,
	FOREIGN KEY (`cuenta_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fecha` text NOT NULL,
	`monto` real NOT NULL,
	`moneda` text NOT NULL,
	`cuenta_id` integer NOT NULL,
	`categoria_id` integer,
	`tipo` text NOT NULL,
	`descripcion` text,
	`cuenta_destino_id` integer,
	FOREIGN KEY (`cuenta_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`categoria_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cuenta_destino_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `accounts` ADD `tipo_cuenta` text DEFAULT 'activo' NOT NULL;