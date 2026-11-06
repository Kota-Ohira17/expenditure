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
	`item_id` text DEFAULT '' NOT NULL,
	`item_name` text NOT NULL,
	`budget_amount` integer,
	`amount` integer NOT NULL,
	`received_on` text NOT NULL,
	`payer` text DEFAULT '' NOT NULL,
	`method` text NOT NULL,
	`account` text,
	`remark` text DEFAULT '' NOT NULL,
	`details` text DEFAULT '{}' NOT NULL,
	`confirmed_at` integer,
	`confirmed_by` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `income_records_seq_unique` ON `income_records` (`seq`);
--> statement-breakpoint
INSERT INTO `income_records` (`seq`, `status`, `applicant_email`, `applicant_name`, `department`, `in_charge`, `line_key`, `item_number`, `item_id`, `item_name`, `budget_amount`, `amount`, `received_on`, `payer`, `method`, `account`, `remark`, `details`, `confirmed_at`, `confirmed_by`, `created_at`)
SELECT e.`seq`, e.`status`, e.`applicant_email`, e.`applicant_name`, e.`department`, e.`in_charge`, i.`line_key`, e.`item_number`, COALESCE(i.`item_id`, ''), e.`item_name`, i.`budget_amount`, COALESCE(e.`amount`, 0), COALESCE(e.`deadline`, ''), COALESCE(json_extract(e.`details`, '$.payer'), ''), COALESCE(e.`payment_method`, ''), json_extract(e.`details`, '$.account'), e.`remark`, json_remove(e.`details`, '$.payer', '$.account'), e.`executed_at`, e.`executed_by`, e.`created_at`
FROM `entries` e LEFT JOIN `entry_items` i ON i.`entry_id` = e.`id`
WHERE e.`kind` = 'income' ORDER BY e.`id`;
--> statement-breakpoint
INSERT INTO `income_files` (`income_id`, `attachment_id`, `kind`, `uploaded_by`, `created_at`)
SELECT r.`id`, f.`attachment_id`, f.`kind`, f.`uploaded_by`, f.`created_at`
FROM `evidence_files` f JOIN `entries` e ON e.`id` = f.`entry_id` JOIN `income_records` r ON r.`seq` = e.`seq`
WHERE e.`kind` = 'income' ORDER BY f.`id`;
--> statement-breakpoint
DELETE FROM `evidence_files` WHERE `entry_id` IN (SELECT `id` FROM `entries` WHERE `kind` = 'income');
--> statement-breakpoint
DELETE FROM `entry_items` WHERE `entry_id` IN (SELECT `id` FROM `entries` WHERE `kind` = 'income');
--> statement-breakpoint
DELETE FROM `entries` WHERE `kind` = 'income';
