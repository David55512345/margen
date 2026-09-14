CREATE TABLE `synced_books` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_key` text NOT NULL,
	`book_id` text NOT NULL,
	`book_key` text NOT NULL,
	`title` text NOT NULL,
	`author` text NOT NULL,
	`file_name` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text DEFAULT 'application/epub+zip' NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`etag` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_opened_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_synced_books_owner_book` ON `synced_books` (`owner_key`,`book_id`);--> statement-breakpoint
CREATE INDEX `idx_synced_books_owner_last_opened` ON `synced_books` (`owner_key`,`last_opened_at`);--> statement-breakpoint
CREATE TABLE `synced_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_key` text NOT NULL,
	`book_key` text NOT NULL,
	`scope` text NOT NULL,
	`payload` text DEFAULT 'null' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_synced_documents_owner_book_scope` ON `synced_documents` (`owner_key`,`book_key`,`scope`);--> statement-breakpoint
CREATE INDEX `idx_synced_documents_owner_updated` ON `synced_documents` (`owner_key`,`updated_at`);