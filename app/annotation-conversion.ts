import type { ReaderNote, ReaderNoteKind } from "./study-contract";

// An immutable snapshot keeps provenance readable even after the source is deleted.
export type AnnotationOrigin = {
  noteId: number | null;
  kind: ReaderNoteKind;
  front: string;
  back: string;
  createdAt: string;
};

export function validAnnotationOrigin(value: unknown): value is AnnotationOrigin {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (item.noteId === null || (Number.isSafeInteger(item.noteId) && Number(item.noteId) > 0))
    && (item.kind === "comment" || item.kind === "flashcard")
    && typeof item.front === "string" && item.front.length <= 8000
    && typeof item.back === "string" && item.back.length > 0 && item.back.length <= 24000
    && typeof item.createdAt === "string" && Number.isFinite(Date.parse(item.createdAt));
}

export function conversionDraft(note: ReaderNote) {
  return note.kind === "comment"
    ? { front: `¿Cuál es la idea principal sobre «${note.anchorLabel || note.chapterTitle || "este tema"}»?`, back: note.back }
    : { front: "Nota", back: `${note.front}\n\n${note.back}` };
}

export function originSnapshot(note: Pick<ReaderNote, "id" | "kind" | "front" | "back" | "createdAt">): AnnotationOrigin {
  return { noteId: note.id, kind: note.kind, front: note.front, back: note.back, createdAt: note.createdAt };
}

export function findOriginNote(note: ReaderNote, notes: ReaderNote[]) {
  const origin = note.origin;
  return origin ? notes.find((source) => source.id === origin.noteId && source.bookKey === note.bookKey
    && source.kind === origin.kind && source.createdAt === origin.createdAt) ?? null : null;
}

export function conversionEdges(notes: ReaderNote[]) {
  return notes.flatMap((note) => {
    const source = findOriginNote(note, notes);
    return source ? [{ id: `origin-${note.id}`, from: `note-${source.id}`, to: `note-${note.id}`, source, target: note }] : [];
  });
}

export function remapAnnotationOrigin(origin: unknown, ids: Record<string, number>): AnnotationOrigin | null {
  if (!validAnnotationOrigin(origin)) return null;
  // Never let a missing source point to an unrelated ID in a recovered library.
  return { ...origin, noteId: origin.noteId === null ? null : ids[String(origin.noteId)] ?? null };
}
