import type { BookProfile, ChapterAnalysis, RetrievedChunk } from "../study-contract.ts";

const STOP_WORDS = new Set([
  "para", "pero", "como", "cómo", "cual", "cuál", "cuando", "donde", "este", "esta", "esto", "estos", "estas",
  "sobre", "entre", "desde", "hasta", "porque", "porqué", "libro", "capitulo", "capítulo", "texto", "autor", "dice",
  "explica", "explicar", "pregunta", "quiero", "puede", "tiene", "hace", "parte", "todo", "toda", "unas", "unos",
]);

export function lexicalTerms(text: string) {
  return Array.from(new Set(
    text.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .match(/[\p{L}\p{N}]{3,}/gu)
      ?.filter((term) => !STOP_WORDS.has(term)) ?? [],
  ));
}

export function lexicalScore(query: string, text: string) {
  const terms = lexicalTerms(query);
  if (!terms.length) return 0;
  const normalized = text.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return terms.reduce((score, term) => {
    const occurrences = normalized.split(term).length - 1;
    return score + (occurrences ? 1 + Math.log1p(occurrences) : 0);
  }, 0) / Math.sqrt(Math.max(1, normalized.length / 500));
}

export function rankChunks(query: string, chunks: RetrievedChunk[], limit = 8) {
  return chunks
    .map((chunk) => ({ ...chunk, score: lexicalScore(query, `${chunk.chapterTitle} ${chunk.text}`) }))
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0) || left.sectionIndex - right.sectionIndex)
    .slice(0, limit);
}

export function rankChapterCards(query: string, analyses: ChapterAnalysis[], limit = 4) {
  return analyses
    .map((analysis) => ({
      analysis,
      score: lexicalScore(query, [
        analysis.chapterTitle,
        analysis.card.mainQuestion,
        analysis.card.thesis,
        ...analysis.card.keyConcepts,
        ...analysis.card.importantClaims,
        ...analysis.card.definitions.flatMap((definition) => [definition.term, definition.definition, ...definition.evidence]),
      ].join(" ")),
    }))
    .sort((left, right) => right.score - left.score || left.analysis.sectionIndex - right.analysis.sectionIndex)
    .slice(0, limit)
    .map((entry) => entry.analysis);
}

export function relevantProfile(profile: BookProfile | null, query: string) {
  if (!profile) return null;
  const terms = lexicalTerms(query);
  const relatedConcepts = profile.keyConcepts
    .filter((concept) => terms.some((term) => `${concept.name} ${concept.definition}`.toLocaleLowerCase().includes(term)))
    .slice(0, 6);
  const filter = (items: string[]) => items
    .filter((item) => terms.some((term) => item.toLocaleLowerCase().includes(term)))
    .slice(0, 5);
  return {
    domains: profile.domains.slice(0, 3),
    contentType: profile.contentType,
    centralTopics: filter(profile.centralTopics),
    observedPositions: filter(profile.observedPositions),
    importantDistinctions: filter(profile.importantDistinctions),
    keyConcepts: relatedConcepts,
    importantEntities: filter(profile.importantEntities),
  };
}
