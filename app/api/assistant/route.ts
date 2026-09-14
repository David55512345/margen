import { env } from "cloudflare:workers";
import { getRequestExecutionContext } from "vinext/shims/request-context";
import { buildContext } from "../../ai/context-builder";
import { ANALYSIS_VERSION, DEFAULT_OPENAI_MODEL, PROMPT_VERSION } from "../../ai/constants";
import { sha256, stableStringify } from "../../ai/hash";
import { callOpenAI, OpenAIOutputError } from "../../ai/provider";
import { taskPrompt } from "../../ai/prompts";
import { requestedReaderNoteKind } from "../../book-memory";
import {
  getBookMemory,
  getCachedAssistantResponse,
  getChapterMemories,
  getChapterMemory,
  recordAIUsage,
  requestOwnerKey,
  saveAssistantResponse,
  updateLearningMemory,
} from "../../ai/repository";
import type { AITask, AssistantRequest, AssistantResponse, HighlightColor } from "../../study-contract";
import { localAssistant } from "../../study-local";

type OpenAIEnv = { OPENAI_API_KEY?: string; OPENAI_MODEL?: string };
const TASKS: AITask[] = [
  "explain_selection", "ai_highlight", "create_note", "chapter_question", "whole_book_question",
  "evaluate_pretest", "evaluate_posttest", "evaluate_feynman",
];

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isAssistantRequest(value: unknown): value is AssistantRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<AssistantRequest>;
  return Boolean(
    request.task && TASKS.includes(request.task)
    && request.book && clean(request.book.id, 200) && clean(request.book.title, 500)
    && request.chapter && clean(request.chapter.id, 500) && Number.isInteger(request.chapter.sectionIndex)
    && request.position && Number.isInteger(request.position.maxReadSectionIndex)
    && typeof request.question === "string",
  );
}

function requestedColor(command: string): HighlightColor {
  const lower = command.toLocaleLowerCase();
  if (lower.includes("verde")) return "green";
  if (lower.includes("azul")) return "blue";
  if (lower.includes("rosa") || lower.includes("rojo")) return "pink";
  return "yellow";
}

/**
 * La telemetría y la caché no deben retrasar la respuesta del asistente:
 * se escriben en segundo plano con ctx.waitUntil cuando el runtime lo permite.
 */
function deferWrite(work: Promise<unknown>) {
  const ctx = getRequestExecutionContext();
  const guarded = work.catch((error) => console.error("[Lector] Escritura diferida fallida:", error));
  if (ctx) {
    ctx.waitUntil(guarded);
    return null;
  }
  return guarded;
}

function toAssistantResponse(task: AITask, raw: Record<string, unknown>, request: AssistantRequest): AssistantResponse {
  if (task === "ai_highlight") {
    const selection = request.selection?.text ?? "";
    const matches = Array.isArray(raw.matches) ? raw.matches.flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object") return [];
      const match = candidate as { start?: unknown; end?: unknown; text?: unknown };
      if (!Number.isInteger(match.start) || !Number.isInteger(match.end) || typeof match.text !== "string") return [];
      let start = Number(match.start);
      let end = Number(match.end);
      if (start < 0 || end <= start || end > selection.length || selection.slice(start, end) !== match.text) {
        start = selection.indexOf(match.text);
        end = start + match.text.length;
      }
      if (start < 0 || end <= start || end > selection.length || selection.slice(start, end) !== match.text) return [];
      return [{ start, end, text: match.text }];
    }).slice(0, 5) : [];
    const quote = matches[0]?.text ?? "";
    return {
      action: "subrayar",
      message: typeof raw.message === "string" ? raw.message : quote ? "Localicé el fragmento solicitado." : "No encontré una coincidencia verificable.",
      highlight: quote ? { quote, color: requestedColor(request.question) } : null,
      matches,
      note: null, questions: [], evaluation: null,
      basis: quote ? "textual" : "insufficient", provider: "openai",
    };
  }
  if (task === "create_note") {
    const kind = requestedReaderNoteKind(request.question);
    return {
      action: "crear_nota",
      message: kind === "comment" ? "Nota creada con la idea solicitada." : "Flashcard creada.",
      highlight: null,
      note: typeof raw.front === "string" && typeof raw.back === "string"
        ? { kind, front: kind === "comment" ? "Nota" : raw.front, back: raw.back }
        : null,
      questions: [], evaluation: null, basis: "textual", provider: "openai",
    };
  }
  if (task.startsWith("evaluate_")) {
    const evaluation = raw.evaluation && typeof raw.evaluation === "object"
      ? raw.evaluation as AssistantResponse["evaluation"] : null;
    return {
      action: "evaluar",
      message: typeof raw.message === "string" ? raw.message : "Actividad evaluada.",
      highlight: null, note: null, questions: [], evaluation, basis: "interpretation", provider: "openai",
    };
  }
  const basis = ["textual", "interpretation", "external", "insufficient"].includes(String(raw.basis))
    ? raw.basis as AssistantResponse["basis"] : "insufficient";
  return {
    action: "responder",
    message: typeof raw.message === "string" ? raw.message : "No hay suficiente evidencia para responder.",
    highlight: null, note: null, questions: [], evaluation: null, basis, provider: "openai",
  };
}

export async function POST(httpRequest: Request) {
  const startedAt = Date.now();
  try {
    const payload = await httpRequest.json();
    if (!isAssistantRequest(payload)) return Response.json({ error: "Solicitud de IA inválida." }, { status: 400 });
    if (payload.question.length > 24_000 || (payload.selection?.text.length ?? 0) > 60_000) {
      return Response.json({ error: "La solicitud excede el tamaño permitido." }, { status: 400 });
    }
    payload.conversation = Array.isArray(payload.conversation)
      ? payload.conversation.flatMap((message: unknown) => {
          if (!message || typeof message !== "object") return [];
          const candidate = message as { role?: unknown; content?: unknown };
          if ((candidate.role !== "user" && candidate.role !== "assistant") || typeof candidate.content !== "string") return [];
          const content = candidate.content.trim().slice(0, 900);
          return content ? [{ role: candidate.role as "user" | "assistant", content }] : [];
        }).slice(-6)
      : [];

    const ownerKey = requestOwnerKey(httpRequest);
    const runtime = env as unknown as OpenAIEnv;
    const model = runtime.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
    const [bookMemory, currentAnalysis, allAnalyses] = await Promise.all([
      getBookMemory(ownerKey, payload.book.id),
      getChapterMemory(ownerKey, payload.book.id, payload.chapter.id),
      payload.task === "whole_book_question" ? getChapterMemories(ownerKey, payload.book.id) : Promise.resolve([]),
    ]);
    const context = buildContext({
      request: payload,
      profile: bookMemory?.profile ?? null,
      currentAnalysis,
      allAnalyses,
    });
    const inputHash = await sha256(stableStringify({ task: payload.task, input: context.input }));
    // Los contratos de subrayado y notas tienen su propia versión: no invalidan
    // memorias ni análisis completos de capítulos que siguen siendo compatibles.
    const taskPromptVersion = payload.task === "ai_highlight"
      ? `${PROMPT_VERSION}-highlight-5-v2`
      : payload.task === "create_note"
        ? `${PROMPT_VERSION}-reader-note-v2`
        : PROMPT_VERSION;
    const cacheKey = await sha256(`${ownerKey}|${payload.book.id}|${payload.chapter.id}|${payload.task}|${inputHash}|${ANALYSIS_VERSION}|${taskPromptVersion}|${model}`);
    const cached = await getCachedAssistantResponse(ownerKey, cacheKey);
    if (cached) {
      const pending = deferWrite(recordAIUsage({
        ownerKey, bookId: payload.book.id, chapterId: payload.chapter.id, task: payload.task, model,
        inputTokens: 0, outputTokens: 0, cachedTokens: 0,
        estimatedInputTokens: context.estimatedInputTokens,
        durationMs: Date.now() - startedAt, cacheHit: true, contextChunks: context.contextChunks,
        createdAt: new Date().toISOString(),
      }));
      if (pending) await pending;
      return Response.json({ ...cached, cacheHit: true });
    }

    let response: AssistantResponse;
    let usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
    let cacheResponse = true;
    if (!runtime.OPENAI_API_KEY) {
      response = localAssistant(payload);
    } else {
      const config = taskPrompt(payload.task);
      try {
        const result = await callOpenAI<Record<string, unknown>>({
          apiKey: runtime.OPENAI_API_KEY,
          model,
          instructions: config.instructions,
          input: context.input,
          schema: config.schema,
          schemaName: config.schemaName,
          maxOutputTokens: config.maxOutputTokens,
          reasoning: config.reasoning,
          promptCacheKey: `lector-${payload.task}-${taskPromptVersion}`,
          retryIncomplete: payload.task === "ai_highlight",
        });
        response = toAssistantResponse(payload.task, result.value, payload);
        usage = result.usage;
        if (payload.task === "ai_highlight" && !response.matches?.length && payload.selection?.text.trim()) {
          console.warn("[Lector] La IA no devolvió offsets verificables; usando respaldo local exacto.");
          response = localAssistant(payload);
          // Una respuesta explicativa sin tramos no satisface una orden de
          // subrayado y tampoco debe quedar fijada en caché.
          cacheResponse = false;
        }
      } catch (error) {
        if (payload.task !== "ai_highlight") throw error;
        if (error instanceof OpenAIOutputError) usage = error.usage;
        console.warn("[Lector] Subrayado estructurado no disponible; usando respaldo local verificado.", error instanceof Error ? error.message : "Error desconocido");
        response = localAssistant(payload);
        // Un respaldo por fallo transitorio no debe impedir futuros intentos con IA.
        cacheResponse = false;
      }
    }

    const learningWrites = response.evaluation && currentAnalysis
      ? currentAnalysis.card.keyConcepts.slice(0, 8).map((concept) => updateLearningMemory({
          ownerKey, bookId: payload.book.id, conceptId: concept,
          mastery: response.evaluation?.score ?? 0,
          confusions: response.evaluation?.gaps ?? [],
          feynman: payload.task === "evaluate_feynman",
        }))
      : [];

    const writes: Promise<unknown>[] = [
      recordAIUsage({
        ownerKey, bookId: payload.book.id, chapterId: payload.chapter.id, task: payload.task, model,
        inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, cachedTokens: usage.cachedTokens,
        estimatedInputTokens: context.estimatedInputTokens,
        durationMs: Date.now() - startedAt, cacheHit: false, contextChunks: context.contextChunks,
        createdAt: new Date().toISOString(),
      }),
      ...learningWrites,
    ];
    if (cacheResponse) {
      writes.unshift(saveAssistantResponse({
        ownerKey, cacheKey, bookId: payload.book.id, chapterId: payload.chapter.id,
        task: payload.task, inputHash, model, response,
      }));
    }
    const pending = deferWrite(Promise.all(writes));
    if (pending) await pending;

    return Response.json(response);
  } catch (error) {
    console.error("[Lector] Error del asistente:", error);
    return Response.json({ error: "El asistente no pudo completar la solicitud." }, { status: 502 });
  }
}
