CREATE TABLE `main_income_items` (
	`id` text PRIMARY KEY NOT NULL,
	`term` text NOT NULL,
	`round_id` integer,
	`item_number` text NOT NULL,
	`item_id` text DEFAULT '' NOT NULL,
	`bureau` text NOT NULL,
	`team` text NOT NULL,
	`kan` text DEFAULT '' NOT NULL,
	`kou` text DEFAULT '' NOT NULL,
	`moku` text DEFAULT '' NOT NULL,
	`setsu` text DEFAULT '' NOT NULL,
	`amount` integer NOT NULL,
	`quantity` text DEFAULT '' NOT NULL,
	`unit_price` integer,
	`spec` text DEFAULT '' NOT NULL,
	`vendor` text DEFAULT '' NOT NULL,
	`remark` text DEFAULT '' NOT NULL,
	`link` text DEFAULT '' NOT NULL,
	`planned_timing` text DEFAULT '' NOT NULL,
	`is_new` integer DEFAULT false NOT NULL,
	`pre_execution` integer DEFAULT false NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`sort_order` real NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `revised_income_items` (
	`id` text PRIMARY KEY NOT NULL,
	`term` text NOT NULL,
	`round_id` integer,
	`item_number` text NOT NULL,
	`item_id` text DEFAULT '' NOT NULL,
	`bureau` text NOT NULL,
	`team` text NOT NULL,
	`kan` text DEFAULT '' NOT NULL,
	`kou` text DEFAULT '' NOT NULL,
	`moku` text DEFAULT '' NOT NULL,
	`setsu` text DEFAULT '' NOT NULL,
	`amount` integer NOT NULL,
	`quantity` text DEFAULT '' NOT NULL,
	`unit_price` integer,
	`spec` text DEFAULT '' NOT NULL,
	`vendor` text DEFAULT '' NOT NULL,
	`remark` text DEFAULT '' NOT NULL,
	`link` text DEFAULT '' NOT NULL,
	`planned_timing` text DEFAULT '' NOT NULL,
	`is_new` integer DEFAULT false NOT NULL,
	`pre_execution` integer DEFAULT false NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`sort_order` real NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `main_income_items` (`id`, `term`, `round_id`, `item_number`, `item_id`, `bureau`, `team`, `kan`, `kou`, `moku`, `setsu`, `amount`, `quantity`, `unit_price`, `spec`, `vendor`, `remark`, `link`, `planned_timing`, `is_new`, `pre_execution`, `deleted`, `status`, `sort_order`, `created_at`, `created_by`)
SELECT `id`, `term`, `round_id`, `item_number`, `item_id`, `bureau`, `team`, `kan`, `kou`, `moku`, `setsu`, `amount`, `quantity`, `unit_price`, `spec`, `vendor`, `remark`, `link`, `planned_timing`, `is_new`, `pre_execution`, `deleted`, `status`, `sort_order`, `created_at`, `created_by` FROM `main_budget_items` WHERE `item_number` LIKE 'in%' ORDER BY `rowid`;
--> statement-breakpoint
DELETE FROM `main_budget_items` WHERE `item_number` LIKE 'in%';
--> statement-breakpoint
INSERT INTO `revised_income_items` (`id`, `term`, `round_id`, `item_number`, `item_id`, `bureau`, `team`, `kan`, `kou`, `moku`, `setsu`, `amount`, `quantity`, `unit_price`, `spec`, `vendor`, `remark`, `link`, `planned_timing`, `is_new`, `pre_execution`, `deleted`, `status`, `sort_order`, `created_at`, `created_by`)
SELECT `id`, `term`, `round_id`, `item_number`, `item_id`, `bureau`, `team`, `kan`, `kou`, `moku`, `setsu`, `amount`, `quantity`, `unit_price`, `spec`, `vendor`, `remark`, `link`, `planned_timing`, `is_new`, `pre_execution`, `deleted`, `status`, `sort_order`, `created_at`, `created_by` FROM `revised_budget_items` WHERE `item_number` LIKE 'in%' ORDER BY `rowid`;
--> statement-breakpoint
DELETE FROM `revised_budget_items` WHERE `item_number` LIKE 'in%';
