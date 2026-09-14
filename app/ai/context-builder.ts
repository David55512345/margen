import type { AssistantRequest, BookProfile, ChapterAnalysis, RetrievedChunk } from "../study-contract.ts";
import { TASK_INPUT_BUDGETS } from "./constants.ts";
import { rankChapterCards, rankChunks, relevantProfile } from "./retrieval.ts";

type ContextBuilderInput = {
  request: AssistantRequest;
  profile: BookProfile | null;
  currentAnalysis: ChapterAnalysis | null;
  allAnalyses: ChapterAnalysis[];
};

type ContextPart = { label: string; value: string; priority: number; required?: boolean };

function json(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function compactCard(analysis: ChapterAnalysis) {
  return {
    chapter: analysis.chapterTitle,
    sectionIndex: analysis.sectionIndex,
    mainQuestion: analysis.card.mainQuestion,
    thesis: analysis.card.thesis,
    keyConcepts: analysis.card.keyConcepts,
    importantClaims: analysis.card.importantClaims.slice(0, 6),
    definitions: analysis.card.definitions,
    importantDistinctions: analysis.card.interpretiveContext.slice(0, 4),
  };
}

function safeChunks(request: AssistantRequest, chunks: RetrievedChunk[]) {
  const maxSection = request.allowFuture ? Number.MAX_SAFE_INTEGER : request.position.maxReadSectionIndex;
  return chunks.filter((chunk) => chunk.sectionIndex <= maxSection);
}

function needsArgumentMemory(question: string) {
  return /argument|tesis|cap[ií]tulo|autor|relaci|context|libro|postura|concept|por qu[eé]/i.test(question);
}

export function buildContext(input: ContextBuilderInput) {
  const { request, profile, currentAnalysis, allAnalyses } = input;
  const budgetTokens = TASK_INPUT_BUDGETS[request.task];
  const budgetCharacters = budgetTokens * 4;
  const parts: ContextPart[] = [
    { label: "PREGUNTA DEL USUARIO", value: request.question.trim(), priority: 130, required: true },
    { label: "LIBRO", value: `${request.book.title} — ${request.book.author}`, priority: 90, required: true },
    { label: "POSICION", value: `Sección actual ${request.chapter.sectionIndex}; máximo leído ${request.position.maxReadSectionIndex}; spoilers ${request.allowFuture ? "permitidos" : "bloqueados"}.`, priority: 80 },
  ];

  if (request.selection?.text) {
    parts.push({ label: "SELECCION — TEXTO DEL LIBRO", value: request.selection.text, priority: 120, required: true });
  }

  if (request.conversation?.length) {
    parts.push({
      label: "HISTORIAL DEL CHAT ACTUAL — CONTEXTO INDEPENDIENTE",
      value: request.conversation.slice(-6).map((message) => `${message.role === "user" ? "Usuario" : "Asistente"}: ${message.content.slice(0, 600)}`).join("\n"),
      priority: 95,
    });
  }

  if (request.task === "ai_highlight") {
    return finalize(parts.filter((part) => part.required || part.label.startsWith("SELECCION")), budgetCharacters, budgetTokens, 0);
  }

  if (request.studyContext) {
    parts.push({ label: "ACTIVIDAD Y RESPUESTAS DEL USUARIO", value: json(request.studyContext), priority: 115, required: true });
  }

  if (request.surrounding && (request.task === "explain_selection" || request.task === "create_note" || request.task === "chapter_question")) {
    const local = [
      request.surrounding.before && `[anterior] ${request.surrounding.before}`,
      request.surrounding.current && `[actual] ${request.surrounding.current}`,
      request.surrounding.after && `[siguiente] ${request.surrounding.after}`,
    ].filter(Boolean).join("\n");
    if (local) parts.push({ label: "VENTANA LOCAL — TEXTO DEL LIBRO", value: local, priority: 110 });
  }

  const shouldUseCard = request.task.startsWith("evaluate_")
    || request.task === "chapter_question"
    || request.task === "whole_book_question"
    || needsArgumentMemory(request.question);
  if (shouldUseCard && currentAnalysis) {
    parts.push({ label: "CHAPTER CARD — MEMORIA VERIFICADA", value: json(compactCard(currentAnalysis)), priority: 75 });
  }

  const filteredChunks = safeChunks(request, request.retrievedChunks ?? []);
  const ranked = rankChunks(request.question, filteredChunks, request.task === "whole_book_question" ? 8 : 5);
  ranked.forEach((chunk, index) => {
    parts.push({
      label: `FRAGMENTO RECUPERADO ${index + 1} — TEXTO DEL LIBRO — SECCION ${chunk.sectionIndex}`,
      value: chunk.text,
      priority: 70 - index,
    });
  });

  if (request.task === "whole_book_question") {
    const allowedAnalyses = allAnalyses.filter((analysis) => request.allowFuture || analysis.sectionIndex <= request.position.maxReadSectionIndex);
    rankChapterCards(request.question, allowedAnalyses, 4).forEach((analysis, index) => {
      if (analysis.chapterId === currentAnalysis?.chapterId) return;
      parts.push({ label: `CHAPTER CARD RECUPERADA ${index + 1}`, value: json(compactCard(analysis)), priority: 60 - index });
    });
  }

  const profileSlice = relevantProfile(profile, `${request.question} ${request.selection?.text ?? ""}`);
  if (profileSlice && (request.task === "whole_book_question" || needsArgumentMemory(request.question))) {
    parts.push({ label: "BOOK PROFILE RELEVANTE — MEMORIA ACUMULADA", value: json(profileSlice), priority: 50 });
  }

  return finalize(parts, budgetCharacters, budgetTokens, ranked.length);
}

const MIN_REQUIRED_CHARACTERS = 480;

function finalize(parts: ContextPart[], budgetCharacters: number, budgetTokens: number, contextChunks: number) {
  const selected: ContextPart[] = [];
  let used = 0;
  for (const part of parts.sort((left, right) => right.priority - left.priority)) {
    const overhead = part.label.length + 8;
    const available = budgetCharacters - used - overhead;
    if (part.value.length <= Math.max(available, 0)) {
      selected.push(part);
      used += overhead + part.value.length;
      continue;
    }
    if (!part.required) continue;
    // Las partes obligatorias nunca se descartan, pero sí se recortan por la cola
    // para que una selección enorme no desborde el presupuesto de la tarea.
    const room = Math.max(available, MIN_REQUIRED_CHARACTERS);
    selected.push({ ...part, label: `${part.label} (RECORTADO)`, value: part.value.slice(0, room) });
    used += overhead + room + 12;
  }
  const input = selected.map((part) => `<${part.label}>\n${part.value}\n</${part.label}>`).join("\n\n");
  return {
    input,
    estimatedInputTokens: Math.ceil(input.length / 4),
    budgetTokens,
    contextChunks,
    includedLabels: selected.map((part) => part.label),
  };
}
