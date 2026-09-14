export type HighlightColor = "yellow" | "green" | "blue" | "pink";
export type ReaderNoteKind = "comment" | "flashcard";

export type AITask =
  | "explain_selection"
  | "ai_highlight"
  | "create_note"
  | "chapter_question"
  | "whole_book_question"
  | "evaluate_pretest"
  | "evaluate_posttest"
  | "evaluate_feynman";

export type AssistantIntent = AITask;

export type StudyQuestion = { id: string; prompt: string };

export type AssistantEvaluation = {
  score: number;
  feedback: string;
  strengths: string[];
  gaps: string[];
  approved: boolean;
};

export type BookProfile = {
  domains: string[];
  contentType: string;
  centralTopics: string[];
  centralQuestions: string[];
  observedPositions: string[];
  recurringAssumptions: string[];
  methodsOfReasoning: string[];
  importantDistinctions: string[];
  keyConcepts: Array<{ name: string; definition: string; evidence: string[] }>;
  importantEntities: string[];
  possibleTraditions: Array<{ name: string; confidence: number; evidence: string[] }>;
};

export type ChapterCard = {
  mainQuestion: string;
  thesis: string;
  keyConcepts: string[];
  argumentMap: string[];
  importantClaims: string[];
  definitions: Array<{ term: string; definition: string; evidence: string[] }>;
  authorAssumptions: string[];
  importantEntities: string[];
  connectionsToPreviousContent: string[];
  interpretiveContext: string[];
};

export type StudyBundle = {
  preReadingQuestions: StudyQuestion[];
  learningObjectives: string[];
  postReadingQuestions: StudyQuestion[];
  feynmanQuestion: string;
  commonMisunderstandings: string[];
};

export type ChapterAnalysis = {
  bookId: string;
  chapterId: string;
  chapterTitle: string;
  sectionIndex: number;
  contentHash: string;
  card: ChapterCard;
  study: StudyBundle;
  concepts: Array<{
    name: string;
    authorDefinition: string;
    relationships: string[];
    evidence: string[];
  }>;
  analysisVersion: string;
  promptVersion: string;
};

export type RetrievedChunk = {
  sectionIndex: number;
  chapterTitle: string;
  text: string;
  cfi?: string;
  score?: number;
};

export type AssistantRequest = {
  task: AITask;
  book: {
    id: string;
    legacyKey: string;
    title: string;
    author: string;
    topic: string;
  };
  chapter: { id: string; title: string; sectionIndex: number };
  position: { cfi: string; maxReadSectionIndex: number };
  question: string;
  conversation?: Array<{ role: "user" | "assistant"; content: string }>;
  selection?: { text: string; cfi: string; sectionIndex: number } | null;
  surrounding?: { before: string; current: string; after: string } | null;
  retrievedChunks?: RetrievedChunk[];
  studyContext?: {
    questions: StudyQuestion[];
    answers: Record<string, string>;
    feynmanQuestion?: string;
    difficulty?: "introductory" | "intermediate" | "advanced";
    scope?: string;
  } | null;
  allowFuture?: boolean;
};

export type AssistantResponse = {
  action: "subrayar" | "crear_nota" | "evaluar" | "responder";
  message: string;
  highlight: { quote: string; color: HighlightColor } | null;
  matches?: Array<{ start: number; end: number; text: string }>;
  note: { kind: ReaderNoteKind; front: string; back: string } | null;
  questions: StudyQuestion[];
  evaluation: AssistantEvaluation | null;
  basis?: "textual" | "interpretation" | "external" | "insufficient";
  provider?: "openai" | "local" | "reader";
  cacheHit?: boolean;
};

export type ChapterAnalysisRequest = {
  book: AssistantRequest["book"] & { toc: string[]; initialProfile: BookProfile };
  chapter: AssistantRequest["chapter"] & { text: string; contentHash: string };
};

export type ChapterAnalysisResponse = {
  analysis: ChapterAnalysis;
  profile: BookProfile;
  cached: boolean;
  provider: "openai" | "local";
};

export type ReaderNote = {
  id: number;
  bookKey: string;
  bookTitle: string;
  chapterKey: string;
  chapterTitle: string;
  kind: ReaderNoteKind;
  front: string;
  back: string;
  anchorLabel: string | null;
  anchorCfi: string | null;
  quote: string | null;
  color: HighlightColor | null;
  highlightId: string | null;
  sectionIndex: number | null;
  createdAt: string;
  updatedAt: string;
  origin?: import("./annotation-conversion").AnnotationOrigin | null;
  conversionKey?: string | null;
};

export type FlashcardAIAction = "answer" | "rewrite" | "regenerate";
export type FlashcardAIDraft = { front: string; back: string };
export type FlashcardAIAssistant = (
  action: FlashcardAIAction,
  front: string,
  back: string,
  card?: ReaderNote | null,
) => Promise<FlashcardAIDraft>;

export type LearningPhase = "pretest" | "posttest" | "feynman";

const STRING_ARRAY = { type: "array", items: { type: "string" } } as const;

export const BOOK_PROFILE_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    domains: STRING_ARRAY,
    contentType: { type: "string" },
    centralTopics: STRING_ARRAY,
    centralQuestions: STRING_ARRAY,
    observedPositions: STRING_ARRAY,
    recurringAssumptions: STRING_ARRAY,
    methodsOfReasoning: STRING_ARRAY,
    importantDistinctions: STRING_ARRAY,
    keyConcepts: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: { name: { type: "string" }, definition: { type: "string" }, evidence: STRING_ARRAY },
        required: ["name", "definition", "evidence"],
      },
    },
    importantEntities: STRING_ARRAY,
    possibleTraditions: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: { name: { type: "string" }, confidence: { type: "number", minimum: 0, maximum: 1 }, evidence: STRING_ARRAY },
        required: ["name", "confidence", "evidence"],
      },
    },
  },
  required: ["domains", "contentType", "centralTopics", "centralQuestions", "observedPositions", "recurringAssumptions", "methodsOfReasoning", "importantDistinctions", "keyConcepts", "importantEntities", "possibleTraditions"],
} as const;

export const CHAPTER_ANALYSIS_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    card: {
      type: "object", additionalProperties: false,
      properties: {
        mainQuestion: { type: "string" }, thesis: { type: "string" }, keyConcepts: STRING_ARRAY,
        argumentMap: STRING_ARRAY, importantClaims: STRING_ARRAY,
        definitions: {
          type: "array",
          items: {
            type: "object", additionalProperties: false,
            properties: { term: { type: "string" }, definition: { type: "string" }, evidence: STRING_ARRAY },
            required: ["term", "definition", "evidence"],
          },
        },
        authorAssumptions: STRING_ARRAY, importantEntities: STRING_ARRAY,
        connectionsToPreviousContent: STRING_ARRAY, interpretiveContext: STRING_ARRAY,
      },
      required: ["mainQuestion", "thesis", "keyConcepts", "argumentMap", "importantClaims", "definitions", "authorAssumptions", "importantEntities", "connectionsToPreviousContent", "interpretiveContext"],
    },
    study: {
      type: "object", additionalProperties: false,
      properties: {
        preReadingQuestions: {
          type: "array", minItems: 3, maxItems: 3,
          items: { type: "object", additionalProperties: false, properties: { id: { type: "string" }, prompt: { type: "string" } }, required: ["id", "prompt"] },
        },
        learningObjectives: STRING_ARRAY,
        postReadingQuestions: {
          type: "array", minItems: 3, maxItems: 3,
          items: { type: "object", additionalProperties: false, properties: { id: { type: "string" }, prompt: { type: "string" } }, required: ["id", "prompt"] },
        },
        feynmanQuestion: { type: "string" }, commonMisunderstandings: STRING_ARRAY,
      },
      required: ["preReadingQuestions", "learningObjectives", "postReadingQuestions", "feynmanQuestion", "commonMisunderstandings"],
    },
    concepts: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: { name: { type: "string" }, authorDefinition: { type: "string" }, relationships: STRING_ARRAY, evidence: STRING_ARRAY },
        required: ["name", "authorDefinition", "relationships", "evidence"],
      },
    },
    profile: BOOK_PROFILE_SCHEMA,
  },
  required: ["card", "study", "concepts", "profile"],
} as const;

export const EXPLANATION_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: { message: { type: "string" }, basis: { type: "string", enum: ["textual", "interpretation", "external", "insufficient"] } },
  required: ["message", "basis"],
} as const;

export const HIGHLIGHT_MATCH_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    message: { type: "string" },
    matches: {
      type: "array", maxItems: 5,
      items: {
        type: "object", additionalProperties: false,
        properties: { start: { type: "integer", minimum: 0 }, end: { type: "integer", minimum: 0 }, text: { type: "string" } },
        required: ["start", "end", "text"],
      },
    },
  },
  required: ["message", "matches"],
} as const;

export const NOTE_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    message: { type: "string" },
    kind: { type: "string", enum: ["comment", "flashcard"] },
    front: { type: "string" },
    back: { type: "string" },
  },
  required: ["message", "kind", "front", "back"],
} as const;

export const EVALUATION_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    message: { type: "string" },
    evaluation: {
      type: "object", additionalProperties: false,
      properties: {
        score: { type: "integer", minimum: 0, maximum: 100 }, feedback: { type: "string" },
        strengths: STRING_ARRAY, gaps: STRING_ARRAY, approved: { type: "boolean" },
      },
      required: ["score", "feedback", "strengths", "gaps", "approved"],
    },
  },
  required: ["message", "evaluation"],
} as const;
