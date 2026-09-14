import type {
  AssistantRequest,
  AssistantResponse,
  BookProfile,
  ChapterAnalysis,
  ChapterAnalysisRequest,
  HighlightColor,
} from "./study-contract.ts";
import { ANALYSIS_VERSION, PROMPT_VERSION } from "./ai/constants.ts";
import { lexicalScore } from "./ai/retrieval.ts";
import { requestedReaderNoteKind } from "./book-memory.ts";

function sentences(text: string) {
  return text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim()).filter((sentence) => sentence.length >= 25 && sentence.length <= 420);
}

function shortSummary(text: string) {
  return sentences(text).slice(0, 2).join(" ").slice(0, 800) || text.replace(/\s+/g, " ").trim().slice(0, 800);
}

function requestedColor(command: string): HighlightColor {
  const lower = command.toLowerCase();
  if (lower.includes("verde")) return "green";
  if (lower.includes("azul")) return "blue";
  if (lower.includes("rosa") || lower.includes("rojo")) return "pink";
  return "yellow";
}

function primaryText(request: AssistantRequest) {
  return request.selection?.text
    || request.surrounding?.current
    || request.retrievedChunks?.[0]?.text
    || request.surrounding?.before
    || "";
}

function bestSentence(question: string, text: string) {
  return sentences(text).map((sentence, index) => ({ sentence, index, score: lexicalScore(question, sentence) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.sentence
    ?? shortSummary(text);
}

export function localAssistant(request: AssistantRequest): AssistantResponse {
  const focus = primaryText(request);
  if (request.task === "ai_highlight") {
    const quote = bestSentence(request.question, focus);
    const start = Math.max(0, focus.indexOf(quote));
    const end = start + quote.length;
    return {
      action: "subrayar",
      message: quote ? "Localicé el fragmento solicitado dentro de la selección." : "No encontré una coincidencia clara.",
      highlight: quote ? { quote, color: requestedColor(request.question) } : null,
      matches: quote ? [{ start, end, text: quote }] : [],
      note: null, questions: [], evaluation: null, basis: quote ? "textual" : "insufficient", provider: "local",
    };
  }

  if (request.task === "create_note") {
    const kind = requestedReaderNoteKind(request.question);
    return {
      action: "crear_nota",
      message: kind === "comment"
        ? "Nota creada con la idea solicitada usando solamente el contexto recuperado."
        : "Flashcard creada usando solamente el contexto recuperado.",
      highlight: null,
      note: {
        kind,
        front: kind === "comment" ? "Nota" : request.question || request.chapter.title,
        back: shortSummary(focus),
      },
      questions: [], evaluation: null, basis: focus ? "textual" : "insufficient", provider: "local",
    };
  }

  if (request.task.startsWith("evaluate_")) {
    const answers = Object.values(request.studyContext?.answers ?? {}).join(" ").trim();
    const detailed = answers.split(/\s+/).filter(Boolean).length >= 45;
    const pretest = request.task === "evaluate_pretest";
    return {
      action: "evaluar",
      message: "Tus respuestas quedaron registradas.",
      highlight: null, note: null, questions: [],
      evaluation: {
        score: pretest ? Math.max(60, detailed ? 88 : 72) : detailed ? 82 : 58,
        feedback: pretest
          ? "El pre-test activa tus conocimientos previos; contrasta estas ideas durante la lectura."
          : detailed ? "La respuesta desarrolla la idea principal con palabras propias." : "Añade relaciones causales y un ejemplo concreto.",
        strengths: detailed ? ["Respuesta desarrollada", "Uso de palabras propias"] : ["Actividad completada"],
        gaps: detailed ? [] : ["Faltan conexiones y ejemplos concretos"],
        approved: true,
      },
      basis: "interpretation", provider: "local",
    };
  }

  const evidence = bestSentence(request.question, [
    request.selection?.text,
    request.surrounding?.before,
    request.surrounding?.current,
    request.surrounding?.after,
    ...(request.retrievedChunks ?? []).map((chunk) => chunk.text),
  ].filter(Boolean).join(" "));
  return {
    action: "responder",
    message: evidence ? `Respuesta directa: ${evidence}` : "No hay suficiente evidencia recuperada para responder con seguridad.",
    highlight: null, note: null, questions: [], evaluation: null,
    basis: evidence ? "textual" : "insufficient", provider: "local",
  };
}

export function localChapterAnalysis(request: ChapterAnalysisRequest, profile: BookProfile): { analysis: ChapterAnalysis; profile: BookProfile } {
  const options = sentences(request.chapter.text);
  const important = options.slice(0, 8);
  const titleWords = request.chapter.title.match(/[\p{L}\p{N}]{4,}/gu)?.slice(0, 5) ?? [];
  const concepts = titleWords.map((name) => ({
    name,
    authorDefinition: important.find((sentence) => sentence.toLocaleLowerCase().includes(name.toLocaleLowerCase())) ?? "",
    relationships: [],
    evidence: important.filter((sentence) => sentence.toLocaleLowerCase().includes(name.toLocaleLowerCase())).slice(0, 2),
  }));
  const nextProfile: BookProfile = {
    ...profile,
    centralTopics: Array.from(new Set([...profile.centralTopics, ...titleWords])).slice(0, 20),
    keyConcepts: Array.from(new Map([
      ...profile.keyConcepts,
      ...concepts.filter((concept) => concept.authorDefinition).map((concept) => ({
        name: concept.name, definition: concept.authorDefinition, evidence: concept.evidence,
      })),
    ].map((concept) => [concept.name.toLocaleLowerCase(), concept])).values()).slice(0, 40),
  };
  return {
    profile: nextProfile,
    analysis: {
      bookId: request.book.id,
      chapterId: request.chapter.id,
      chapterTitle: request.chapter.title,
      sectionIndex: request.chapter.sectionIndex,
      contentHash: request.chapter.contentHash,
      card: {
        mainQuestion: `¿Cuál es la idea central de “${request.chapter.title}”?`,
        thesis: important[0] ?? shortSummary(request.chapter.text),
        keyConcepts: titleWords,
        argumentMap: important.slice(0, 4),
        importantClaims: important.slice(0, 5),
        definitions: concepts.filter((concept) => concept.authorDefinition).map((concept) => ({
          term: concept.name, definition: concept.authorDefinition, evidence: concept.evidence,
        })),
        authorAssumptions: [], importantEntities: [], connectionsToPreviousContent: [], interpretiveContext: [],
      },
      study: {
        preReadingQuestions: [
          { id: "pre-1", prompt: `¿Qué sabes ya sobre el tema de “${request.chapter.title}”?` },
          { id: "pre-2", prompt: "¿Qué conceptos esperas encontrar en este capítulo?" },
          { id: "pre-3", prompt: "¿Qué pregunta te gustaría responder al terminar la lectura?" },
        ],
        learningObjectives: ["Identificar la tesis central", "Relacionar los conceptos principales"],
        postReadingQuestions: [
          { id: "post-1", prompt: `Resume la tesis central de “${request.chapter.title}”.` },
          { id: "post-2", prompt: "Explica la relación entre dos conceptos importantes del capítulo." },
          { id: "post-3", prompt: "¿Qué evidencia o argumento sostiene la idea principal?" },
        ],
        feynmanQuestion: `Explica con palabras sencillas la idea central de “${request.chapter.title}” y da un ejemplo.`,
        commonMisunderstandings: [],
      },
      concepts,
      analysisVersion: ANALYSIS_VERSION,
      promptVersion: PROMPT_VERSION,
    },
  };
}
