CREATE TABLE `authors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`nameNl` varchar(128),
	`nameEn` varchar(128),
	`nameAr` varchar(128),
	`slug` varchar(128),
	`bioNl` text,
	`bioEn` text,
	`bioAr` text,
	`roleNl` varchar(128),
	`roleEn` varchar(128),
	`roleAr` varchar(128),
	`expertise` json,
	`avatarUrl` varchar(500),
	`socialLinks` json,
	`articleCount` int DEFAULT 0,
	`featured` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `authors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `parent_child_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parentId` int NOT NULL,
	`childId` int NOT NULL,
	`relationship` varchar(32) NOT NULL DEFAULT 'parent',
	`canEdit` boolean DEFAULT true,
	`confirmed` boolean DEFAULT false,
	`createdBy` int NOT NULL,
	`linkedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `parent_child_links_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `specialist_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`specialistId` int NOT NULL,
	`familyId` int NOT NULL,
	`status` varchar(16) NOT NULL DEFAULT 'pending',
	`expertise` varchar(128),
	`assignmentNotes` text,
	`assignedBy` int,
	`assignedAt` timestamp NOT NULL DEFAULT (now()),
	`acceptedAt` timestamp,
	CONSTRAINT `specialist_assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `specialist_notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`treatmentPlanId` int NOT NULL,
	`authorId` int NOT NULL,
	`type` varchar(32) NOT NULL DEFAULT 'feedback',
	`content` text NOT NULL,
	`visibleToParents` boolean DEFAULT true,
	`pinned` boolean DEFAULT false,
	`attachments` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `specialist_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `treatment_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`familyId` int NOT NULL,
	`childId` int NOT NULL,
	`specialistId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`issueDescription` text,
	`planContent` text,
	`status` varchar(16) NOT NULL DEFAULT 'active',
	`priority` varchar(16) DEFAULT 'medium',
	`category` varchar(32),
	`goals` json,
	`startDate` varchar(10),
	`targetEndDate` varchar(10),
	`completedDate` varchar(10),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `treatment_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','specialist','teacher') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `children` ADD `publicId` varchar(32);--> statement-breakpoint
ALTER TABLE `content` ADD `slug` varchar(255);--> statement-breakpoint
ALTER TABLE `content` ADD `excerpt` text;--> statement-breakpoint
ALTER TABLE `users` ADD `publicId` varchar(32);--> statement-breakpoint
ALTER TABLE `users` ADD `birthDate` varchar(10);--> statement-breakpoint
ALTER TABLE `users` ADD `password_hash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `auth_method` varchar(32) DEFAULT 'oauth';--> statement-breakpoint
ALTER TABLE `children` ADD CONSTRAINT `children_publicId_unique` UNIQUE(`publicId`);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_publicId_unique` UNIQUE(`publicId`);