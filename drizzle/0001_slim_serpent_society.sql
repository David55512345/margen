CREATE TABLE `ai_books` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_key` text NOT NULL,
	`book_id` text NOT NULL,
	`legacy_key` text NOT NULL,
	`title` text NOT NULL,
	`author` text NOT NULL,
	`toc_json` text DEFAULT '[]' NOT NULL,
	`profile_json` text DEFAULT '{}' NOT NULL,
	`analysis_version` text NOT NULL,
	`prompt_version` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ai_books_owner_book` ON `ai_books` (`owner_key`,`book_id`);--> statement-breakpoint
CREATE INDEX `idx_ai_books_owner_legacy` ON `ai_books` (`owner_key`,`legacy_key`);--> statement-breakpoint
CREATE TABLE `ai_cache` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_key` text NOT NULL,
	`cache_key` text NOT NULL,
	`book_id` text NOT NULL,
	`chapter_id` text,
	`task` text NOT NULL,
	`input_hash` text NOT NULL,
	`analysis_version` text NOT NULL,
	`prompt_version` text NOT NULL,
	`model` text NOT NULL,
	`response_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ai_cache_key` ON `ai_cache` (`cache_key`);--> statement-breakpoint
CREATE INDEX `idx_ai_cache_owner_book_task` ON `ai_cache` (`owner_key`,`book_id`,`task`);--> statement-breakpoint
CREATE TABLE `ai_usage_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_key` text NOT NULL,
	`book_id` text NOT NULL,
	`chapter_id` text,
	`task` text NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cached_tokens` integer DEFAULT 0 NOT NULL,
	`estimated_input_tokens` integer DEFAULT 0 NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`cache_hit` integer DEFAULT false NOT NULL,
	`context_chunks` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ai_usage_owner_created` ON `ai_usage_events` (`owner_key`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ai_usage_owner_task` ON `ai_usage_events` (`owner_key`,`task`);--> statement-breakpoint
CREATE TABLE `chapter_memories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_key` text NOT NULL,
	`book_id` text NOT NULL,
	`chapter_id` text NOT NULL,
	`section_index` integer NOT NULL,
	`title` text NOT NULL,
	`content_hash` text NOT NULL,
	`card_json` text NOT NULL,
	`study_json` text NOT NULL,
	`concepts_json` text NOT NULL,
	`analysis_version` text NOT NULL,
	`prompt_version` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_chapter_memories_owner_book_chapter` ON `chapter_memories` (`owner_key`,`book_id`,`chapter_id`);--> statement-breakpoint
CREATE INDEX `idx_chapter_memories_owner_book_section` ON `chapter_memories` (`owner_key`,`book_id`,`section_index`);--> statement-breakpoint
CREATE TABLE `reader_positions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_key` text NOT NULL,
	`book_id` text NOT NULL,
	`section_index` integer DEFAULT 0 NOT NULL,
	`max_read_section_index` integer DEFAULT 0 NOT NULL,
	`cfi` text DEFAULT '' NOT NULL,
	`percent` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reader_positions_owner_book` ON `reader_positions` (`owner_key`,`book_id`);--> statement-breakpoint
CREATE TABLE `user_learning_memory` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_key` text NOT NULL,
	`book_id` text NOT NULL,
	`concept_id` text NOT NULL,
	`seen` integer DEFAULT true NOT NULL,
	`mastery` integer DEFAULT 0 NOT NULL,
	`confusions_json` text DEFAULT '[]' NOT NULL,
	`feynman_attempts` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_learning_owner_book_concept` ON `user_learning_memory` (`owner_key`,`book_id`,`concept_id`);
--> statement-breakpoint
PRAGMA optimize;
