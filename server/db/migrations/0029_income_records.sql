CREATE TABLE `income_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`income_id` integer NOT NULL,
	`attachment_id` integer NOT NULL,
	`kind` text NOT NULL,
	`uploaded_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`income_id`) REFERENCES `income_records`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`attachment_id`) REFERENCES `attachments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `income_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`seq` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`applicant_email` text NOT NULL,
	`applicant_name` text NOT NULL,
	`department` text NOT NULL,
	`in_charge` text NOT NULL,
	`line_key` text,
	`item_number` text NOT NULL,
	`item_name` text NOT NULL,
	`budget_amount` integer,
	`amount` integer NOT NULL,
	`received_on` text NOT NULL,
	`payer` text DEFAULT '' NOT NULL,
	`method` text NOT NULL,
	`remark` text DEFAULT '' NOT NULL,
	`details` text DEFAULT '{}' NOT NULL,
	`confirmed_at` integer,
	`confirmed_by` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `income_records_seq_unique` ON `income_records` (`seq`);