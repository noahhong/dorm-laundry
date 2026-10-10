CREATE TABLE `report_flags` (
	`report_id` text NOT NULL,
	`device_hash` text NOT NULL,
	`ip_hash` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_flags_report_device` ON `report_flags` (`report_id`,`device_hash`);--> statement-breakpoint
CREATE INDEX `report_flags_device_time` ON `report_flags` (`device_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `report_flags_ip_time` ON `report_flags` (`ip_hash`,`created_at`);--> statement-breakpoint
ALTER TABLE `reports` ADD `flags_cleared_at` integer;