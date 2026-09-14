"use client";

import type { ReactElement } from "react";

/*
 * Iconografía del lector: trazos de 1.5 px sobre una rejilla de 20×20 para que
 * todos los símbolos compartan peso, esquinas redondeadas y tamaño óptico.
 * Sustituye a los caracteres unicode que se usaban antes como iconos.
 */
export type IconName =
  | "menu"
  | "panelLeft"
  | "panelRight"
  | "book"
  | "bookOpen"
  | "plus"
  | "minus"
  | "play"
  | "pause"
  | "stop"
  | "chevronLeft"
  | "chevronRight"
  | "arrowLeft"
  | "arrowRight"
  | "list"
  | "highlighter"
  | "note"
  | "cards"
  | "sparkles"
  | "download"
  | "sliders"
  | "archive"
  | "lock"
  | "volume"
  | "mic"
  | "undo"
  | "redo"
  | "eraser"
  | "close"
  | "check"
  | "alert"
  | "sun"
  | "moon"
  | "droplet"
  | "grip"
  | "target"
  | "board"
  | "link"
  | "send"
  | "speaker";

const PATHS: Record<IconName, ReactElement> = {
  menu: <path d="M3.25 5.75h13.5M3.25 10h13.5M3.25 14.25h13.5" />,
  panelLeft: <><rect x="2.75" y="3.75" width="14.5" height="12.5" rx="2.25" /><path d="M7.75 3.75v12.5" /></>,
  panelRight: <><rect x="2.75" y="3.75" width="14.5" height="12.5" rx="2.25" /><path d="M12.25 3.75v12.5" /><path d="M5.6 7.6h3.6M5.6 10.6h3.6" /></>,
  book: <><path d="M4 4.25A1.5 1.5 0 0 1 5.5 2.75h9.25a.75.75 0 0 1 .75.75v12.25a.75.75 0 0 1-.75.75H5.5A1.5 1.5 0 0 1 4 15V4.25Z" /><path d="M7 6.25h5.25M7 9h5.25" /></>,
  bookOpen: <><path d="M10 5.5C8.6 4.4 6.9 3.9 4.6 4a.85.85 0 0 0-.85.85v8.4c0 .48.4.86.88.85 2.1-.06 3.7.4 5.37 1.65 1.67-1.25 3.27-1.71 5.37-1.65a.86.86 0 0 0 .88-.85v-8.4A.85.85 0 0 0 15.4 4c-2.3-.1-4 .4-5.4 1.5Z" /><path d="M10 5.5v10.25" /></>,
  plus: <path d="M10 4.25v11.5M4.25 10h11.5" />,
  minus: <path d="M4.5 10h11" />,
  play: <path d="M7.4 4.6l7.1 4.68a.85.85 0 0 1 0 1.44L7.4 15.4a.85.85 0 0 1-1.32-.72V5.32a.85.85 0 0 1 1.32-.72Z" fill="currentColor" stroke="none" />,
  pause: <path d="M6.4 4.4h2.1a.6.6 0 0 1 .6.6v10a.6.6 0 0 1-.6.6H6.4a.6.6 0 0 1-.6-.6V5a.6.6 0 0 1 .6-.6Zm5.1 0h2.1a.6.6 0 0 1 .6.6v10a.6.6 0 0 1-.6.6h-2.1a.6.6 0 0 1-.6-.6V5a.6.6 0 0 1 .6-.6Z" fill="currentColor" stroke="none" />,
  stop: <rect x="5.6" y="5.6" width="8.8" height="8.8" rx="1.6" fill="currentColor" stroke="none" />,
  chevronLeft: <path d="M12.25 4.75 6.75 10l5.5 5.25" />,
  chevronRight: <path d="M7.75 4.75 13.25 10l-5.5 5.25" />,
  arrowLeft: <path d="M15.25 10H4.75m0 0 4.5-4.5m-4.5 4.5 4.5 4.5" />,
  arrowRight: <path d="M4.75 10h10.5m0 0-4.5-4.5m4.5 4.5-4.5 4.5" />,
  list: <><path d="M7.25 5.5h9M7.25 10h9M7.25 14.5h9" /><path d="M3.9 5.5h.01M3.9 10h.01M3.9 14.5h.01" strokeWidth="1.9" /></>,
  highlighter: <><path d="M12.4 3.9a1.6 1.6 0 0 1 2.26 0l1.44 1.44a1.6 1.6 0 0 1 0 2.26l-6.3 6.3-3.7.72.72-3.7 5.58-7.02Z" /><path d="M11.1 5.5l3.4 3.4M5.25 16.6h6" /></>,
  note: <><rect x="3.75" y="3.75" width="12.5" height="12.5" rx="2.25" /><path d="M6.9 7.75h6.2M6.9 10.5h6.2M6.9 13.25h3.6" /></>,
  cards: <><rect x="2.75" y="5.9" width="10.4" height="9.35" rx="1.9" /><path d="M6.2 3.9h8.05a2 2 0 0 1 2 2v7.3" /></>,
  sparkles: <><path d="M8.4 3.5l1.1 3.06 3.05 1.1-3.05 1.1-1.1 3.06-1.1-3.06-3.05-1.1 3.05-1.1L8.4 3.5Z" /><path d="M14.2 11.4l.62 1.7 1.7.62-1.7.62-.62 1.7-.62-1.7-1.7-.62 1.7-.62.62-1.7Z" /></>,
  download: <path d="M10 3.75v7.9m0 0 3.1-3.05M10 11.65 6.9 8.6M4.4 13.4v1.35a1.5 1.5 0 0 0 1.5 1.5h8.2a1.5 1.5 0 0 0 1.5-1.5V13.4" />,
  sliders: <><path d="M3.5 6.6h4.4M11.6 6.6h4.9M3.5 13.4h6.4M13.6 13.4h2.9" /><circle cx="9.75" cy="6.6" r="1.85" /><circle cx="11.75" cy="13.4" r="1.85" /></>,
  archive: <><rect x="3.25" y="4.25" width="13.5" height="3.4" rx="1.2" /><path d="M4.6 7.65v7a1.5 1.5 0 0 0 1.5 1.5h7.8a1.5 1.5 0 0 0 1.5-1.5v-7" /><path d="M8.25 11h3.5" /></>,
  lock: <><rect x="4.4" y="8.6" width="11.2" height="7.4" rx="2.1" /><path d="M7.15 8.6V6.9a2.85 2.85 0 0 1 5.7 0v1.7" /></>,
  volume: <><path d="M4.25 8.1h2.1l3.3-2.85a.6.6 0 0 1 1 .46v8.58a.6.6 0 0 1-1 .46L6.35 11.9h-2.1a.6.6 0 0 1-.6-.6V8.7a.6.6 0 0 1 .6-.6Z" /><path d="M13.4 7.6a3.6 3.6 0 0 1 0 4.8M15.6 5.7a6.4 6.4 0 0 1 0 8.6" /></>,
  mic: <><rect x="7.6" y="2.9" width="4.8" height="8.2" rx="2.4" /><path d="M4.9 9.6a5.1 5.1 0 0 0 10.2 0M10 14.7v2.4" /></>,
  undo: <path d="M6.4 8.6H12a3.7 3.7 0 0 1 0 7.4H8.2M6.4 8.6l2.9-2.9M6.4 8.6l2.9 2.9" />,
  redo: <path d="M13.6 8.6H8a3.7 3.7 0 0 0 0 7.4h3.8M13.6 8.6l-2.9-2.9M13.6 8.6l-2.9 2.9" />,
  eraser: <><path d="M9.1 15.9H5.5L3.4 13.8a1.3 1.3 0 0 1 0-1.84l6.7-6.7a1.3 1.3 0 0 1 1.84 0l3.36 3.36a1.3 1.3 0 0 1 0 1.84l-6.2 6.2" /><path d="M6.6 9.1l4.4 4.4M6.2 16h9.9" /></>,
  close: <path d="M5.4 5.4l9.2 9.2M14.6 5.4l-9.2 9.2" />,
  check: <path d="M4.6 10.4l3.5 3.5 7.3-7.9" />,
  alert: <><path d="M8.72 3.9a1.48 1.48 0 0 1 2.56 0l5.1 8.86a1.48 1.48 0 0 1-1.28 2.22H4.9a1.48 1.48 0 0 1-1.28-2.22L8.72 3.9Z" /><path d="M10 7.6v3.1M10 13.1h.01" strokeWidth="1.8" /></>,
  sun: <><circle cx="10" cy="10" r="3.4" /><path d="M10 2.9v1.7M10 15.4v1.7M2.9 10h1.7M15.4 10h1.7M4.98 4.98l1.2 1.2M13.82 13.82l1.2 1.2M15.02 4.98l-1.2 1.2M6.18 13.82l-1.2 1.2" /></>,
  moon: <path d="M15.7 12.4A6.3 6.3 0 0 1 7.6 4.3a6.4 6.4 0 1 0 8.1 8.1Z" />,
  droplet: <path d="M10 3.4c2.4 2.3 4.4 4.6 4.4 7.1a4.4 4.4 0 1 1-8.8 0c0-2.5 2-4.8 4.4-7.1Z" />,
  grip: <path d="M7.6 5.5h.01M12.4 5.5h.01M7.6 10h.01M12.4 10h.01M7.6 14.5h.01M12.4 14.5h.01" strokeWidth="2.1" />,
  target: <><circle cx="10" cy="10" r="6.1" /><circle cx="10" cy="10" r="2.2" /><path d="M10 1.9v2.2M10 15.9v2.2M1.9 10h2.2M15.9 10h2.2" /></>,
  board: <><rect x="2.75" y="3.9" width="14.5" height="10.2" rx="2" /><path d="M6.6 16.6l1.7-2.5M13.4 16.6l-1.7-2.5M6.4 7.4h3.1M6.4 10.6h6.1" /></>,
  link: <><path d="M8.4 11.6l3.2-3.2" /><path d="M7.2 8.7 6 9.9a2.9 2.9 0 0 0 4.1 4.1l1.2-1.2M12.8 11.3l1.2-1.2a2.9 2.9 0 0 0-4.1-4.1L8.7 7.2" /></>,
  send: <path d="M16.4 4.1 3.9 8.55c-.62.22-.6 1.1.03 1.29l4.53 1.35 1.35 4.53c.19.63 1.07.65 1.29.03L16.4 4.1Z" />,
  speaker: <><path d="M5 8.2h1.9l2.9-2.5a.55.55 0 0 1 .9.42v7.76a.55.55 0 0 1-.9.42L6.9 11.8H5a.55.55 0 0 1-.55-.55V8.75A.55.55 0 0 1 5 8.2Z" /><path d="M13.3 8a3.2 3.2 0 0 1 0 4" /></>,
};

export function Icon({ name, className, size = 16 }: { name: IconName; className?: string; size?: number }) {
  return (
    <svg
      className={className ? `lector-icon ${className}` : "lector-icon"}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
