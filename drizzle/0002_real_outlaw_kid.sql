ALTER TABLE `reader_notes` ADD `kind` text DEFAULT 'flashcard' NOT NULL;--> statement-breakpoint
ALTER TABLE `reader_notes` ADD `anchor_label` text;--> statement-breakpoint
ALTER TABLE `reader_notes` ADD `anchor_cfi` text;