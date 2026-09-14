import {
  EVALUATION_SCHEMA,
  EXPLANATION_SCHEMA,
  HIGHLIGHT_MATCH_SCHEMA,
  NOTE_SCHEMA,
  type AITask,
} from "../study-contract";
import { TASK_OUTPUT_BUDGETS } from "./constants";

const BASE_INSTRUCTIONS = `Eres el asistente de lectura de un EPUB privado.
REGLAS:
1. La evidencia etiquetada como TEXTO DEL LIBRO es la única fuente para atribuir posturas al autor.
2. Distingue evidencia textual, interpretación y conocimiento externo. No presentes interpretaciones como citas ni como postura confirmada.
3. No atribuyas al autor una postura que solamente describe, critica o cita.
4. Si falta evidencia, dilo. No inventes contenido del libro.
5. Responde en español, con claridad y brevedad.
6. Respeta estrictamente el esquema JSON de la tarea.`;

const TASKS: Record<AITask, {
  instructions: string;
  schema: Record<string, unknown>;
  schemaName: string;
  maxOutputTokens: number;
  reasoning: "none" | "low";
}> = {
  explain_selection: {
    instructions: "Explica o sintetiza directamente el fragmento seleccionado. Usa el contexto adicional solo para desambiguar y señala la base de la respuesta. Responde en el chat; no crees notas ni flashcards.",
    schema: EXPLANATION_SCHEMA,
    schemaName: "explain_selection",
    maxOutputTokens: TASK_OUTPUT_BUDGETS.explain_selection,
    reasoning: "none",
  },
  ai_highlight: {
    instructions: `Marca dentro de SELECCION exactamente la parte pedida.
- Trabaja solo sobre el texto que aparece bajo SELECCION; ignora cualquier otro contexto para calcular posiciones.
- Devuelve solo los tramos realmente necesarios: entre 0 y 5 fragmentos contiguos. No completes el cupo si menos fragmentos bastan.
- Si la petición pide destacar lo importante, central o esencial y SELECCION contiene texto útil, elige entre 1 y 5 tramos; no respondas solo con una explicación.
- start y end son offsets UTF-16 relativos al primer carácter de SELECCION, con end exclusivo, y SELECCION.slice(start, end) debe ser idéntico a text (mismos espacios, acentos y puntuación, sin recortar).
- No amplíes el tramo a la oración o al párrafo completo si la petición apunta a menos texto.
- Si la petición no se localiza con certeza en SELECCION, devuelve matches vacío y explica el motivo en message.
- Nunca devuelvas HTML ni texto reescrito.`,
    schema: HIGHLIGHT_MATCH_SCHEMA,
    schemaName: "highlight_offsets",
    maxOutputTokens: TASK_OUTPUT_BUDGETS.ai_highlight,
    reasoning: "low",
  },
  create_note: {
    instructions: `Crea exactamente el tipo de anotación solicitado usando la evidencia disponible.
- Si pide explícitamente una nota, comentario o apunte, devuelve kind "comment": front debe ser "Nota" y back debe ser una nota declarativa, breve y editable. No la conviertas en pregunta y respuesta.
- Solo si pide explícitamente una flashcard, tarjeta o Anki, devuelve kind "flashcard": front debe contener la pregunta y back la respuesta.
- Nunca conviertas la palabra "nota" en una flashcard.`,
    schema: NOTE_SCHEMA,
    schemaName: "reader_note",
    maxOutputTokens: TASK_OUTPUT_BUDGETS.create_note,
    reasoning: "none",
  },
  chapter_question: {
    instructions: "Responde o sintetiza la pregunta sobre el capítulo usando primero los fragmentos recuperados y la ventana de lectura, y después la memoria compacta del capítulo. Responde en el chat; no crees notas ni flashcards.",
    schema: EXPLANATION_SCHEMA,
    schemaName: "chapter_answer",
    maxOutputTokens: TASK_OUTPUT_BUDGETS.chapter_question,
    reasoning: "none",
  },
  whole_book_question: {
    instructions: "Responde sobre el libro usando únicamente los capítulos y fragmentos recuperados que aparecen en el contexto. Explica si la respuesta está limitada por el progreso de lectura.",
    schema: EXPLANATION_SCHEMA,
    schemaName: "book_answer",
    maxOutputTokens: TASK_OUTPUT_BUDGETS.whole_book_question,
    reasoning: "low",
  },
  evaluate_pretest: {
    instructions: "Evalúa participación y conocimientos previos de forma formativa. El pre-test se aprueba al responder; no penalices desconocer contenido aún no leído.",
    schema: EVALUATION_SCHEMA,
    schemaName: "pretest_evaluation",
    maxOutputTokens: TASK_OUTPUT_BUDGETS.evaluate_pretest,
    reasoning: "low",
  },
  evaluate_posttest: {
    instructions: "Evalúa comprensión contra la Chapter Card. Señala fortalezas y lagunas concretas sin exigir formulaciones literales.",
    schema: EVALUATION_SCHEMA,
    schemaName: "posttest_evaluation",
    maxOutputTokens: TASK_OUTPUT_BUDGETS.evaluate_posttest,
    reasoning: "low",
  },
  evaluate_feynman: {
    instructions: "Evalúa si la explicación usa palabras propias, relaciones causales y precisión conceptual. Señala fortalezas y lagunas accionables.",
    schema: EVALUATION_SCHEMA,
    schemaName: "feynman_evaluation",
    maxOutputTokens: TASK_OUTPUT_BUDGETS.evaluate_feynman,
    reasoning: "low",
  },
};

export function taskPrompt(task: AITask) {
  const config = TASKS[task];
  return { ...config, instructions: `${BASE_INSTRUCTIONS}\n\nTAREA:\n${config.instructions}` };
}

export const CHAPTER_ANALYSIS_INSTRUCTIONS = `${BASE_INSTRUCTIONS}

Analiza una sola vez el capítulo suministrado y produce conjuntamente:
- una Chapter Card compacta;
- conceptos y definiciones respaldados por citas breves;
- exactamente tres preguntas previas, tres posteriores y una pregunta Feynman;
- una actualización acumulativa del perfil del libro.

El perfil debe ser adaptativo al dominio. No uses una etiqueta ideológica simplista. Registra posiciones observadas, supuestos, métodos, distinciones, entidades y posibles tradiciones con confianza y evidencia. Conserva información previa válida y añade solamente lo respaldado por este capítulo. Mantén la Chapter Card concisa.`;
