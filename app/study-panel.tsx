"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { AnnotationActions, type AnnotationActionsProps } from "./annotation-tools";
import type { AssistantResponse, FlashcardAIAction, FlashcardAIAssistant, ReaderNote, ReaderNoteKind } from "./study-contract";
import { STUDY_DIFFICULTY_LABELS, type StudyPreferences } from "./study-planner";

export type StudyTab = "assistant" | "notes" | "flashcards";

export type AssistantChatMessage = {
  id: string;
  role: "user" | "assistant" | "error";
  text: string;
  response?: AssistantResponse;
  savedNoteId?: number;
};

export type AssistantChat = {
  id: string;
  title: string;
  messages: AssistantChatMessage[];
};

export type NoteDraft = {
  kind: "comment" | "flashcard";
  front: string;
  back: string;
  referenceLabel?: string | null;
};

type StudyPanelProps = AnnotationActionsProps & {
  open: boolean;
  hasBook: boolean;
  tab: StudyTab;
  chapterTitle: string;
  assistantBusy: boolean;
  assistantError: string;
  assistantChats: AssistantChat[];
  activeAssistantChatId: string;
  assistantFocus: { source: "selection"; text: string } | null;
  assistantDraft: string;
  assistantDictating: boolean;
  assistantSpeechMessageId: string | null;
  assistantSpeechPaused: boolean;
  speechSupported: boolean;
  recognitionSupported: boolean;
  notes: ReaderNote[];
  noteDraft: NoteDraft | null;
  noteDraftBusy: boolean;
  noteDraftAIBusy: boolean;
  noteDraftError: string;
  linkedNoteEditRequest: { noteId: number; token: number } | null;
  currentChapterKey: string;
  onClose: () => void;
  onTabChange: (tab: StudyTab) => void;
  onCommand: (command: string) => void;
  onNewAssistantChat: () => void;
  onSelectAssistantChat: (chatId: string) => void;
  onAssistantDraftChange: (value: string) => void;
  onStartAssistantDictation: () => void;
  onStopAssistantDictation: () => void;
  onSpeakAssistantMessage: (messageId: string, text: string) => void;
  onStopAssistantSpeech: () => void;
  onClearAssistantFocus: () => void;
  onStartNoteDraft: (kind: NoteDraft["kind"]) => void;
  onChangeNoteDraft: (draft: NoteDraft) => void;
  onCancelNoteDraft: () => void;
  onSaveNoteDraft: () => void;
  onUseNoteDraftAI: () => void;
  onRegenerateNoteDraftAI: () => void;
  onSaveChatMessageAsComment: (text: string, role: "user" | "assistant") => void;
  onSaveNote: (note: ReaderNote) => Promise<void>;
  onAssistFlashcard: FlashcardAIAssistant;
  onDeleteNote: (id: number) => void;
  onLinkedNoteEditComplete: (id: number) => void;
  onOpenNoteReference: (note: ReaderNote) => void;
  onOpenNotesLibrary: () => void;
  onOpenFlashcardWorkspace: () => void;
  onPracticeFlashcard: (note: ReaderNote) => void;
  onOpenWhiteboard: () => void;
};

type NoteDraftEditorProps = Pick<StudyPanelProps,
  "noteDraftBusy" | "noteDraftAIBusy" | "noteDraftError" | "onChangeNoteDraft" |
  "onCancelNoteDraft" | "onSaveNoteDraft" | "onUseNoteDraftAI" | "onRegenerateNoteDraftAI"
> & { noteDraft: NoteDraft; editing?: boolean };

export function NoteDraftEditor(props: NoteDraftEditorProps) {
  return (
    <article className={`note-draft note-draft-${props.noteDraft.kind}`}>
      <header><div><strong>{props.editing ? "Editar nota" : props.noteDraft.kind === "comment" ? "Nueva nota" : "Nueva flashcard"}</strong><span>{props.noteDraft.referenceLabel ? `Vinculada a: ${props.noteDraft.referenceLabel}` : "No se creará nada hasta que lo guardes."}</span></div><button type="button" onClick={props.onCancelNoteDraft} aria-label="Cerrar editor de nota" disabled={props.noteDraftBusy}><Icon name="close" size={13} /></button></header>
      {props.noteDraft.kind === "flashcard" && <label>Pregunta<textarea value={props.noteDraft.front} onChange={(event) => props.onChangeNoteDraft({ ...props.noteDraft!, front: event.target.value })} rows={2} placeholder="Escribe la pregunta…" /></label>}
      <label>{props.noteDraft.kind === "comment" ? "Nota" : "Respuesta"}<textarea disabled={props.noteDraftAIBusy || props.noteDraftBusy} value={props.noteDraft.back} onChange={(event) => props.onChangeNoteDraft({ ...props.noteDraft!, back: event.target.value })} rows={props.noteDraft.kind === "comment" ? 6 : 4} placeholder={props.noteDraft.kind === "comment" ? "Escribe aquí tu nota…" : "Escribe la respuesta…"} /></label>
      {props.noteDraft.referenceLabel && (
        <div className="note-draft-ai-tools">
          <div>
            <button type="button" onClick={props.onUseNoteDraftAI} disabled={props.noteDraftAIBusy || (props.noteDraft.kind === "flashcard" && !props.noteDraft.front.trim())}>
              <Icon name="sparkles" size={12} />
              {props.noteDraftAIBusy
                ? "Preparando con IA…"
                : props.noteDraft.kind === "comment"
                  ? props.noteDraft.back.trim() ? "Rehacer nota con IA" : "Crear nota con IA"
                  : "Rehacer respuesta con IA"}
            </button>
            {props.noteDraft.kind === "flashcard" && (
              <button type="button" onClick={props.onRegenerateNoteDraftAI} disabled={props.noteDraftAIBusy}>
                <Icon name="redo" size={12} /> Rehacer toda la flashcard
              </button>
            )}
          </div>
          <small>{props.noteDraft.kind === "comment" ? "Usará solamente el fragmento seleccionado." : "Puedes conservar la pregunta o generar de nuevo la pregunta y la respuesta desde el fragmento."}</small>
        </div>
      )}
      {props.noteDraftAIBusy && <div className="note-draft-ai-status" role="status"><i /><span><strong>{props.noteDraft.kind === "comment" ? "Redactando nota con IA…" : "Preparando flashcard con IA…"}</strong><small>{props.noteDraft.kind === "comment" ? "Sintetizando el fragmento seleccionado." : "Usando el fragmento seleccionado como referencia."}</small></span></div>}
      {props.noteDraftError && <p className="note-draft-error">{props.noteDraftError}</p>}
      <div className="note-draft-actions"><button type="button" onClick={props.onCancelNoteDraft} disabled={props.noteDraftBusy}>Cancelar</button><button type="button" onClick={props.onSaveNoteDraft} disabled={props.noteDraftBusy || props.noteDraftAIBusy || !props.noteDraft.back.trim() || (props.noteDraft.kind === "flashcard" && !props.noteDraft.front.trim())}>{props.noteDraftBusy ? "Guardando…" : props.noteDraftAIBusy ? "Preparando…" : props.noteDraft.kind === "comment" ? "Guardar nota" : "Guardar flashcard"}</button></div>
    </article>
  );
}

const ACTION_LABELS: Record<Exclude<NonNullable<AssistantResponse>["action"], "crear_nota">, string> = {
  subrayar: "Subrayado",
  evaluar: "Evaluación",
  responder: "Respuesta",
};

function assistantActionLabel(response: AssistantResponse) {
  if (response.action === "crear_nota") return response.note?.kind === "comment" ? "Nota creada" : "Flashcard creada";
  return ACTION_LABELS[response.action];
}

function assistantSpeechText(message: AssistantChatMessage) {
  const note = message.response?.note;
  if (!note) return message.text;
  return note.kind === "flashcard"
    ? `Pregunta. ${note.front}. Respuesta. ${note.back}`
    : `Nota. ${note.back}`;
}

function AssistantCreatedNote({ note, savedNote, onSave, onAssistFlashcard, onConvert, onShowOrigin }: AnnotationActionsProps & {
  note: NonNullable<AssistantResponse["note"]>;
  savedNote: ReaderNote | null;
  onSave: (note: ReaderNote) => Promise<void>;
  onAssistFlashcard: FlashcardAIAssistant;
}) {
  const [editing, setEditing] = useState(false);
  const [front, setFront] = useState(note.front);
  const [back, setBack] = useState(note.back);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAIBusy] = useState<FlashcardAIAction | null>(null);
  const [error, setError] = useState("");

  const assist = async (action: FlashcardAIAction) => {
    if (note.kind !== "flashcard" || !front.trim() || aiBusy || saving) return;
    setAIBusy(action);
    setError("");
    try {
      const draft = await onAssistFlashcard(action, front.trim(), back.trim(), savedNote);
      setFront(draft.front);
      setBack(draft.back);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "La IA no pudo completar la flashcard.");
    } finally {
      setAIBusy(null);
    }
  };

  const save = async () => {
    if (!savedNote || !back.trim() || (note.kind === "flashcard" && !front.trim()) || saving) return;
    setSaving(true);
    setError("");
    try {
      await onSave({ ...savedNote, front: note.kind === "comment" ? "Nota" : front.trim(), back: back.trim() });
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo guardar el cambio.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={`assistant-created-note assistant-created-note-${note.kind} ${editing ? "is-editing" : ""}`}>
      <div className="assistant-created-note-heading">
        <small>{note.kind === "comment" ? "Contenido de la nota" : "Flashcard guardada"}</small>
        {savedNote && !editing && <button type="button" onClick={() => setEditing(true)} title="Editar sin salir del chat" aria-label={note.kind === "comment" ? "Editar nota en el chat" : "Editar flashcard en el chat"}><Icon name={note.kind === "comment" ? "note" : "cards"} size={11} /> Editar</button>}
      </div>
      {editing ? (
        <div className="assistant-created-note-editor">
          {note.kind === "flashcard" && <label>Pregunta<textarea value={front} onChange={(event) => setFront(event.target.value)} rows={2} /></label>}
          <label>{note.kind === "comment" ? "Nota" : "Respuesta"}<textarea value={back} onChange={(event) => setBack(event.target.value)} rows={3} /></label>
          {note.kind === "flashcard" && <div className="flashcard-ai-tools compact"><span><Icon name="sparkles" size={12} /> Ayuda de IA</span><div><button type="button" onClick={() => void assist("answer")} disabled={Boolean(aiBusy)}>{aiBusy === "answer" ? "Respondiendo…" : "Responder pregunta"}</button><button type="button" onClick={() => void assist("rewrite")} disabled={Boolean(aiBusy)}>{aiBusy === "rewrite" ? "Reformulando…" : "Reformular respuesta"}</button></div></div>}
          {error && <p className="note-draft-error">{error}</p>}
          <footer><button type="button" onClick={() => { setFront(note.front); setBack(note.back); setEditing(false); }}>Cancelar</button><button type="button" onClick={() => void save()} disabled={saving || Boolean(aiBusy) || !back.trim() || (note.kind === "flashcard" && !front.trim())}>{saving ? "Guardando…" : "Guardar"}</button></footer>
        </div>
      ) : note.kind === "comment" ? (
        <p>{back}</p>
      ) : (
        <><strong>{front}</strong><span>{back}</span></>
      )}
      {!editing && <i>Guardada automáticamente en {note.kind === "comment" ? "Notas" : "Flashcards"}</i>}
      {!editing && savedNote && <AnnotationActions note={savedNote} onConvert={onConvert} onShowOrigin={onShowOrigin} />}
    </section>
  );
}

type NoteCardProps = AnnotationActionsProps & {
  note: ReaderNote;
  onSave: (note: ReaderNote) => Promise<void>;
  onAssistFlashcard: FlashcardAIAssistant;
  onDelete: (id: number) => void;
  onOpenReference: (note: ReaderNote) => void;
  onPractice?: (note: ReaderNote) => void;
  onBeginEdit?: (note: ReaderNote) => void;
  editRequestToken?: number | null;
  onEditComplete?: (id: number) => void;
};

export function NoteCard({ note, onSave, onAssistFlashcard, onDelete, onOpenReference, onPractice, onBeginEdit, onConvert, onShowOrigin, editRequestToken = null, onEditComplete = () => undefined }: NoteCardProps) {
  const cardRef = useRef<HTMLElement>(null);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  const [editing, setEditing] = useState(false);
  const [front, setFront] = useState(note.front);
  const [back, setBack] = useState(note.back);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAIBusy] = useState<FlashcardAIAction | null>(null);
  const [error, setError] = useState("");
  const isComment = note.kind === "comment";

  useEffect(() => {
    if (editRequestToken === null) return;
    const frame = window.requestAnimationFrame(() => {
      setFront(note.front);
      setBack(note.back);
      setError("");
      setEditing(true);
      window.requestAnimationFrame(() => {
        cardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        noteInputRef.current?.focus();
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editRequestToken, note.back, note.front]);

  const beginEdit = () => {
    if (onBeginEdit) { onBeginEdit(note); return; }
    setFront(note.front);
    setBack(note.back);
    setError("");
    setEditing(true);
  };

  const save = async () => {
    const nextFront = isComment ? "Nota" : front.trim();
    const nextBack = back.trim();
    if (!nextBack || (!isComment && !nextFront) || saving) return;
    setSaving(true);
    setError("");
    try {
      await onSave({ ...note, front: nextFront, back: nextBack });
      setEditing(false);
      onEditComplete(note.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  const assist = async (action: FlashcardAIAction) => {
    if (isComment || !front.trim() || aiBusy || saving) return;
    setAIBusy(action);
    setError("");
    try {
      const draft = await onAssistFlashcard(action, front.trim(), back.trim(), note);
      setFront(draft.front);
      setBack(draft.back);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "La IA no pudo completar la flashcard.");
    } finally {
      setAIBusy(null);
    }
  };

  return (
    <article ref={cardRef} className={`note-card note-card-${note.kind} ${note.color ? `note-linked-${note.color}` : ""} ${editing ? "is-editing" : ""}`}>
      <div className="note-card-header"><span>{note.chapterTitle}</span><i>{isComment ? "Nota" : "Flashcard"}</i><button type="button" onClick={() => { onEditComplete(note.id); onDelete(note.id); }} aria-label={isComment ? "Eliminar nota" : "Eliminar flashcard"}><Icon name="close" size={13} /></button></div>
      {note.anchorLabel && note.anchorCfi && (
        <button className="note-anchor" type="button" onClick={() => onOpenReference(note)} title="Volver a esta referencia en el libro">
          <Icon name="target" size={13} /> {note.anchorLabel}
        </button>
      )}
      {editing ? (
        <>
          {!isComment && <label>Pregunta<textarea value={front} onChange={(event) => setFront(event.target.value)} rows={2} /></label>}
          <label>{isComment ? "Nota" : "Respuesta"}<textarea ref={noteInputRef} value={back} onChange={(event) => setBack(event.target.value)} rows={isComment ? 6 : 4} /></label>
          {!isComment && <div className="flashcard-ai-tools compact"><span><Icon name="sparkles" size={12} /> Ayuda de IA</span><div><button type="button" onClick={() => void assist("answer")} disabled={Boolean(aiBusy)}>{aiBusy === "answer" ? "Respondiendo…" : "Responder pregunta"}</button><button type="button" onClick={() => void assist("rewrite")} disabled={Boolean(aiBusy)}>{aiBusy === "rewrite" ? "Reformulando…" : "Reformular respuesta"}</button></div></div>}
          {error && <p className="note-draft-error">{error}</p>}
          <div className="note-edit-actions"><button type="button" onClick={() => { setEditing(false); onEditComplete(note.id); }}>Cancelar</button><button type="button" onClick={() => void save()} disabled={saving || Boolean(aiBusy) || !back.trim() || (!isComment && !front.trim())}>{saving ? "Guardando…" : "Guardar"}</button></div>
        </>
      ) : isComment ? (
        <p className="note-sticky-text">{note.back}</p>
      ) : (
        <div className="flashcard-preview"><strong>{note.front}</strong><span>{note.back}</span></div>
      )}
      {note.quote && note.anchorCfi ? (
        <button className="note-reference-quote" type="button" onClick={() => onOpenReference(note)} title="Volver al fragmento exacto en el libro">
          <span>“{note.quote}”</span><small>Ir al texto →</small>
        </button>
      ) : note.quote ? <blockquote className="note-reference-quote"><span>“{note.quote}”</span></blockquote> : null}
      <div className="note-card-footer">{note.quote ? <small className={`note-color ${note.highlightId ? `note-color-${note.color ?? "yellow"}` : "note-color-selection"}`}>{note.highlightId ? "Vinculada al subrayado" : "Basada en la selección"}</small> : <span />} {!editing && <span className="note-card-footer-actions">{note.kind === "flashcard" && onPractice && <button type="button" onClick={() => onPractice(note)} title="Intentar esta flashcard"><Icon name="play" size={10} /> Intentar</button>}<button type="button" onClick={beginEdit}>Editar</button></span>}</div>
      {!editing && <AnnotationActions note={note} onConvert={onConvert} onShowOrigin={onShowOrigin} />}
    </article>
  );
}

type NotesLibraryProps = AnnotationActionsProps & {
  open: boolean;
  bookTitle: string;
  notes: ReaderNote[];
  onClose: () => void;
  onSaveNote: (note: ReaderNote) => Promise<void>;
  onAssistFlashcard: FlashcardAIAssistant;
  onDeleteNote: (id: number) => void;
  onOpenNoteReference: (note: ReaderNote) => void;
  onClearAnnotations: () => void;
};

export function NotesLibrary(props: NotesLibraryProps) {
  const [kind, setKind] = useState<ReaderNoteKind>("comment");
  const [query, setQuery] = useState("");
  if (!props.open) return null;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleNotes = props.notes.filter((note) => {
    if (note.kind !== kind) return false;
    if (!normalizedQuery) return true;
    return `${note.chapterTitle} ${note.anchorLabel ?? ""} ${note.front} ${note.back} ${note.quote ?? ""}`.toLocaleLowerCase().includes(normalizedQuery);
  });
  const commentCount = props.notes.filter((note) => note.kind === "comment").length;
  const flashcardCount = props.notes.filter((note) => note.kind === "flashcard").length;

  return (
    <div className="notes-library-page" role="dialog" aria-modal="true" aria-label="Todas las notas del libro">
      <header className="notes-library-header">
        <button type="button" onClick={props.onClose} aria-label="Volver al lector"><Icon name="arrowLeft" size={15} /></button>
        <div><span>ARCHIVO DEL LIBRO</span><h2>{props.bookTitle || "Notas y flashcards"}</h2><p>Todas tus anotaciones, organizadas fuera del espacio de lectura.</p></div>
        <button type="button" onClick={props.onClose} aria-label="Cerrar archivo de notas"><Icon name="close" size={14} /></button>
      </header>
      <div className="notes-library-controls">
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por capítulo, texto o referencia…" aria-label="Buscar en todas las notas" />
        <div className="note-kind-tabs" role="tablist" aria-label="Filtrar archivo por tipo">
          <button type="button" className={kind === "comment" ? "active" : ""} onClick={() => setKind("comment")}>Notas <i>{commentCount}</i></button>
          <button type="button" className={kind === "flashcard" ? "active" : ""} onClick={() => setKind("flashcard")}>Flashcards <i>{flashcardCount}</i></button>
        </div>
      </div>
      <main className="notes-library-content">
        {visibleNotes.length ? <div className="notes-library-grid">{visibleNotes.map((note) => <NoteCard key={note.id} note={note} onSave={props.onSaveNote} onAssistFlashcard={props.onAssistFlashcard} onDelete={props.onDeleteNote} onOpenReference={props.onOpenNoteReference} onConvert={props.onConvert} onShowOrigin={props.onShowOrigin} />)}</div> : <div className="notes-empty"><span><Icon name="note" size={18} /></span><p>No hay anotaciones que coincidan con esta vista.</p></div>}
      </main>
      <footer className="notes-library-footer"><span>{props.notes.length} anotaciones en este libro</span><button type="button" onClick={props.onClearAnnotations}>Borrar todas las anotaciones…</button></footer>
    </div>
  );
}

type StudyOverviewModalProps = {
  open: boolean;
  studyMode: boolean;
  chapterTitle: string;
  learningStatus: { pretest: boolean; posttest: boolean; feynman: boolean };
  preferences: StudyPreferences;
  subtopics: string[];
  subtopicsLoading: boolean;
  onClose: () => void;
  onPreferencesChange: (preferences: StudyPreferences) => void;
  onStartStudy: () => void;
  onOpenPhase: (phase: "pretest" | "posttest" | "feynman") => void;
  onExitStudy: () => void;
};

export function StudyOverviewModal(props: StudyOverviewModalProps) {
  if (!props.open) return null;
  return (
    <div className="study-overview-backdrop" role="presentation">
      <section id="study-overview-dialog" className="study-overview-dialog" role="dialog" aria-modal="true" aria-labelledby="study-overview-title">
        <header>
          <div><span>MODO OPCIONAL</span><small>{props.chapterTitle}</small></div>
          <button type="button" onClick={props.onClose} aria-label="Cerrar ventana de estudio"><Icon name="close" size={14} /></button>
        </header>
        <div className="study-overview-content">
          <h2 id="study-overview-title">{props.studyMode ? "Estudio activo" : "Diseña tu sesión"}</h2>
          <p>{props.studyMode
            ? "Abre cualquier actividad cuando quieras o ajusta el nivel antes de continuar."
            : "Elige dificultad, número de preguntas y si quieres trabajar el capítulo completo o un solo subtema."}</p>

          <div className="study-preferences" aria-label="Configuración del estudio">
            <fieldset>
              <legend>Dificultad</legend>
              <div className="study-choice-row">
                {(Object.keys(STUDY_DIFFICULTY_LABELS) as Array<keyof typeof STUDY_DIFFICULTY_LABELS>).map((difficulty) => (
                  <button key={difficulty} type="button" className={props.preferences.difficulty === difficulty ? "active" : ""} onClick={() => props.onPreferencesChange({ ...props.preferences, difficulty })}>{STUDY_DIFFICULTY_LABELS[difficulty]}</button>
                ))}
              </div>
            </fieldset>
            <label className="study-question-count"><span>Preguntas por test</span><select value={props.preferences.questionCount} onChange={(event) => props.onPreferencesChange({ ...props.preferences, questionCount: Number(event.target.value) })}>{Array.from({ length: 8 }, (_, index) => index + 1).map((count) => <option value={count} key={count}>{count}</option>)}</select></label>
            <fieldset>
              <legend>Alcance</legend>
              <div className="study-choice-row">
                <button type="button" className={props.preferences.scope === "chapter" ? "active" : ""} onClick={() => props.onPreferencesChange({ ...props.preferences, scope: "chapter" })}>Capítulo completo</button>
                <button type="button" className={props.preferences.scope === "subtopic" ? "active" : ""} onClick={() => props.onPreferencesChange({ ...props.preferences, scope: "subtopic", subtopic: props.preferences.subtopic || props.subtopics[0] || "" })}>Un subtema</button>
              </div>
              {props.preferences.scope === "subtopic" && (
                <select value={props.preferences.subtopic} onChange={(event) => props.onPreferencesChange({ ...props.preferences, subtopic: event.target.value })} aria-label="Elegir subtema" disabled={props.subtopicsLoading || !props.subtopics.length}>
                  {props.subtopicsLoading && <option value="">Preparando subtemas…</option>}
                  {!props.subtopicsLoading && !props.subtopics.length && <option value="">No se detectaron subtemas</option>}
                  {props.subtopics.map((subtopic) => <option key={subtopic} value={subtopic}>{subtopic}</option>)}
                </select>
              )}
            </fieldset>
          </div>

          <button className="study-mode-action" type="button" onClick={props.onStartStudy} disabled={props.preferences.scope === "subtopic" && !props.preferences.subtopic}>
            {props.studyMode ? "Continuar con la actividad pendiente" : "Comenzar sesión de estudio"} <Icon name="arrowRight" size={15} />
          </button>
          <ol className={`learning-steps ${props.studyMode ? "mode-active" : "mode-inactive"}`}>
            <li className={props.learningStatus.pretest ? "complete" : "current"}><button type="button" onClick={() => props.onOpenPhase("pretest")}><i>{props.learningStatus.pretest ? <Icon name="check" size={12} /> : "1"}</i><div><strong>Pre-test</strong><span>Activa conocimientos previos antes de comenzar.</span></div><b>{props.learningStatus.pretest ? "Repetir" : "Abrir"} →</b></button></li>
            <li className={props.learningStatus.posttest ? "complete" : props.learningStatus.pretest ? "current" : ""}><button type="button" onClick={() => props.onOpenPhase("posttest")}><i>{props.learningStatus.posttest ? <Icon name="check" size={12} /> : "2"}</i><div><strong>Post-test</strong><span>Recupera las ideas centrales de este alcance.</span></div><b>{props.learningStatus.posttest ? "Repetir" : "Abrir"} →</b></button></li>
            <li className={props.learningStatus.feynman ? "complete" : props.learningStatus.posttest ? "current" : ""}><button type="button" onClick={() => props.onOpenPhase("feynman")}><i>{props.learningStatus.feynman ? <Icon name="check" size={12} /> : "3"}</i><div><strong>Técnica Feynman</strong><span>Explica con tus palabras y detecta lagunas.</span></div><b>{props.learningStatus.feynman ? "Repetir" : "Abrir"} →</b></button></li>
          </ol>
          {props.studyMode && <button className="study-exit-action" type="button" onClick={props.onExitStudy}>Salir del modo estudio</button>}
        </div>
      </section>
    </div>
  );
}

export function StudyPanel(props: StudyPanelProps) {
  const assistantInputRef = useRef<HTMLTextAreaElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const activeChat = props.assistantChats.find((chat) => chat.id === props.activeAssistantChatId) ?? props.assistantChats[0];
  const chapterNotes = props.notes.filter((note) => note.chapterKey === props.currentChapterKey);
  const visibleNoteKind: ReaderNoteKind = props.tab === "flashcards" ? "flashcard" : "comment";
  const visibleNotes = chapterNotes.filter((note) => note.kind === visibleNoteKind);
  const commentCount = chapterNotes.filter((note) => note.kind === "comment").length;
  const flashcardCount = chapterNotes.filter((note) => note.kind === "flashcard").length;

  useEffect(() => {
    if (props.open && props.tab === "assistant") assistantInputRef.current?.focus();
  }, [props.assistantFocus, props.open, props.tab]);

  useEffect(() => {
    const conversation = conversationRef.current;
    if (conversation) conversation.scrollTop = conversation.scrollHeight;
  }, [activeChat?.messages, props.assistantBusy]);

  const submit = () => {
    const value = props.assistantDraft.trim();
    if (!value || props.assistantBusy || !props.hasBook) return;
    props.onCommand(value);
    props.onAssistantDraftChange("");
  };

  return (
    <aside className={`study-panel ${props.open ? "open" : ""}`} aria-label="Cuaderno inteligente" aria-hidden={!props.open}>
      <header className="study-panel-header">
        <div><span>CUADERNO INTELIGENTE</span><strong>{props.chapterTitle || "Abre un capítulo"}</strong></div>
        <button type="button" onClick={props.onClose} aria-label="Cerrar cuaderno inteligente"><Icon name="close" size={14} /></button>
      </header>

      <div className="study-tabs" role="tablist" aria-label="Herramientas del lector">
        <button type="button" className={props.tab === "assistant" ? "active" : ""} onClick={() => props.onTabChange("assistant")} role="tab" aria-selected={props.tab === "assistant"}>IA</button>
        <button type="button" className={props.tab === "notes" ? "active" : ""} onClick={() => props.onTabChange("notes")} role="tab" aria-selected={props.tab === "notes"}>Notas <i>{commentCount}</i></button>
        <button type="button" className={props.tab === "flashcards" ? "active" : ""} onClick={() => props.onTabChange("flashcards")} role="tab" aria-selected={props.tab === "flashcards"}>Flashcards <i>{flashcardCount}</i></button>
      </div>

      {!props.hasBook ? (
        <div className="study-empty"><span><Icon name="sparkles" size={18} /></span><strong>El asistente espera tu libro</strong><p>Abre un EPUB para usar el contexto del capítulo, crear notas y empezar las evaluaciones.</p></div>
      ) : props.tab === "assistant" ? (
        <div className="assistant-tab" role="tabpanel">
          <div className="assistant-chat-switcher">
            <label>
              <span>Chat</span>
              <select value={props.activeAssistantChatId} onChange={(event) => props.onSelectAssistantChat(event.target.value)} aria-label="Seleccionar chat de IA">
                {props.assistantChats.map((chat) => <option key={chat.id} value={chat.id}>{chat.title}</option>)}
              </select>
            </label>
            <button type="button" onClick={props.onNewAssistantChat} aria-label="Crear un chat nuevo" title="Nuevo chat con contexto independiente"><Icon name="plus" size={13} /> Nuevo</button>
          </div>
          <div className="assistant-context-row">
            <div className="context-chip"><i /> Este chat conserva su propio hilo y contexto</div>
          </div>
          {props.assistantFocus && (
            <section className="assistant-reference-card" aria-label="Texto seleccionado como referencia para la IA">
              <header>
                <div><span aria-hidden="true"><Icon name="sparkles" size={13} /></span><p><strong>Texto seleccionado</strong><small>La IA dará prioridad a esta referencia</small></p></div>
                <button type="button" onClick={props.onClearAssistantFocus} aria-label="Quitar texto seleccionado"><Icon name="close" size={13} /></button>
              </header>
              <blockquote>“{props.assistantFocus.text}”</blockquote>
            </section>
          )}
          <div className="assistant-conversation" aria-live="polite" ref={conversationRef}>
            {activeChat?.messages.map((message) => message.role === "user" ? (
              <div className="assistant-message assistant-message-user" key={message.id}>
                <small>Tú</small><p>{message.text}</p>
                <button className="assistant-save-comment" type="button" onClick={() => props.onSaveChatMessageAsComment(message.text, "user")} title="Guardar este mensaje como nota"><Icon name="note" size={12} /> Guardar</button>
              </div>
            ) : message.role === "error" ? (
              <div className="assistant-message assistant-message-error" key={message.id}><p className="assistant-error">{message.text}</p></div>
            ) : message.response ? (
              <article className="assistant-message assistant-message-ai" key={message.id}>
                <div className="assistant-result-meta">
                  <span>{assistantActionLabel(message.response)}</span>
                  <small>{message.response.cacheHit ? "Respuesta reutilizada" : message.response.provider === "openai" ? "OpenAI" : message.response.provider === "reader" ? "Lector · 0 tokens" : "Modo local"}</small>
                </div>
                {message.response.provider === "local" && (
                  <div className="local-model-warning"><strong>Respuesta básica</strong><span>No hay un LLM conectado; esta respuesta usa reglas locales y puede ser limitada.</span></div>
                )}
                <p>{message.response.message}</p>
                {message.response.note && <AssistantCreatedNote note={message.response.note} savedNote={message.savedNoteId ? props.notes.find((note) => note.id === message.savedNoteId) ?? null : null} onSave={props.onSaveNote} onAssistFlashcard={props.onAssistFlashcard} onConvert={props.onConvert} onShowOrigin={props.onShowOrigin} />}
                {message.response.highlight && <blockquote>“{message.response.highlight.quote}”</blockquote>}
                {message.response.evaluation && (
                  <div className="mini-score"><strong>{message.response.evaluation.score}</strong><span>/100<br />{message.response.evaluation.feedback}</span></div>
                )}
                <div className="assistant-message-actions">
                  {message.response.action !== "crear_nota" && (
                    <button type="button" onClick={() => props.onSaveChatMessageAsComment(message.text, "assistant")} title="Convertir esta respuesta en una nota editable">
                      <span aria-hidden="true"><Icon name="note" size={12} /></span> Guardar como nota
                    </button>
                  )}
                  <button
                    type="button"
                    className={props.assistantSpeechMessageId === message.id ? props.assistantSpeechPaused ? "is-speaking is-paused" : "is-speaking" : ""}
                    onClick={() => props.onSpeakAssistantMessage(message.id, assistantSpeechText(message))}
                    disabled={!props.speechSupported}
                    aria-label={props.assistantSpeechMessageId === message.id ? props.assistantSpeechPaused ? "Reanudar audio de esta respuesta" : "Pausar audio de esta respuesta" : "Reproducir esta respuesta en voz alta"}
                    aria-pressed={props.assistantSpeechMessageId === message.id}
                    title="Usa la voz, velocidad y volumen del lector"
                  >
                    <span aria-hidden="true"><Icon name={props.assistantSpeechMessageId === message.id && !props.assistantSpeechPaused ? "pause" : "play"} size={11} /></span>
                    {props.assistantSpeechMessageId === message.id ? props.assistantSpeechPaused ? "Reanudar" : "Pausar" : "Escuchar"}
                  </button>
                  {props.assistantSpeechMessageId === message.id && (
                    <button className="assistant-speech-stop" type="button" onClick={props.onStopAssistantSpeech} aria-label="Detener audio de esta respuesta" title="Detener y volver al inicio">
                      <span aria-hidden="true"><Icon name="stop" size={10} /></span> Detener
                    </button>
                  )}
                </div>
              </article>
            ) : null)}
            {props.assistantBusy ? (
              <div className="assistant-message assistant-thinking"><i /><i /><i /><span>Preparando el contexto necesario…</span></div>
            ) : props.assistantError ? (
              <div className="assistant-message assistant-message-error"><p className="assistant-error">{props.assistantError}</p></div>
            ) : !activeChat?.messages.length ? (
              <div className={`assistant-welcome ${props.assistantFocus ? "has-reference" : ""}`}>
                <span><Icon name={props.assistantFocus ? "check" : "sparkles"} size={16} /></span>
                <h3>{props.assistantFocus ? "Referencia lista" : "Pregunta, crea o subraya"}</h3>
                <p>{props.assistantFocus
                  ? "Escribe qué quieres saber. La respuesta se basará primero en el texto seleccionado."
                  : "Selecciona un fragmento del libro y pulsa IA, o pregunta sobre el capítulo actual."}</p>
              </div>
            ) : null}
          </div>
          <div className="assistant-compose">
            <textarea ref={assistantInputRef} value={props.assistantDraft} onChange={(event) => props.onAssistantDraftChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} placeholder="Escribe una pregunta sobre el foco…" rows={3} />
            <div className="assistant-compose-actions">
              <button
                className={`assistant-compose-mic ${props.assistantDictating ? "is-listening" : ""}`}
                type="button"
                disabled={!props.recognitionSupported || props.assistantBusy}
                onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); props.onStartAssistantDictation(); }}
                onPointerUp={props.onStopAssistantDictation}
                onPointerCancel={props.onStopAssistantDictation}
                onKeyDown={(event) => { if (!event.repeat && (event.key === " " || event.key === "Enter")) { event.preventDefault(); props.onStartAssistantDictation(); } }}
                onKeyUp={(event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); props.onStopAssistantDictation(); } }}
                aria-label="Mantén presionado para dar un comando o preguntar a la IA"
                aria-pressed={props.assistantDictating}
                title="Si la frase no es un comando, se envía a la IA de este chat"
              ><Icon name="mic" size={14} /></button>
              <button className="assistant-compose-send" type="button" onClick={submit} disabled={!props.assistantDraft.trim() || props.assistantBusy} aria-label="Enviar comando al asistente"><Icon name="send" size={14} /></button>
            </div>
          </div>
          <p className="assistant-privacy">La voz ejecuta primero los comandos reconocidos y envía las demás frases a la IA. Cada chat usa solo su propio hilo, la selección y el contexto relevante; no se reenvía automáticamente todo el capítulo.</p>
        </div>
      ) : (
        <div className="notes-tab" role="tabpanel">
          <div className="notes-controls">
            <div className="notes-chapter-label"><span>CAPÍTULO ACTUAL</span><strong>{props.chapterTitle}</strong></div>
            <div className="notes-actions">
              <button
                type="button"
                className={visibleNoteKind === "comment" ? "notes-create-comment" : "notes-create-flashcard"}
                onClick={() => props.onStartNoteDraft(visibleNoteKind)}
              >{visibleNoteKind === "comment" ? <><Icon name="plus" size={13} /> Escribir nota</> : <><Icon name="plus" size={13} /> Crear flashcard</>}</button>
            </div>
            {visibleNoteKind === "flashcard" ? (
              <div className="notes-workspace-actions"><button type="button" onClick={props.onOpenFlashcardWorkspace}>Abrir página de flashcards</button></div>
            ) : (
              <div className="notes-workspace-actions"><button type="button" onClick={props.onOpenWhiteboard}>Abrir pizarra de notas</button></div>
            )}
            <button className="notes-library-link" type="button" onClick={props.onOpenNotesLibrary}>Ver todas las anotaciones del libro <span><Icon name="arrowRight" size={13} /></span></button>
          </div>
          {props.noteDraft?.kind === visibleNoteKind && <NoteDraftEditor {...props} noteDraft={props.noteDraft} />}
          {visibleNotes.length === 0 ? <div className="notes-empty"><span><Icon name={visibleNoteKind === "flashcard" ? "cards" : "note"} size={18} /></span><p>{visibleNoteKind === "flashcard" ? "Aún no hay flashcards en este capítulo." : "Aún no hay notas en este capítulo."}</p></div> : (
            <div className="note-list">
              {visibleNotes.map((note) => <NoteCard key={note.id} note={note} onSave={props.onSaveNote} onAssistFlashcard={props.onAssistFlashcard} onDelete={props.onDeleteNote} onOpenReference={props.onOpenNoteReference} onPractice={props.onPracticeFlashcard} onConvert={props.onConvert} onShowOrigin={props.onShowOrigin} editRequestToken={props.linkedNoteEditRequest?.noteId === note.id ? props.linkedNoteEditRequest.token : null} onEditComplete={props.onLinkedNoteEditComplete} />)}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
