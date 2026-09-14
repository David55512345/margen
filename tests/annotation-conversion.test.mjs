import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { conversionDraft, conversionEdges, findOriginNote, originSnapshot, remapAnnotationOrigin, validAnnotationOrigin } from "../app/annotation-conversion.ts";
import { boardConnectionPath, layoutBoardNodes } from "../app/board-layout.ts";
import { remapNoteReferences } from "../app/vault-core.ts";

const book = { id: `sha256-${"c".repeat(64)}`, key: "conversion-book", title: "Libro", author: "Autora", fileName: "book.epub" };
const original = { id: 1, bookKey: book.key, bookTitle: book.title, chapterKey: "chapter-7", chapterTitle: "Acción", kind: "comment", front: "Nota", back: "El conjunto disponible se valora por el bienestar que conserva, no mediante una suma mecánica.", quote: "Because the effects which things are able to produce are different…", anchorCfi: "epubcfi(/6/4!/4/2)", anchorLabel: "Quantity and quality", highlightId: "highlight-1", color: "green", sectionIndex: 7, createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-01T00:00:00.000Z" };

test("conversion drafts preserve source content and provenance survives source edits and deletion", () => {
  const draft = conversionDraft(original);
  assert.equal(draft.back, original.back);
  assert.match(draft.front, /Quantity and quality/);
  const card = { ...original, id: 2, kind: "flashcard", front: "¿Cómo se valora un conjunto?", origin: originSnapshot(original) };
  assert.equal(conversionDraft(card).back, `${card.front}\n\n${card.back}`);
  assert.equal(validAnnotationOrigin(card.origin), true);
  assert.equal(validAnnotationOrigin({ ...card.origin, noteId: -1 }), false);
  assert.equal(findOriginNote(card, [original])?.id, 1);
  assert.equal(findOriginNote(card, [{ ...original, bookKey: "other" }]), null);
  assert.equal(findOriginNote(card, [{ ...original, createdAt: "2025-02-01" }]), null);
  assert.equal(conversionEdges([original, card])[0].from, "note-1");
  assert.equal(conversionEdges([{ ...original, back: "Edición posterior" }, card]).length, 1);
  assert.equal(card.origin.back, original.back);
  assert.equal(conversionEdges([card]).length, 0);
  assert.equal(card.origin.back, original.back);
});

test("folder remapping preserves lineage and never links a missing source to a reused ID", () => {
  const card = { ...original, id: 2, kind: "flashcard", origin: originSnapshot(original) };
  const restored = remapNoteReferences([card, original], { 1: 101, 2: 102 }, "notes");
  assert.equal(restored[0].origin.noteId, 101);
  assert.equal(conversionEdges(restored)[0].to, "note-102");
  const missing = remapAnnotationOrigin(card.origin, { 2: 102 });
  assert.equal(missing.noteId, null);
  assert.equal(missing.back, original.back);
  const board = remapNoteReferences({ positions: { "note-1": { x: 0, y: 0 } }, edges: [{ id: "manual", from: "note-1", to: "note-2" }] }, { 1: 101, 2: 102 }, "whiteboard");
  assert.equal(board.edges[0].to, "note-102");
});

test("board includes stable positions and places converted cards near their sources without overlap", () => {
  const nodes = [{ id: "note-1" }, { id: "note-2", sourceId: "note-1" }, { id: "meta-1" }];
  const layout = layoutBoardNodes(nodes, { "note-1": { x: 100, y: 100 } });
  assert.deepEqual(layout["note-1"], { x: 100, y: 100 });
  assert.deepEqual(layout["note-2"], { x: 420, y: 100 });
  assert.notDeepEqual(layout["meta-1"], layout["note-2"]);
  assert.deepEqual(layoutBoardNodes([...nodes].reverse(), layout), layout);
  const path = boardConnectionPath(layout["note-1"], layout["note-2"]);
  assert.match(path.path, /^M 350 210 C/);
  assert.ok(Number.isFinite(path.x));
});

const viewModules = new Map();
async function viewModule(file) {
  if (viewModules.has(file.href)) return viewModules.get(file.href);
  let code = ts.transpileModule(await readFile(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  for (const [, specifier] of [...code.matchAll(/from "([^"]+)"/g)]) {
    let replacement;
    if (specifier === "./device-sync") replacement = `data:text/javascript,${encodeURIComponent("export const hydrateSyncedDocument = async (_,__,v) => v; export const saveSyncedDocument = async () => true;")}`;
    else if (specifier.startsWith(".")) {
      const filename = specifier.replace(/\.tsx?$/, "");
      let dependency = new URL(`${filename}.tsx`, file);
      try { await readFile(dependency); } catch { dependency = new URL(`${filename}.ts`, file); }
      replacement = await viewModule(dependency);
    } else replacement = import.meta.resolve(specifier);
    code = code.replaceAll(`from "${specifier}"`, `from "${replacement}"`);
  }
  const result = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  viewModules.set(file.href, result);
  return result;
}

test("rendered annotation controls and board show both types and directed provenance", async () => {
  const { AnnotationActions, AnnotationOriginDialog, ConversionDialog } = await import(await viewModule(new URL("../app/annotation-tools.tsx", import.meta.url)));
  const { WhiteboardPage } = await import(await viewModule(new URL("../app/whiteboard-page.tsx", import.meta.url)));
  const { NoteCard } = await import(await viewModule(new URL("../app/study-panel.tsx", import.meta.url)));
  const card = { ...original, id: 2, kind: "flashcard", front: "¿Cómo se valora el conjunto?", origin: originSnapshot(original) };
  const callbacks = { onConvert() {}, onShowOrigin() {}, onClose() {}, onOpenNote() {}, onSave: async () => {}, onDelete() {}, onOpenReference() {}, onAssistFlashcard: async () => {} };
  const controls = renderToStaticMarkup(createElement(AnnotationActions, { ...callbacks, note: original }));
  assert.match(controls, /Convertir en flashcard/);
  const cardHTML = renderToStaticMarkup(createElement(NoteCard, { ...callbacks, note: card }));
  assert.match(cardHTML, /Convertir en nota/);
  assert.match(cardHTML, /Basada en una nota/);
  const boardHTML = renderToStaticMarkup(createElement(WhiteboardPage, { ...callbacks, open: true, bookKey: book.key, bookTitle: book.title, notes: [original, card] }));
  assert.match(boardHTML, /flashcard-node/);
  assert.match(boardHTML, /Nota → Flashcard/);
  assert.match(boardHTML, /marker-end="url\(#conversion-arrow\)"/);
  assert.match(boardHTML, /Convertir en flashcard/);
  assert.match(boardHTML, /Convertir en nota/);
  const preview = renderToStaticMarkup(createElement(ConversionDialog, { ...callbacks, source: original, onPrepareQuestion: async () => "", onOpenResult() {} }));
  assert.match(preview, /Crear pregunta con IA/);
  assert.match(preview, /conservando el original/);
  const orphan = renderToStaticMarkup(createElement(AnnotationOriginDialog, { ...callbacks, note: card, notes: [card] }));
  assert.match(orphan, /El original ya no está disponible/);
  assert.match(orphan, /suma mecánica/);
});

async function loadRoute(path, database) {
  globalThis.__margenConversionDatabase = database;
  const source = (await readFile(new URL(`../app/api/${path}/route.ts`, import.meta.url), "utf8"))
    .replace('import { getDb } from "../../../db";', 'const getDb = () => globalThis.__margenConversionDatabase;')
    .replace('from "../../../db/schema"', `from "${new URL("../db/schema.ts", import.meta.url).href}"`)
    .replace('import { getBookMemory, getChapterMemories } from "../../ai/repository";', 'const getBookMemory = async () => null; const getChapterMemories = async () => [];')
    .replace('from "../../vault-core"', `from "${new URL("../app/vault-core.ts", import.meta.url).href}"`)
    .replace('from "../../annotation-conversion"', `from "${new URL("../app/annotation-conversion.ts", import.meta.url).href}"`)
    .replace('from "drizzle-orm"', `from "${import.meta.resolve("drizzle-orm")}"`);
  return import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString("base64")}`);
}

test("authenticated conversions are non-destructive, retryable, scoped to the source book and recoverable", async () => {
  const sqlite = new DatabaseSync(":memory:");
  for (const name of (await readdir(new URL("../drizzle/", import.meta.url))).filter((name) => name.endsWith(".sql")).sort()) sqlite.exec(await readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8"));
  const database = drizzle(async (sql, params, method) => {
    const statement = sqlite.prepare(sql);
    if (method === "run") { statement.run(...params); return { rows: [] }; }
    return { rows: statement.all(...params).map((row) => Object.values(row)) };
  });
  try {
    const notes = await loadRoute("notes", database);
    const vault = await loadRoute("vault", database);
    const request = (path, method, payload, owner = "owner-a") => new Request(`http://localhost/api/${path}`, { method, headers: { "Content-Type": "application/json", ...(owner ? { "oai-authenticated-user-id": owner } : {}) }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
    const source = (await (await notes.POST(request("notes", "POST", original))).json()).note;
    const payload = { sourceNoteId: source.id, sourceUpdatedAt: source.updatedAt, bookKey: book.key, conversionKey: "conversion-test-key-1", front: "¿Cómo se valora un conjunto?", back: source.back, quote: "Do not use this forged reference" };
    assert.equal((await notes.POST(request("notes", "POST", payload, null))).status, 401);
    assert.equal((await notes.POST(request("notes", "POST", payload, "owner-b"))).status, 404);
    assert.equal((await notes.POST(request("notes", "POST", { ...payload, bookKey: "wrong-book" }))).status, 404);
    assert.equal((await notes.POST(request("notes", "POST", { ...payload, sourceUpdatedAt: "stale" }))).status, 409);
    assert.equal((await notes.POST(request("notes", "POST", { ...payload, back: "x".repeat(24001) }))).status, 400);
    assert.equal(sqlite.prepare("SELECT count(*) AS n FROM reader_notes").get().n, 1);
    const response = await notes.POST(request("notes", "POST", payload));
    assert.equal(response.status, 201);
    const card = (await response.json()).note;
    assert.equal(card.kind, "flashcard");
    assert.equal(card.origin.noteId, source.id);
    assert.equal(card.origin.back, source.back);
    for (const field of ["quote", "anchorCfi", "highlightId", "sectionIndex", "chapterKey"]) assert.equal(card[field], source[field]);
    assert.equal((await (await notes.POST(request("notes", "POST", payload))).json()).note.id, card.id);
    assert.equal(sqlite.prepare("SELECT count(*) AS n FROM reader_notes").get().n, 2);
    assert.equal(sqlite.prepare("SELECT kind FROM reader_notes WHERE id = ?").get(source.id).kind, "comment");
    const reversed = (await (await notes.POST(request("notes", "POST", { ...payload, sourceNoteId: card.id, sourceUpdatedAt: card.updatedAt, conversionKey: "conversion-test-key-2", back: `${card.front}\n\n${card.back}` }))).json()).note;
    assert.equal(reversed.kind, "comment");
    assert.equal(reversed.origin.noteId, card.id);
    assert.equal(reversed.origin.front, card.front);
    const data = { format: "margen-book", version: 1, book, savedAt: new Date().toISOString(), values: { notes: [reversed, card, source], whiteboard: { positions: {}, edges: [{ id: "manual", from: `note-${source.id}`, to: `note-${card.id}` }], metaNotes: [] } } };
    const recovery = await vault.POST(request("vault", "POST", data, "owner-c"));
    assert.equal(recovery.status, 200);
    const ids = (await recovery.json()).noteIds;
    const recovered = (await (await vault.GET(request(`vault?bookId=${book.id}&bookKey=${book.key}`, "GET", null, "owner-c"))).json()).values.notes;
    assert.equal(recovered.find((item) => item.id === ids[card.id]).origin.noteId, ids[source.id]);
    assert.equal(conversionEdges(recovered).length, 2);
    await vault.POST(request("vault", "POST", data, "owner-c"));
    assert.equal(sqlite.prepare("SELECT count(*) AS n FROM reader_notes WHERE owner_key = 'owner-c'").get().n, 3);
    await notes.PATCH(request("notes", "PATCH", { id: source.id, front: "Nota", back: "Edición posterior del original" }));
    const current = (await (await notes.GET(request(`notes?bookKey=${book.key}`, "GET"))).json()).notes;
    assert.equal(current.find((item) => item.id === card.id).origin.back, original.back);
    await notes.DELETE(request(`notes?id=${source.id}`, "DELETE"));
    const surviving = (await (await notes.GET(request(`notes?bookKey=${book.key}`, "GET"))).json()).notes;
    assert.equal(surviving.find((item) => item.id === card.id).origin.back, original.back);
    assert.equal(conversionEdges(surviving).length, 1);
    const missingData = { ...data, values: { notes: [card] } };
    await vault.POST(request("vault", "POST", missingData, "owner-d"));
    const missingSource = (await (await vault.GET(request(`vault?bookId=${book.id}&bookKey=${book.key}`, "GET", null, "owner-d"))).json()).values.notes[0];
    assert.equal(missingSource.origin.noteId, null);
    assert.equal(missingSource.origin.back, original.back);
  } finally { delete globalThis.__margenConversionDatabase; sqlite.close(); }
});
