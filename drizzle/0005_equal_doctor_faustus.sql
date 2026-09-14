ALTER TABLE `reader_notes` ADD `origin` text;--> statement-breakpoint
ALTER TABLE `reader_notes` ADD `conversion_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reader_notes_owner_conversion` ON `reader_notes` (`owner_key`,`conversion_key`);