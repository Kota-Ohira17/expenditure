CREATE TABLE `manual_journals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`memo` text NOT NULL,
	`lines` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
