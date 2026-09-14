import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { buildContext } from "../app/ai/context-builder.ts";
import { callOpenAI } from "../app/ai/provider.ts";
import { classifyAssistantTask, directSelectionHighlightColor, initialBookProfile, requestedReaderNoteKind } from "../app/book-memory.ts";
import { localAssistant, localChapterAnalysis } from "../app/study-local.ts";
import { HIGHLIGHT_MATCH_SCHEMA, NOTE_SCHEMA } from "../app/study-contract.ts";
import { parseReadingChunkVoiceCommand, parseReadingParagraphVoiceCommand } from "../app/voice-commands.ts";

const projectRoot = new URL("../", import.meta.url);

async function fetchWorker(request = new Request("http://localhost/", { headers: { accept: "text/html" } })) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    request,
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the EPUB reader shell and product metadata", async () => {
  const response = await fetchWorker();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Margen — lectura inteligente<\/title>/i);
  assert.match(html, /Abrir EPUB/);
  assert.match(html, /Lectura en voz alta/);
  assert.match(html, /El EPUB y tus anotaciones se sincronizan de forma privada/);
  assert.match(html, /Estudio acompañado/);
  assert.match(html, /Notas/);
  assert.match(html, /CUADERNO INTELIGENTE/);
  assert.match(html, /Margen/);
  assert.match(html, /Perfil del usuario/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("compiled public worker refuses unconfigured APIs before touching storage", async () => {
  for (const path of ["/api/notes", "/api/library", "/api/vault", "/api/assistant"]) {
    const response = await fetchWorker(new Request(`http://localhost${path}`, {
      headers: { "oai-authenticated-user-id": "forged-owner" },
    }));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("returns a structured local assistant action when no API key is configured", () => {
  const selected = "Este es un ejemplo suficientemente detallado para verificar el subrayado exacto dentro del fragmento seleccionado.";
  const payload = localAssistant({
    task: "ai_highlight",
    book: { id: "book-1", legacyKey: "legacy-1", title: "Libro de prueba", author: "Autora", topic: "Aprendizaje" },
    chapter: { id: "chapter-1", title: "El primer concepto", sectionIndex: 0 },
    position: { cfi: "cfi-1", maxReadSectionIndex: 0 },
    question: "subraya el ejemplo en verde",
    selection: { text: selected, cfi: "cfi-1", sectionIndex: 0 },
  });

  assert.equal(payload.action, "subrayar");
  assert.equal(payload.highlight.color, "green");
  assert.match(payload.highlight.quote, /ejemplo suficientemente detallado/);
  assert.equal(selected.slice(payload.matches[0].start, payload.matches[0].end), payload.matches[0].text);
  assert.equal(payload.provider, "local");
});

test("local assistant answers from the explicit reader focus instead of a generic chapter summary", () => {
  const payload = localAssistant({
    task: "explain_selection",
    book: { id: "book-1", legacyKey: "legacy-1", title: "Libro de prueba", author: "Autora", topic: "Economía" },
    chapter: { id: "chapter-2", title: "El trabajo", sectionIndex: 1 },
    position: { cfi: "cfi-2", maxReadSectionIndex: 1 },
    question: "¿A qué se refiere con labores productivas?",
    selection: {
      text: "Las labores productivas crean bienes o servicios que otras personas demandan. Quien los produce puede intercambiarlos por lo que necesita para vivir.",
      cfi: "cfi-2",
      sectionIndex: 1,
    },
    surrounding: {
      before: "El capítulo empieza con una introducción general que no responde la pregunta.",
      current: "Las labores productivas crean bienes o servicios que otras personas demandan.",
      after: "Quien los produce puede intercambiarlos por lo que necesita para vivir.",
    },
  });

  assert.equal(payload.action, "responder");
  assert.match(payload.message, /^Respuesta directa:/);
  assert.match(payload.message, /crean bienes o servicios/);
  assert.doesNotMatch(payload.message, /introducción general/);
});

test("context builder prioritizes selection and blocks future sections", () => {
  const request = {
    task: "whole_book_question",
    book: { id: "book-1", legacyKey: "legacy-1", title: "Libro", author: "Autor", topic: "libertad" },
    chapter: { id: "chapter-2", title: "Capítulo 2", sectionIndex: 1 },
    position: { cfi: "cfi-2", maxReadSectionIndex: 1 },
    question: "¿Cómo cambia el concepto de libertad?",
    selection: { text: "La libertad exige responsabilidad.", cfi: "cfi-2", sectionIndex: 1 },
    retrievedChunks: [
      { sectionIndex: 1, chapterTitle: "Capítulo 2", text: "La libertad exige responsabilidad." },
      { sectionIndex: 4, chapterTitle: "Capítulo futuro", text: "SPOILER FUTURO SOBRE LIBERTAD." },
    ],
    allowFuture: false,
  };
  const result = buildContext({
    request,
    profile: initialBookProfile("Libro", "Autor", "libertad", ["Capítulo 1", "Capítulo 2"]),
    currentAnalysis: null,
    allAnalyses: [],
  });
  assert.match(result.input, /La libertad exige responsabilidad/);
  assert.doesNotMatch(result.input, /SPOILER FUTURO/);
  assert.ok(result.estimatedInputTokens <= result.budgetTokens);
});

test("chapter analysis creates the complete study bundle once", () => {
  const profile = initialBookProfile("Economía cotidiana", "Autora", "decisiones y escasez", ["Elección"]);
  const { analysis } = localChapterAnalysis({
    book: {
      id: "book-1", legacyKey: "legacy-1", title: "Economía cotidiana", author: "Autora",
      topic: "decisiones y escasez", toc: ["Elección"], initialProfile: profile,
    },
    chapter: {
      id: "section-0", title: "Elección", sectionIndex: 0, contentHash: "hash-1",
      text: "Toda elección utiliza recursos escasos y obliga a renunciar a otra alternativa. El coste de oportunidad representa el valor de la mejor alternativa descartada. Esta relación permite comparar decisiones diferentes.",
    },
  }, profile);
  assert.equal(analysis.study.preReadingQuestions.length, 3);
  assert.equal(analysis.study.postReadingQuestions.length, 3);
  assert.match(analysis.study.feynmanQuestion, /Explica/);
  assert.equal(analysis.contentHash, "hash-1");
});

test("parses repeated chunk voice controls and caps them at three", () => {
  assert.deepEqual(parseReadingChunkVoiceCommand("anterior, anterior"), { action: "previous", count: 2 });
  assert.deepEqual(parseReadingChunkVoiceCommand("siguiente siguiente siguiente"), { action: "next", count: 3 });
  assert.deepEqual(parseReadingChunkVoiceCommand("siguiente siguiente siguiente siguiente"), { action: "next", count: 3 });
  assert.deepEqual(parseReadingChunkVoiceCommand("repite este fragmento"), { action: "repeat", count: 1 });
  assert.equal(parseReadingChunkVoiceCommand("página siguiente"), null);
  assert.deepEqual(parseReadingParagraphVoiceCommand("siguiente párrafo"), { action: "next" });
  assert.deepEqual(parseReadingParagraphVoiceCommand("párrafo anterior"), { action: "previous" });
  assert.deepEqual(parseReadingParagraphVoiceCommand("repite este párrafo"), { action: "repeat" });
});

test("turns short color commands into zero-token whole-selection highlights", () => {
  assert.equal(directSelectionHighlightColor("verde", "yellow"), "green");
  assert.equal(directSelectionHighlightColor("¡Verde!", "yellow"), "green");
  assert.equal(directSelectionHighlightColor("rosa", "yellow"), "pink");
  assert.equal(directSelectionHighlightColor("subraya este texto de azul", "yellow"), null);
  assert.equal(directSelectionHighlightColor("subraya la idea principal de verde", "yellow"), null);
});

test("allows the AI to choose freely between zero and five highlight fragments", () => {
  assert.equal(HIGHLIGHT_MATCH_SCHEMA.properties.matches.maxItems, 5);
  assert.equal("minItems" in HIGHLIGHT_MATCH_SCHEMA.properties.matches, false);
});

test("recognizes natural Spanish variations for highlighting without confusing whole-selection colors", () => {
  assert.equal(classifyAssistantTask("subraye solo lo más importante", true), "ai_highlight");
  assert.equal(classifyAssistantTask("quiero que de aquí me subrayes solo el ejemplo en verde", true), "ai_highlight");
  assert.equal(classifyAssistantTask("solo remárcame el texto", true), "ai_highlight");
  assert.equal(classifyAssistantTask("por favor pon de verde lo más importante", true), "ai_highlight");
  assert.equal(classifyAssistantTask("destaca las ideas centrales", true), "ai_highlight");
  assert.equal(directSelectionHighlightColor("solo remárcame el texto", "yellow"), null);
  assert.equal(directSelectionHighlightColor("pon este texto de verde", "yellow"), null);
  assert.equal(directSelectionHighlightColor("pon de verde lo más importante", "yellow"), null);
});

test("keeps notes distinct from flashcards in natural Spanish requests", () => {
  assert.equal(classifyAssistantTask("crea una nota con la idea más importante", true), "create_note");
  assert.equal(classifyAssistantTask("crea una flashcard de esto que estoy subraya", true), "create_note");
  assert.equal(classifyAssistantTask("entonces dame una flashcard preguntándome todo lo que es la acción, según este capítulo", false), "create_note");
  assert.equal(classifyAssistantTask("prepárame una tarjeta Anki de este capítulo", false), "create_note");
  assert.equal(classifyAssistantTask("dame una síntesis de lo que es la acción", false), "chapter_question");
  assert.equal(classifyAssistantTask("sintetiza las diferentes definiciones", true), "explain_selection");
  assert.equal(classifyAssistantTask("en este capítulo, ¿cuál es la síntesis de la acción?", true), "chapter_question");
  assert.equal(requestedReaderNoteKind("crea una nota con la idea más importante"), "comment");
  assert.equal(requestedReaderNoteKind("haz un comentario breve"), "comment");
  assert.equal(requestedReaderNoteKind("crea una flashcard de esta idea"), "flashcard");
  assert.equal(requestedReaderNoteKind("haz una tarjeta Anki"), "flashcard");
  assert.equal(requestedReaderNoteKind("entonces dame una flashcard preguntándome todo lo que es la acción"), "flashcard");
  assert.deepEqual(NOTE_SCHEMA.properties.kind.enum, ["comment", "flashcard"]);

  const note = localAssistant({
    task: "create_note",
    book: { id: "book-1", legacyKey: "legacy-1", title: "Libro", author: "Autor", topic: "economía" },
    chapter: { id: "chapter-1", title: "Capítulo", sectionIndex: 0 },
    position: { cfi: "cfi-1", maxReadSectionIndex: 0 },
    question: "crea una nota con la idea más importante",
    selection: { text: "La competencia coordina decisiones dispersas y beneficia a los consumidores.", cfi: "cfi-1", sectionIndex: 0 },
  });
  assert.equal(note.note?.kind, "comment");
  assert.equal(note.note?.front, "Nota");
});

test("retries an incomplete structured highlight without reasoning-token starvation", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(init.body));
    if (requests.length === 1) {
      return Response.json({
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output: [],
        usage: { input_tokens: 10, output_tokens: 6, input_tokens_details: { cached_tokens: 2 } },
      });
    }
    return Response.json({
      status: "completed",
      output: [{ content: [{ type: "output_text", text: JSON.stringify({ message: "Listo", matches: [] }) }] }],
      usage: { input_tokens: 11, output_tokens: 7, input_tokens_details: { cached_tokens: 3 } },
    });
  };

  try {
    const result = await callOpenAI({
      apiKey: "test-key",
      model: "gpt-5.6-luna",
      instructions: "Devuelve JSON.",
      input: "Selección de prueba",
      schema: { type: "object" },
      schemaName: "highlight_offsets",
      maxOutputTokens: 180,
      reasoning: "low",
      promptCacheKey: "test-highlight",
      retryIncomplete: true,
    });
    assert.deepEqual(result.value, { message: "Listo", matches: [] });
    assert.equal(requests.length, 2);
    assert.equal(requests[0].reasoning.effort, "low");
    assert.equal(requests[1].reasoning.effort, "none");
    assert.equal(requests[1].max_output_tokens, 640);
    assert.deepEqual(result.usage, { inputTokens: 21, outputTokens: 13, cachedTokens: 5 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("keeps the finished reader free of starter assets", async () => {
  const [page, layout, packageJson, studyPanel, assistantRoute, analysisRoute, contextBuilder, styles, settings, prompts, provider, constants, notesRoute, schema, notesMigration, noteLinkMigration, localBookStore, deviceSync, syncRoute, libraryRoute, hostingConfig, syncMigration] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/study-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/assistant/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/analysis/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/ai/context-builder.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/reader-settings.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ai/prompts.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/ai/provider.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/ai/constants.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/notes/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0002_real_outlaw_kid.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0003_gifted_ricochet.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/local-book-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/device-sync.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/sync/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/library/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0004_deep_shinko_yamashiro.sql", import.meta.url), "utf8"),
  ]);

  // epub.js nunca se inicializa dentro de un contenedor oculto y el último
  // archivo válido se restaura desde el almacenamiento local del navegador.
  assert.match(page, /await waitForVisibleViewer\(viewer\)/);
  assert.match(page, /const initialTarget = savedCfi \|\| fallbackTarget/);
  assert.doesNotMatch(page, /rendition\.display\(savedCfi \|\| undefined\)/);
  assert.match(page, /relocatedCfiRef\.current = ""/);
  assert.match(page, /loadLastEpub\(\)/);
  assert.match(page, /saveLastEpub\(file\.name/);
  assert.match(localBookStore, /indexedDB\.open\(DB_NAME, DB_VERSION\)/);
  assert.match(localBookStore, /LAST_BOOK_KEY = "last-opened"/);
  assert.match(localBookStore, /new File\(\[stored\.blob\], stored\.name/);
  assert.match(page, /Biblioteca sincronizada/);
  assert.match(page, /syncEpubToCloud/);
  assert.match(page, /hydrateSyncedDocument\(details\.key, "highlights"/);
  assert.match(deviceSync, /margen-sync-dirty/);
  assert.match(deviceSync, /navigator\.onLine/);
  assert.match(syncRoute, /syncedDocuments/);
  assert.match(libraryRoute, /LIBRARY/);
  assert.match(libraryRoute, /application\/epub\+zip/);
  assert.match(hostingConfig, /r2: "LIBRARY"/);
  assert.match(hostingConfig, /hasSitesConfig/);
  assert.match(syncMigration, /CREATE TABLE `synced_books`/);
  assert.match(syncMigration, /CREATE TABLE `synced_documents`/);

  assert.match(prompts, /SELECCION\.slice\(start, end\)/);
  assert.match(prompts, /devuelve matches vacío/);
  assert.match(prompts, /entre 0 y 5 fragmentos/);
  assert.match(assistantRoute, /getRequestExecutionContext/);
  assert.match(assistantRoute, /ctx\.waitUntil\(guarded\)/);
  assert.match(assistantRoute, /Subrayado estructurado no disponible; usando respaldo local verificado/);
  assert.match(assistantRoute, /La IA no devolvió offsets verificables; usando respaldo local exacto/);
  assert.match(assistantRoute, /cacheResponse = false/);
  assert.match(assistantRoute, /slice\(0, 5\)/);
  assert.match(assistantRoute, /highlight-5-v2/);
  assert.match(provider, /incomplete_details/);
  assert.match(provider, /retryIncomplete/);
  assert.match(constants, /ai_highlight: 900/);
  assert.match(contextBuilder, /MIN_REQUIRED_CHARACTERS/);
  assert.match(contextBuilder, /RECORTADO/);
  assert.match(styles, /\.lector-selection-palette\.is-editing/);
  assert.match(styles, /\.lector-selection-erase/);
  assert.match(styles, /conic-gradient\(from 215deg/);
  assert.match(styles, /\.highlight-swatch:hover/);

  // Modos de visualización: tokens por tema y barra flotante semitransparente.
  assert.match(styles, /:root\[data-theme="sepia"\]/);
  assert.match(styles, /:root\[data-theme="oscuro"\]/);
  assert.match(styles, /--paper-rgb: 31, 31, 31/);
  assert.match(styles, /\.highlight-toolbar \{ opacity: \.34;/);
  assert.match(styles, /\.highlight-toolbar:hover, \.highlight-toolbar:focus-within \{ opacity: 1;/);
  assert.match(page, /const READER_THEMES/);
  assert.match(page, /setReaderPreference\("lector-theme"/);
  assert.match(page, /document\.documentElement\.dataset\.theme = readerTheme/);
  assert.match(page, /rendition\.themes\.select\(`lector-\$\{nextTheme\}`\)/);
  assert.match(page, /body\[data-lector-theme="oscuro"\]/);

  // La barra flotante ya no rotula "Anotar" y el botón de entrada es una píldora con flecha.
  assert.match(page, /\{editingHighlight && <strong>Cambiar color<\/strong>\}/);
  assert.doesNotMatch(page, /<strong>\{editingHighlight \? "Cambiar color" : "Anotar"\}<\/strong>/);
  assert.match(styles, /\.primary-action \{ margin-top: 24px; display: inline-flex;/);
  assert.match(styles, /\.primary-action:hover \.lector-icon \{ transform: translateX\(3px\); \}/);

  assert.match(packageJson, /"epubjs": "\^0\.3\.93"/);
  assert.match(packageJson, /"jszip": "\^3\.10\.1"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(page, /SpeechSynthesisUtterance/);
  assert.match(page, /bestSpanishVoice/);
  assert.match(page, /readerVoiceChoices/);
  assert.match(page, /POPULAR_GOOGLE_VOICE_LANGUAGES/);
  assert.match(page, /isHighFidelityVoice/);
  assert.match(page, /lector-preferred-voice/);
  assert.match(page, /Intl\.Segmenter/);
  assert.match(page, /wrapSentenceSegments/);
  assert.match(page, /lectorSentenceIndex/);
  assert.match(page, /Escuchar desde esta oración/);
  assert.match(page, /lector-speaking-sentence/);
  assert.match(page, /speechGuardTimerRef/);
  assert.match(page, /2_500/);
  assert.match(page, /toggleSpeechPause/);
  assert.match(page, /startReadingVisiblePage/);
  assert.match(page, /audio-player/);
  assert.match(page, /reader-bottom-cluster/);
  assert.match(page, /audio-transport/);
  assert.match(page, /audio-skip/);
  assert.match(page, /skipReadingChunk/);
  assert.match(page, /jumpReadingChunks/);
  assert.match(page, /recentNarratedParagraphsRef/);
  assert.doesNotMatch(page, /Voz \+ IA/);
  assert.doesNotMatch(page, /Comando o pregunta/);
  assert.match(page, /className="mic-icon"/);
  assert.doesNotMatch(page, /Abrir el asistente durante la lectura/);
  assert.doesNotMatch(page, /notes-toggle ai-toggle/);
  assert.match(page, /tools-toggle/);
  assert.match(page, /tools-panel-icon/);
  assert.match(page, /Abrir panel de IA, notas y flashcards/);
  assert.match(page, />Anotar<\/span>/);
  assert.match(settings, /Modo Anotar/);
  assert.match(page, /modeRef\.current !== "highlight" && modeRef\.current !== "reading"/);
  assert.match(page, /mode === "highlight" \|\| mode === "reading"/);
  assert.match(page, /body\[data-lector-mode="reading"\] ::selection/);
  assert.doesNotMatch(page, /explicit_focus/);
  assert.match(page, /assistantFocusRef\.current = focus/);
  assert.match(page, /focusPendingSelectionForAssistant/);
  assert.match(page, /highlight-toolbar" role="toolbar"/);
  assert.match(page, /hasBook && mode === "highlight"/);
  assert.match(page, /highlight-ai \$\{hasPendingHighlightSelection \|\| editingHighlight/);
  assert.match(page, /runAssistantAction/);
  assert.match(page, /Abrir el chat de IA/);
  assert.match(page, /IA sobre este texto/);
  assert.match(page, /highlight-history/);
  assert.match(page, /placeHighlightPalette/);
  // La paleta contextual vive en la ventana principal: el iframe de epub.js está
  // en sandbox sin `allow-scripts` y sus temporizadores nunca ejecutan el callback.
  assert.doesNotMatch(page, /contents\.window\.(setTimeout|clearTimeout)/);
  assert.match(page, /defaultView\?\.frameElement as HTMLElement/);
  assert.match(page, /manager\?: unknown/);
  assert.match(page, /runPaletteAction/);
  assert.match(page, /lector-selection-erase/);
  assert.match(page, /is-editing/);
  assert.match(page, /markRangeWithSurgery/);
  assert.match(page, /markSelectionWithSurgery/);
  assert.match(page, /splitHighlightForRange/);
  assert.match(page, /normalizedMapForRange/);
  assert.match(page, /subRangeFromNormalizedOffsets/);
  assert.match(page, /applyAssistantMatchHighlights/);
  assert.match(page, /resolveAssistantFocusTarget/);
  assert.match(page, /editingHighlightRef/);
  assert.match(page, /if \(!pending \|\| \(modeRef\.current !== "highlight" && modeRef\.current !== "reading"\)\) return false;/);
  assert.match(page, /\{hasBook && \(/);
  assert.match(page, /Usar la selección como foco de la IA/);
  assert.match(page, /applyToolbarHighlightColor/);
  assert.match(page, /lector-selection-ai/);
  assert.match(page, /openPendingSelectionNote/);
  assert.match(page, /openPendingSelectionFlashcard/);
  assert.match(page, /openEditingHighlightFlashcard/);
  assert.match(page, /runAnnotationAction/);
  assert.match(page, /Crear una nota vinculada al texto seleccionado/);
  assert.match(page, /Crear una flashcard vinculada al texto seleccionado/);
  assert.match(page, /Preguntar a la IA sobre el texto seleccionado/);
  assert.match(studyPanel, /assistant-reference-card/);
  assert.match(studyPanel, /Texto seleccionado/);
  assert.match(studyPanel, /Referencia lista/);
  assert.match(studyPanel, /La IA dará prioridad a esta referencia/);
  assert.match(studyPanel, /assistant-message-user/);
  assert.match(studyPanel, /activeChat\?\.messages\.map/);
  assert.match(studyPanel, /Crear un chat nuevo/);
  assert.match(studyPanel, /Lector · 0 tokens/);
  assert.match(studyPanel, /assistantActionLabel/);
  assert.match(studyPanel, /Basada en la selección/);
  assert.match(studyPanel, /Reproducir esta respuesta en voz alta/);
  assert.match(studyPanel, /Escuchar/);
  assert.match(studyPanel, /Guardar como nota/);
  assert.match(studyPanel, /export type StudyTab = "assistant" \| "notes" \| "flashcards"/);
  assert.match(studyPanel, /Flashcards <i>\{flashcardCount\}<\/i>/);
  assert.doesNotMatch(studyPanel, />Aprendizaje<\/button>/);
  assert.match(studyPanel, /<Icon name="plus" size=\{13\} \/> Escribir nota/);
  assert.match(studyPanel, /<Icon name="plus" size=\{13\} \/> Crear flashcard/);
  assert.doesNotMatch(studyPanel, /requestedNoteKind: ReaderNoteKind/);
  assert.match(studyPanel, /props\.tab === "flashcards" \? "flashcard" : "comment"/);
  assert.doesNotMatch(studyPanel, />Todo <i>/);
  assert.doesNotMatch(studyPanel, /visibleNoteKind === "all"/);
  assert.match(studyPanel, /No se creará nada hasta que lo guardes/);
  assert.match(studyPanel, /props\.onStartNoteDraft\(visibleNoteKind\)/);
  assert.match(studyPanel, /!isComment && <label>Pregunta/);
  assert.match(studyPanel, /isComment \? "Nota" : "Respuesta"/);
  assert.match(studyPanel, /CAPÍTULO ACTUAL/);
  assert.match(studyPanel, /ARCHIVO DEL LIBRO/);
  assert.match(studyPanel, /Ver todas las anotaciones del libro/);
  assert.match(studyPanel, /notes-library-page/);
  assert.match(studyPanel, /StudyOverviewModal/);
  assert.match(studyPanel, /study-overview-dialog/);
  assert.match(studyPanel, /Diseña tu sesión/);
  assert.match(studyPanel, /Preguntas por test/);
  assert.match(studyPanel, /Capítulo completo/);
  assert.match(studyPanel, /Un subtema/);
  assert.match(studyPanel, /onOpenPhase\("pretest"\)/);
  assert.match(studyPanel, /Pre-test/);
  assert.match(studyPanel, /Post-test/);
  assert.match(studyPanel, /Técnica Feynman/);
  assert.match(page, /setStudyOverviewOpen\(true\)/);
  assert.match(studyPanel, /note\.chapterKey === props\.currentChapterKey/);
  assert.match(studyPanel, /onOpenReference\(note\)/);
  assert.match(studyPanel, /Ir al texto →/);
  assert.match(studyPanel, /assistant-created-note/);
  assert.match(studyPanel, /assistantSpeechText/);
  assert.match(studyPanel, /Pregunta\. \$\{note\.front\}\. Respuesta\. \$\{note\.back\}/);
  assert.match(studyPanel, /savedNoteId/);
  assert.match(studyPanel, /Editar sin salir del chat/);
  assert.match(studyPanel, /Guardada automáticamente en/);
  assert.match(studyPanel, /onPracticeFlashcard/);
  assert.match(studyPanel, /Intentar esta flashcard/);
  assert.match(page, /subchapterAnchor/);
  assert.match(page, /rendition\.display\(note\.anchorCfi\)/);
  assert.match(page, /saveChatMessageAsComment/);
  assert.match(page, /openEditingHighlightNote/);
  assert.match(page, /openEditingHighlightAssistant/);
  assert.match(page, /syncHighlightNoteIndicators/);
  assert.match(page, /lector-highlight-note-icon/);
  assert.match(page, /NOTE_REFERENCE_HIGHLIGHT/);
  assert.match(page, /FLASHCARD_REFERENCE_HIGHLIGHT/);
  assert.match(page, /FLASHCARD_REFERENCE_TARGET_HIGHLIGHT/);
  assert.match(page, /lector-note-reference-icon/);
  assert.match(page, /lector-note-kind-flashcard/);
  assert.match(page, /focusNoteReferenceVisual/);
  assert.match(page, /setNamedTextHighlight/);
  assert.match(page, /target\.scrollIntoView/);
  assert.match(page, /lector-note-target/);
  assert.match(page, /--lector-note-halo/);
  assert.match(page, /rgba\(var\(--lector-note-halo\)/);
  assert.match(page, /openLinkedNoteEditor/);
  assert.match(page, /lector-selection-note/);
  assert.match(page, /lector-selection-flashcard/);
  assert.match(page, /highlight-annotation-note/);
  assert.match(page, /highlight-annotation-flashcard/);
  assert.match(page, /lector-study-panel-width/);
  assert.match(page, /clearBookAnnotations/);
  assert.match(notesRoute, /eq\(readerNotes\.bookKey, bookKey\)/);
  assert.match(notesRoute, /payload\.kind === "comment"/);
  assert.match(notesRoute, /detachHighlightId/);
  assert.match(page, /detachHighlightId: highlightId/);
  assert.match(schema, /anchorLabel: text\("anchor_label"\)/);
  assert.match(schema, /anchorCfi: text\("anchor_cfi"\)/);
  assert.match(schema, /highlightId: text\("highlight_id"\)/);
  assert.match(notesMigration, /ADD `kind` text DEFAULT 'flashcard' NOT NULL/);
  assert.match(notesMigration, /ADD `anchor_label` text/);
  assert.match(notesMigration, /ADD `anchor_cfi` text/);
  assert.match(noteLinkMigration, /ADD `highlight_id` text/);
  assert.match(page, /speakAssistantMessage/);
  assert.match(page, /assistantSpeechMessageIdRef/);
  assert.match(page, /assistantSpeechPaused/);
  assert.match(studyPanel, /Pausar/);
  assert.match(studyPanel, /Reanudar/);
  assert.match(studyPanel, /onStopAssistantSpeech/);
  assert.match(studyPanel, /Detener audio de esta respuesta/);
  assert.match(page, /utterance\.volume = speechVolumeRef\.current/);
  assert.doesNotMatch(studyPanel, /context-chip-focus/);
  assert.match(page, /lectorStudy/);
  assert.match(page, /addEventListener\("contextmenu"/);
  assert.match(page, /addEventListener\("mousedown"/);
  assert.match(page, /rightVoiceHeld/);
  assert.match(page, /\(event as MouseEvent\)\.button === 2/);
  assert.match(page, /startPushToTalkRef\.current/);
  assert.doesNotMatch(page, /assistantFocusPosition/);
  assert.doesNotMatch(page, /pendingAssistantFocus/);
  assert.doesNotMatch(page, /source: "paragraph"/);
  assert.doesNotMatch(page, /assistantSelectionCapturedAtRef/);
  assert.match(page, /setSpeechRateFromControl/);
  assert.match(page, /type="range"/);
  assert.match(page, /lector-speech-rate/);
  assert.match(page, /lector-speech-volume/);
  assert.match(page, /audio-volume-popover/);
  assert.match(page, /audio-volume-trigger/);
  assert.match(styles, /\.audio-volume-popover:hover \.audio-volume-control/);
  // El volumen se despliega animando el ancho y fuera del flujo, para no encoger al selector de voz.
  assert.match(styles, /\.audio-volume-control \{[^}]*position: absolute;/);
  assert.match(styles, /\.audio-volume-control \{[^}]*width: 0;/);
  assert.match(styles, /\.audio-volume-control \{[^}]*transition: width \.22s/);
  assert.match(styles, /\.audio-volume-control \{[^}]*pointer-events: none;/);
  assert.match(styles, /\.audio-volume-popover:hover \.audio-volume-control, \.audio-volume-popover:focus-within \.audio-volume-control \{ width: 196px;/);
  assert.match(styles, /\.audio-volume-control input, \.audio-rate-control input \{[^}]*height: 28px;/);
  assert.match(styles, /var\(--slider-fill, 100%\)/);
  assert.match(page, /"--slider-fill": `\$\{Math\.round\(speechVolume \* 100\)\}%`/);
  assert.match(page, /lector-boost-speech-rate/);
  assert.match(page, /lector-hold-speech-rate/);
  // La velocidad usa el mismo desplegable: multiplicador fijo y barra horizontal fuera del flujo.
  assert.match(page, /audio-rate-popover/);
  assert.match(page, /audio-rate-trigger/);
  assert.match(page, /"--slider-fill": `\$\{Math\.round\(\(\(speechRate - 0\.5\) \/ 1\.5\) \* 100\)\}%`/);
  assert.match(styles, /\.audio-rate-control \{[^}]*position: absolute;/);
  assert.match(styles, /\.audio-rate-control \{[^}]*width: 0;/);
  assert.match(styles, /\.audio-rate-control \{[^}]*transition: width \.22s/);
  assert.match(styles, /\.audio-rate-control \{[^}]*pointer-events: none;/);
  assert.match(styles, /\.audio-rate-popover:hover \.audio-rate-control, \.audio-rate-popover:focus-within \.audio-rate-control \{ width: 196px;/);
  assert.doesNotMatch(styles, /writing-mode: vertical-lr/);
  assert.match(styles, /\.push-to-talk \.mic-icon[^}]*border-radius: 50%/);
  assert.match(settings, /SHORTCUT_ACTIONS/);
  assert.match(settings, /Atajos de teclado/);
  assert.match(settings, /Fragmento hablado anterior/);
  assert.match(settings, /Repetir fragmento hablado/);
  assert.match(settings, /Fragmento hablado siguiente/);
  assert.match(settings, /speed_boost/);
  assert.match(settings, /speed_boost: "KeyA"/);
  assert.match(page, /speedShortcutHeldRef/);
  assert.match(page, /target\?\.closest\("input, textarea, select, \[contenteditable='true'\]"\)/);
  assert.doesNotMatch(page, /input, button, textarea, select/);
  assert.match(page, /setTemporarySpeedBoost\(true\)/);
  assert.match(page, /setTemporarySpeedBoost\(false\)/);
  assert.doesNotMatch(settings, /Aceleración al mantener clic/);
  assert.doesNotMatch(page, /let holdTimer/);
  assert.match(page, /parseReadingParagraphVoiceCommand/);
  assert.match(page, /applyAssistantSelectionHighlight/);
  assert.match(page, /focusSavedHighlightForAssistant/);
  assert.match(page, /assistantFocusHighlightIdRef/);
  assert.match(page, /requestedDirectColor \|\| intendedTask === "ai_highlight"/);
  assert.match(page, /focusPendingSelectionForAssistant\(false\)/);
  assert.match(page, /kind: result\.note\.kind|\.\.\.result\.note/);
  assert.match(page, /if \(!requestedDirectColor && intendedTask !== "ai_highlight"\)/);
  assert.match(page, /provider: "reader"/);
  assert.match(contextBuilder, /HISTORIAL DEL CHAT ACTUAL/);
  assert.match(page, /changeReaderLayout/);
  assert.match(page, /scrolled-doc/);
  assert.match(page, /lector-reader-layout/);
  assert.match(page, /className="reader-stage-actions"/);
  assert.match(page, /className="topbar-mode-switch"/);
  assert.match(page, /className="reader-stage-layout"/);
  assert.match(page, /className=\{`reader-stage-study/);
  assert.match(styles, /\.reader-stage-actions/);
  assert.match(page, /className="topbar-actions"/);
  assert.doesNotMatch(page, /className="layout-switch sidebar-segment"/);
  assert.doesNotMatch(page, /className="mode-switch sidebar-segment"/);
  assert.match(page, /leftSidebarOpen/);
  assert.match(page, /lector-left-sidebar-width/);
  assert.match(page, /book-rail-resizer/);
  assert.match(page, /without-book-rail/);
  assert.match(page, /reader-navigation/);
  assert.match(page, /IA — Preguntar sobre el libro/);
  assert.match(page, /Repasar flashcards/);
  assert.match(page, /Pizarra de notas/);
  assert.match(page, /profile-button/);
  assert.match(page, /Perfil del lector/);
  assert.match(page, /flattenBookToc/);
  assert.match(page, /bookDetails\.tocEntries\.map/);
  assert.match(page, /rendition\.display\(entry\.href\)/);
  assert.match(styles, /\.chapter-list button/);
  assert.match(page, /rendition\.resize/);
  assert.match(page, /Ocultar panel izquierdo/);
  assert.match(page, /Ocultar panel de herramientas/);
  assert.doesNotMatch(page, /\^\(play\|reproduce\|reproducir\)/);
  assert.match(page, /continua\|continuar\|reanuda/);
  assert.match(page, /getPreviousCursor/);
  assert.match(page, /Fragmento anterior/);
  assert.match(page, /Fragmento siguiente/);
  assert.match(page, /Comenzar lectura/);
  assert.match(page, /page-turn-next/);
  assert.match(page, /Ir a la página siguiente/);
  assert.match(page, /markNativeSelection/);
  assert.match(page, /selectionForDocument/);
  assert.match(page, /defaultView\?\.getSelection\(\)/);
  assert.doesNotMatch(page, /document\.getSelection\(\)/);
  assert.match(page, /intersectsNode/);
  assert.match(page, /applyReaderModeToDocument/);
  assert.match(page, /lector-highlights:/);
  assert.match(page, /highlight-swatches/);
  assert.doesNotMatch(page, /clic sobre un subrayado abre sus acciones/);
  assert.match(page, /highlightId && \(!selection \|\| selection\.isCollapsed\)/);
  assert.doesNotMatch(page, /addEventListener\("dblclick"/);
  assert.doesNotMatch(page, /Subrayado ·/);
  assert.match(page, /mouseup/);
  assert.match(page, /pointerup/);
  assert.doesNotMatch(page, /pulsa un color o IA/);
  assert.match(page, /lector-selection-palette/);
  assert.match(page, /selectionPaletteTimer/);
  assert.match(page, /180/);
  assert.match(page, /Acciones para el texto seleccionado/);
  assert.match(page, /pointerAnchor/);
  assert.match(page, /showPendingHighlightPalette/);
  assert.match(page, /dismissPendingHighlightSelection\(\);/);
  assert.match(page, /highlightPalettePosition/);
  assert.match(page, /viewerRect\?\.left/);
  assert.match(page, /HIGHLIGHT_COLORS\.map/);
  assert.doesNotMatch(page, /hostDocument\.body\.appendChild\(palette\)/);
  assert.match(page, /highlightUndoRef/);
  assert.match(page, /highlightRedoRef/);
  assert.match(page, /Deshacer último subrayado/);
  assert.match(page, /Rehacer último subrayado/);
  assert.match(page, /toggleEraser/);
  assert.match(page, /\^\(borrar\|borra\)\$/);
  assert.match(page, /> Borrar/);
  assert.match(page, /eraseHighlight/);
  assert.match(page, /lectorEraser/);
  assert.match(page, /exportHighlightedEpub/);
  assert.match(page, /Descargar EPUB subrayado/);
  assert.match(page, /application\/epub\+zip/);
  assert.doesNotMatch(page, /\/api\/speech/);
  assert.match(page, /webkitSpeechRecognition/);
  assert.match(page, /tryRunImmediateVoiceCommand/);
  assert.match(page, /recognitionReleaseRequestedRef\.current && tryRunImmediateVoiceCommand\(combined\)/);
  assert.match(page, /if \(handledImmediately\) recognitionRef\.current\?\.abort\(\)/);
  assert.match(page, /wasHandledImmediately/);
  assert.match(page, /maxAlternatives = 1/);
  assert.match(page, /result\.isFinal/);
  assert.match(page, /navigator\.language/);
  assert.match(page, /recognition\.lang = browserLanguage/);
  assert.match(page, /Ocultar transcripción/);
  assert.doesNotMatch(page, /comandoUsuario|__activeTtsUtterance/);
  assert.match(page, /application\/epub\+zip/);
  assert.match(page, /requestAssistant/);
  assert.match(page, /assistantAbortControllerRef/);
  assert.match(page, /Cancelar IA/);
  assert.match(page, /controller\.abort\(\)/);
  assert.match(page, /editingHighlight\?\.id/);
  assert.match(page, /ensureChapterAnalysis/);
  assert.match(page, /ensureChapterAnalysisRef\.current\(chapter\)/);
  assert.match(page, /taskUsesSelection/);
  assert.match(page, /savedNoteId: savedNote\.id/);
  assert.match(page, /queryBookIndex/);
  assert.match(page, /reader-position/);
  assert.match(page, /sectionPositionRef/);
  assert.match(page, /rememberedPosition/);
  assert.match(page, /contentHash/);
  assert.doesNotMatch(assistantRoute, /chapter\.text/);
  assert.match(analysisRoute, /payload\.chapter\.text/);
  assert.match(contextBuilder, /TASK_INPUT_BUDGETS/);
  assert.match(contextBuilder, /maxReadSectionIndex/);
  assert.match(page, /Exportar Anki CSV|exportNotes/);
  assert.match(page, /book\.spine\.each/);
  assert.doesNotMatch(page, /spine\.forEach/);
  assert.match(page, /if \(!studyModeRef\.current\) return true/);
  assert.match(page, /studyModeRef\.current && !saved\.pretest/);
  assert.match(page, /skipLearningActivity/);
  assert.match(page, /skipped: true/);
  assert.match(page, /learningSubmissionRef/);
  const [learningModal, flashcardsPage, whiteboardPage, studyPlanner] = await Promise.all([
    readFile(new URL("../app/learning-modal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/flashcards-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/whiteboard-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/study-planner.ts", import.meta.url), "utf8"),
  ]);
  assert.match(learningModal, /Omitir y comenzar/);
  assert.match(learningModal, /Omitir y continuar/);
  assert.match(learningModal, /Omitir y avanzar/);
  assert.doesNotMatch(learningModal, /Descargar para Anki/);
  assert.match(learningModal, /Agregar al deck/);
  assert.match(learningModal, /onAddQuestionToDeck\(question\.id\)/);
  assert.match(learningModal, /Responder con IA/);
  assert.match(learningModal, /Editar esta pregunta/);
  assert.match(learningModal, /onQuestionPromptChange/);
  assert.match(learningModal, /onAnswerWithAI/);
  assert.match(learningModal, /Dictar esta respuesta/);
  assert.match(learningModal, /Reintentar esta pregunta/);
  assert.match(learningModal, /Reintentar este test/);
  assert.match(learningModal, /webkitSpeechRecognition/);
  assert.match(learningModal, /learning-modal-close/);
  assert.match(studyPlanner, /questionCount: 3/);
  assert.match(studyPlanner, /Math\.min\(8, Math\.max\(1/);
  assert.match(studyPlanner, /scope: "chapter" \| "subtopic"/);
  assert.match(studyPlanner, /buildFeynmanQuestion/);
  assert.match(flashcardsPage, /Otra vez/);
  assert.match(flashcardsPage, /Difícil/);
  assert.match(flashcardsPage, /Exportar Anki/);
  assert.match(flashcardsPage, /Editar flashcard/);
  assert.match(flashcardsPage, /Responder la pregunta/);
  assert.match(flashcardsPage, /Reformular respuesta/);
  assert.doesNotMatch(flashcardsPage, /Reformular toda la flashcard/);
  assert.match(flashcardsPage, /Rehacer toda la flashcard/);
  assert.match(flashcardsPage, /assistEditor\("regenerate"\)/);
  assert.match(flashcardsPage, /onAssistCard/);
  assert.match(flashcardsPage, /initialCardId/);
  assert.match(flashcardsPage, /Intentar esta flashcard/);
  assert.match(flashcardsPage, /browser-card-reference/);
  assert.match(flashcardsPage, /reference-reader-dialog/);
  assert.match(flashcardsPage, /REFERENCIA DEL EPUB/);
  assert.match(flashcardsPage, /lector-review:/);
  assert.match(whiteboardPage, /Pizarra de notas/);
  assert.match(whiteboardPage, /Metanota/);
  assert.match(whiteboardPage, /Pizarra de notas y flashcards/);
  assert.match(whiteboardPage, /"Conectar"/);
  assert.match(whiteboardPage, /board-origin-edge/);
  assert.match(whiteboardPage, /lector-whiteboard:/);
  assert.match(styles, /\.knowledge-page/);
  assert.match(styles, /\.flashcard-ai-tools/);
  assert.match(page, /generateReferenceFlashcard/);
  assert.match(page, /Crea una flashcard a partir de este fragmento seleccionado/);
  assert.match(page, /noteDraftAIBusy/);
  assert.match(page, /assistCurrentNoteDraftWithAI/);
  assert.match(page, /regenerateCurrentFlashcardWithAI/);
  assert.match(page, /action === "regenerate"/);
  assert.match(page, /Conserva literalmente esta pregunta de flashcard/);
  assert.match(page, /topbar-font-control/);
  assert.doesNotMatch(page, /className="sidebar-font-control"/);
  assert.match(studyPanel, /Crear nota con IA/);
  assert.match(studyPanel, /Rehacer respuesta con IA/);
  assert.match(studyPanel, /Rehacer toda la flashcard/);
  assert.match(styles, /\.whiteboard-canvas/);
  assert.match(page, /handleVoiceCommand/);
  assert.match(page, /parseReadingChunkVoiceCommand/);
  assert.match(page, /preserveViewport/);
  assert.match(page, /if \(preserveViewport\) return;/);
  assert.match(page, /activateParagraphRef\.current\(cursor, sentenceIndex, true\)/);
  assert.match(page, /abrir\|abre\|mostrar\|muestra\|ver/);
  assert.match(page, /empieza\|empezar\|comienza\|comenzar/);
  assert.doesNotMatch(page, /assistantCommandRef/);
  assert.match(layout, /openGraph/);
  assert.match(layout, /\/og\.png/);
  assert.doesNotMatch(layout, /codex-preview|Starter Project/);

  await assert.rejects(access(new URL("app/_sites-preview", projectRoot)));
});
