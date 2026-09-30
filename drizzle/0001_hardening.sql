CREATE TABLE `login_failures` (
	`id` text PRIMARY KEY NOT NULL,
	`ip_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `login_failures_ip_time` ON `login_failures` (`ip_hash`,`created_at`);--> statement-breakpoint
ALTER TABLE `reports` ADD `undone_at` integer;