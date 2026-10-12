ALTER TABLE `holdings_movements` ADD `valor_ars` real;--> statement-breakpoint
ALTER TABLE `holdings_movements` ADD `gastos` real;--> statement-breakpoint
ALTER TABLE `holdings_movements` ADD `dolar_mep` real;--> statement-breakpoint
ALTER TABLE `holdings_movements` ADD `dolar_ccl` real;--> statement-breakpoint
ALTER TABLE `holdings_movements` ADD `external_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `ux_holdings_movements_cuenta_external` ON `holdings_movements` (`cuenta_id`,`external_id`);--> statement-breakpoint
ALTER TABLE `holdings_snapshots` ADD `valor_ars` real;