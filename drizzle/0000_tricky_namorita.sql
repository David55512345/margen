CREATE TABLE `learning_progress` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_key` text NOT NULL,
	`book_key` text NOT NULL,
	`chapter_key` text NOT NULL,
	`phase` text NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_learning_progress_owner_book_chapter_phase` ON `learning_progress` (`owner_key`,`book_key`,`chapter_key`,`phase`);--> statement-breakpoint
CREATE TABLE `reader_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_key` text NOT NULL,
	`book_key` text NOT NULL,
	`book_title` text NOT NULL,
	`chapter_key` text NOT NULL,
	`chapter_title` text NOT NULL,
	`front` text NOT NULL,
	`back` text NOT NULL,
	`quote` text,
	`color` text,
	`section_index` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_reader_notes_owner_book` ON `reader_notes` (`owner_key`,`book_key`);