CREATE TABLE `content_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(100) NOT NULL,
	`nameNl` varchar(255) NOT NULL,
	`nameEn` varchar(255) NOT NULL,
	`nameAr` varchar(255) NOT NULL,
	`appSection` enum('fitrah','weekprogramma','tips','begrippen','behandelingen','general') DEFAULT 'general',
	`ageGroup` varchar(50),
	`sortOrder` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `content_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `content_categories_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `content_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contentId` int NOT NULL,
	`fileName` varchar(500) NOT NULL,
	`fileType` enum('word','pdf','excel','image','other') NOT NULL,
	`filePath` varchar(1024) NOT NULL,
	`fileSize` int,
	`language` enum('nl','en','ar') DEFAULT 'nl',
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `content_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `content_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`categoryId` int,
	`contentType` enum('article','video','audio','tip','fatwa') NOT NULL,
	`status` enum('draft','published') NOT NULL DEFAULT 'draft',
	`originalLanguage` enum('nl','en','ar') NOT NULL DEFAULT 'nl',
	`tags` text,
	`authorId` int,
	`mediaUrl` varchar(1024),
	`sortOrder` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	`publishedAt` timestamp,
	CONSTRAINT `content_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `content_translations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contentId` int NOT NULL,
	`language` enum('nl','en','ar') NOT NULL,
	`title` varchar(500) NOT NULL,
	`summary` text,
	`body` text,
	`isAutoTranslated` boolean DEFAULT false,
	`isReviewed` boolean DEFAULT false,
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `content_translations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `function_invitation_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(20) NOT NULL,
	`functionRole` enum('vader','moeder','specialist','leraar','kennisdrager','arts','imam','therapeut','maatschappelijk_werker','opvoedkundige_begeleider') NOT NULL,
	`restrictedEmail` varchar(255),
	`maxUses` int,
	`usedCount` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp,
	CONSTRAINT `function_invitation_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `function_invitation_codes_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
ALTER TABLE `messages` MODIFY COLUMN `type` varchar(32) NOT NULL DEFAULT 'text';--> statement-breakpoint
ALTER TABLE `user_functions` MODIFY COLUMN `functionRole` enum('vader','moeder','specialist','leraar','kennisdrager','arts','imam','therapeut','maatschappelijk_werker','opvoedkundige_begeleider') NOT NULL;