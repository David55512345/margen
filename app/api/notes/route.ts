import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { readerNotes } from "../../../db/schema";
import { originSnapshot } from "../../annotation-conversion";

function ownerKey(request: Request) {
  return request.headers.get("oai-authenticated-user-id") || "site-owner";
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(request: Request) {
  const bookKey = clean(new URL(request.url).searchParams.get("bookKey"), 500);
  if (!bookKey) return Response.json({ error: "bookKey es obligatorio." }, { status: 400 });

  const db = getDb();
  const notes = await db.select().from(readerNotes)
    .where(and(eq(readerNotes.ownerKey, ownerKey(request)), eq(readerNotes.bookKey, bookKey)))
    .orderBy(desc(readerNotes.updatedAt), desc(readerNotes.id));
  return Response.json({ notes });
}

export async function POST(request: Request) {
  const payload = await request.json() as Record<string, unknown>;
  const now = new Date().toISOString();
  if (payload.sourceNoteId !== undefined) {
    const owner = request.headers.get("oai-authenticated-user-id");
    if (!owner) return Response.json({ error: "Inicia sesión para convertir anotaciones." }, { status: 401 });
    const sourceId = Number(payload.sourceNoteId);
    const conversionKey = clean(payload.conversionKey, 100);
    if (!Number.isSafeInteger(sourceId) || sourceId <= 0 || !/^[a-zA-Z0-9-]{16,100}$/.test(conversionKey)) {
      return Response.json({ error: "La conversión no es válida." }, { status: 400 });
    }
    const db = getDb();
    const [previous] = await db.select().from(readerNotes).where(and(eq(readerNotes.ownerKey, owner), eq(readerNotes.conversionKey, conversionKey)));
    if (previous) {
      if (previous.bookKey !== payload.bookKey || previous.origin?.noteId !== sourceId) return Response.json({ error: "Esta conversión pertenece a otra anotación." }, { status: 409 });
      return Response.json({ note: previous });
    }
    const [source] = await db.select().from(readerNotes).where(and(eq(readerNotes.id, sourceId), eq(readerNotes.ownerKey, owner), eq(readerNotes.bookKey, clean(payload.bookKey, 500))));
    if (!source) return Response.json({ error: "La anotación original ya no está disponible. No se guardó la conversión." }, { status: 404 });
    if (source.updatedAt !== payload.sourceUpdatedAt) return Response.json({ error: "El original cambió. Cierra esta vista y vuelve a convertirlo para usar la versión actual." }, { status: 409 });
    const kind = source.kind === "comment" ? "flashcard" : "comment";
    const front = kind === "comment" ? "Nota" : typeof payload.front === "string" ? payload.front.trim() : "";
    const back = typeof payload.back === "string" ? payload.back.trim() : "";
    if (!front || !back || front.length > 8000 || back.length > 24000) return Response.json({ error: "Revisa el contenido: pregunta de hasta 8.000 y respuesta o nota de hasta 24.000 caracteres." }, { status: 400 });
    const { id: _id, origin: _origin, ...fields } = source;
    void _id; void _origin;
    const snapshot = originSnapshot({ ...source, kind: source.kind === "comment" ? "comment" : "flashcard" });
    // One insert stores both the new annotation and its provenance. The source is untouched.
    const [inserted] = await db.insert(readerNotes).values({ ...fields, kind, front, back, origin: snapshot, conversionKey, createdAt: now, updatedAt: now })
      .onConflictDoNothing({ target: [readerNotes.ownerKey, readerNotes.conversionKey] }).returning();
    const note = inserted ?? (await db.select().from(readerNotes).where(and(eq(readerNotes.ownerKey, owner), eq(readerNotes.conversionKey, conversionKey))))[0];
    if (!note || note.origin?.noteId !== sourceId || note.bookKey !== source.bookKey) return Response.json({ error: "Conflicto de conversión. Vuelve a abrirla." }, { status: 409 });
    return Response.json({ note }, { status: inserted ? 201 : 200 });
  }
  const kind = payload.kind === "comment" ? "comment" : "flashcard";
  const values = {
    ownerKey: ownerKey(request),
    bookKey: clean(payload.bookKey, 500),
    bookTitle: clean(payload.bookTitle, 500),
    chapterKey: clean(payload.chapterKey, 500),
    chapterTitle: clean(payload.chapterTitle, 500),
    kind,
    front: clean(payload.front, 8_000),
    back: clean(payload.back, 24_000),
    anchorLabel: clean(payload.anchorLabel, 500) || null,
    anchorCfi: clean(payload.anchorCfi, 2_000) || null,
    quote: clean(payload.quote, 8_000) || null,
    color: clean(payload.color, 20) || null,
    highlightId: clean(payload.highlightId, 200) || null,
    sectionIndex: Number.isInteger(payload.sectionIndex) ? Number(payload.sectionIndex) : null,
    createdAt: now,
    updatedAt: now,
  };
  if (!values.bookKey || !values.chapterKey || !values.front || !values.back) {
    return Response.json({ error: "Libro, capítulo, título y contenido son obligatorios." }, { status: 400 });
  }

  const [note] = await getDb().insert(readerNotes).values(values).returning();
  return Response.json({ note }, { status: 201 });
}

export async function PATCH(request: Request) {
  const payload = await request.json() as Record<string, unknown>;
  const detachHighlightId = clean(payload.detachHighlightId, 200);
  const detachBookKey = clean(payload.bookKey, 500);
  if (detachHighlightId && detachBookKey) {
    const notes = await getDb().update(readerNotes)
      .set({ highlightId: null, color: null, updatedAt: new Date().toISOString() })
      .where(and(
        eq(readerNotes.ownerKey, ownerKey(request)),
        eq(readerNotes.bookKey, detachBookKey),
        eq(readerNotes.highlightId, detachHighlightId),
      ))
      .returning();
    return Response.json({ notes });
  }
  const id = Number(payload.id);
  const detachHighlight = payload.detachHighlight === true;
  if (!Number.isInteger(id)) {
    return Response.json({ error: "Nota inválida." }, { status: 400 });
  }
  if (detachHighlight) {
    const [note] = await getDb().update(readerNotes)
      .set({ highlightId: null, color: null, updatedAt: new Date().toISOString() })
      .where(and(eq(readerNotes.id, id), eq(readerNotes.ownerKey, ownerKey(request))))
      .returning();
    if (!note) return Response.json({ error: "Nota no encontrada." }, { status: 404 });
    return Response.json({ note });
  }
  const front = clean(payload.front, 8_000);
  const back = clean(payload.back, 24_000);
  if (!front || !back) {
    return Response.json({ error: "Nota, título y contenido válidos son obligatorios." }, { status: 400 });
  }

  const [note] = await getDb().update(readerNotes)
    .set({ front, back, updatedAt: new Date().toISOString() })
    .where(and(eq(readerNotes.id, id), eq(readerNotes.ownerKey, ownerKey(request))))
    .returning();
  if (!note) return Response.json({ error: "Nota no encontrada." }, { status: 404 });
  return Response.json({ note });
}

export async function DELETE(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const bookKey = clean(searchParams.get("bookKey"), 500);
  if (bookKey) {
    await getDb().delete(readerNotes)
      .where(and(eq(readerNotes.ownerKey, ownerKey(request)), eq(readerNotes.bookKey, bookKey)));
    return new Response(null, { status: 204 });
  }
  const id = Number(searchParams.get("id"));
  if (!Number.isInteger(id)) return Response.json({ error: "id inválido." }, { status: 400 });
  await getDb().delete(readerNotes)
    .where(and(eq(readerNotes.id, id), eq(readerNotes.ownerKey, ownerKey(request))));
  return new Response(null, { status: 204 });
}
