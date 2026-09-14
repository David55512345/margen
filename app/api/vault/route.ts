import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { learningProgress, readerNotes, readerPositions, syncedDocuments, userLearningMemory } from "../../../db/schema";
import { getBookMemory, getChapterMemories } from "../../ai/repository";
import { isRecord, remapNoteReferences, validBookData } from "../../vault-core";
import { remapAnnotationOrigin, validAnnotationOrigin } from "../../annotation-conversion";

const HEADERS = { "Cache-Control": "private, no-store" };
const SCOPES = ["highlights", "whiteboard", "review", "chats"];
const clean = (value: unknown, max: number) => typeof value === "string" ? value.slice(0, max) : "";
const date = (value: unknown) => {
  const input = clean(value, 40);
  return Number.isFinite(Date.parse(input)) ? new Date(Math.min(Date.parse(input), Date.now())).toISOString() : new Date().toISOString();
};
const withoutOwner = <T extends { ownerKey: string }>(row: T) => {
  const { ownerKey: _, ...safe } = row;
  void _;
  return safe;
};

export async function GET(request: Request) {
  const owner = request.headers.get("oai-authenticated-user-id");
  if (!owner) return Response.json({ error: "Inicia sesión para copiar tus datos." }, { status: 401, headers: HEADERS });
  const params = new URL(request.url).searchParams;
  const bookId = clean(params.get("bookId"), 200);
  const bookKey = clean(params.get("bookKey"), 500);
  if (!/^sha256-[a-f0-9]{64}$/.test(bookId) || !bookKey) return Response.json({ error: "Libro inválido." }, { status: 400, headers: HEADERS });
  const db = getDb();
  const [notes, progress, positions, documents, book, chapters, learning] = await Promise.all([
    db.select().from(readerNotes).where(and(eq(readerNotes.ownerKey, owner), eq(readerNotes.bookKey, bookKey))),
    db.select().from(learningProgress).where(and(eq(learningProgress.ownerKey, owner), eq(learningProgress.bookKey, bookKey))),
    db.select().from(readerPositions).where(and(eq(readerPositions.ownerKey, owner), eq(readerPositions.bookId, bookId))),
    db.select().from(syncedDocuments).where(and(eq(syncedDocuments.ownerKey, owner), eq(syncedDocuments.bookKey, bookKey))),
    getBookMemory(owner, bookId), getChapterMemories(owner, bookId),
    db.select().from(userLearningMemory).where(and(eq(userLearningMemory.ownerKey, owner), eq(userLearningMemory.bookId, bookId))),
  ]);
  const values: Record<string, unknown> = {
    notes: notes.map(withoutOwner), progress: progress.map(withoutOwner), position: positions[0] ? withoutOwner(positions[0]) : null,
    memory: { book: book ? withoutOwner(book) : null, chapters }, learning: learning.map(withoutOwner),
  };
  for (const document of documents) {
    if (SCOPES.includes(document.scope)) values[document.scope] = JSON.parse(document.payload) as unknown;
  }
  return Response.json({ values }, { headers: HEADERS });
}

export async function POST(request: Request) {
  const owner = request.headers.get("oai-authenticated-user-id");
  if (!owner) return Response.json({ error: "Inicia sesión para recuperar tus datos." }, { status: 401, headers: HEADERS });
  const text = await request.text();
  if (text.length > 16_000_000) return Response.json({ error: "El archivo de datos supera 16 MB." }, { status: 413, headers: HEADERS });
  let data: unknown;
  try { data = JSON.parse(text) as unknown; } catch { return Response.json({ error: "Archivo de datos inválido." }, { status: 400, headers: HEADERS }); }
  if (!validBookData(data)) return Response.json({ error: "El formato de la carpeta no es compatible." }, { status: 400, headers: HEADERS });
  const { book, values } = data;
  const importedNotes = Array.isArray(values.notes) ? values.notes : [];
  const importedProgress = Array.isArray(values.progress) ? values.progress : [];
  if (importedNotes.length > 5000 || importedProgress.length > 5000
    || importedNotes.some((note) => !isRecord(note) || note.bookKey !== book.key || !Number.isSafeInteger(note.id) || !Number.isFinite(Date.parse(String(note.createdAt))) || !Number.isFinite(Date.parse(String(note.updatedAt))) || !clean(note.front, 8000).trim() || !clean(note.back, 24000).trim() || !clean(note.chapterKey, 500) || (note.origin != null && !validAnnotationOrigin(note.origin)))
    || importedProgress.some((row) => !isRecord(row) || row.bookKey !== book.key || !["pretest", "posttest", "feynman"].includes(String(row.phase)) || !clean(row.chapterKey, 500))) {
    return Response.json({ error: "La carpeta contiene registros inválidos o de otro libro. No se importaron." }, { status: 400, headers: HEADERS });
  }
  for (const scope of SCOPES) if (values[scope] !== undefined && JSON.stringify(values[scope]).length > 1_000_000) {
    return Response.json({ error: `Los datos de ${scope} superan el límite de sincronización.` }, { status: 413, headers: HEADERS });
  }
  const db = getDb();
  const existingNotes = await db.select().from(readerNotes).where(and(eq(readerNotes.ownerKey, owner), eq(readerNotes.bookKey, book.key)));
  const ids: Record<string, number> = {};
  const originsToRestore: Array<{ id: number; origin: unknown }> = [];
  // Non-destructive recovery: never delete records and never replace a newer edit.
  // The original creation timestamp survives import, making retries idempotent.
  for (const row of importedNotes.filter(isRecord)) {
    const createdAt = new Date(String(row.createdAt)).toISOString();
    const chapterKey = clean(row.chapterKey, 500);
    const kind = row.kind === "comment" ? "comment" : "flashcard";
    const candidates = existingNotes.filter((item) => item.createdAt === createdAt && item.chapterKey === chapterKey && item.kind === kind);
    const existing = candidates.find((item) => item.id === row.id) ?? candidates.find((item) => item.front === row.front && item.back === row.back) ?? (candidates.length === 1 ? candidates[0] : undefined);
    const fields = {
      ownerKey: owner, bookKey: book.key, bookTitle: book.title, chapterKey, chapterTitle: clean(row.chapterTitle, 500), kind,
      front: clean(row.front, 8000), back: clean(row.back, 24000), anchorLabel: clean(row.anchorLabel, 500) || null,
      anchorCfi: clean(row.anchorCfi, 2000) || null, quote: clean(row.quote, 8000) || null,
      color: clean(row.color, 20) || null, highlightId: clean(row.highlightId, 200) || null,
      sectionIndex: Number.isSafeInteger(row.sectionIndex) ? Number(row.sectionIndex) : null,
      createdAt, updatedAt: date(row.updatedAt),
    };
    if (existing) {
      ids[String(row.id)] = existing.id;
      if (fields.updatedAt > existing.updatedAt) {
        await db.update(readerNotes).set(fields).where(and(eq(readerNotes.id, existing.id), eq(readerNotes.ownerKey, owner)));
      }
      if (row.origin && fields.updatedAt >= existing.updatedAt) originsToRestore.push({ id: existing.id, origin: row.origin });
    } else {
      const [inserted] = await db.insert(readerNotes).values(fields).returning();
      ids[String(row.id)] = inserted.id;
      existingNotes.push(inserted);
      if (row.origin) originsToRestore.push({ id: inserted.id, origin: row.origin });
    }
  }
  // Resolve IDs only after all notes are recovered, including child-before-parent files.
  for (const item of originsToRestore) {
    const origin = remapAnnotationOrigin(item.origin, ids);
    if (origin?.noteId !== null) {
      const source = existingNotes.find((note) => note.id === origin?.noteId);
      if (!source || source.createdAt !== origin?.createdAt || source.kind !== origin?.kind || source.id === item.id) {
        if (origin) origin.noteId = null;
      }
    }
    await db.update(readerNotes).set({ origin }).where(and(eq(readerNotes.id, item.id), eq(readerNotes.ownerKey, owner)));
  }
  const progress = await db.select().from(learningProgress).where(and(eq(learningProgress.ownerKey, owner), eq(learningProgress.bookKey, book.key)));
  for (const row of importedProgress.filter(isRecord)) {
    const chapterKey = clean(row.chapterKey, 500); const phase = String(row.phase); const updatedAt = date(row.updatedAt);
    const existing = progress.find((item) => item.chapterKey === chapterKey && item.phase === phase);
    if (existing && existing.updatedAt >= updatedAt) continue;
    const payload = typeof row.payload === "string" ? row.payload.slice(0, 50_000) : JSON.stringify(row.payload ?? {}).slice(0, 50_000);
    const fields = { ownerKey: owner, bookKey: book.key, chapterKey, phase, completed: row.completed === true, payload, updatedAt };
    await db.insert(learningProgress).values(fields).onConflictDoUpdate({ target: [learningProgress.ownerKey, learningProgress.bookKey, learningProgress.chapterKey, learningProgress.phase], set: { completed: fields.completed, payload, updatedAt } });
  }
  const documents = await db.select().from(syncedDocuments).where(and(eq(syncedDocuments.ownerKey, owner), eq(syncedDocuments.bookKey, book.key)));
  for (const scope of SCOPES) {
    if (values[scope] === undefined) continue;
    const updatedAt = date(data.savedAt);
    const existing = documents.find((item) => item.scope === scope);
    if (existing && existing.updatedAt >= updatedAt) continue;
    const payload = JSON.stringify(remapNoteReferences(values[scope], ids, scope));
    await db.insert(syncedDocuments).values({ ownerKey: owner, bookKey: book.key, scope, payload, updatedAt }).onConflictDoUpdate({ target: [syncedDocuments.ownerKey, syncedDocuments.bookKey, syncedDocuments.scope], set: { payload, updatedAt, revision: (existing?.revision ?? 0) + 1 } });
  }
  if (isRecord(values.position)) {
    const row = values.position;
    const [existing] = await db.select().from(readerPositions).where(and(eq(readerPositions.ownerKey, owner), eq(readerPositions.bookId, book.id)));
    const updatedAt = date(row.updatedAt);
    if (!existing || existing.updatedAt < updatedAt) {
      const sectionIndex = Math.max(0, Math.floor(Number(row.sectionIndex) || 0));
      const fields = { ownerKey: owner, bookId: book.id, cfi: clean(row.cfi, 2000), sectionIndex, maxReadSectionIndex: Math.max(sectionIndex, Math.floor(Number(row.maxReadSectionIndex) || 0)), percent: Math.max(0, Math.min(100, Math.round(Number(row.percent) || 0))), updatedAt };
      await db.insert(readerPositions).values(fields).onConflictDoUpdate({ target: [readerPositions.ownerKey, readerPositions.bookId], set: fields });
    }
  }
  return Response.json({ restored: true, noteIds: ids }, { headers: HEADERS });
}
