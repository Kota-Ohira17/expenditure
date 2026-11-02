CREATE TABLE `cashbook_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`date` text NOT NULL,
	`account` text NOT NULL,
	`to_account` text,
	`amount` integer NOT NULL,
	`memo` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `income_records` ADD `account` text;