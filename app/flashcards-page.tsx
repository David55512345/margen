"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "./icons";
import { AnnotationActions, type AnnotationActionsProps } from "./annotation-tools";
import type { FlashcardAIAction, FlashcardAIAssistant, ReaderNote } from "./study-contract";
import { hydrateSyncedDocument, saveSyncedDocument, type DeviceSyncStatus } from "./device-sync";

type ReviewGrade = "again" | "hard" | "good" | "easy";
type ReviewSchedule = { dueAt: number; intervalDays: number; ease: number; reviews: number; lapses: number };
type ReviewMap = Record<string, ReviewSchedule>;

type FlashcardsPageProps = AnnotationActionsProps & {
  open: boolean;
  bookKey: string;
  bookTitle: string;
  cards: ReaderNote[];
  initialCardId: number | null;
  onClose: () => void;
  onCreateCard: (front: string, back: string) => Promise<void>;
  onSaveCard: (card: ReaderNote) => Promise<void>;
  onDeleteCard: (id: number) => void;
  onOpenReference: (card: ReaderNote) => void;
  onExportCards: (cards: ReaderNote[]) => void;
  onAssistCard: FlashcardAIAssistant;
  onSyncStatusChange?: (status: DeviceSyncStatus) => void;
};

function scheduleCard(current: ReviewSchedule | undefined, grade: ReviewGrade): ReviewSchedule {
  const now = Date.now();
  const base = current ?? { dueAt: now, intervalDays: 0, ease: 2.5, reviews: 0, lapses: 0 };
  if (grade === "again") return { ...base, dueAt: now + 60_000, intervalDays: 0, ease: Math.max(1.3, base.ease - .2), reviews: base.reviews + 1, lapses: base.lapses + 1 };
  const multiplier = grade === "hard" ? 1.2 : grade === "easy" ? base.ease + .35 : base.ease;
  const firstInterval = grade === "hard" ? 1 : grade === "easy" ? 7 : 3;
  const intervalDays = Math.max(firstInterval, Math.round((base.intervalDays || 1) * multiplier));
  return { ...base, dueAt: now + intervalDays * 86_400_000, intervalDays, ease: Math.max(1.3, base.ease + (grade === "easy" ? .15 : grade === "hard" ? -.05 : 0)), reviews: base.reviews + 1 };
}

function dueLabel(schedule: ReviewSchedule | undefined, now: number) {
  if (!schedule) return "Nueva";
  if (schedule.dueAt <= now) return "Para hoy";
  const days = Math.max(1, Math.ceil((schedule.dueAt - now) / 86_400_000));
  return `En ${days} d`;
}

export function FlashcardsPage(props: FlashcardsPageProps) {
  if (!props.open) return null;
  return <FlashcardsWorkspace key={`${props.bookKey}:${props.initialCardId ?? "all"}`} {...props} />;
}

function FlashcardsWorkspace(props: FlashcardsPageProps) {
  const initialCard = props.initialCardId === null ? null : props.cards.find((card) => card.id === props.initialCardId) ?? null;
  const [view, setView] = useState<"decks" | "review" | "browse">(initialCard ? "review" : "decks");
  const [selectedChapter, setSelectedChapter] = useState(initialCard?.chapterTitle ?? "all");
  const [query, setQuery] = useState("");
  const [reviewMap, setReviewMap] = useState<ReviewMap>(() => {
    if (typeof window === "undefined" || !props.bookKey) return {};
    try {
      const saved = window.localStorage.getItem(`lector-review:${props.bookKey}`);
      return saved ? JSON.parse(saved) as ReviewMap : {};
    } catch { return {}; }
  });
  const [reviewNow, setReviewNow] = useState(() => Date.now());
  const [reviewIndex, setReviewIndex] = useState(0);
  const [answerVisible, setAnswerVisible] = useState(false);
  const [practiceCardId, setPracticeCardId] = useState<number | null>(initialCard?.id ?? null);
  const [referenceCard, setReferenceCard] = useState<ReaderNote | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingCard, setEditingCard] = useState<ReaderNote | null>(null);
  const [newFront, setNewFront] = useState("");
  const [newBack, setNewBack] = useState("");
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAIBusy] = useState<FlashcardAIAction | null>(null);
  const [aiError, setAIError] = useState("");
  const [syncReady, setSyncReady] = useState(false);

  useEffect(() => {
    if (!props.open || !props.bookKey) return;
    let active = true;
    void hydrateSyncedDocument(props.bookKey, "review", reviewMap, props.onSyncStatusChange).then((synced) => {
      if (!active) return;
      setReviewMap(synced && typeof synced === "object" && !Array.isArray(synced) ? synced : reviewMap);
      setSyncReady(true);
    });
    return () => { active = false; };
    // La hidratación debe ejecutarse una sola vez al abrir este deck.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.bookKey, props.open]);

  useEffect(() => {
    if (!props.open || !props.bookKey || !syncReady) return;
    try { window.localStorage.setItem(`lector-review:${props.bookKey}`, JSON.stringify(reviewMap)); } catch { /* la copia remota sigue disponible */ }
    const timer = window.setTimeout(() => {
      void saveSyncedDocument(props.bookKey, "review", reviewMap, props.onSyncStatusChange);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [props.bookKey, props.onSyncStatusChange, props.open, reviewMap, syncReady]);

  const chapters = useMemo(() => Array.from(new Set(props.cards.map((card) => card.chapterTitle))).sort(), [props.cards]);
  const selectedCards = useMemo(() => props.cards.filter((card) => selectedChapter === "all" || card.chapterTitle === selectedChapter), [props.cards, selectedChapter]);
  const dueCards = useMemo(() => selectedCards.filter((card) => !reviewMap[String(card.id)] || reviewMap[String(card.id)].dueAt <= reviewNow), [reviewMap, reviewNow, selectedCards]);
  const reviewCards = useMemo(() => practiceCardId === null ? dueCards : selectedCards.filter((card) => card.id === practiceCardId), [dueCards, practiceCardId, selectedCards]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const browsedCards = selectedCards.filter((card) => !normalizedQuery || `${card.front} ${card.back} ${card.chapterTitle}`.toLocaleLowerCase().includes(normalizedQuery));
  const currentCard = reviewCards[reviewIndex % Math.max(1, reviewCards.length)];
  const newCount = selectedCards.filter((card) => !reviewMap[String(card.id)]).length;
  const learnedCount = selectedCards.length - newCount;

  const grade = (value: ReviewGrade) => {
    if (!currentCard) return;
    setReviewMap((current) => ({ ...current, [String(currentCard.id)]: scheduleCard(current[String(currentCard.id)], value) }));
    setAnswerVisible(false);
    setReviewIndex((current) => current + 1);
    setReviewNow(Date.now());
  };

  const startReview = (card?: ReaderNote) => {
    if (card) {
      setSelectedChapter(card.chapterTitle);
      setPracticeCardId(card.id);
    } else {
      setPracticeCardId(null);
    }
    setReviewIndex(0);
    setAnswerVisible(false);
    setView("review");
  };

  const create = async () => {
    if (!newFront.trim() || !newBack.trim() || saving) return;
    setSaving(true);
    try {
      await props.onCreateCard(newFront.trim(), newBack.trim());
      setNewFront(""); setNewBack(""); setCreating(false); setView("browse");
    } finally { setSaving(false); }
  };

  const openEditor = (card?: ReaderNote) => {
    setEditingCard(card ?? null);
    setNewFront(card?.front ?? "");
    setNewBack(card?.back ?? "");
    setAIBusy(null);
    setAIError("");
    setCreating(true);
  };

  const assistEditor = async (action: FlashcardAIAction) => {
    if ((action !== "regenerate" && !newFront.trim()) || saving || aiBusy) return;
    setAIBusy(action);
    setAIError("");
    try {
      const draft = await props.onAssistCard(action, newFront.trim(), newBack.trim(), editingCard);
      setNewFront(draft.front);
      setNewBack(draft.back);
    } catch (caught) {
      setAIError(caught instanceof Error ? caught.message : "La IA no pudo completar la flashcard.");
    } finally {
      setAIBusy(null);
    }
  };

  const saveEditor = async () => {
    if (!newFront.trim() || !newBack.trim() || saving) return;
    if (!editingCard) return void create();
    setSaving(true);
    try {
      await props.onSaveCard({ ...editingCard, front: newFront.trim(), back: newBack.trim() });
      setEditingCard(null); setNewFront(""); setNewBack(""); setCreating(false);
    } finally { setSaving(false); }
  };

  const closeEditor = () => { setCreating(false); setEditingCard(null); setNewFront(""); setNewBack(""); setAIBusy(null); setAIError(""); };

  return (
    <div className="knowledge-page flashcards-workspace" role="dialog" aria-modal="true" aria-label="Página de flashcards">
      <aside className="knowledge-sidebar">
        <button className="knowledge-back" type="button" onClick={props.onClose}><Icon name="arrowLeft" size={14} /> Volver al lector</button>
        <div className="knowledge-book"><span>DECK ACTUAL</span><strong>{props.bookTitle || "Flashcards"}</strong><small>{props.cards.length} tarjetas</small></div>
        <nav aria-label="Navegación de flashcards">
          <button type="button" className={view === "decks" ? "active" : ""} onClick={() => setView("decks")}><span><Icon name="cards" size={14} /></span> Mazos</button>
          <button type="button" className={view === "review" ? "active" : ""} onClick={() => startReview()}><span><Icon name="play" size={13} /></span> Estudiar ahora <i>{dueCards.length}</i></button>
          <button type="button" className={view === "browse" ? "active" : ""} onClick={() => setView("browse")}><span><Icon name="list" size={14} /></span> Explorar tarjetas</button>
        </nav>
        <div className="deck-list"><span>CAPÍTULOS</span><button type="button" className={selectedChapter === "all" ? "active" : ""} onClick={() => setSelectedChapter("all")}>Todo el libro <i>{props.cards.length}</i></button>{chapters.map((chapter) => <button type="button" className={selectedChapter === chapter ? "active" : ""} onClick={() => setSelectedChapter(chapter)} key={chapter}>{chapter}<i>{props.cards.filter((card) => card.chapterTitle === chapter).length}</i></button>)}</div>
      </aside>

      <main className="knowledge-main">
        <header className="knowledge-header"><div><span>LECTOR / FLASHCARDS</span><h1>{selectedChapter === "all" ? "Repaso del libro" : selectedChapter}</h1></div><div><button type="button" onClick={() => props.onExportCards(selectedCards)} disabled={!selectedCards.length}>Exportar Anki</button><button className="primary" type="button" onClick={() => openEditor()}><Icon name="plus" size={13} /> Nueva flashcard</button></div></header>

        {view === "decks" ? (
          <section className="deck-dashboard">
            <div className="study-stats"><article><span>Para hoy</span><strong>{dueCards.length}</strong><small>listas para repasar</small></article><article><span>Nuevas</span><strong>{newCount}</strong><small>sin estudiar</small></article><article><span>Aprendiendo</span><strong>{learnedCount}</strong><small>con historial</small></article></div>
            <article className="deck-hero"><div><span>SESIÓN RECOMENDADA</span><h2>{dueCards.length ? `${dueCards.length} tarjetas te esperan` : "Repaso al día"}</h2><p>El intervalo de cada tarjeta cambia según recuerdes la respuesta: Otra vez, Difícil, Bien o Fácil.</p></div><button type="button" onClick={() => startReview()} disabled={!dueCards.length}>{dueCards.length ? "Comenzar repaso" : "Nada pendiente"} <Icon name="arrowRight" size={14} /></button></article>
            <div className="deck-table"><div><b>Mazo</b><b>Tarjetas</b><b>Pendientes</b><b>Acción</b></div>{["all", ...chapters].map((chapter) => { const cards = props.cards.filter((card) => chapter === "all" || card.chapterTitle === chapter); const due = cards.filter((card) => !reviewMap[String(card.id)] || reviewMap[String(card.id)].dueAt <= reviewNow).length; return <div key={chapter}><span>{chapter === "all" ? props.bookTitle : chapter}</span><span>{cards.length}</span><span>{due}</span><button type="button" onClick={() => { setSelectedChapter(chapter); setPracticeCardId(null); setView("review"); setReviewIndex(0); setAnswerVisible(false); }}>Estudiar</button></div>; })}</div>
          </section>
        ) : view === "review" ? (
          <section className="review-session">
            <div className="review-progress"><span>{Math.min(reviewIndex, reviewCards.length)} / {reviewCards.length}</span><i style={{ width: `${reviewCards.length ? Math.min(100, reviewIndex / reviewCards.length * 100) : 100}%` }} /></div>
            {currentCard && reviewIndex < reviewCards.length ? <>
              <article className={`review-card ${answerVisible ? "is-revealed" : ""}`}>
                <small>{currentCard.chapterTitle}</small><h2>{currentCard.front}</h2>
                <AnnotationActions note={currentCard} onConvert={props.onConvert} onShowOrigin={props.onShowOrigin} />
                {answerVisible && <div className="review-answer"><span>RESPUESTA</span><p>{currentCard.back}</p>{currentCard.quote && <button className="review-reference" type="button" onClick={() => setReferenceCard(currentCard)} title="Abrir el texto de referencia"><span>Referencia del libro</span>“{currentCard.quote}”</button>}</div>}
              </article>
              {!answerVisible ? <button className="show-answer" type="button" onClick={() => setAnswerVisible(true)}>Mostrar respuesta</button> : <div className="review-grades"><button type="button" onClick={() => grade("again")}><b>Otra vez</b><small>&lt; 1 min</small></button><button type="button" onClick={() => grade("hard")}><b>Difícil</b><small>1 día</small></button><button type="button" onClick={() => grade("good")}><b>Bien</b><small>3+ días</small></button><button type="button" onClick={() => grade("easy")}><b>Fácil</b><small>7+ días</small></button></div>}
            </> : <div className="review-complete"><span><Icon name="check" size={20} /></span><h2>Sesión terminada</h2><p>Ya no quedan tarjetas pendientes en este mazo.</p><button type="button" onClick={() => setView("decks")}>Volver a los mazos</button></div>}
          </section>
        ) : (
          <section className="card-browser">
            <div className="card-browser-tools"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar pregunta, respuesta o capítulo…" /><span>{browsedCards.length} resultados</span></div>
            <div className="browser-table"><div><b>Flashcard</b><b>Capítulo</b><b>Estado</b><b /></div>{browsedCards.map((card) => <div key={card.id}><span><strong>{card.front}</strong><small>{card.back}</small>{card.quote && <button className="browser-card-reference" type="button" onClick={() => setReferenceCard(card)} title="Ver el texto de referencia">“{card.quote}”</button>}<AnnotationActions note={card} onConvert={props.onConvert} onShowOrigin={props.onShowOrigin} /></span><span>{card.chapterTitle}</span><span>{dueLabel(reviewMap[String(card.id)], reviewNow)}</span><span><button type="button" onClick={() => startReview(card)} title="Intentar esta flashcard"><Icon name="play" size={10} /> Intentar</button><button type="button" onClick={() => openEditor(card)}>Editar</button><button type="button" onClick={() => props.onDeleteCard(card.id)} aria-label="Eliminar flashcard"><Icon name="close" size={13} /></button></span></div>)}</div>
          </section>
        )}
      </main>

      {creating && <div className="knowledge-dialog-backdrop"><section className="knowledge-dialog flashcard-editor-dialog" role="dialog" aria-modal="true" aria-label={editingCard ? "Editar flashcard" : "Crear flashcard"}><header><div><span>{editingCard ? "EDITAR TARJETA" : "NUEVA TARJETA"}</span><h2>{editingCard ? "Editar flashcard" : "Crear flashcard"}</h2></div><button type="button" onClick={closeEditor} aria-label="Cerrar editor de flashcard"><Icon name="close" size={14} /></button></header><label>Pregunta<textarea value={newFront} onChange={(event) => setNewFront(event.target.value)} rows={3} /></label><label>Respuesta<textarea value={newBack} onChange={(event) => setNewBack(event.target.value)} rows={5} /></label><div className="flashcard-ai-tools"><span><Icon name="sparkles" size={13} /> Ayuda de IA</span><div><button type="button" onClick={() => void assistEditor("answer")} disabled={!newFront.trim() || Boolean(aiBusy)}>{aiBusy === "answer" ? "Respondiendo…" : "Responder la pregunta"}</button><button type="button" onClick={() => void assistEditor("rewrite")} disabled={!newFront.trim() || Boolean(aiBusy)}>{aiBusy === "rewrite" ? "Reformulando…" : "Reformular respuesta"}</button>{!editingCard && <button type="button" onClick={() => void assistEditor("regenerate")} disabled={Boolean(aiBusy)}>{aiBusy === "regenerate" ? "Creando otra…" : "Rehacer toda la flashcard"}</button>}</div><small>{editingCard ? "Estas opciones conservan tu pregunta y trabajan únicamente sobre la respuesta." : "Puedes conservar la pregunta o generar de nuevo tanto la pregunta como la respuesta."}</small></div>{aiError && <p className="flashcard-ai-error" role="alert">{aiError}</p>}<footer><button type="button" onClick={closeEditor}>Cancelar</button><button className="primary" type="button" onClick={() => void saveEditor()} disabled={saving || Boolean(aiBusy) || !newFront.trim() || !newBack.trim()}>{saving ? "Guardando…" : editingCard ? "Guardar cambios" : "Guardar en el deck"}</button></footer></section></div>}
      {referenceCard && <div className="knowledge-dialog-backdrop reference-reader-backdrop"><section className="knowledge-dialog reference-reader-dialog" role="dialog" aria-modal="true" aria-label="Texto de referencia de la flashcard"><header><div><span>REFERENCIA DEL EPUB</span><h2>{referenceCard.anchorLabel || referenceCard.chapterTitle}</h2><small>{referenceCard.chapterTitle}</small></div><button type="button" onClick={() => setReferenceCard(null)} aria-label="Cerrar referencia"><Icon name="close" size={14} /></button></header><article className="reference-reader-page"><span><Icon name="bookOpen" size={15} /> Fragmento guardado</span><blockquote>“{referenceCard.quote || "Esta flashcard no conserva un fragmento textual."}”</blockquote></article><footer><button type="button" onClick={() => setReferenceCard(null)}>Cerrar</button>{referenceCard.anchorCfi && <button className="primary" type="button" onClick={() => props.onOpenReference(referenceCard)}>Abrir en el lector</button>}</footer></section></div>}
    </div>
  );
}
