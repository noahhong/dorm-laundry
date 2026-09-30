CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`machine_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`device_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_machine_endpoint` ON `push_subscriptions` (`machine_id`,`endpoint`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_device` ON `push_subscriptions` (`device_hash`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_created` ON `push_subscriptions` (`created_at`);