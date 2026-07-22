CREATE TABLE `child_ai_conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`childAccountId` int NOT NULL,
	`title` varchar(255),
	`messages` json,
	`messageCount` int DEFAULT 0,
	`parentReviewed` boolean DEFAULT false,
	`flaggedForParent` boolean DEFAULT false,
	`flagReason` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `child_ai_conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `child_app_usage` (
	`id` int AUTO_INCREMENT NOT NULL,
	`childAccountId` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`packageName` varchar(255) NOT NULL,
	`appName` varchar(255),
	`usageSeconds` int DEFAULT 0,
	`category` varchar(32),
	`openCount` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `child_app_usage_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `child_daily_summary` (
	`id` int AUTO_INCREMENT NOT NULL,
	`childAccountId` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`totalAppUsageSeconds` int DEFAULT 0,
	`morningAdhkarDone` boolean DEFAULT false,
	`eveningAdhkarDone` boolean DEFAULT false,
	`sleepAdhkarDone` boolean DEFAULT false,
	`wakingAdhkarDone` boolean DEFAULT false,
	`customTasksCompleted` int DEFAULT 0,
	`customTasksTotal` int DEFAULT 0,
	`challengesCompleted` int DEFAULT 0,
	`aiQuestionsAsked` int DEFAULT 0,
	`screensVisited` json,
	`firstOpenAt` varchar(8),
	`lastCloseAt` varchar(8),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `child_daily_summary_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `custom_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parentId` int NOT NULL,
	`childAccountId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`category` varchar(32) DEFAULT 'other',
	`priority` varchar(10) DEFAULT 'medium',
	`dueDate` varchar(10),
	`recurrence` varchar(16) DEFAULT 'none',
	`status` varchar(16) DEFAULT 'pending',
	`proofImageUrl` text,
	`childNote` text,
	`parentFeedback` text,
	`completedAt` timestamp,
	`parentVerified` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `custom_tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `family_chat_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parentId` int NOT NULL,
	`childAccountId` int NOT NULL,
	`senderType` varchar(10) NOT NULL,
	`content` text NOT NULL,
	`messageType` varchar(16) DEFAULT 'text',
	`attachmentUrl` text,
	`isRead` boolean DEFAULT false,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `family_chat_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `parent_ai_consultations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parentId` int NOT NULL,
	`consultationType` varchar(10) NOT NULL,
	`targetId` varchar(32),
	`targetName` varchar(128),
	`messages` json,
	`messageCount` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `parent_ai_consultations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `gender` varchar(10);--> statement-breakpoint
ALTER TABLE `users` ADD `maritalStatus` varchar(32);--> statement-breakpoint
ALTER TABLE `users` ADD `hasChildren` boolean;--> statement-breakpoint
ALTER TABLE `users` ADD `previousMethodology` varchar(64);