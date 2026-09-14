import { and, desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { syncedBooks } from "../../../db/schema";
import { sha256 } from "../../ai/hash";

type StoredObject = {
  body: ReadableStream;
  httpEtag: string;
  size: number;
  writeHttpMetadata(headers: Headers): void;
};

type LibraryBucket = {
  get(key: string): Promise<StoredObject | null>;
  head(key: string): Promise<{ etag: string; size: number } | null>;
  put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string; contentDisposition?: string }; customMetadata?: Record<string, string> }): Promise<{ etag: string; size: number } | null>;
  delete(key: string): Promise<void>;
};

function bucket() {
  const binding = (env as unknown as { LIBRARY?: LibraryBucket }).LIBRARY;
  if (!binding) throw new Error("El almacenamiento sincronizado de libros no está disponible.");
  return binding;
}

function ownerKey(request: Request) {
  return request.headers.get("oai-authenticated-user-id") || "site-owner";
}

function clean(value: string | null, max: number) {
  return (value ?? "").trim().slice(0, max);
}

function decodedHeader(request: Request, name: string, max: number) {
  const raw = clean(request.headers.get(name), max * 3);
  try { return decodeURIComponent(raw).slice(0, max); } catch { return raw.slice(0, max); }
}

async function objectKeyFor(owner: string, bookId: string) {
  const ownerHash = await sha256(owner);
  return `users/${ownerHash}/books/${bookId}.epub`;
}

function publicBook(book: typeof syncedBooks.$inferSelect) {
  return {
    bookId: book.bookId,
    bookKey: book.bookKey,
    title: book.title,
    author: book.author,
    fileName: book.fileName,
    contentType: book.contentType,
    sizeBytes: book.sizeBytes,
    updatedAt: book.updatedAt,
    lastOpenedAt: book.lastOpenedAt,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedBookId = clean(url.searchParams.get("bookId"), 200);
  const owner = ownerKey(request);
  const db = getDb();
  if (!requestedBookId) {
    const books = await db.select().from(syncedBooks)
      .where(eq(syncedBooks.ownerKey, owner))
      .orderBy(desc(syncedBooks.lastOpenedAt));
    return Response.json({ books: books.map(publicBook), lastBook: books[0] ? publicBook(books[0]) : null });
  }

  const [book] = await db.select().from(syncedBooks).where(and(
    eq(syncedBooks.ownerKey, owner),
    eq(syncedBooks.bookId, requestedBookId),
  ));
  if (!book) return Response.json({ error: "Libro sincronizado no encontrado." }, { status: 404 });
  const object = await bucket().get(book.objectKey);
  if (!object) return Response.json({ error: "El archivo sincronizado ya no está disponible." }, { status: 404 });
  const now = new Date().toISOString();
  await db.update(syncedBooks).set({ lastOpenedAt: now }).where(eq(syncedBooks.id, book.id));
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", book.contentType || "application/epub+zip");
  headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(book.fileName)}`);
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Margen-File-Name", encodeURIComponent(book.fileName));
  return new Response(object.body, { headers });
}

export async function POST(request: Request) {
  const owner = ownerKey(request);
  const bookId = clean(request.headers.get("x-margen-book-id"), 200);
  const bookKey = decodedHeader(request, "x-margen-book-key", 500);
  const title = decodedHeader(request, "x-margen-title", 500);
  const author = decodedHeader(request, "x-margen-author", 500);
  const fileName = decodedHeader(request, "x-margen-file-name", 500) || "libro.epub";
  if (!bookId.startsWith("sha256-") || !bookKey || !title) {
    return Response.json({ error: "Faltan datos del libro para sincronizarlo." }, { status: 400 });
  }
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 95 * 1024 * 1024) {
    return Response.json({ error: "El EPUB está vacío o supera 95 MB, el límite de sincronización directa." }, { status: 413 });
  }
  const verifiedId = `sha256-${await sha256(bytes)}`;
  if (verifiedId !== bookId) return Response.json({ error: "El archivo no coincide con su identificador." }, { status: 400 });

  const storage = bucket();
  const objectKey = await objectKeyFor(owner, bookId);
  let stored = await storage.head(objectKey);
  if (!stored) {
    stored = await storage.put(objectKey, bytes, {
      httpMetadata: { contentType: "application/epub+zip", contentDisposition: `inline; filename="${fileName.replace(/["\\]/g, "_")}"` },
      customMetadata: { bookId, owner: (await sha256(owner)).slice(0, 24) },
    });
  }
  if (!stored) return Response.json({ error: "No se pudo guardar el EPUB." }, { status: 503 });

  const now = new Date().toISOString();
  const [book] = await getDb().insert(syncedBooks).values({
    ownerKey: owner,
    bookId,
    bookKey,
    title,
    author: author || "Autor desconocido",
    fileName,
    objectKey,
    contentType: "application/epub+zip",
    sizeBytes: bytes.byteLength,
    etag: stored.etag,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
  }).onConflictDoUpdate({
    target: [syncedBooks.ownerKey, syncedBooks.bookId],
    set: { bookKey, title, author: author || "Autor desconocido", fileName, objectKey, sizeBytes: bytes.byteLength, etag: stored.etag, updatedAt: now, lastOpenedAt: now },
  }).returning();
  return Response.json({ book: publicBook(book) });
}

export async function DELETE(request: Request) {
  const owner = ownerKey(request);
  const bookId = clean(new URL(request.url).searchParams.get("bookId"), 200);
  if (!bookId) return Response.json({ error: "bookId es obligatorio." }, { status: 400 });
  const [book] = await getDb().select().from(syncedBooks).where(and(
    eq(syncedBooks.ownerKey, owner),
    eq(syncedBooks.bookId, bookId),
  ));
  if (!book) return new Response(null, { status: 204 });
  await bucket().delete(book.objectKey);
  await getDb().delete(syncedBooks).where(eq(syncedBooks.id, book.id));
  return new Response(null, { status: 204 });
}
