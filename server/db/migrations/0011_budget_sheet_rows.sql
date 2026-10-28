CREATE TABLE `budget_sheet_rows` (
	`sort_order` integer PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`cells` text NOT NULL,
	`line_key` text
);
