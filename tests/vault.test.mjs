import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import ts from "typescript";
import { bookDirectory, isVaultPreference, mergeVaultCopy, readJSON, remapNoteReferences, validBook, validBookData, validManifest, writeJSON } from "../app/vault-core.ts";

class Directory {
  constructor(name) { this.name = name; this.files = new Map(); this.directories = new Map(); this.permission = "granted"; this.fail = null; }
  async queryPermission() { return this.permission; }
  async requestPermission() { return this.permission; }
  async getDirectoryHandle(name, { create = false } = {}) {
    if (!this.directories.has(name) && create) this.directories.set(name, new Directory(name));
    if (!this.directories.has(name)) throw new DOMException("Missing", "NotFoundError");
    return this.directories.get(name);
  }
  async getFileHandle(name, { create = false } = {}) {
    if (!this.files.has(name) && !create) throw new DOMException("Missing", "NotFoundError");
    return {
      getFile: async () => {
        if (!this.files.has(name)) throw new DOMException("Missing", "NotFoundError");
        return new Blob([this.files.get(name)]);
      },
      createWritable: async () => {
        let pending;
        return {
          write: async (value) => { pending = value; },
          close: async () => { if (this.fail === name) throw new DOMException("Disco lleno", "QuotaExceededError"); this.files.set(name, pending); },
          abort: async () => { pending = undefined; },
        };
      },
    };
  }
}
const bytes = new TextEncoder().encode("epub-test-binary").buffer;
const book = { id: `sha256-${createHash("sha256").update(new Uint8Array(bytes)).digest("hex")}`, key: "book-key", title: "Mi libro", author: "Autora", fileName: "mi libro.epub" };
const snapshot = (value) => ({ format: "margen-book", version: 1, book, savedAt: "2026-08-01T00:00:00.000Z", values: { notes: value } });

test("folder format rejects traversal, foreign formats and future versions", async () => {
  assert.equal(validBook(book), true);
  for (const id of ["../secrets", "C:\\Users", "sha256-../test"]) {
    assert.equal(validBook({ ...book, id }), false);
    await assert.rejects(bookDirectory(new Directory("root"), id), /inválido/);
  }
  assert.equal(validManifest({ format: "another-app", version: 1 }), false);
  assert.equal(validBookData({ ...snapshot([]), version: 2 }), false);
  assert.equal(isVaultPreference("OPENAI_API_KEY"), false);
  assert.equal(isVaultPreference("access_token"), false);
  assert.equal(isVaultPreference("lector-speech-volume"), true);
});

test("atomic saves keep an independent previous version and recover a corrupted current file", async () => {
  const folder = new Directory("book");
  await writeJSON(folder, "datos.json", snapshot(["primera"]), validBookData);
  await writeJSON(folder, "datos.json", snapshot(["segunda"]), validBookData);
  assert.deepEqual(JSON.parse(folder.files.get("datos.anterior.json")).values.notes, ["primera"]);
  folder.files.set("datos.json", "{interrupted");
  assert.deepEqual((await readJSON(folder, "datos.json", validBookData)).values.notes, ["primera"]);
  await writeJSON(folder, "datos.json", snapshot(["recuperada"]), validBookData);
  folder.fail = "datos.json";
  await assert.rejects(writeJSON(folder, "datos.json", snapshot(["fallida"]), validBookData), /Disco lleno/);
  assert.deepEqual((await readJSON(folder, "datos.json", validBookData)).values.notes, ["recuperada"]);
});

test("invalid existing data is never silently replaced", async () => {
  const folder = new Directory("other");
  folder.files.set("datos.json", JSON.stringify({ format: "otra app" }));
  await assert.rejects(writeJSON(folder, "datos.json", snapshot([]), validBookData), /No se pudo leer/);
  assert.equal(JSON.parse(folder.files.get("datos.json")).format, "otra app");
});

test("restoring IDs preserves flashcard schedules, board edges and chat links", () => {
  const map = { 10: 701, 20: 702 };
  assert.deepEqual(remapNoteReferences({ 10: { reviews: 4 } }, map, "review"), { 701: { reviews: 4 } });
  const board = remapNoteReferences({ positions: { "note-10": { x: 1 } }, edges: [{ from: "note-10", to: "note-20" }], metaNotes: [{ id: "meta-1", text: "idea" }] }, map, "whiteboard");
  assert.equal(board.positions["note-701"].x, 1);
  assert.equal(board.edges[0].to, "note-702");
  assert.equal(board.metaNotes[0].text, "idea");
  assert.equal(remapNoteReferences([{ messages: [{ savedNoteId: 10 }] }], map, "chats")[0].messages[0].savedNoteId, 701);
});

test("opening a folder against an empty cloud account cannot erase the local work", () => {
  const local = { notes: [{ id: 1, back: "nota local", updatedAt: "2026-01-01" }], progress: [{ chapterKey: "c", phase: "pretest", completed: true }], position: { cfi: "local-cfi", updatedAt: "2026-01-01" } };
  const merged = mergeVaultCopy(local, { notes: [], progress: [], position: null });
  assert.equal(merged.notes[0].back, "nota local");
  assert.equal(merged.progress[0].completed, true);
  assert.equal(merged.position.cfi, "local-cfi");
  const newer = mergeVaultCopy(local, { notes: [{ id: 1, back: "edición nueva", updatedAt: "2026-02-01" }] });
  assert.equal(newer.notes[0].back, "edición nueva");
});

function mockStorage() {
  const map = new Map();
  return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: (key) => map.delete(key), clear: () => map.clear(), key: (i) => [...map.keys()][i] ?? null, get length() { return map.size; } };
}
function mockIDB() {
  const records = new Map();
  return { open: () => {
    const request = {};
    queueMicrotask(() => {
      request.result = { createObjectStore() {}, close() {}, transaction: () => {
        const tx = { objectStore: () => {
          const operation = (value) => { const op = {}; queueMicrotask(() => { op.result = value; op.onsuccess?.(); queueMicrotask(() => tx.oncomplete?.()); }); return op; };
          return { get: (key) => operation(records.get(key)), put: (value, key) => { records.set(key, value); return operation(value); }, delete: (key) => { records.delete(key); return operation(); } };
        } };
        return tx;
      } };
      request.onsuccess?.();
    });
    return request;
  }, clear: () => records.clear() };
}

async function loadStore() {
  const source = await readFile(new URL("../app/vault-store.ts", import.meta.url), "utf8");
  const coreURL = new URL("../app/vault-core.ts", import.meta.url).href;
  const compiled = ts.transpileModule(source.replace('from "./vault-core"', `from "${coreURL}"`), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}#${crypto.randomUUID()}`);
}

test("a real-folder contract survives cleared browser storage, recovers notes and verifies the EPUB", async () => {
  const originals = Object.fromEntries(["window", "localStorage", "indexedDB", "navigator", "location", "fetch"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const directory = new Directory("Biblioteca Margen");
  const storage = mockStorage(); const idb = mockIDB();
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: { isSecureContext: true, showDirectoryPicker: async () => directory } },
    localStorage: { configurable: true, value: storage }, indexedDB: { configurable: true, value: idb },
    navigator: { configurable: true, value: { locks: { request: async (_key, callback) => callback() }, onLine: false } },
    location: { configurable: true, value: { origin: "https://margen.test" } },
    fetch: { configurable: true, value: async () => { throw new Error("offline"); } },
  });
  try {
    const store = await loadStore();
    await store.chooseVault(true);
    await store.registerVaultBook(book, bytes);
    const notes = [{ id: 8, bookKey: book.key, kind: "flashcard", front: "Pregunta", back: "Respuesta", origin: { noteId: 7, kind: "comment", front: "Nota", back: "Contenido original antes de convertir", createdAt: "2025-01-01T00:00:00.000Z" } }];
    await store.saveVaultValues(book.key, { notes, highlights: [{ quote: "párrafo" }], review: { 8: { reviews: 3 } }, chats: [{ id: "chat-1", title: "Consulta", messages: [{ text: "Hola" }] }] });
    await store.saveVaultSyncValue(book.key, "highlights", [{ quote: "cambio sin internet" }], true);
    storage.setItem("lector-speech-rate", "0.95"); storage.setItem("access_token", "never-export");
    await store.saveVaultPreferences(); await store.flushVault();
    assert.equal(store.getVaultStatus().state, "ready");
    assert.doesNotMatch(directory.files.get("configuracion.json"), /never-export/);
    // A new module/browser session, no handles or local storage: only the folder survives.
    storage.clear(); idb.clear();
    const restored = await loadStore();
    await restored.chooseVault(false);
    await restored.hydrateVaultBook(book);
    assert.deepEqual((await restored.vaultFetch(`/api/notes?bookKey=${book.key}`)).status, 200);
    assert.deepEqual((await (await restored.vaultFetch(`/api/notes?bookKey=${book.key}`)).json()).notes, notes);
    assert.equal(JSON.parse(storage.getItem(`lector-review:${book.key}`))[8].reviews, 3);
    assert.equal(storage.getItem(`margen-sync-dirty:highlights:${book.key}`), "1");
    assert.equal(JSON.parse(storage.getItem(`lector-highlights:${book.key}`))[0].quote, "cambio sin internet");
    assert.equal(JSON.parse(storage.getItem(`lector-chats:${book.key}`))[0].title, "Consulta");
    await restored.restoreVaultPreferences();
    assert.equal(storage.getItem("lector-speech-rate"), "0.95");
    const epub = await restored.openVaultEpub();
    assert.equal(epub.name, book.fileName);
    assert.equal(await epub.text(), "epub-test-binary");
    directory.permission = "denied";
    await restored.saveVaultValues(book.key, { notes: ["no-permission"] }); await restored.flushVault();
    assert.equal(restored.getVaultStatus().state, "permission");
    directory.permission = "granted";
    await restored.authorizeVault(); await restored.flushVault();
    assert.equal(restored.getVaultStatus().state, "ready");
    const folder = await bookDirectory(directory, book.id);
    assert.deepEqual(JSON.parse(folder.files.get("datos.json")).values.notes, ["no-permission"]);
    folder.files.set("libro.epub", "tampered");
    await assert.rejects(restored.openVaultEpub(), /cambió fuera/);
    await restored.disconnectVault();
    assert.ok(directory.files.has("margen.json"));
    assert.ok(folder.files.has("datos.json"));
  } finally {
    for (const [key, descriptor] of Object.entries(originals)) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
});
