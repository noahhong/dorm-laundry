CREATE TABLE `buildings` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`campus` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `buildings_slug_unique` ON `buildings` (`slug`);--> statement-breakpoint
CREATE TABLE `machines` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`code` text NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`wash_machine_number` text,
	`position` integer DEFAULT 0 NOT NULL,
	`admin_state` text,
	`admin_note` text,
	`status_reset_at` integer,
	`retired_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `machines_code_unique` ON `machines` (`code`);--> statement-breakpoint
CREATE INDEX `machines_room` ON `machines` (`room_id`,`position`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`machine_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`outcome` text NOT NULL,
	`setting` text,
	`symptoms` text DEFAULT '[]' NOT NULL,
	`error_code` text,
	`minutes` integer,
	`load_size` text,
	`note` text,
	`device_hash` text NOT NULL,
	`ip_hash` text NOT NULL,
	`trust` real DEFAULT 1 NOT NULL,
	`hidden_at` integer,
	FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reports_machine_time` ON `reports` (`machine_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `reports_device_time` ON `reports` (`device_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `reports_ip_time` ON `reports` (`ip_hash`,`created_at`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`building_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`location_hint` text,
	`wash_location_code` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`building_id`) REFERENCES `buildings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_building_slug` ON `rooms` (`building_id`,`slug`);