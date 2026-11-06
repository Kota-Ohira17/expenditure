ALTER TABLE `budget_change_requests` ADD `item_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `budget_lines` ADD `item_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `budget_reviews` ADD `item_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `entry_items` ADD `item_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `income_records` ADD `item_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `main_budget_items` ADD `item_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `pre_execution_requests` ADD `item_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `revised_budget_items` ADD `item_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE `main_budget_items` SET `item_id` = `item_number`;
--> statement-breakpoint
UPDATE `revised_budget_items` SET `item_id` = `item_number`;
--> statement-breakpoint
UPDATE `budget_reviews` SET `item_id` = `item_number`;
--> statement-breakpoint
UPDATE `budget_change_requests` SET `item_id` = `item_number`;
--> statement-breakpoint
UPDATE `pre_execution_requests` SET `item_id` = `item_number`;
--> statement-breakpoint
UPDATE `budget_lines` SET `item_id` = `item_number`;
--> statement-breakpoint
UPDATE `entry_items` SET `item_id` = `item_number`;
--> statement-breakpoint
UPDATE `income_records` SET `item_id` = `item_number` WHERE `line_key` IS NOT NULL;
