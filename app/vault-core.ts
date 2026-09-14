import { remapAnnotationOrigin } from "./annotation-conversion.ts";

// Portable on-disk format. No browser cache, account credentials or absolute paths.
export type VaultBook = { id: string; key: string; title: string; author: string; fileName: string };
export type VaultManifest = {
  format: "margen-library"; version: 1; id: string; createdAt: string;
  books: VaultBook[]; lastBookId: string | null;
};
export type VaultRecord = Record<string, unknown>;
export type VaultBookData = {
  format: "margen-book"; version: 1; book: VaultBook; savedAt: string;
  values: Record<string, unknown>;
};
export type VaultFile = {
  getFile(): Promise<Blob>;
  createWritable(): Promise<{ write(data: string | Blob | ArrayBuffer): Promise<void>; close(): Promise<void>; abort(): Promise<void> }>;
};
export type VaultDirectory = {
  name: string;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<VaultFile>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<VaultDirectory>;
  queryPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
};

export function isRecord(value: unknown): value is VaultRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function validBook(value: unknown): value is VaultBook {
  return isRecord(value) && typeof value.id === "string" && /^sha256-[a-f0-9]{64}$/.test(value.id)
    && ["key", "title", "author", "fileName"].every((key) => typeof value[key] === "string" && (value[key] as string).length <= 500)
    && Boolean(value.key) && Boolean(value.title);
}

export function validManifest(value: unknown): value is VaultManifest {
  return isRecord(value) && value.format === "margen-library" && value.version === 1
    && typeof value.id === "string" && /^[a-zA-Z0-9-]{1,100}$/.test(value.id)
    && typeof value.createdAt === "string" && Array.isArray(value.books) && value.books.every(validBook)
    && (value.lastBookId === null || value.books.some((book) => book.id === value.lastBookId));
}

export function validBookData(value: unknown): value is VaultBookData {
  return isRecord(value) && value.format === "margen-book" && value.version === 1 && validBook(value.book)
    && typeof value.savedAt === "string" && isRecord(value.values);
}

export function missingFile(error: unknown) { return error instanceof Error && error.name === "NotFoundError"; }

export async function readJSON<T>(directory: VaultDirectory, name: string, valid: (value: unknown) => value is T): Promise<T | null> {
  let found = false;
  // A failed/interrupted save never makes the last complete copy inaccessible.
  for (const candidate of [name, name.replace(/\.json$/, ".anterior.json")]) {
    try {
      const file = await (await directory.getFileHandle(candidate)).getFile();
      found = true;
      if (file.size > 64 * 1024 * 1024) throw new Error("Archivo de datos demasiado grande.");
      const value: unknown = JSON.parse(await file.text());
      if (isRecord(value) && typeof value.format === "string" && value.format.startsWith("margen-") && value.version !== 1) throw new Error("Esta carpeta usa otra versión de Margen. No se modificaron sus archivos.");
      if (valid(value)) return value;
    } catch (error) {
      if (!missingFile(error) && !(error instanceof SyntaxError)) throw error;
    }
  }
  if (found) throw new Error(`No se pudo leer ${name}. Conservamos los archivos originales; revisa su copia anterior.`);
  return null;
}

export async function writeFile(directory: VaultDirectory, name: string, data: string | Blob | ArrayBuffer) {
  const stream = await (await directory.getFileHandle(name, { create: true })).createWritable();
  try { await stream.write(data); await stream.close(); }
  catch (error) { await stream.abort().catch(() => undefined); throw error; }
}

export async function writeJSON<T>(directory: VaultDirectory, name: string, value: T, valid: (value: unknown) => value is T) {
  if (!valid(value)) throw new Error("Datos de carpeta inválidos.");
  const previous = await readJSON(directory, name, valid);
  const serialized = JSON.stringify(value, null, 2);
  if (previous && JSON.stringify(previous, null, 2) === serialized) return;
  if (previous) await writeFile(directory, name.replace(/\.json$/, ".anterior.json"), JSON.stringify(previous, null, 2));
  await writeFile(directory, name, serialized);
}

export async function bookDirectory(directory: VaultDirectory, id: string, create = false) {
  if (!/^sha256-[a-f0-9]{64}$/.test(id)) throw new Error("Identificador de libro inválido.");
  const books = await directory.getDirectoryHandle("libros", { create });
  return books.getDirectoryHandle(id, { create });
}

export function mergeRows(rows: unknown, additions: unknown, key = "id"): VaultRecord[] {
  const map = new Map<unknown, VaultRecord>();
  for (const row of [...(Array.isArray(rows) ? rows : []), ...(Array.isArray(additions) ? additions : [])]) {
    if (!isRecord(row) || row[key] === undefined) continue;
    const previous = map.get(row[key]);
    if (!previous || String(row.updatedAt ?? "") >= String(previous.updatedAt ?? "")) map.set(row[key], row);
  }
  return [...map.values()];
}

export function mergeVaultCopy(local: VaultRecord, incoming: VaultRecord): VaultRecord {
  const merged = { ...incoming };
  // Opening a folder against an empty account must not erase portable records.
  // Explicit deletions are applied separately at the note mutation boundary.
  if (Array.isArray(local.notes) && Array.isArray(incoming.notes)) merged.notes = mergeRows(local.notes, incoming.notes);
  if (Array.isArray(local.progress) && Array.isArray(incoming.progress)) {
    const keyed = (rows: unknown[]) => rows.filter(isRecord).map((row) => ({ ...row, recordKey: `${row.chapterKey}:${row.phase}` }));
    merged.progress = mergeRows(keyed(local.progress), keyed(incoming.progress), "recordKey");
  }
  if (isRecord(local.position) && (!isRecord(incoming.position) || String(local.position.updatedAt ?? "") > String(incoming.position.updatedAt ?? ""))) merged.position = local.position;
  return merged;
}

// Explicit allowlist: never export cookies, authentication tokens, API keys or unrelated apps' storage.
const PREFERENCES = new Set([
  "lector-theme", "lector-highlight-color", "lector-preferred-voice", "lector-speech-rate",
  "lector-speech-volume", "lector-boost-speech-rate", "lector-hold-speech-rate", "lector-shortcuts",
  "lector-reader-layout", "lector-left-sidebar", "lector-left-sidebar-width", "lector-study-panel-width",
  "lector-study-preferences", "lector-font-percent",
]);
export function isVaultPreference(key: string) { return PREFERENCES.has(key); }

export function remapNoteReferences(value: unknown, ids: Record<string, number>, scope: string): unknown {
  if (scope === "notes" && Array.isArray(value)) return value.filter(isRecord).map((note) => ({ ...note,
    id: ids[String(note.id)] ?? note.id, origin: remapAnnotationOrigin(note.origin, ids),
  }));
  if (scope === "chats" && Array.isArray(value)) return value.filter(isRecord).map((chat) => ({
    ...chat,
    messages: Array.isArray(chat.messages) ? chat.messages.filter(isRecord).map((message) => ({
      ...message, ...(typeof message.savedNoteId === "number" && ids[String(message.savedNoteId)] !== undefined ? { savedNoteId: ids[String(message.savedNoteId)] } : {}),
    })) : [],
  }));
  if (!isRecord(value)) return value;
  if (scope === "review") return Object.fromEntries(Object.entries(value).map(([id, data]) => [String(ids[id] ?? id), data]));
  const nodeId = (id: unknown) => typeof id === "string" && id.startsWith("note-") && ids[id.slice(5)] !== undefined ? `note-${ids[id.slice(5)]}` : id;
  if (scope === "whiteboard") return {
    ...value,
    positions: isRecord(value.positions) ? Object.fromEntries(Object.entries(value.positions).map(([id, position]) => [String(nodeId(id)), position])) : {},
    edges: Array.isArray(value.edges) ? value.edges.filter(isRecord).map((edge) => ({ ...edge, from: nodeId(edge.from), to: nodeId(edge.to) })) : [],
  };
  return value;
}
