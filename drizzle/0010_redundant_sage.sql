CREATE TABLE `partnerships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId1` int NOT NULL,
	`userId2` int NOT NULL,
	`status` varchar(16) NOT NULL DEFAULT 'active',
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`dissolvedAt` timestamp,
	CONSTRAINT `partnerships_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `spouse_advice` (
	`id` int AUTO_INCREMENT NOT NULL,
	`recipientId` int NOT NULL,
	`aboutSpouseId` int NOT NULL,
	`content` text NOT NULL,
	`category` varchar(32) NOT NULL DEFAULT 'general',
	`basedOn` json,
	`isRead` boolean DEFAULT false,
	`isHelpful` boolean,
	`weekId` varchar(10),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `spouse_advice_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `translation_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceHash` varchar(64) NOT NULL,
	`targetLang` enum('nl','en') NOT NULL,
	`sourceText` text NOT NULL,
	`translatedText` text NOT NULL,
	`category` varchar(50) DEFAULT 'general',
	`hitCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `translation_cache_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `children` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `deletedAt` timestamp;