ALTER TABLE `machine_runs` ADD `alert_endpoint` text;--> statement-breakpoint
ALTER TABLE `machine_runs` ADD `alert_p256dh` text;--> statement-breakpoint
ALTER TABLE `machine_runs` ADD `alert_auth` text;--> statement-breakpoint
CREATE INDEX `machine_runs_ends` ON `machine_runs` (`ends_at`);