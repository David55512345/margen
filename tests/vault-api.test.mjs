import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import ts from "typescript";

test("folder recovery is authenticated, owner-scoped, retryable and preserves newer edits", async () => {
  const sqlite = new DatabaseSync(":memory:");
  for (const name of (await readdir(new URL("../drizzle/", import.meta.url))).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(await readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8"));
  }
  const database = drizzle(async (sql, params, method) => {
    const statement = sqlite.prepare(sql);
    if (method === "run") { statement.run(...params); return { rows: [] }; }
    return { rows: statement.all(...params).map((row) => Object.values(row)) };
  });
  globalThis.__margenVaultTestDatabase = database;
  try {
    const source = (await readFile(new URL("../app/api/vault/route.ts", import.meta.url), "utf8"))
      .replace('import { getDb } from "../../../db";', 'const getDb = () => globalThis.__margenVaultTestDatabase;')
      .replace('from "../../../db/schema"', `from "${new URL("../db/schema.ts", import.meta.url).href}"`)
      .replace('import { getBookMemory, getChapterMemories } from "../../ai/repository";', 'const getBookMemory = async () => null; const getChapterMemories = async () => [];')
      .replace('from "../../vault-core"', `from "${new URL("../app/vault-core.ts", import.meta.url).href}"`)
      .replace('from "../../annotation-conversion"', `from "${new URL("../app/annotation-conversion.ts", import.meta.url).href}"`)
      .replace('from "drizzle-orm"', `from "${import.meta.resolve("drizzle-orm")}"`);
    const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    const route = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
    const id = `sha256-${"a".repeat(64)}`;
    const book = { id, key: "test-vault-book", title: "Libro", author: "Autora", fileName: "book.epub" };
    const when = "2025-01-01T00:00:00.000Z";
    const data = { format: "margen-book", version: 1, book, savedAt: when, values: {
      notes: [{ id: 987, bookKey: book.key, chapterKey: "chapter-1", chapterTitle: "Capítulo", kind: "flashcard", front: "¿Pregunta?", back: "Respuesta original", createdAt: when, updatedAt: when }],
      review: { 987: { reviews: 4 } },
      whiteboard: { positions: { "note-987": { x: 100 } }, edges: [], metaNotes: [] },
      progress: [{ bookKey: book.key, chapterKey: "chapter-1", phase: "pretest", completed: true, payload: "{}", updatedAt: when }],
      position: { sectionIndex: 4, maxReadSectionIndex: 5, percent: 25, cfi: "test-cfi", updatedAt: when },
    } };
    const post = (owner, payload = data) => route.POST(new Request("http://localhost/api/vault", { method: "POST", headers: { "Content-Type": "application/json", ...(owner ? { "oai-authenticated-user-id": owner } : {}) }, body: JSON.stringify(payload) }));
    const get = (owner) => route.GET(new Request(`http://localhost/api/vault?bookId=${id}&bookKey=${book.key}`, { headers: owner ? { "oai-authenticated-user-id": owner } : {} }));
    assert.equal((await post(null)).status, 401);
    assert.equal((await get(null)).status, 401);
    assert.equal(sqlite.prepare("SELECT count(*) AS total FROM reader_notes").get().total, 0);
    const first = await post("owner-a");
    assert.equal(first.status, 200);
    const map = (await first.json()).noteIds;
    assert.ok(map[987]);
    assert.equal((await post("owner-a")).status, 200);
    assert.equal(sqlite.prepare("SELECT count(*) AS total FROM reader_notes").get().total, 1);
    const saved = await (await get("owner-a")).json();
    assert.equal(saved.values.notes[0].back, "Respuesta original");
    assert.equal(saved.values.notes[0].ownerKey, undefined);
    assert.equal(saved.values.review[map[987]].reviews, 4);
    assert.equal(saved.values.whiteboard.positions[`note-${map[987]}`].x, 100);
    assert.equal(saved.values.progress[0].completed, true);
    assert.equal(saved.values.position.cfi, "test-cfi");
    const other = await (await get("owner-b")).json();
    assert.equal(other.values.notes.length, 0);
    assert.equal(other.values.progress.length, 0);
    sqlite.prepare("UPDATE reader_notes SET back = ?, updated_at = ? WHERE owner_key = ?").run("Edición más reciente", "2026-01-01T00:00:00.000Z", "owner-a");
    await post("owner-a");
    assert.equal((await (await get("owner-a")).json()).values.notes[0].back, "Edición más reciente");
    const invalid = structuredClone(data); invalid.values.notes[0].bookKey = "foreign-book";
    assert.equal((await post("owner-b", invalid)).status, 400);
    assert.equal((await (await get("owner-b")).json()).values.notes.length, 0);
    assert.equal((await post("owner-a", { ...data, version: 2 })).status, 400);
  } finally { delete globalThis.__margenVaultTestDatabase; sqlite.close(); }
});
