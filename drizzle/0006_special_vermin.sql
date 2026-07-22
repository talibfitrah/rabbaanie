CREATE TABLE `admin_2fa` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`secret` varchar(128) NOT NULL,
	`verified` boolean NOT NULL DEFAULT false,
	`backupCodes` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `admin_2fa_id` PRIMARY KEY(`id`),
	CONSTRAINT `admin_2fa_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`userName` varchar(255),
	`userRole` varchar(32),
	`action` varchar(64) NOT NULL,
	`entityType` varchar(64),
	`entityId` int,
	`description` text,
	`metadata` json,
	`ipAddress` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
