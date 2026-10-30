CREATE TABLE `budget_reference_files` (
	`kind` text PRIMARY KEY NOT NULL,
	`file_name` text NOT NULL,
	`count` integer NOT NULL,
	`total` integer NOT NULL,
	`imported_at` integer NOT NULL,
	`imported_by` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `budget_references` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`sort_order` integer NOT NULL,
	`item_number` text DEFAULT '' NOT NULL,
	`bureau` text DEFAULT '' NOT NULL,
	`team` text DEFAULT '' NOT NULL,
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
	`pre_execution` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE `budget_items` ADD `reference_id` integer;