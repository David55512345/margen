"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./icons";
import type { ReaderNote } from "./study-contract";
import { conversionDraft, findOriginNote } from "./annotation-conversion";

export type AnnotationActionsProps = {
  onConvert: (note: ReaderNote) => void;
  onShowOrigin: (note: ReaderNote) => void;
};

export function AnnotationActions({ note, onConvert, onShowOrigin }: AnnotationActionsProps & { note: ReaderNote }) {
  const label = note.kind === "comment" ? "Convertir en flashcard" : "Convertir en nota";
  return <div className="annotation-actions">
    {note.origin && <button type="button" className="annotation-origin" onClick={() => onShowOrigin(note)} title="Ver el origen de esta conversión"><Icon name="link" size={12} />Basada en {note.origin.kind === "comment" ? "una nota" : "una flashcard"}</button>}
    <button type="button" onClick={() => onConvert(note)} title={`${label} conservando el original`}><Icon name={note.kind === "comment" ? "cards" : "note"} size={12} />{label}</button>
  </div>;
}

export function AnnotationDetailDialog({ note, children, onClose }: { note: ReaderNote; children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="annotation-dialog annotation-detail" aria-label={note.kind === "comment" ? "Ver nota" : "Ver flashcard"} onCancel={onClose} onClose={onClose}>
    <header><h2>{note.kind === "comment" ? "Nota" : "Flashcard"}</h2><button type="button" onClick={onClose} aria-label="Cerrar anotación"><Icon name="close" /></button></header>
    <div className="annotation-dialog-body">{children}</div>
  </dialog>;
}

export function ConversionDialog({ source, onClose, onPrepareQuestion, onSave, onOpenResult }: {
  source: ReaderNote;
  onClose: () => void;
  onPrepareQuestion: (note: ReaderNote) => Promise<string>;
  onSave: (source: ReaderNote, front: string, back: string, key: string) => Promise<ReaderNote>;
  onOpenResult: (note: ReaderNote) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(() => conversionDraft(source));
  const [key] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState<"ai" | "save" | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ReaderNote | null>(null);
  const flashcard = source.kind === "comment";
  useEffect(() => { dialog.current?.showModal(); }, []);
  const prepare = async () => {
    if (busy) return;
    setBusy("ai"); setError("");
    try { const front = await onPrepareQuestion(source); setDraft((current) => ({ ...current, front })); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo generar la pregunta. Puedes escribirla tú."); }
    finally { setBusy(null); }
  };
  const save = async () => {
    if (busy || result) return;
    setBusy("save"); setError("");
    try { setResult(await onSave(source, draft.front, draft.back, key)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo guardar. Tu original está intacto."); }
    finally { setBusy(null); }
  };
  return <dialog ref={dialog} className="annotation-dialog" aria-labelledby="conversion-title" onCancel={(event) => { if (busy) event.preventDefault(); else onClose(); }} onClose={onClose}>
    <header><div><small>CONVERSIÓN CON ORIGEN</small><h2 id="conversion-title">{flashcard ? "Convertir en flashcard" : "Convertir en nota"}</h2></div><button type="button" disabled={Boolean(busy)} onClick={onClose} aria-label="Cerrar conversión"><Icon name="close" /></button></header>
    {result ? <><div className="annotation-dialog-body" role="status"><p>{flashcard ? "Flashcard guardada." : "Nota guardada."} El original sigue intacto y ambos están unidos por un trazo de origen en la pizarra.</p><strong>{result.front}</strong><p className="annotation-full-text">{result.back}</p></div><footer><button type="button" onClick={onClose}>Cerrar</button><button type="button" onClick={() => { onClose(); onOpenResult(result); }}>Ver {flashcard ? "flashcard" : "nota"}</button></footer></> : <>
      <div className="annotation-dialog-body">
        <p>Se creará una {flashcard ? "flashcard" : "nota"} nueva, conservando el original, su referencia al libro y un vínculo entre ambas. Revisa el contenido antes de guardar.</p>
        <small>{source.chapterTitle}</small>
        {flashcard && <label>Pregunta<textarea value={draft.front} onChange={(event) => setDraft({ ...draft, front: event.target.value })} maxLength={8000} rows={3} disabled={Boolean(busy)} /></label>}
        {flashcard && <button type="button" className="annotation-ai" disabled={Boolean(busy)} onClick={() => void prepare()}><Icon name="sparkles" size={13} />{busy === "ai" ? "Preparando pregunta…" : "Crear pregunta con IA"}</button>}
        <label>{flashcard ? "Respuesta" : "Contenido de la nota"}<textarea value={draft.back} onChange={(event) => setDraft({ ...draft, back: event.target.value })} rows={8} disabled={Boolean(busy)} /></label>
        {draft.back.length > 24000 && <p role="alert">El contenido supera 24.000 caracteres. Acórtalo antes de guardar; el original se conservará completo.</p>}
        {error && <p className="annotation-error" role="alert">{error}</p>}
      </div>
      <footer><button type="button" onClick={onClose} disabled={Boolean(busy)}>Cancelar</button><button type="button" onClick={() => void save()} disabled={Boolean(busy) || !draft.front.trim() || !draft.back.trim() || draft.back.length > 24000}>{busy === "save" ? "Guardando…" : flashcard ? "Guardar flashcard vinculada" : "Guardar nota vinculada"}</button></footer>
    </>}
  </dialog>;
}

export function AnnotationOriginDialog({ note, notes, onClose, onOpenNote }: {
  note: ReaderNote; notes: ReaderNote[]; onClose: () => void; onOpenNote: (note: ReaderNote) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const source = findOriginNote(note, notes);
  const origin = note.origin;
  if (!origin) return null;
  return <dialog ref={dialog} className="annotation-dialog" aria-labelledby="annotation-origin-title" onCancel={onClose} onClose={onClose}>
    <header><div><small>TRAZO DE ORIGEN</small><h2 id="annotation-origin-title">{origin.kind === "comment" ? "Nota de origen" : "Flashcard de origen"}</h2></div><button type="button" onClick={onClose} aria-label="Cerrar origen"><Icon name="close" /></button></header>
    <div className="annotation-dialog-body"><p>{origin.kind === "comment" ? "Nota" : "Flashcard"} <Icon name="arrowRight" size={12} /> {note.kind === "comment" ? "Nota" : "Flashcard"} · {new Date(note.createdAt).toLocaleDateString()}</p><small>Copia del original al convertir. {source ? "Las ediciones posteriores no cambian esta referencia." : "El original ya no está disponible; conservamos su contenido."}</small>{origin.kind === "flashcard" && <strong>{origin.front}</strong>}<p className="annotation-full-text">{origin.back}</p></div>
    <footer><button type="button" onClick={onClose}>Cerrar</button>{source && <button type="button" onClick={() => { onClose(); onOpenNote(source); }}>Abrir original</button>}</footer>
  </dialog>;
}
