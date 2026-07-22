CREATE TABLE `admin_stats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` varchar(32) NOT NULL,
	`date` varchar(10) NOT NULL,
	`value` int NOT NULL DEFAULT 0,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `admin_stats_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`childId` varchar(64),
	`type` varchar(32) NOT NULL DEFAULT 'freeform',
	`title` varchar(255),
	`language` varchar(5) DEFAULT 'nl',
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`role` varchar(16) NOT NULL,
	`content` text NOT NULL,
	`provider` varchar(16),
	`model` varchar(64),
	`tokensUsed` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `child_observations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`childId` int NOT NULL,
	`authorId` int NOT NULL,
	`category` varchar(32) NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`severity` varchar(16) DEFAULT 'medium',
	`tags` json,
	`addressed` boolean DEFAULT false,
	`observedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `child_observations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `children` (
	`id` int AUTO_INCREMENT NOT NULL,
	`familyId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`birthDate` varchar(10),
	`gender` varchar(16),
	`profileData` json,
	`environmentData` json,
	`profileCompleted` boolean DEFAULT false,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `children_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `content` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` varchar(32) NOT NULL,
	`category` varchar(32),
	`subCategory` varchar(64),
	`ageRange` varchar(16),
	`titleNl` varchar(500),
	`titleEn` varchar(500),
	`titleAr` varchar(500),
	`contentNl` text,
	`contentEn` text,
	`contentAr` text,
	`source` text,
	`sourceEn` text,
	`sourceAr` text,
	`tags` json,
	`published` boolean DEFAULT true,
	`sortOrder` int DEFAULT 0,
	`authorId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `content_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `families` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`inviteCode` varchar(32) NOT NULL,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `families_id` PRIMARY KEY(`id`),
	CONSTRAINT `families_inviteCode_unique` UNIQUE(`inviteCode`)
);
--> statement-breakpoint
CREATE TABLE `family_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`familyId` int NOT NULL,
	`userId` int NOT NULL,
	`role` varchar(32) NOT NULL DEFAULT 'familielid',
	`displayName` varchar(128),
	`permissions` json,
	`accepted` boolean DEFAULT false,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `family_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `goal_progress` (
	`id` int AUTO_INCREMENT NOT NULL,
	`familyId` int NOT NULL,
	`childId` int NOT NULL,
	`weekId` varchar(10) NOT NULL,
	`goalId` varchar(64) NOT NULL,
	`status` varchar(16) NOT NULL DEFAULT 'pending',
	`notes` text,
	`markedBy` int,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `goal_progress_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`familyId` int NOT NULL,
	`senderId` int NOT NULL,
	`recipientId` int,
	`childId` int,
	`type` varchar(16) NOT NULL DEFAULT 'text',
	`subject` varchar(255),
	`content` text NOT NULL,
	`isRead` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `newsletter_interactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`newsletterId` int NOT NULL,
	`subscriberId` int NOT NULL,
	`type` varchar(32) NOT NULL,
	`data` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `newsletter_interactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `newsletter_subscribers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`email` varchar(320) NOT NULL,
	`name` varchar(128),
	`language` varchar(5) DEFAULT 'nl',
	`active` boolean DEFAULT true,
	`subscribedAt` timestamp NOT NULL DEFAULT (now()),
	`unsubscribedAt` timestamp,
	CONSTRAINT `newsletter_subscribers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `newsletters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`titleNl` varchar(255),
	`titleEn` varchar(255),
	`titleAr` varchar(255),
	`contentNl` text,
	`contentEn` text,
	`contentAr` text,
	`interactiveElements` json,
	`audience` varchar(32) DEFAULT 'all',
	`status` varchar(16) DEFAULT 'draft',
	`scheduledAt` timestamp,
	`sentAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `newsletters_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `language` varchar(5) DEFAULT 'nl';--> statement-breakpoint
ALTER TABLE `users` ADD `profileData` json;--> statement-breakpoint
ALTER TABLE `users` ADD `onboardingCompleted` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `users` ADD `lastActive` timestamp DEFAULT (now());