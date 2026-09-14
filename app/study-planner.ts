import type { ChapterAnalysis, LearningPhase, StudyQuestion } from "./study-contract";

export type StudyDifficulty = "introductory" | "intermediate" | "advanced";

export type StudyPreferences = {
  difficulty: StudyDifficulty;
  questionCount: number;
  scope: "chapter" | "subtopic";
  subtopic: string;
};

export const DEFAULT_STUDY_PREFERENCES: StudyPreferences = {
  difficulty: "intermediate",
  questionCount: 3,
  scope: "chapter",
  subtopic: "",
};

export const STUDY_DIFFICULTY_LABELS: Record<StudyDifficulty, string> = {
  introductory: "Inicial",
  intermediate: "Intermedia",
  advanced: "Avanzada",
};

function uniqueQuestions(questions: StudyQuestion[]) {
  const seen = new Set<string>();
  return questions.filter((question) => {
    const key = question.prompt.replace(/\s+/g, " ").trim().toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function topicLabel(analysis: ChapterAnalysis, preferences: StudyPreferences) {
  return preferences.scope === "subtopic" && preferences.subtopic.trim()
    ? preferences.subtopic.trim()
    : analysis.chapterTitle;
}

function targetedQuestions(
  analysis: ChapterAnalysis,
  phase: Exclude<LearningPhase, "feynman">,
  preferences: StudyPreferences,
) {
  const topic = topicLabel(analysis, preferences);
  const concepts = analysis.card.keyConcepts.length
    ? analysis.card.keyConcepts
    : analysis.concepts.map((concept) => concept.name);
  const claims = analysis.card.importantClaims.length
    ? analysis.card.importantClaims
    : analysis.card.argumentMap;
  const definitions = analysis.card.definitions;
  const questions: StudyQuestion[] = [];
  const add = (prompt: string) => questions.push({ id: `${phase}-generated-${questions.length + 1}`, prompt });

  if (phase === "pretest") {
    if (preferences.difficulty === "introductory") {
      add(`¿Qué significa para ti “${topic}” antes de leer esta parte?`);
      add(`¿Qué ejemplo cotidiano relacionas con “${topic}”?`);
      concepts.forEach((concept) => add(`¿Qué sabes ya sobre el concepto “${concept}”?`));
    } else if (preferences.difficulty === "intermediate") {
      add(`¿Qué relaciones esperas encontrar entre “${topic}” y la tesis del capítulo?`);
      concepts.forEach((concept) => add(`¿Cómo crees que “${concept}” interviene en “${topic}”?`));
      add(`¿Qué pregunta concreta debería responder el texto sobre “${topic}”?`);
    } else {
      add(`Formula una hipótesis discutible sobre “${topic}” antes de leer los argumentos del autor.`);
      add(`¿Qué supuestos habría que examinar para evaluar una tesis sobre “${topic}”?`);
      concepts.forEach((concept) => add(`¿Qué tensión conceptual podría existir entre “${concept}” y “${topic}”?`));
    }
  } else if (preferences.difficulty === "introductory") {
    add(`Resume con tus palabras la idea principal sobre “${topic}”.`);
    definitions.forEach((definition) => add(`¿Cómo define el capítulo “${definition.term}”?`));
    claims.forEach((claim, index) => add(`Explica de forma sencilla la idea ${index + 1}: “${claim.slice(0, 150)}”.`));
  } else if (preferences.difficulty === "intermediate") {
    add(`¿Cómo sostiene el autor su idea principal sobre “${topic}”?`);
    concepts.forEach((concept) => add(`Relaciona “${concept}” con la tesis central del capítulo.`));
    claims.forEach((claim) => add(`¿Qué función cumple este argumento en el razonamiento del capítulo: “${claim.slice(0, 150)}”?`));
  } else {
    add(`Evalúa la solidez de la tesis sobre “${topic}” e identifica su supuesto principal.`);
    add(`Formula una objeción fuerte a la explicación del capítulo sobre “${topic}” y respóndela desde el texto.`);
    claims.forEach((claim) => add(`¿Qué evidencia adicional necesitarías para evaluar críticamente esta afirmación: “${claim.slice(0, 150)}”?`));
    concepts.forEach((concept) => add(`Compara el papel de “${concept}” con otro concepto central y explica la diferencia.`));
  }
  return questions;
}

export function studySubtopics(analysis: ChapterAnalysis) {
  return Array.from(new Set([
    ...analysis.card.keyConcepts,
    ...analysis.card.definitions.map((definition) => definition.term),
    ...analysis.concepts.map((concept) => concept.name),
  ].map((item) => item.trim()).filter(Boolean))).slice(0, 18);
}

export function buildStudyQuestions(
  analysis: ChapterAnalysis,
  phase: Exclude<LearningPhase, "feynman">,
  preferences: StudyPreferences,
) {
  const desired = Math.min(8, Math.max(1, Math.round(preferences.questionCount)));
  const base = phase === "pretest"
    ? analysis.study.preReadingQuestions
    : analysis.study.postReadingQuestions;
  const subtopic = preferences.scope === "subtopic" ? preferences.subtopic.trim().toLocaleLowerCase() : "";
  const orderedBase = subtopic
    ? [...base].sort((left, right) => Number(right.prompt.toLocaleLowerCase().includes(subtopic)) - Number(left.prompt.toLocaleLowerCase().includes(subtopic)))
    : base;
  const generated = targetedQuestions(analysis, phase, preferences);
  const candidates = preferences.scope === "subtopic"
    ? [...generated, ...orderedBase]
    : [...orderedBase, ...generated];
  return uniqueQuestions(candidates).slice(0, desired).map((question, index) => ({
    ...question,
    id: `${phase}-${index + 1}`,
  }));
}

export function buildFeynmanQuestion(analysis: ChapterAnalysis, preferences: StudyPreferences) {
  const topic = topicLabel(analysis, preferences);
  const suffix = preferences.difficulty === "introductory"
    ? "Usa palabras sencillas y un ejemplo cotidiano."
    : preferences.difficulty === "advanced"
      ? "Incluye la tesis, sus relaciones causales, un supuesto y una posible objeción."
      : "Incluye la idea principal, dos relaciones importantes y un ejemplo propio.";
  return `Explica “${topic}” como si se lo enseñaras a alguien que no conoce el tema. ${suffix}`;
}

export function pendingStudyPhase(status: Record<LearningPhase, boolean>): LearningPhase {
  if (!status.pretest) return "pretest";
  if (!status.posttest) return "posttest";
  return "feynman";
}
