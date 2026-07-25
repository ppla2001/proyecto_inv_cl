ALTER TABLE `transactions` ADD `external_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `ux_transactions_cuenta_external` ON `transactions` (`cuenta_id`,`external_id`);