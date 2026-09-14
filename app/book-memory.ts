import type { AITask, BookProfile, HighlightColor, ReaderNoteKind } from "./study-contract.ts";

const DOMAIN_HINTS: Array<[string, RegExp]> = [
  ["economía", /econom|mercado|precio|capital|trabajo|producci[oó]n|riqueza/i],
  ["política", /pol[ií]tic|estado|gobierno|poder|democr|libertad/i],
  ["filosofía", /filosof|ontolog|epistem|[eé]tica|moral|raz[oó]n/i],
  ["historia", /histori|siglo|guerra|revoluci[oó]n|imperio|cronolog/i],
  ["ciencia", /ciencia|biolog|f[ií]sic|qu[ií]mic|mecanismo|experimento/i],
  ["psicología", /psicolog|conducta|mente|cognici[oó]n|emoci[oó]n/i],
  ["literatura", /novela|cuento|poes[ií]a|personaje|narrador|relato/i],
  ["derecho", /derecho|ley|jur[ií]dic|tribunal|constituci[oó]n/i],
  ["informática", /software|algorit|programaci[oó]n|comput|datos/i],
];

export function initialBookProfile(title: string, author: string, topic: string, toc: string[]): BookProfile {
  const sample = `${title} ${author} ${topic} ${toc.join(" ")}`;
  const domains = DOMAIN_HINTS.filter(([, pattern]) => pattern.test(sample)).map(([domain]) => domain);
  return {
    domains: domains.length ? domains.slice(0, 4) : ["general"],
    contentType: /novela|cuento|poes[ií]a|personaje|narrador/i.test(sample) ? "narrativo" : "expositivo",
    centralTopics: toc.slice(0, 12),
    centralQuestions: [],
    observedPositions: [],
    recurringAssumptions: [],
    methodsOfReasoning: [],
    importantDistinctions: [],
    keyConcepts: [],
    importantEntities: author && author !== "Autor desconocido" ? [author] : [],
    possibleTraditions: [],
  };
}

function normalizedAssistantCommand(question: string) {
  return question.toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const HIGHLIGHT_VERB = /\b(subr+ay(?:a|ar|e|es|ame)|marc(?:a|ar|e|ame)|remarc(?:a|ar|e|ara|ase|ame)|resalt(?:a|ar|e|ame)|destac(?:a|ar|e|ame))\b/;
const HIGHLIGHT_COLOR = /\b(verde|azul|rosa|rosado|rojo|amarillo|amarilla)\b/;
const HIGHLIGHT_TARGET = /\b(lo mas importante|lo principal|lo esencial|idea(?:s)? (?:principal(?:es)?|importante(?:s)?|central(?:es)?)|texto|fragmento|seleccion|esto)\b/;
const NOTE_ARTIFACT = /\b(nota|comentario|apunte|anki|tarjeta|flashcard)\b/;
const NOTE_ACTION = /\b(crea|crear|creame|dame|dar|genera|generar|generame|prepara|preparar|preparame|haz|hacer|hazme|guarda|guardar|guardame|anade|anadir|agrega|agregar|convierte|convertir|transforma|transformar|pasa|pasar|quiero)\b/;

function explicitlyRequestsNoteArtifact(normalized: string) {
  return NOTE_ACTION.test(normalized)
    && NOTE_ARTIFACT.test(normalized)
    && (
      /\b(crea|crear|creame|dame|dar|genera|generar|generame|prepara|preparar|preparame|haz|hacer|hazme|guarda|guardar|guardame|anade|anadir|agrega|agregar|convierte|convertir|transforma|transformar|pasa|pasar|quiero)\b.{0,56}\b(nota|comentario|apunte|anki|tarjeta|flashcard)\b/.test(normalized)
      || /\b(nota|comentario|apunte|anki|tarjeta|flashcard)\b.{0,32}\b(crea|crear|creame|dame|dar|genera|generar|generame|prepara|preparar|preparame|haz|hacer|hazme|guarda|guardar|guardame|anade|anadir|agrega|agregar|convierte|convertir|transforma|transformar|pasa|pasar)\b/.test(normalized)
    );
}

export function classifyAssistantTask(question: string, hasSelection: boolean): AITask {
  const normalized = normalizedAssistantCommand(question);
  // Solo una orden explícita crea una anotación. Palabras informativas como
  // «síntesis» o «sintetiza» deben producir una respuesta normal en el chat.
  if (explicitlyRequestsNoteArtifact(normalized)) return "create_note";
  const requestsColoredSelection = hasSelection
    && HIGHLIGHT_COLOR.test(normalized)
    && HIGHLIGHT_TARGET.test(normalized)
    && /\b(pon|poner|pinta|pintar|colorea|colorear|deja|dejar|haz|hacer)\b/.test(normalized);
  if (HIGHLIGHT_VERB.test(normalized) || requestsColoredSelection) return "ai_highlight";
  if (/todo el libro|a lo largo del libro|en qu[eé] cap[ií]tulos|d[oó]nde habla|evoluciona.+libro|compara.+cap[ií]tul/i.test(normalized)) {
    return "whole_book_question";
  }
  // Una pregunta que nombra expresamente el capítulo no debe quedar limitada por
  // una selección antigua que todavía se conserva como foco del chat.
  if (/\b(este|el|del|actual) capitulo\b|\ben el capitulo\b/.test(normalized)) return "chapter_question";
  return hasSelection ? "explain_selection" : "chapter_question";
}

export function requestedReaderNoteKind(question: string): ReaderNoteKind {
  const normalized = normalizedAssistantCommand(question);
  const requestsConversion = /\b(convierte|convertir|transforma|transformar|pasa|pasar|vuelve|volver)\b.{0,28}\b(anki|tarjeta|flashcard)\b/.test(normalized);
  if (/\b(nota|comentario|apunte)\b/.test(normalized) && !requestsConversion) return "comment";
  return /\b(anki|tarjeta|flashcard)\b/.test(normalized) ? "flashcard" : "comment";
}

export function directSelectionHighlightColor(question: string, fallback: HighlightColor): HighlightColor | null {
  const normalized = normalizedAssistantCommand(question);
  if (/^verde$/.test(normalized)) return "green";
  if (/^azul$/.test(normalized)) return "blue";
  if (/^(rosa|rosado|rojo)$/.test(normalized)) return "pink";
  if (/^amarill[oa]$/.test(normalized)) return "yellow";
  void fallback;
  return null;
}

export function explicitlyAllowsSpoilers(question: string) {
  return /incluyendo spoilers|con spoilers|aunque no lo haya le[ií]do|todo el libro sin limitar/i.test(question);
}
