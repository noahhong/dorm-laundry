CREATE TABLE `report_votes` (
	`report_id` text NOT NULL,
	`device_hash` text NOT NULL,
	`ip_hash` text NOT NULL,
	`vote` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_votes_report_device` ON `report_votes` (`report_id`,`device_hash`);--> statement-breakpoint
CREATE INDEX `report_votes_device_time` ON `report_votes` (`device_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `report_votes_ip_time` ON `report_votes` (`ip_hash`,`created_at`);--> statement-breakpoint
ALTER TABLE `reports` ADD `thickness` text;