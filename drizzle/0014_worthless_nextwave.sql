CREATE TABLE `daily_diagnostic_checkins` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`questions` json NOT NULL,
	`answers` json,
	`source` varchar(16) NOT NULL DEFAULT 'generated',
	`answeredAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `daily_diagnostic_checkins_id` PRIMARY KEY(`id`),
	CONSTRAINT `daily_diagnostic_user_date_unique` UNIQUE(`userId`,`date`)
);
