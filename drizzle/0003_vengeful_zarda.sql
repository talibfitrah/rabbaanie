CREATE TABLE `specialist_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`displayName` varchar(128),
	`bio` text,
	`expertise` json,
	`languages` json,
	`country` varchar(64),
	`countryIso` varchar(5),
	`city` varchar(128),
	`lat` varchar(20),
	`lon` varchar(20),
	`phone` varchar(32),
	`isAvailable` boolean DEFAULT true,
	`maxFamilies` int DEFAULT 10,
	`activeFamilyCount` int DEFAULT 0,
	`rating` varchar(5),
	`ratingCount` int DEFAULT 0,
	`verified` boolean DEFAULT false,
	`lastOnline` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `specialist_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `specialist_profiles_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `messages` ADD `readAt` timestamp;