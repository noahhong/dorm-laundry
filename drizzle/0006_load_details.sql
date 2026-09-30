CREATE TABLE `report_photos` (
	`report_id` text PRIMARY KEY NOT NULL,
	`mime` text NOT NULL,
	`bytes` blob NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `reports` ADD `damaged_items` text;--> statement-breakpoint
ALTER TABLE `reports` ADD `damage_kinds` text;