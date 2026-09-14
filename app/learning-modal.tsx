"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import type { AssistantEvaluation, LearningPhase, StudyQuestion } from "./study-contract";

export type LearningModalState = {
  phase: LearningPhase;
  chapterTitle: string;
  questions: StudyQuestion[];
  answers: Record<string, string>;
  evaluation: AssistantEvaluation | null;
  loading: boolean;
  difficultyLabel?: string;
  scopeLabel?: string;
};

type LearningModalProps = {
  state: LearningModalState;
  onAnswer: (id: string, value: string) => void;
  onSubmit: () => void;
  onContinue: () => void;
  onSkip: () => void;
  onCloseActivity: () => void;
  onExitStudy: () => void;
  onQuestionPromptChange: (questionId: string, prompt: string) => void;
  onAnswerWithAI: (questionId: string) => void;
  onRetryQuestion: (questionId: string | null) => void;
  onAddQuestionToDeck: (questionId: string) => void;
  questionAIBusyId: string | null;
  questionAIError: string;
  deckBusyQuestionId: string | null;
  deckAddedQuestionIds: string[];
};

type AnswerSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type AnswerSpeechWindow = Window & {
  SpeechRecognition?: new () => AnswerSpeechRecognition;
  webkitSpeechRecognition?: new () => AnswerSpeechRecognition;
};

const PHASE_COPY = {
  pretest: {
    kicker: "ANTES DE LEER",
    title: "Activa lo que ya sabes",
    description: "Responde las preguntas configuradas para activar tus conocimientos previos, o sáltalas y comienza a leer.",
    submit: "Revisar respuestas",
    skip: "Omitir y comenzar",
  },
  posttest: {
    kicker: "AL TERMINAR",
    title: "Recupera lo aprendido",
    description: "Contesta sin volver al texto. La recuperación activa ayuda a fijar las ideas centrales.",
    submit: "Evaluar respuestas",
    skip: "Omitir y continuar",
  },
  feynman: {
    kicker: "TÉCNICA FEYNMAN",
    title: "Explícalo con tus palabras",
    description: "Imagina que se lo enseñas a alguien que no conoce el tema. La retroalimentación señalará fortalezas y lagunas.",
    submit: "Analizar mi explicación",
    skip: "Omitir y avanzar",
  },
} as const;

export function LearningModal({ state, onAnswer, onSubmit, onContinue, onSkip, onCloseActivity, onExitStudy, onQuestionPromptChange, onAnswerWithAI, onRetryQuestion, onAddQuestionToDeck, questionAIBusyId, questionAIError, deckBusyQuestionId, deckAddedQuestionIds }: LearningModalProps) {
  const copy = PHASE_COPY[state.phase];
  const answerIds = state.phase === "feynman" ? ["feynman"] : state.questions.map((question) => question.id);
  const canSubmit = answerIds.length > 0 && answerIds.every((id) => (state.answers[id] ?? "").trim().length >= 3);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [questionDraft, setQuestionDraft] = useState("");
  const [answerDraft, setAnswerDraft] = useState("");
  const [dictatingTarget, setDictatingTarget] = useState<string | null>(null);
  const [dictationError, setDictationError] = useState("");
  const answerRecognitionRef = useRef<AnswerSpeechRecognition | null>(null);

  useEffect(() => () => {
    answerRecognitionRef.current?.abort();
    answerRecognitionRef.current = null;
  }, []);

  const dictateAnswer = (target: string, currentValue: string, apply: (value: string) => void) => {
    if (answerRecognitionRef.current) {
      answerRecognitionRef.current.stop();
      if (dictatingTarget === target) return;
    }
    const speechWindow = window as AnswerSpeechWindow;
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setDictationError("El dictado no está disponible en este navegador.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = navigator.language || "es-MX";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => { setDictationError(""); setDictatingTarget(target); };
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join(" ").trim();
      if (transcript) apply(`${currentValue.trim()}${currentValue.trim() ? " " : ""}${transcript}`);
    };
    recognition.onerror = (event) => {
      if (event.error !== "aborted" && event.error !== "no-speech") setDictationError("No se pudo reconocer la respuesta. Vuelve a intentarlo.");
    };
    recognition.onend = () => {
      if (answerRecognitionRef.current === recognition) answerRecognitionRef.current = null;
      setDictatingTarget((current) => current === target ? null : current);
    };
    answerRecognitionRef.current = recognition;
    try { recognition.start(); } catch { answerRecognitionRef.current = null; setDictatingTarget(null); setDictationError("El micrófono ya está ocupado."); }
  };

  const beginQuestionEdit = (questionId: string, prompt: string) => {
    setEditingQuestionId(questionId);
    setQuestionDraft(prompt);
    setAnswerDraft(state.answers[questionId] ?? "");
  };

  const saveQuestionEdit = () => {
    const prompt = questionDraft.trim();
    if (!editingQuestionId || !prompt) return;
    onQuestionPromptChange(editingQuestionId, prompt);
    if (state.evaluation) onAnswer(editingQuestionId, answerDraft.trim());
    setEditingQuestionId(null);
    setQuestionDraft("");
    setAnswerDraft("");
  };

  return (
    <div className="learning-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="learning-modal-title">
      <section className="learning-modal">
        <header>
          <span>{copy.kicker}</span>
          <div className="learning-modal-head-actions">
            <button className="exit-study" type="button" onClick={onExitStudy}>Salir del modo estudio</button>
            <button className="learning-modal-close" type="button" onClick={onCloseActivity} aria-label="Cerrar esta actividad" title="Cerrar actividad"><Icon name="close" size={14} /></button>
          </div>
          <small>{state.chapterTitle}</small>
          <h2 id="learning-modal-title">{copy.title}</h2>
          <p>{copy.description}</p>
          <div className="learning-context-chips">
            {state.difficultyLabel && <span>Nivel {state.difficultyLabel}</span>}
            {state.scopeLabel && <span>{state.scopeLabel}</span>}
          </div>
        </header>

        {state.loading && !state.evaluation ? (
          <div className="learning-loading" role="status">
            <i />
            <strong>Preparando la actividad…</strong>
            <button className="learning-skip" type="button" onClick={onSkip}>{copy.skip}</button>
          </div>
        ) : state.evaluation ? (
          <div className="evaluation-result">
            <div className="evaluation-score"><strong>{state.evaluation.score}</strong><span>/100</span></div>
            <div><span>RETROALIMENTACIÓN</span><h3>{state.evaluation.feedback}</h3></div>
            <div className="evaluation-columns">
              <section><strong>Fortalezas</strong><ul>{state.evaluation.strengths.length ? state.evaluation.strengths.map((item) => <li key={item}>{item}</li>) : <li>Actividad completada</li>}</ul></section>
              <section><strong>Por reforzar</strong><ul>{state.evaluation.gaps.length ? state.evaluation.gaps.map((item) => <li key={item}>{item}</li>) : <li>Sin lagunas críticas detectadas</li>}</ul></section>
            </div>
            <section className="learning-question-deck-list" aria-label="Preguntas disponibles para el deck de flashcards">
              <header><div><strong>Preguntas de esta actividad</strong><small>Añade únicamente las que quieras volver a practicar.</small></div></header>
              {state.questions.map((question, index) => {
                const added = deckAddedQuestionIds.includes(question.id);
                const busy = deckBusyQuestionId === question.id;
                const aiBusy = questionAIBusyId === question.id;
                const editing = editingQuestionId === question.id;
                return (
                  <article className="learning-question-deck-item" key={question.id}>
                    <i>{index + 1}</i>
                    <div className="learning-question-deck-copy">
                      {editing ? (
                        <div className="learning-question-inline-editor">
                          <textarea value={questionDraft} onChange={(event) => setQuestionDraft(event.target.value)} rows={2} aria-label="Editar pregunta" />
                          <div className="learning-answer-input"><textarea value={answerDraft} onChange={(event) => setAnswerDraft(event.target.value)} rows={3} aria-label="Editar respuesta" placeholder="Respuesta de la flashcard" /><button className={dictatingTarget === `edit-${question.id}` ? "is-listening" : ""} type="button" onClick={() => dictateAnswer(`edit-${question.id}`, answerDraft, setAnswerDraft)} aria-label="Dictar respuesta" title="Dictar respuesta"><Icon name="mic" size={13} /></button></div>
                          <span><button type="button" onClick={() => { setEditingQuestionId(null); setQuestionDraft(""); setAnswerDraft(""); }}>Cancelar</button><button type="button" onClick={saveQuestionEdit} disabled={!questionDraft.trim()}>Aplicar</button></span>
                        </div>
                      ) : <strong>{question.prompt}</strong>}
                      {!editing && <p>{state.answers[question.id]?.trim() || "Sin respuesta escrita"}</p>}
                    </div>
                    <div className="learning-question-deck-actions">
                      <button className="question-ai-answer" type="button" onClick={() => onAnswerWithAI(question.id)} disabled={Boolean(questionAIBusyId)} aria-label="Dejar que la IA responda esta pregunta" title="Responder con IA">{aiBusy ? "…" : <><Icon name="sparkles" size={12} /><small>IA</small></>}</button>
                      <button type="button" onClick={() => beginQuestionEdit(question.id, question.prompt)} disabled={editing} aria-label="Editar esta pregunta" title="Editar pregunta"><Icon name="note" size={12} /></button>
                      <button type="button" onClick={() => onRetryQuestion(question.id)} aria-label="Reintentar esta pregunta" title="Reintentar esta pregunta"><Icon name="redo" size={12} /></button>
                      <button
                        className={`question-deck-add ${added ? "is-added" : ""}`}
                        type="button"
                        onClick={() => onAddQuestionToDeck(question.id)}
                        disabled={busy || added}
                        aria-label={added ? "Pregunta añadida al deck" : "Agregar esta pregunta al deck"}
                        title={added ? "Añadida al deck" : "Agregar al deck"}
                      >{busy ? "…" : added ? <Icon name="check" size={13} /> : <Icon name="plus" size={13} />}</button>
                    </div>
                  </article>
                );
              })}
              {questionAIError && <p className="learning-question-ai-error" role="alert">{questionAIError}</p>}
            </section>
            <div className="evaluation-primary-actions"><button className="learning-skip" type="button" onClick={() => onRetryQuestion(null)}><Icon name="redo" size={12} /> Reintentar este test</button><button className="learning-primary" type="button" onClick={onContinue}>{state.phase === "pretest" ? "Comenzar el capítulo" : state.phase === "posttest" ? "Continuar con Feynman" : "Avanzar al siguiente capítulo"} <span><Icon name="arrowRight" size={14} /></span></button></div>
          </div>
        ) : (
          <div className="learning-form">
            {state.questions.map((question, index) => {
              const editing = editingQuestionId === question.id;
              const aiBusy = questionAIBusyId === question.id;
              return (
                <div className={state.phase === "feynman" ? "feynman-field" : "question-field"} key={question.id}>
                  <div className="learning-question-heading">
                    {editing ? (
                      <div className="learning-question-inline-editor">
                        <textarea value={questionDraft} onChange={(event) => setQuestionDraft(event.target.value)} rows={2} aria-label="Editar pregunta" />
                        <span><button type="button" onClick={() => { setEditingQuestionId(null); setQuestionDraft(""); setAnswerDraft(""); }}>Cancelar</button><button type="button" onClick={saveQuestionEdit} disabled={!questionDraft.trim()}>Aplicar</button></span>
                      </div>
                    ) : <span>{state.phase !== "feynman" && <i>{index + 1}</i>}{question.prompt || "Explica la idea principal con tus palabras"}</span>}
                    {!editing && <div className="learning-question-tools"><button type="button" onClick={() => onAnswerWithAI(question.id)} disabled={Boolean(questionAIBusyId)}><Icon name="sparkles" size={12} /> {aiBusy ? "Respondiendo…" : "Responder con IA"}</button><button type="button" onClick={() => beginQuestionEdit(question.id, question.prompt)}><Icon name="note" size={11} /> Editar</button></div>}
                  </div>
                  <div className="learning-answer-input"><textarea value={state.answers[question.id] ?? ""} onChange={(event) => onAnswer(question.id, event.target.value)} rows={state.phase === "feynman" ? 10 : 3} placeholder={state.phase === "feynman" ? "Este capítulo explica que…" : "Escribe tu respuesta…"} /><button className={dictatingTarget === question.id ? "is-listening" : ""} type="button" onClick={() => dictateAnswer(question.id, state.answers[question.id] ?? "", (value) => onAnswer(question.id, value))} aria-label={dictatingTarget === question.id ? "Detener dictado de esta respuesta" : "Dictar esta respuesta"} title={dictatingTarget === question.id ? "Detener dictado" : "Dictar respuesta"}><Icon name="mic" size={14} /></button></div>
                </div>
              );
            })}
            {dictationError && <p className="learning-question-ai-error" role="alert">{dictationError}</p>}
            {questionAIError && <p className="learning-question-ai-error" role="alert">{questionAIError}</p>}
            <div className="learning-form-footer">
              <small>{answerIds.filter((id) => (state.answers[id] ?? "").trim()).length} de {answerIds.length} respuestas</small>
              <div className="learning-form-actions">
                <button className="learning-skip" type="button" onClick={onSkip}>{copy.skip}</button>
                <button className="learning-primary" type="button" onClick={onSubmit} disabled={!canSubmit || state.loading}>{state.loading ? "Analizando…" : copy.submit} <span><Icon name="arrowRight" size={14} /></span></button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
