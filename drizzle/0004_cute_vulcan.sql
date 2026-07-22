CREATE TABLE `invitation_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(32) NOT NULL,
	`createdBy` int,
	`usedBy` int,
	`isUsed` boolean DEFAULT false,
	`restrictedEmail` varchar(255),
	`expiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`usedAt` timestamp,
	CONSTRAINT `invitation_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `invitation_codes_code_unique` UNIQUE(`code`)
);
