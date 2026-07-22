CREATE TABLE `user_authorization_roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`role` enum('super_admin','admin','moderator','user') NOT NULL,
	`assignedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_authorization_roles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_functions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`functionRole` enum('ouder','specialist','leraar','kennisdrager','arts','imam','therapeut','maatschappelijk_werker') NOT NULL,
	`specialization` varchar(255),
	`city` varchar(128),
	`isActive` boolean DEFAULT true,
	`assignedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_functions_id` PRIMARY KEY(`id`)
);
