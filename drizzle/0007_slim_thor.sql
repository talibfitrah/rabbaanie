CREATE TABLE `network_contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category` enum('specialist','teacher','kennisdrager','doctor') NOT NULL,
	`name` varchar(128) NOT NULL,
	`email` varchar(320),
	`phone` varchar(32),
	`specialization` varchar(255),
	`city` varchar(128),
	`country` varchar(64),
	`bio` text,
	`languages` json,
	`isAvailable` boolean DEFAULT true,
	`userId` int,
	`addedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `network_contacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','super_admin','moderator','specialist','teacher','kennisdrager','doctor') NOT NULL DEFAULT 'user';