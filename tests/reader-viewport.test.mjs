import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { captureReaderViewport, restoreReaderViewport, sameReaderViewport } from "../app/reader-viewport.ts";

const rect = (left, top, width = 8, height = 18) => ({ left, top, width, height, right: left + width, bottom: top + height });

function fixture() {
  const container = { scrollTop: 0, scrollLeft: 0, style: {}, getBoundingClientRect: () => rect(0, 100, 200, 200) };
  const node = (length, top, icon = false) => ({ length, top, left: 12, parentElement: { closest: () => icon ? {} : null } });
  const nodes = [node(10, -30), node(1, 0, true), node(30, 20)];
  const block = { dataset: { lectorCfi: "epubcfi(/6/2!/4/2)" }, getClientRects: () => [rect(0, -30, 200, 70)] };
  const document = {
    querySelectorAll: () => [block],
    createTreeWalker: () => { let i = 0; return { nextNode: () => nodes[i++] }; },
    createRange: () => {
      let current; let start = 0;
      return {
        selectNodeContents(value) { current = value; start = 0; },
        setStart(value, offset) { current = value; start = offset; },
        setEnd() {},
        getClientRects() { return [this.getBoundingClientRect()]; },
        getBoundingClientRect() { return rect(current.left + start * 8, current.top); },
      };
    },
  };
  block.ownerDocument = document;
  const contents = { document, sectionIndex: 0, window: { frameElement: {
    getBoundingClientRect: () => rect(-container.scrollLeft, 100 - container.scrollTop, 200, 2000),
  } } };
  const rendition = { getContents: () => [contents], layout: (...args) => { assert.equal(args.length, 0, "layout must be read without resetting it"); return { delta: 400 }; } };
  const viewer = { querySelector: () => container };
  return { viewer, rendition, container, nodes };
}

test("captures visible text and skips annotation icons when counting offsets", () => {
  const { viewer, rendition } = fixture();
  assert.deepEqual(captureReaderViewport(viewer, rendition), {
    sectionIndex: 0, cfi: "epubcfi(/6/2!/4/2)", textOffset: 10, top: 20,
  });
});

test("restores the same text offset after vertical reflow, without native double anchoring", () => {
  const { viewer, rendition, container, nodes } = fixture();
  const anchor = captureReaderViewport(viewer, rendition);
  nodes[2].top = 520;
  restoreReaderViewport(viewer, rendition, anchor, true);
  assert.equal(container.scrollTop, 500);
  assert.equal(container.style.overflowAnchor, "none");
  restoreReaderViewport(viewer, rendition, anchor, true);
  assert.equal(container.scrollTop, 500, "restoration must be idempotent");
});

test("paginated restoration selects the spread containing the original character", () => {
  const { viewer, rendition, container, nodes } = fixture();
  const anchor = captureReaderViewport(viewer, rendition);
  nodes[2].left = 890;
  container.scrollLeft = 400;
  restoreReaderViewport(viewer, rendition, anchor, false);
  assert.equal(container.scrollLeft, 800);
});

test("panel-only reflow can retain its anchor, but reading movement invalidates it", () => {
  const { viewer, rendition } = fixture();
  const anchor = captureReaderViewport(viewer, rendition);
  assert.equal(sameReaderViewport(anchor, { ...anchor, top: 20.4 }), true);
  for (const changes of [{ top: 24 }, { textOffset: 11 }, { cfi: "other" }, { sectionIndex: 1 }]) {
    assert.equal(sameReaderViewport(anchor, { ...anchor, ...changes }), false);
  }
  assert.equal(sameReaderViewport(null, null), false);
});

test("missing content does not cause a jump or crash", () => {
  const { viewer, rendition, container } = fixture();
  rendition.getContents = () => [];
  assert.equal(captureReaderViewport(viewer, rendition), null);
  restoreReaderViewport(viewer, rendition, { sectionIndex: 0, cfi: "missing", textOffset: 0, top: 0 }, true);
  assert.equal(container.scrollTop, 0);
});

test("selection notes reuse the editor without duplicating it in the sidebar", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const editor = await readFile(new URL("../app/floating-note-editor.tsx", import.meta.url), "utf8");
  assert.match(page, /noteDraft=\{floatingNotePosition \? null : noteDraft\}/);
  assert.match(page, /onBeginEdit=\{editFloatingNote\}/);
  assert.match(page, /restoredViewportRef/);
  assert.match(editor, /aria-modal="false"/);
  assert.match(editor, /preventScroll: true/);
});
