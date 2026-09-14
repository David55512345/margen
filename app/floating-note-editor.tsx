"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export type FloatingNotePosition = { left: number; top: number };

/** A non-modal editor: opening it never changes the book's available width. */
export function FloatingNoteEditor({ position, onClose, busy, children }: {
  position: FloatingNotePosition;
  onClose: () => void;
  busy: boolean;
  children: ReactNode;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState(position);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const place = () => {
      const bounds = frame.getBoundingClientRect();
      const next = {
        left: Math.max(12, Math.min(position.left, window.innerWidth - bounds.width - 12)),
        top: Math.max(12, Math.min(position.top, window.innerHeight - bounds.height - 12)),
      };
      setPlacement((current) => current.left === next.left && current.top === next.top ? current : next);
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(frame);
    window.addEventListener("resize", place);
    frame.querySelector<HTMLTextAreaElement>("textarea")?.focus({ preventScroll: true });
    return () => { observer.disconnect(); window.removeEventListener("resize", place); };
  }, [position]);

  return (
    <div ref={frameRef} className="floating-note-editor" style={placement}
      role="dialog" aria-label="Nota del fragmento seleccionado" aria-modal="false"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape" && !busy) { event.preventDefault(); onClose(); }
      }}>
      {children}
    </div>
  );
}
