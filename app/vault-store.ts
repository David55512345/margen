import {
  bookDirectory, isRecord, isVaultPreference, mergeRows, mergeVaultCopy, missingFile, readJSON, remapNoteReferences,
  validBook, validBookData, validManifest, writeFile, writeJSON,
  type VaultBook, type VaultBookData, type VaultDirectory, type VaultManifest, type VaultRecord,
} from "./vault-core";

export type VaultStatus = { state: "unlinked" | "permission" | "saving" | "ready" | "error"; name: string; message: string; savedAt: string | null; books: VaultBook[] };
const initialStatus: VaultStatus = { state: "unlinked", name: "", message: "Sin carpeta conectada", savedAt: null, books: [] };
let status = initialStatus;
let root: VaultDirectory | null = null;
let manifest: VaultManifest | null = null;
let remembered: VaultDirectory | null = null;
let queue: Promise<unknown> = Promise.resolve();
let pending = 0;
let initializePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();
const knownBooks = new Map<string, VaultBook>();
const memory = new Map<string, VaultBookData>();
const dirtyValues = new Map<string, VaultRecord>();

export const getVaultStatus = () => status;
export const getVaultServerStatus = () => initialStatus;
export function subscribeVault(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function report(next: Partial<VaultStatus>) { status = { ...status, ...next }; listeners.forEach((listener) => listener()); }
export function vaultSupported() { return typeof window !== "undefined" && "showDirectoryPicker" in window && window.isSecureContext; }
export function hasVault() { return Boolean(root && manifest); }

async function rememberHandle(handle?: VaultDirectory | null): Promise<VaultDirectory | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("margen-folder", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("settings");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("settings", handle === undefined ? "readonly" : "readwrite");
      const store = tx.objectStore("settings");
      const operation = handle === undefined ? store.get("directory") : handle ? store.put(handle, "directory") : store.delete("directory");
      let result: VaultDirectory | null = null;
      operation.onsuccess = () => { if (handle === undefined) result = operation.result ?? null; };
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  });
}

async function attach(directory: VaultDirectory, create: boolean) {
  let next = await readJSON(directory, "margen.json", validManifest);
  if (!next) {
    if (!create) throw new Error("No encontramos margen.json en esta carpeta.");
    next = { format: "margen-library", version: 1, id: crypto.randomUUID(), createdAt: new Date().toISOString(), books: [], lastBookId: null };
    await writeJSON(directory, "margen.json", next, validManifest);
    try { await directory.getFileHandle("LEEME-MARGEN.txt"); }
    catch (error) {
      if (!missingFile(error)) throw error;
      await writeFile(directory, "LEEME-MARGEN.txt", "BIBLIOTECA MARGEN\n\nEsta carpeta contiene tus libros y tu trabajo. Puedes copiarla completa a otro disco.\nEn Margen: Perfil > Carpeta de Margen > Abrir carpeta existente.\n\nlibros/<identificador>/libro.epub: EPUB original, sin modificar.\nlibros/<identificador>/datos.json: notas, flashcards, subrayados, chats, estudio, pizarra y progreso disponibles.\n*.anterior.json: última copia completa anterior.\nconfiguracion.json: preferencias de este dispositivo (sin contraseñas).\n\nLos archivos se actualizan mientras Margen está abierto y tiene permiso. La IA y la sincronización necesitan internet.\nNo edites la misma carpeta simultáneamente desde programas externos. No contiene claves de acceso.\n");
    }
  }
  root = directory; manifest = next; remembered = directory; memory.clear();
  for (const book of next.books) knownBooks.set(book.key, book);
  report({ state: "ready", name: directory.name, books: next.books, message: "Carpeta conectada", savedAt: null });
  await rememberHandle(directory).catch(() => undefined);
}

export async function initializeVault() {
  if (initializePromise) return initializePromise;
  initializePromise = (async () => {
    if (!vaultSupported()) return;
    try {
      remembered = await rememberHandle();
      if (!remembered) return;
      if (await remembered.queryPermission({ mode: "readwrite" }) === "granted") await attach(remembered, false);
      else report({ state: "permission", name: remembered.name, message: "Autoriza la carpeta para volver a guardar en ella" });
    } catch (error) { report({ state: "error", message: error instanceof Error ? error.message : "No se pudo abrir la carpeta." }); }
  })();
  return initializePromise;
}

export async function chooseVault(create: boolean) {
  if (!vaultSupported()) throw new Error("Elige la carpeta desde Chrome en tu computadora. En este dispositivo puedes seguir usando la biblioteca sincronizada.");
  // Keep the picker on the user's click; do not await network or file work before it.
  const picker = window as unknown as { showDirectoryPicker(options: { id: string; mode: string; startIn: string }): Promise<VaultDirectory> };
  const chosen = await picker.showDirectoryPicker({ id: "margen-library", mode: "readwrite", startIn: "documents" });
  await flushVault();
  await attach(chosen, create);
}

export async function authorizeVault() {
  if (!remembered) return;
  if (await remembered.requestPermission({ mode: "readwrite" }) !== "granted") throw new Error("No se concedió permiso. Tus archivos no se han modificado.");
  await attach(remembered, false);
  for (const [key, values] of dirtyValues) await saveVaultValues(key, values);
}

export async function disconnectVault() {
  await flushVault();
  root = null; manifest = null; remembered = null; memory.clear();
  await rememberHandle(null).catch(() => undefined);
  report(initialStatus);
}

function enqueue<T>(work: (directory: VaultDirectory, current: VaultManifest) => Promise<T>): Promise<T | null> {
  const directory = root; const selected = manifest;
  if (!directory || !selected) return Promise.resolve(null);
  pending += 1; report({ state: "saving", message: "Guardando en tu carpeta…" });
  const run = async () => {
    const perform = async () => {
      if (await directory.queryPermission({ mode: "readwrite" }) !== "granted") throw new DOMException("Autoriza de nuevo el acceso a la carpeta.", "NotAllowedError");
      const current = await readJSON(directory, "margen.json", validManifest);
      if (!current || current.id !== selected.id) throw new Error("La carpeta cambió. Ábrela de nuevo antes de guardar.");
      return work(directory, current);
    };
    return navigator.locks ? navigator.locks.request(`margen-folder-${selected.id}`, perform) : perform();
  };
  const task = queue.then(run);
  queue = task.catch((error) => {
    report({ state: error?.name === "NotAllowedError" ? "permission" : "error", message: error instanceof Error ? error.message : "No se pudo guardar en la carpeta. Revisa el espacio y el permiso." });
  }).finally(() => {
    pending -= 1;
    if (!pending && status.state === "saving") report({ state: "ready", message: "Guardado en tu carpeta", savedAt: new Date().toISOString() });
  });
  return task;
}

export async function flushVault() { await queue; }
export function vaultHasPendingWrites() { return pending > 0 || Boolean(manifest?.books.some((book) => Object.keys(dirtyValues.get(book.key) ?? {}).length)); }

export async function registerVaultBook(book: VaultBook, bytes?: ArrayBuffer, markOpened = true) {
  if (!validBook(book)) throw new Error("Libro inválido para la carpeta.");
  knownBooks.set(book.key, book);
  await enqueue(async (directory, current) => {
    const folder = await bookDirectory(directory, book.id, true);
    if (bytes) {
      let exists = false;
      try { exists = (await (await folder.getFileHandle("libro.epub")).getFile()).size === bytes.byteLength; }
      catch (error) { if (!missingFile(error)) throw error; }
      if (!exists) await writeFile(folder, "libro.epub", bytes);
    }
    current.books = [...current.books.filter((item) => item.id !== book.id), book];
    if (markOpened || !current.lastBookId) current.lastBookId = book.id;
    await writeJSON(directory, "margen.json", current, validManifest);
    manifest = current;
    report({ books: current.books });
  });
}

export async function readVaultBookData(book: VaultBook) {
  if (!root) return memory.get(book.key) ?? null;
  try {
    const folder = await bookDirectory(root, book.id);
    const data = await readJSON(folder, "datos.json", validBookData);
    if (data && (data.book.id !== book.id || data.book.key !== book.key)) throw new Error("Los datos no corresponden a este libro.");
    if (data) memory.set(book.key, data);
    return data;
  } catch (error) { if (missingFile(error)) return null; throw error; }
}

export async function saveVaultValues(bookKey: string, values: VaultRecord) {
  const book = knownBooks.get(bookKey);
  if (!book) return;
  const previous = memory.get(bookKey);
  const changes = { ...dirtyValues.get(bookKey), ...values };
  memory.set(bookKey, { format: "margen-book", version: 1, book, savedAt: new Date().toISOString(), values: { ...previous?.values, ...changes } });
  dirtyValues.set(bookKey, changes);
  try {
    const result = await enqueue(async (directory) => {
      const folder = await bookDirectory(directory, book.id, true);
      const existing = await readJSON(folder, "datos.json", validBookData);
      if (existing && existing.book.key !== bookKey) throw new Error("El archivo contiene datos de otro libro.");
      const data: VaultBookData = { format: "margen-book", version: 1, book, savedAt: new Date().toISOString(), values: { ...existing?.values, ...changes } };
      await writeJSON(folder, "datos.json", data, validBookData);
      return true;
    });
    if (result) {
      const dirty = dirtyValues.get(bookKey) ?? {};
      for (const key of Object.keys(changes)) if (dirty[key] === changes[key]) delete dirty[key];
      if (!Object.keys(dirty).length) dirtyValues.delete(bookKey);
    }
  } catch { /* status reports the failure; dirty values remain available for retry */ }
}

export function cachedVaultValues(bookKey: string) { return memory.get(bookKey)?.values ?? {}; }

export async function saveVaultSyncValue(bookKey: string, scope: string, payload: unknown, pendingSync: boolean) {
  const current = cachedVaultValues(bookKey);
  const previous = isRecord(current.pendingSync) ? current.pendingSync : {};
  // An old response must not acknowledge a newer local edit.
  if (!pendingSync && JSON.stringify(current[scope]) !== JSON.stringify(payload)) return;
  await saveVaultValues(bookKey, { [scope]: payload, pendingSync: { ...previous, [scope]: pendingSync } });
}

export async function openVaultEpub(bookId?: string) {
  if (!root || !manifest) return null;
  const book = manifest.books.find((item) => item.id === (bookId ?? manifest?.lastBookId));
  if (!book) return null;
  const file = await (await (await bookDirectory(root, book.id)).getFileHandle("libro.epub")).getFile();
  // Verify portable files instead of trusting their name/path or a modified manifest.
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (book.id !== `sha256-${digest}`) throw new Error("Este EPUB cambió fuera de Margen. Impórtalo de nuevo para no mezclar sus anotaciones.");
  return new File([file], book.fileName, { type: "application/epub+zip" });
}

export async function saveVaultPreferences() {
  if (typeof window === "undefined") return;
  const values: Record<string, string> = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key && isVaultPreference(key)) values[key] = localStorage.getItem(key) ?? "";
  }
  await enqueue(async (directory) => writeJSON(directory, "configuracion.json", values,
    (value): value is Record<string, string> => isRecord(value) && Object.entries(value).every(([key, item]) => isVaultPreference(key) && typeof item === "string")));
}

export function setReaderPreference(key: string, value: string) {
  localStorage.setItem(key, value);
  if (isVaultPreference(key)) void saveVaultPreferences().catch(() => undefined);
}

export async function restoreVaultPreferences() {
  if (!root) return;
  const preferences = await readJSON(root, "configuracion.json", (value): value is Record<string, string> => isRecord(value) && Object.entries(value).every(([key, item]) => isVaultPreference(key) && typeof item === "string"));
  if (preferences) for (const [key, value] of Object.entries(preferences)) localStorage.setItem(key, value);
}

export async function hydrateVaultBook(book: VaultBook) {
  knownBooks.set(book.key, book);
  const data = await readVaultBookData(book);
  if (!data) return null;
  for (const scope of ["highlights", "whiteboard", "review", "chats"]) {
    if (data.values[scope] !== undefined && !localStorage.getItem(`margen-sync-dirty:${scope}:${book.key}`)) {
      localStorage.setItem(`lector-${scope}:${book.key}`, JSON.stringify(data.values[scope]));
      if (isRecord(data.values.pendingSync) && data.values.pendingSync[scope]) localStorage.setItem(`margen-sync-dirty:${scope}:${book.key}`, "1");
    }
  }
  return data;
}

// Capture durable API results at the existing boundary; never intercept credentials or AI prompts.
export async function vaultFetch(input: string, init?: RequestInit): Promise<Response> {
  const url = new URL(input, typeof location === "undefined" ? "http://localhost" : location.origin);
  const method = (init?.method ?? "GET").toUpperCase();
  let body: VaultRecord = {};
  try { if (typeof init?.body === "string") body = JSON.parse(init.body) as VaultRecord; } catch { /* non-JSON upload */ }
  const key = String(body.bookKey ?? body.legacyKey ?? url.searchParams.get("bookKey") ?? "");
  const id = String(body.bookId ?? url.searchParams.get("bookId") ?? "");
  const book = knownBooks.get(key) ?? [...knownBooks.values()].find((item) => item.id === id)
    ?? (url.pathname === "/api/notes" && (body.id || url.searchParams.has("id")) ? [...knownBooks.values()].find((item) => {
      const rows = cachedVaultValues(item.key).notes;
      return Array.isArray(rows) && rows.some((note) => isRecord(note) && note.id === Number(body.id ?? url.searchParams.get("id")));
    }) : undefined);
  const cached = book ? cachedVaultValues(book.key) : {};
  if (book && url.pathname === "/api/reader-position" && method === "POST") await saveVaultValues(book.key, { position: { ...body, updatedAt: new Date().toISOString() } });
  const fallback = () => {
    if (!book || !hasVault()) return null;
    if (url.pathname === "/api/notes" && method === "GET" && Array.isArray(cached.notes)) return Response.json({ notes: cached.notes });
    if (url.pathname === "/api/progress" && method === "GET" && Array.isArray(cached.progress)) return Response.json({ progress: cached.progress });
    if (url.pathname === "/api/memory" && cached.position) return Response.json({ ...(isRecord(cached.memory) ? cached.memory : {}), position: cached.position });
    return null;
  };
  let response: Response;
  try { response = await globalThis.fetch(input, init); }
  catch (error) { const local = fallback(); if (local) return local; throw error; }
  if (!response.ok) return (response.status >= 500 ? fallback() : null) ?? response;
  if (!book || !["/api/notes", "/api/progress", "/api/memory", "/api/analysis"].includes(url.pathname)) return response;
  let result: VaultRecord = {};
  try { if (response.status !== 204) result = await response.clone().json() as VaultRecord; } catch { return response; }
  const latest = cachedVaultValues(book.key);
  if (hasVault() && method === "GET" && ["/api/notes", "/api/progress"].includes(url.pathname)) {
    result = mergeVaultCopy(latest, result);
    response = Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  }
  if (hasVault() && url.pathname === "/api/memory") {
    result = mergeVaultCopy(latest, result);
    response = Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  }
  if (url.pathname === "/api/notes") {
    let notes = Array.isArray(latest.notes) ? latest.notes : [];
    if (method === "DELETE") notes = url.searchParams.has("bookKey") ? [] : notes.filter((note) => isRecord(note) && note.id !== Number(url.searchParams.get("id")));
    else if (method === "GET" && Array.isArray(result.notes)) notes = result.notes;
    else notes = mergeRows(notes, result.notes ?? (result.note ? [result.note] : []));
    await saveVaultValues(book.key, { notes });
  } else if (url.pathname === "/api/progress") {
    const progress = method === "GET" ? result.progress : mergeRows(
      (Array.isArray(latest.progress) ? latest.progress : []).filter(isRecord).map((row) => ({ ...row, recordKey: `${row.chapterKey}:${row.phase}` })),
      isRecord(result.progress) ? [{ ...result.progress, recordKey: `${result.progress.chapterKey}:${result.progress.phase}` }] : [], "recordKey");
    await saveVaultValues(book.key, { progress });
  } else if (url.pathname === "/api/memory") await saveVaultValues(book.key, { memory: result, ...(result.position ? { position: result.position } : {}) });
  else if (result.analysis) await saveVaultValues(book.key, { analyses: { ...(isRecord(latest.analyses) ? latest.analyses : {}), [String(body.chapterId ?? (isRecord(body.chapter) ? body.chapter.id : url.searchParams.get("chapterId")))]: result.analysis } });
  return response;
}

export async function copyCloudLibraryToVault() {
  if (!root) throw new Error("Conecta primero una carpeta.");
  const response = await globalThis.fetch("/api/library", { cache: "no-store" });
  if (!response.ok) throw new Error("No se pudo consultar la biblioteca sincronizada. Los archivos de tu carpeta no se han eliminado.");
  const result = await response.json() as { books: Array<{ bookId: string; bookKey: string; title: string; author: string; fileName: string }> };
  for (const remote of result.books) {
    const book = { id: remote.bookId, key: remote.bookKey, title: remote.title, author: remote.author, fileName: remote.fileName };
    if (!validBook(book)) continue;
    let bytes: ArrayBuffer | undefined;
    try { await (await bookDirectory(root, book.id)).getFileHandle("libro.epub"); }
    catch (error) {
      if (!missingFile(error)) throw error;
      const epub = await globalThis.fetch(`/api/library?bookId=${encodeURIComponent(book.id)}`, { cache: "no-store" });
      if (!epub.ok) throw new Error(`No se pudo descargar ${book.title}. Inténtalo de nuevo.`);
      bytes = await epub.arrayBuffer();
    }
    await registerVaultBook(book, bytes, false);
    const localData = await readVaultBookData(book);
    const snapshot = await globalThis.fetch(`/api/vault?bookId=${encodeURIComponent(book.id)}&bookKey=${encodeURIComponent(book.key)}`, { cache: "no-store" });
    if (!snapshot.ok) throw new Error(`No se pudieron guardar las anotaciones de ${book.title}.`);
    const incoming = await snapshot.json() as { values: VaultRecord };
    const values = mergeVaultCopy(localData?.values ?? {}, incoming.values);
    // Unsynced local work wins over a stale cloud copy. Cached chats belong to this device.
    for (const scope of ["highlights", "whiteboard", "review", "chats"]) {
      const local = localStorage.getItem(`lector-${scope}:${book.key}`);
      if (local && (scope === "chats" || localStorage.getItem(`margen-sync-dirty:${scope}:${book.key}`))) {
        try { values[scope] = JSON.parse(local) as unknown; } catch { /* keep the cloud copy */ }
      } else if (isRecord(localData?.values.pendingSync) && localData.values.pendingSync[scope]) {
        values[scope] = localData.values[scope];
      }
    }
    await saveVaultValues(book.key, values);
  }
  await saveVaultPreferences();
  await flushVault();
  if (status.state === "error" || status.state === "permission") throw new Error(status.message);
}

export async function restoreBookFromVault(book: VaultBook) {
  const data = await readVaultBookData(book);
  if (!data) throw new Error("Este libro todavía no tiene datos guardados en la carpeta.");
  const response = await globalThis.fetch("/api/vault", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  const result = await response.json() as { error?: string; noteIds?: Record<string, number> };
  if (!response.ok) throw new Error(result.error || "No se pudo recuperar este libro.");
  const values: VaultRecord = { ...data.values, pendingSync: {} };
  for (const scope of ["whiteboard", "review", "chats"]) if (values[scope] !== undefined) values[scope] = remapNoteReferences(values[scope], result.noteIds ?? {}, scope);
  if (Array.isArray(values.notes)) values.notes = remapNoteReferences(values.notes, result.noteIds ?? {}, "notes");
  await saveVaultValues(book.key, values);
  await hydrateVaultBook(book);
}
