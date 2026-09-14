export const ANALYSIS_VERSION = "2.0.0";
export const PROMPT_VERSION = "2.0.0";
export const DEFAULT_OPENAI_MODEL = "gpt-5.6-luna";

export const TASK_INPUT_BUDGETS = {
  explain_selection: 2_200,
  ai_highlight: 800,
  create_note: 1_400,
  chapter_question: 3_600,
  whole_book_question: 5_500,
  evaluate_pretest: 1_800,
  evaluate_posttest: 2_400,
  evaluate_feynman: 2_400,
} as const;

export const TASK_OUTPUT_BUDGETS = {
  explain_selection: 420,
  ai_highlight: 900,
  create_note: 360,
  chapter_question: 560,
  whole_book_question: 760,
  evaluate_pretest: 520,
  evaluate_posttest: 620,
  evaluate_feynman: 620,
  chapter_analysis: 2_600,
} as const;
