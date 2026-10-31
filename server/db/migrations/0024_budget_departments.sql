CREATE TABLE `budget_departments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`round_id` integer NOT NULL,
	`bureau_id` integer NOT NULL,
	`code` text NOT NULL,
	`name_ja` text DEFAULT '' NOT NULL,
	`sort_order` real NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `budget_rounds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bureau_id`) REFERENCES `budget_bureaus`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `budget_teams` ADD `department_id` integer REFERENCES budget_departments(id);