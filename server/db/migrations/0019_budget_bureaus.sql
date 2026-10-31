CREATE TABLE `budget_bureaus` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`round_id` integer NOT NULL,
	`bureau_no` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` real NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `budget_rounds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `budget_teams` ADD `bureau_id` integer REFERENCES budget_bureaus(id);