import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../db";
import {
  aiBooks,
  aiCache,
  aiUsageEvents,
  chapterMemories,
  readerPositions,
  userLearningMemory,
} from "../../db/schema";
import type { AssistantResponse, BookProfile, ChapterAnalysis } from "../study-contract";
import { ANALYSIS_VERSION, PROMPT_VERSION } from "./constants";

export function requestOwnerKey(request: Request) {
  return request.headers.get("oai-authenticated-user-id") || "site-owner";
}

function parseJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

export async function getBookMemory(ownerKey: string, bookId: string) {
  const [row] = await getDb().select().from(aiBooks)
    .where(and(eq(aiBooks.ownerKey, ownerKey), eq(aiBooks.bookId, bookId)))
    .limit(1);
  if (!row) return null;
  return { ...row, profile: parseJson<BookProfile>(row.profileJson, emptyBookProfile()) };
}

export async function upsertBookMemory(values: {
  ownerKey: string;
  bookId: string;
  legacyKey: string;
  title: string;
  author: string;
  toc: string[];
  profile: BookProfile;
}) {
  const now = new Date().toISOString();
  const [row] = await getDb().insert(aiBooks).values({
    ownerKey: values.ownerKey,
    bookId: values.bookId,
    legacyKey: values.legacyKey,
    title: values.title,
    author: values.author,
    tocJson: JSON.stringify(values.toc),
    profileJson: JSON.stringify(values.profile),
    analysisVersion: ANALYSIS_VERSION,
    promptVersion: PROMPT_VERSION,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [aiBooks.ownerKey, aiBooks.bookId],
    set: {
      legacyKey: values.legacyKey,
      title: values.title,
      author: values.author,
      tocJson: JSON.stringify(values.toc),
      profileJson: JSON.stringify(values.profile),
      analysisVersion: ANALYSIS_VERSION,
      promptVersion: PROMPT_VERSION,
      updatedAt: now,
    },
  }).returning();
  return row;
}

export async function updateBookProfile(ownerKey: string, bookId: string, profile: BookProfile) {
  await getDb().update(aiBooks).set({
    profileJson: JSON.stringify(profile),
    analysisVersion: ANALYSIS_VERSION,
    promptVersion: PROMPT_VERSION,
    updatedAt: new Date().toISOString(),
  }).where(and(eq(aiBooks.ownerKey, ownerKey), eq(aiBooks.bookId, bookId)));
}

export async function getChapterMemory(ownerKey: string, bookId: string, chapterId: string) {
  const [row] = await getDb().select().from(chapterMemories)
    .where(and(
      eq(chapterMemories.ownerKey, ownerKey),
      eq(chapterMemories.bookId, bookId),
      eq(chapterMemories.chapterId, chapterId),
    )).limit(1);
  if (!row) return null;
  return rowToAnalysis(row);
}

export async function getChapterMemories(ownerKey: string, bookId: string) {
  const rows = await getDb().select().from(chapterMemories)
    .where(and(eq(chapterMemories.ownerKey, ownerKey), eq(chapterMemories.bookId, bookId)));
  return rows.map(rowToAnalysis);
}

function rowToAnalysis(row: typeof chapterMemories.$inferSelect): ChapterAnalysis {
  return {
    bookId: row.bookId,
    chapterId: row.chapterId,
    chapterTitle: row.title,
    sectionIndex: row.sectionIndex,
    contentHash: row.contentHash,
    card: parseJson(row.cardJson, emptyChapterCard()),
    study: parseJson(row.studyJson, emptyStudyBundle()),
    concepts: parseJson(row.conceptsJson, []),
    analysisVersion: row.analysisVersion,
    promptVersion: row.promptVersion,
  };
}

export async function saveChapterMemory(ownerKey: string, analysis: ChapterAnalysis) {
  const now = new Date().toISOString();
  await getDb().insert(chapterMemories).values({
    ownerKey,
    bookId: analysis.bookId,
    chapterId: analysis.chapterId,
    sectionIndex: analysis.sectionIndex,
    title: analysis.chapterTitle,
    contentHash: analysis.contentHash,
    cardJson: JSON.stringify(analysis.card),
    studyJson: JSON.stringify(analysis.study),
    conceptsJson: JSON.stringify(analysis.concepts),
    analysisVersion: analysis.analysisVersion,
    promptVersion: analysis.promptVersion,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [chapterMemories.ownerKey, chapterMemories.bookId, chapterMemories.chapterId],
    set: {
      sectionIndex: analysis.sectionIndex,
      title: analysis.chapterTitle,
      contentHash: analysis.contentHash,
      cardJson: JSON.stringify(analysis.card),
      studyJson: JSON.stringify(analysis.study),
      conceptsJson: JSON.stringify(analysis.concepts),
      analysisVersion: analysis.analysisVersion,
      promptVersion: analysis.promptVersion,
      updatedAt: now,
    },
  });
}

export async function getCachedAssistantResponse(ownerKey: string, cacheKey: string) {
  const [row] = await getDb().select().from(aiCache)
    .where(and(eq(aiCache.ownerKey, ownerKey), eq(aiCache.cacheKey, cacheKey))).limit(1);
  return row ? parseJson<AssistantResponse | null>(row.responseJson, null) : null;
}

export async function saveAssistantResponse(values: {
  ownerKey: string;
  cacheKey: string;
  bookId: string;
  chapterId: string;
  task: string;
  inputHash: string;
  model: string;
  response: AssistantResponse;
}) {
  await getDb().insert(aiCache).values({
    ownerKey: values.ownerKey,
    cacheKey: values.cacheKey,
    bookId: values.bookId,
    chapterId: values.chapterId,
    task: values.task,
    inputHash: values.inputHash,
    analysisVersion: ANALYSIS_VERSION,
    promptVersion: PROMPT_VERSION,
    model: values.model,
    responseJson: JSON.stringify(values.response),
    createdAt: new Date().toISOString(),
  }).onConflictDoNothing({ target: aiCache.cacheKey });
}

export async function recordAIUsage(values: typeof aiUsageEvents.$inferInsert) {
  await getDb().insert(aiUsageEvents).values(values);
}

export async function getRecentAIUsage(ownerKey: string, limit = 100) {
  return getDb().select().from(aiUsageEvents)
    .where(eq(aiUsageEvents.ownerKey, ownerKey))
    .orderBy(desc(aiUsageEvents.createdAt))
    .limit(Math.max(1, Math.min(500, limit)));
}

export async function getReaderPosition(ownerKey: string, bookId: string) {
  const [row] = await getDb().select().from(readerPositions)
    .where(and(eq(readerPositions.ownerKey, ownerKey), eq(readerPositions.bookId, bookId))).limit(1);
  return row ?? null;
}

export async function saveReaderPosition(values: {
  ownerKey: string;
  bookId: string;
  sectionIndex: number;
  maxReadSectionIndex: number;
  cfi: string;
  percent: number;
}) {
  const now = new Date().toISOString();
  await getDb().insert(readerPositions).values({ ...values, updatedAt: now })
    .onConflictDoUpdate({
      target: [readerPositions.ownerKey, readerPositions.bookId],
      set: {
        sectionIndex: values.sectionIndex,
        maxReadSectionIndex: values.maxReadSectionIndex,
        cfi: values.cfi,
        percent: values.percent,
        updatedAt: now,
      },
    });
}

export async function updateLearningMemory(values: {
  ownerKey: string;
  bookId: string;
  conceptId: string;
  mastery: number;
  confusions: string[];
  feynman: boolean;
}) {
  const existing = await getDb().select().from(userLearningMemory).where(and(
    eq(userLearningMemory.ownerKey, values.ownerKey),
    eq(userLearningMemory.bookId, values.bookId),
    eq(userLearningMemory.conceptId, values.conceptId),
  )).limit(1);
  const now = new Date().toISOString();
  const attempts = (existing[0]?.feynmanAttempts ?? 0) + (values.feynman ? 1 : 0);
  await getDb().insert(userLearningMemory).values({
    ownerKey: values.ownerKey,
    bookId: values.bookId,
    conceptId: values.conceptId,
    seen: true,
    mastery: Math.max(0, Math.min(100, values.mastery)),
    confusionsJson: JSON.stringify(values.confusions.slice(0, 8)),
    feynmanAttempts: attempts,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [userLearningMemory.ownerKey, userLearningMemory.bookId, userLearningMemory.conceptId],
    set: {
      seen: true,
      mastery: Math.max(0, Math.min(100, values.mastery)),
      confusionsJson: JSON.stringify(values.confusions.slice(0, 8)),
      feynmanAttempts: attempts,
      updatedAt: now,
    },
  });
}

export function emptyBookProfile(): BookProfile {
  return {
    domains: [], contentType: "desconocido", centralTopics: [], centralQuestions: [],
    observedPositions: [], recurringAssumptions: [], methodsOfReasoning: [], importantDistinctions: [],
    keyConcepts: [], importantEntities: [], possibleTraditions: [],
  };
}

function emptyChapterCard() {
  return {
    mainQuestion: "", thesis: "", keyConcepts: [], argumentMap: [], importantClaims: [], definitions: [],
    authorAssumptions: [], importantEntities: [], connectionsToPreviousContent: [], interpretiveContext: [],
  };
}

function emptyStudyBundle() {
  return { preReadingQuestions: [], learningObjectives: [], postReadingQuestions: [], feynmanQuestion: "", commonMisunderstandings: [] };
}
