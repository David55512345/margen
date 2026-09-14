import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { AnnotationOrigin } from "../app/annotation-conversion";

export const readerNotes = sqliteTable("reader_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerKey: text("owner_key").notNull(),
  bookKey: text("book_key").notNull(),
  bookTitle: text("book_title").notNull(),
  chapterKey: text("chapter_key").notNull(),
  chapterTitle: text("chapter_title").notNull(),
  kind: text("kind").notNull().default("flashcard"),
  front: text("front").notNull(),
  back: text("back").notNull(),
  anchorLabel: text("anchor_label"),
  anchorCfi: text("anchor_cfi"),
  quote: text("quote"),
  color: text("color"),
  highlightId: text("highlight_id"),
  sectionIndex: integer("section_index"),
  origin: text("origin", { mode: "json" }).$type<AnnotationOrigin>(),
  conversionKey: text("conversion_key"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_reader_notes_owner_book").on(table.ownerKey, table.bookKey),
  uniqueIndex("idx_reader_notes_owner_conversion").on(table.ownerKey, table.conversionKey),
]);

export const learningProgress = sqliteTable("learning_progress", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerKey: text("owner_key").notNull(),
  bookKey: text("book_key").notNull(),
  chapterKey: text("chapter_key").notNull(),
  phase: text("phase").notNull(),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  payload: text("payload").notNull().default("{}"),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("idx_learning_progress_owner_book_chapter_phase")
    .on(table.ownerKey, table.bookKey, table.chapterKey, table.phase),
]);

export const aiBooks = sqliteTable("ai_books", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerKey: text("owner_key").notNull(),
  bookId: text("book_id").notNull(),
  legacyKey: text("legacy_key").notNull(),
  title: text("title").notNull(),
  author: text("author").notNull(),
  tocJson: text("toc_json").notNull().default("[]"),
  profileJson: text("profile_json").notNull().default("{}"),
  analysisVersion: text("analysis_version").notNull(),
  promptVersion: text("prompt_version").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("idx_ai_books_owner_book").on(table.ownerKey, table.bookId),
  index("idx_ai_books_owner_legacy").on(table.ownerKey, table.legacyKey),
]);

export const chapterMemories = sqliteTable("chapter_memories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerKey: text("owner_key").notNull(),
  bookId: text("book_id").notNull(),
  chapterId: text("chapter_id").notNull(),
  sectionIndex: integer("section_index").notNull(),
  title: text("title").notNull(),
  contentHash: text("content_hash").notNull(),
  cardJson: text("card_json").notNull(),
  studyJson: text("study_json").notNull(),
  conceptsJson: text("concepts_json").notNull(),
  analysisVersion: text("analysis_version").notNull(),
  promptVersion: text("prompt_version").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("idx_chapter_memories_owner_book_chapter")
    .on(table.ownerKey, table.bookId, table.chapterId),
  index("idx_chapter_memories_owner_book_section")
    .on(table.ownerKey, table.bookId, table.sectionIndex),
]);

export const aiCache = sqliteTable("ai_cache", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerKey: text("owner_key").notNull(),
  cacheKey: text("cache_key").notNull(),
  bookId: text("book_id").notNull(),
  chapterId: text("chapter_id"),
  task: text("task").notNull(),
  inputHash: text("input_hash").notNull(),
  analysisVersion: text("analysis_version").notNull(),
  promptVersion: text("prompt_version").notNull(),
  model: text("model").notNull(),
  responseJson: text("response_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("idx_ai_cache_key").on(table.cacheKey),
  index("idx_ai_cache_owner_book_task").on(table.ownerKey, table.bookId, table.task),
]);

export const aiUsageEvents = sqliteTable("ai_usage_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerKey: text("owner_key").notNull(),
  bookId: text("book_id").notNull(),
  chapterId: text("chapter_id"),
  task: text("task").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  cachedTokens: integer("cached_tokens").notNull().default(0),
  estimatedInputTokens: integer("estimated_input_tokens").notNull().default(0),
  durationMs: integer("duration_ms").notNull().default(0),
  cacheHit: integer("cache_hit", { mode: "boolean" }).notNull().default(false),
  contextChunks: integer("context_chunks").notNull().default(0),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("idx_ai_usage_owner_created").on(table.ownerKey, table.createdAt),
  index("idx_ai_usage_owner_task").on(table.ownerKey, table.task),
]);

export const readerPositions = sqliteTable("reader_positions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerKey: text("owner_key").notNull(),
  bookId: text("book_id").notNull(),
  sectionIndex: integer("section_index").notNull().default(0),
  maxReadSectionIndex: integer("max_read_section_index").notNull().default(0),
  cfi: text("cfi").notNull().default(""),
  percent: integer("percent").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("idx_reader_positions_owner_book").on(table.ownerKey, table.bookId),
]);

export const userLearningMemory = sqliteTable("user_learning_memory", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerKey: text("owner_key").notNull(),
  bookId: text("book_id").notNull(),
  conceptId: text("concept_id").notNull(),
  seen: integer("seen", { mode: "boolean" }).notNull().default(true),
  mastery: integer("mastery").notNull().default(0),
  confusionsJson: text("confusions_json").notNull().default("[]"),
  feynmanAttempts: integer("feynman_attempts").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("idx_user_learning_owner_book_concept")
    .on(table.ownerKey, table.bookId, table.conceptId),
]);

export const syncedDocuments = sqliteTable("synced_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerKey: text("owner_key").notNull(),
  bookKey: text("book_key").notNull(),
  scope: text("scope").notNull(),
  payload: text("payload").notNull().default("null"),
  revision: integer("revision").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("idx_synced_documents_owner_book_scope").on(table.ownerKey, table.bookKey, table.scope),
  index("idx_synced_documents_owner_updated").on(table.ownerKey, table.updatedAt),
]);

export const syncedBooks = sqliteTable("synced_books", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerKey: text("owner_key").notNull(),
  bookId: text("book_id").notNull(),
  bookKey: text("book_key").notNull(),
  title: text("title").notNull(),
  author: text("author").notNull(),
  fileName: text("file_name").notNull(),
  objectKey: text("object_key").notNull(),
  contentType: text("content_type").notNull().default("application/epub+zip"),
  sizeBytes: integer("size_bytes").notNull().default(0),
  etag: text("etag").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  lastOpenedAt: text("last_opened_at").notNull(),
}, (table) => [
  uniqueIndex("idx_synced_books_owner_book").on(table.ownerKey, table.bookId),
  index("idx_synced_books_owner_last_opened").on(table.ownerKey, table.lastOpenedAt),
]);
