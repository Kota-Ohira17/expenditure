ALTER TABLE `users` ADD `dm_on_created` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `dm_on_executed` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `slack_email` text DEFAULT '' NOT NULL;