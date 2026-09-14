import { env } from "cloudflare:workers";
import { ANALYSIS_VERSION, DEFAULT_OPENAI_MODEL, PROMPT_VERSION, TASK_OUTPUT_BUDGETS } from "../../ai/constants";
import { callOpenAI } from "../../ai/provider";
import { CHAPTER_ANALYSIS_INSTRUCTIONS } from "../../ai/prompts";
import {
  getBookMemory,
  getChapterMemory,
  recordAIUsage,
  requestOwnerKey,
  saveChapterMemory,
  updateBookProfile,
  upsertBookMemory,
} from "../../ai/repository";
import {
  CHAPTER_ANALYSIS_SCHEMA,
  type BookProfile,
  type ChapterAnalysis,
  type ChapterAnalysisRequest,
  type ChapterAnalysisResponse,
} from "../../study-contract";
import { localChapterAnalysis } from "../../study-local";

type OpenAIEnv = { OPENAI_API_KEY?: string; OPENAI_MODEL?: string };
const MAX_CHAPTER_CHARACTERS = 180_000;

function isRequest(value: unknown): value is ChapterAnalysisRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<ChapterAnalysisRequest>;
  return Boolean(
    request.book && typeof request.book.id === "string" && typeof request.book.title === "string"
    && request.chapter && typeof request.chapter.id === "string" && typeof request.chapter.title === "string"
    && typeof request.chapter.text === "string" && typeof request.chapter.contentHash === "string"
    && Number.isInteger(request.chapter.sectionIndex),
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const bookId = url.searchParams.get("bookId")?.slice(0, 200) ?? "";
  const chapterId = url.searchParams.get("chapterId")?.slice(0, 500) ?? "";
  const contentHash = url.searchParams.get("contentHash")?.slice(0, 200) ?? "";
  if (!bookId || !chapterId || !contentHash) return Response.json({ error: "Identificadores incompletos." }, { status: 400 });
  const ownerKey = requestOwnerKey(request);
  const [analysis, book] = await Promise.all([
    getChapterMemory(ownerKey, bookId, chapterId),
    getBookMemory(ownerKey, bookId),
  ]);
  if (!analysis || analysis.contentHash !== contentHash || analysis.analysisVersion !== ANALYSIS_VERSION || analysis.promptVersion !== PROMPT_VERSION) {
    return Response.json({ analysis: null, profile: book?.profile ?? null, cached: false });
  }
  return Response.json({ analysis, profile: book?.profile ?? null, cached: true, provider: "openai" });
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const payload = await request.json();
    if (!isRequest(payload) || !payload.chapter.text.trim() || payload.chapter.text.length > MAX_CHAPTER_CHARACTERS) {
      return Response.json({ error: "Capítulo inválido o demasiado extenso." }, { status: 400 });
    }
    const ownerKey = requestOwnerKey(request);
    let book = await getBookMemory(ownerKey, payload.book.id);
    if (!book) {
      await upsertBookMemory({
        ownerKey, bookId: payload.book.id, legacyKey: payload.book.legacyKey,
        title: payload.book.title, author: payload.book.author, toc: payload.book.toc,
        profile: payload.book.initialProfile,
      });
      book = await getBookMemory(ownerKey, payload.book.id);
    }
    const existing = await getChapterMemory(ownerKey, payload.book.id, payload.chapter.id);
    if (existing && existing.contentHash === payload.chapter.contentHash
      && existing.analysisVersion === ANALYSIS_VERSION && existing.promptVersion === PROMPT_VERSION) {
      const response: ChapterAnalysisResponse = {
        analysis: existing,
        profile: book?.profile ?? payload.book.initialProfile,
        cached: true,
        provider: "openai",
      };
      await recordAIUsage({
        ownerKey, bookId: payload.book.id, chapterId: payload.chapter.id, task: "chapter_analysis",
        model: "persistent-cache", inputTokens: 0, outputTokens: 0, cachedTokens: 0,
        estimatedInputTokens: 0, durationMs: Date.now() - startedAt, cacheHit: true, contextChunks: 0,
        createdAt: new Date().toISOString(),
      });
      return Response.json(response);
    }

    const runtime = env as unknown as OpenAIEnv;
    const model = runtime.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
    const currentProfile = book?.profile ?? payload.book.initialProfile;
    let analysis: ChapterAnalysis;
    let profile: BookProfile;
    let provider: "openai" | "local";
    let usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
    const input = `<BOOK>\n${JSON.stringify({ title: payload.book.title, author: payload.book.author, toc: payload.book.toc })}\n</BOOK>\n\n<CURRENT_BOOK_PROFILE>\n${JSON.stringify(currentProfile)}\n</CURRENT_BOOK_PROFILE>\n\n<CHAPTER id="${payload.chapter.id}" title="${payload.chapter.title}">\n${payload.chapter.text}\n</CHAPTER>`;

    if (!runtime.OPENAI_API_KEY) {
      const local = localChapterAnalysis(payload, currentProfile);
      analysis = local.analysis;
      profile = local.profile;
      provider = "local";
    } else {
      const result = await callOpenAI<{
        card: ChapterAnalysis["card"];
        study: ChapterAnalysis["study"];
        concepts: ChapterAnalysis["concepts"];
        profile: BookProfile;
      }>({
        apiKey: runtime.OPENAI_API_KEY,
        model,
        instructions: CHAPTER_ANALYSIS_INSTRUCTIONS,
        input,
        schema: CHAPTER_ANALYSIS_SCHEMA as unknown as Record<string, unknown>,
        schemaName: "chapter_analysis_bundle",
        maxOutputTokens: TASK_OUTPUT_BUDGETS.chapter_analysis,
        reasoning: "low",
        promptCacheKey: `lector-chapter-analysis-${PROMPT_VERSION}`,
      });
      analysis = {
        bookId: payload.book.id, chapterId: payload.chapter.id, chapterTitle: payload.chapter.title,
        sectionIndex: payload.chapter.sectionIndex, contentHash: payload.chapter.contentHash,
        card: result.value.card, study: result.value.study, concepts: result.value.concepts,
        analysisVersion: ANALYSIS_VERSION, promptVersion: PROMPT_VERSION,
      };
      profile = result.value.profile;
      provider = "openai";
      usage = result.usage;
    }

    await Promise.all([
      saveChapterMemory(ownerKey, analysis),
      updateBookProfile(ownerKey, payload.book.id, profile),
      recordAIUsage({
        ownerKey, bookId: payload.book.id, chapterId: payload.chapter.id, task: "chapter_analysis", model,
        inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, cachedTokens: usage.cachedTokens,
        estimatedInputTokens: Math.ceil(input.length / 4), durationMs: Date.now() - startedAt,
        cacheHit: false, contextChunks: 1, createdAt: new Date().toISOString(),
      }),
    ]);
    return Response.json({ analysis, profile, cached: false, provider } satisfies ChapterAnalysisResponse);
  } catch (error) {
    console.error("[Lector] Error al analizar el capítulo:", error);
    return Response.json({ error: "No se pudo preparar la memoria del capítulo." }, { status: 502 });
  }
}
