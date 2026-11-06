CREATE TABLE `issued_item_numbers` (
	`term` text NOT NULL,
	`item_number` text NOT NULL,
	`source` text NOT NULL,
	`reference_number` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`term`, `item_number`)
);
