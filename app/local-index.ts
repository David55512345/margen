import { rankChunks } from "./ai/retrieval";
import type { RetrievedChunk } from "./study-contract";

type IndexParagraph = { sectionIndex: number; cfi: string; text: string; isParagraph: boolean };
type StoredChunk = RetrievedChunk & { id: string; bookId: string };

const DB_NAME = "lector-epub-index";
const STORE_NAME = "chunks";
const DB_VERSION = 1;

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("bookId", "bookId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function chunksForSection(bookId: string, chapterTitle: string, paragraphs: IndexParagraph[]) {
  const groups: StoredChunk[] = [];
  let buffer: IndexParagraph[] = [];
  let length = 0;
  const flush = () => {
    if (!buffer.length) return;
    const index = groups.length;
    groups.push({
      id: `${bookId}:${paragraphs[0]?.sectionIndex ?? 0}:${index}`,
      bookId,
      sectionIndex: buffer[0].sectionIndex,
      chapterTitle,
      text: buffer.map((paragraph) => paragraph.text).join("\n\n"),
      cfi: buffer[0].cfi,
    });
    buffer = [];
    length = 0;
  };
  paragraphs.forEach((paragraph) => {
    if (buffer.length && length + paragraph.text.length > 2_800) flush();
    buffer.push(paragraph);
    length += paragraph.text.length;
  });
  flush();
  return groups;
}

export async function indexSection(bookId: string, chapterTitle: string, paragraphs: IndexParagraph[]) {
  if (typeof indexedDB === "undefined" || !bookId || !paragraphs.length) return;
  try {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    chunksForSection(bookId, chapterTitle, paragraphs).forEach((chunk) => store.put(chunk));
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  } catch {
    // El índice es una optimización local; la lectura continúa si Chrome lo bloquea.
  }
}

export async function queryBookIndex(bookId: string, query: string, maxSectionIndex: number, allowFuture: boolean, limit = 8) {
  if (typeof indexedDB === "undefined" || !bookId) return [];
  try {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAME, "readonly");
    const index = transaction.objectStore(STORE_NAME).index("bookId");
    const request = index.getAll(IDBKeyRange.only(bookId));
    const chunks = await new Promise<StoredChunk[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as StoredChunk[]);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return rankChunks(query, chunks.filter((chunk) => allowFuture || chunk.sectionIndex <= maxSectionIndex), limit);
  } catch {
    return [];
  }
}
