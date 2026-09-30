CREATE TABLE `machine_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`machine_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`ended_at` integer,
	`device_hash` text NOT NULL,
	`ip_hash` text NOT NULL,
	FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `machine_runs_machine_time` ON `machine_runs` (`machine_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `machine_runs_device_time` ON `machine_runs` (`device_hash`,`started_at`);--> statement-breakpoint
CREATE INDEX `machine_runs_ip_time` ON `machine_runs` (`ip_hash`,`started_at`);