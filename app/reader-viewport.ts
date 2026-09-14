import type { Contents, Rendition } from "epubjs";

export type ReaderViewportAnchor = {
  sectionIndex: number;
  cfi: string;
  textOffset: number;
  top: number;
};

export function sameReaderViewport(a: ReaderViewportAnchor | null, b: ReaderViewportAnchor | null) {
  return Boolean(a && b && a.sectionIndex === b.sectionIndex && a.cfi === b.cfi
    && a.textOffset === b.textOffset && Math.abs(a.top - b.top) < 1);
}

function contentList(rendition: Rendition): Contents[] {
  const contents = rendition.getContents() as unknown as Contents | Contents[] | undefined;
  return contents ? Array.isArray(contents) ? contents : [contents] : [];
}

function textNodes(element: Element): Text[] {
  const walker = element.ownerDocument.createTreeWalker(element, 4);
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.parentElement?.closest(".lector-highlight-note-icon, .lector-note-reference-icon, script, style")) nodes.push(node as Text);
  }
  return nodes;
}

function iframeRect(contents: Contents) {
  return contents.window.frameElement?.getBoundingClientRect();
}

/** Capture visible text, not the delayed location last reported by epub.js. */
export function captureReaderViewport(viewer: HTMLElement, rendition: Rendition): ReaderViewportAnchor | null {
  const viewport = (viewer.querySelector(".epub-container") ?? viewer).getBoundingClientRect();
  for (const contents of contentList(rendition)) {
    const frame = iframeRect(contents);
    if (!frame) continue;
    const visible = (rect: DOMRect) => rect.width > 0 && rect.height > 0
      && rect.bottom + frame.top > viewport.top + 1 && rect.top + frame.top < viewport.bottom
      && rect.right + frame.left > viewport.left && rect.left + frame.left < viewport.right;
    for (const block of contents.document.querySelectorAll<HTMLElement>("[data-lector-cfi]")) {
      if (!Array.from(block.getClientRects()).some(visible)) continue;
      let offset = 0;
      for (const node of textNodes(block)) {
        const range = contents.document.createRange();
        range.selectNodeContents(node);
        if (Array.from(range.getClientRects()).some(visible)) {
          // Chunk first, then locate the first visible character within that chunk.
          for (let start = 0; start < node.length; start += 32) {
            range.setStart(node, start);
            range.setEnd(node, Math.min(start + 32, node.length));
            if (!Array.from(range.getClientRects()).some(visible)) continue;
            for (let index = start; index < Math.min(start + 32, node.length); index++) {
              range.setStart(node, index);
              range.setEnd(node, index + 1);
              const rect = Array.from(range.getClientRects()).find(visible);
              if (rect) return { sectionIndex: contents.sectionIndex, cfi: block.dataset.lectorCfi!, textOffset: offset + index, top: rect.top + frame.top - viewport.top };
            }
          }
        }
        offset += node.length;
      }
    }
  }
  return null;
}

export function restoreReaderViewport(viewer: HTMLElement, rendition: Rendition, anchor: ReaderViewportAnchor, scroll: boolean) {
  const contents = contentList(rendition).find((item) => item.sectionIndex === anchor.sectionIndex);
  const container = viewer.querySelector<HTMLElement>(".epub-container");
  if (!contents || !container) return;
  // The reader restores a text anchor itself. Native scroll anchoring would
  // apply a second offset when epub.js updates the iframe height after reflow.
  container.style.overflowAnchor = "none";
  const block = Array.from(contents.document.querySelectorAll<HTMLElement>("[data-lector-cfi]"))
    .find((item) => item.dataset.lectorCfi === anchor.cfi);
  const frame = iframeRect(contents);
  if (!block || !frame) return;
  let remaining = anchor.textOffset;
  for (const node of textNodes(block)) {
    if (remaining >= node.length) { remaining -= node.length; continue; }
    const range = contents.document.createRange();
    range.setStart(node, remaining);
    range.setEnd(node, Math.min(remaining + 1, node.length));
    const rect = range.getBoundingClientRect();
    const viewport = container.getBoundingClientRect();
    if (scroll) {
      container.scrollTop += rect.top + frame.top - viewport.top - anchor.top;
    } else {
      const layout = (rendition.layout as (settings?: unknown) => { delta?: number })();
      const delta = Number(layout?.delta) || viewport.width;
      if (delta > 0) {
        const x = container.scrollLeft + rect.left + frame.left - viewport.left;
        container.scrollLeft = Math.floor(Math.max(0, x) / delta) * delta;
      }
    }
    return;
  }
}
