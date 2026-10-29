CREATE TABLE `budget_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`round_id` integer NOT NULL,
	`team_id` integer NOT NULL,
	`item_number` text DEFAULT '' NOT NULL,
	`kan` text DEFAULT '' NOT NULL,
	`kou` text DEFAULT '' NOT NULL,
	`moku` text DEFAULT '' NOT NULL,
	`setsu` text DEFAULT '' NOT NULL,
	`quantity` text DEFAULT '' NOT NULL,
	`unit_price` integer,
	`amount` integer NOT NULL,
	`vendor` text DEFAULT '' NOT NULL,
	`spec` text DEFAULT '' NOT NULL,
	`link` text DEFAULT '' NOT NULL,
	`planned_timing` text DEFAULT '' NOT NULL,
	`remark` text DEFAULT '' NOT NULL,
	`is_new` integer DEFAULT false NOT NULL,
	`pre_execution` integer DEFAULT false NOT NULL,
	`sort_order` real NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`review_comment` text DEFAULT '' NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`base_item_id` integer,
	`base_amount` integer,
	`updated_at` integer NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `budget_rounds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `budget_teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `budget_rounds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`term` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'collecting' NOT NULL,
	`base_round_id` integer,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`confirmed_at` integer
);
--> statement-breakpoint
CREATE TABLE `budget_teams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`round_id` integer NOT NULL,
	`bureau_no` text NOT NULL,
	`bureau` text NOT NULL,
	`team` text NOT NULL,
	`person` text DEFAULT '' NOT NULL,
	`sort_order` real NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `budget_rounds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `users` ADD `budget_bureau` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `budget_team` text DEFAULT '' NOT NULL;