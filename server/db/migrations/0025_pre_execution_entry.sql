ALTER TABLE `pre_execution_requests` ADD `entry_id` integer REFERENCES entries(id);--> statement-breakpoint
ALTER TABLE `pre_execution_requests` ADD `item_name` text DEFAULT '' NOT NULL;