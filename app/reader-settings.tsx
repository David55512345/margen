"use client";

import { useEffect, useState } from "react";
import { findShortcutConflict } from "./shortcut-bindings";

export const SHORTCUT_ACTIONS = [
  { id: "open_book", label: "Abrir o cambiar EPUB", group: "Archivo" },
  { id: "open_settings", label: "Abrir Settings", group: "Archivo" },
  { id: "toggle_left_sidebar", label: "Mostrar u ocultar biblioteca", group: "Paneles" },
  { id: "open_assistant", label: "Abrir IA", group: "Paneles" },
  { id: "open_notes", label: "Abrir notas", group: "Paneles" },
  { id: "toggle_right_panel", label: "Mostrar u ocultar panel derecho", group: "Paneles" },
  { id: "toggle_study", label: "Activar o salir de Estudio", group: "Paneles" },
  { id: "layout_paginated", label: "Vista Página", group: "Lectura" },
  { id: "layout_scroll", label: "Vista Scroll", group: "Lectura" },
  { id: "font_decrease", label: "Reducir letra", group: "Lectura" },
  { id: "font_increase", label: "Aumentar letra", group: "Lectura" },
  { id: "mode_reading", label: "Modo Lectura", group: "Lectura" },
  { id: "mode_highlight", label: "Modo Anotar", group: "Lectura" },
  { id: "previous_page", label: "Página anterior", group: "Navegación" },
  { id: "next_page", label: "Página siguiente", group: "Navegación" },
  { id: "previous_paragraph", label: "Párrafo anterior", group: "Navegación" },
  { id: "next_paragraph", label: "Párrafo siguiente", group: "Navegación" },
  { id: "repeat_paragraph", label: "Repetir párrafo", group: "Navegación" },
  { id: "previous_chunk", label: "Fragmento hablado anterior", group: "Navegación" },
  { id: "repeat_chunk", label: "Repetir fragmento hablado", group: "Navegación" },
  { id: "next_chunk", label: "Fragmento hablado siguiente", group: "Navegación" },
  { id: "play_pause", label: "Continuar o pausar", group: "Voz" },
  { id: "stop", label: "Detener lectura", group: "Voz" },
  { id: "voice_input", label: "Mantener para voz/IA", group: "Voz" },
  { id: "speed_boost", label: "Mantener para acelerar lectura", group: "Voz" },
  { id: "undo_highlight", label: "Deshacer subrayado", group: "Anotación" },
  { id: "redo_highlight", label: "Rehacer subrayado", group: "Anotación" },
  { id: "toggle_eraser", label: "Activar o desactivar borrado", group: "Anotación" },
  { id: "highlight_yellow", label: "Subrayar amarillo", group: "Anotación" },
  { id: "highlight_green", label: "Subrayar verde", group: "Anotación" },
  { id: "highlight_blue", label: "Subrayar azul", group: "Anotación" },
  { id: "highlight_pink", label: "Subrayar rosa", group: "Anotación" },
] as const;

export type ShortcutAction = typeof SHORTCUT_ACTIONS[number]["id"];
export type ShortcutMap = Record<ShortcutAction, string>;

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  open_book: "",
  open_settings: "",
  toggle_left_sidebar: "",
  open_assistant: "",
  open_notes: "",
  toggle_right_panel: "",
  toggle_study: "",
  layout_paginated: "",
  layout_scroll: "",
  font_decrease: "",
  font_increase: "",
  mode_reading: "",
  mode_highlight: "",
  previous_page: "ArrowLeft",
  next_page: "ArrowRight",
  previous_paragraph: "Alt+ArrowUp",
  next_paragraph: "Alt+ArrowDown",
  repeat_paragraph: "",
  previous_chunk: "",
  repeat_chunk: "",
  next_chunk: "",
  play_pause: "Space",
  stop: "Escape",
  voice_input: "KeyV",
  speed_boost: "KeyA",
  undo_highlight: "",
  redo_highlight: "",
  toggle_eraser: "",
  highlight_yellow: "",
  highlight_green: "",
  highlight_blue: "",
  highlight_pink: "",
};

const MODIFIER_CODES = new Set(["AltLeft", "AltRight", "ControlLeft", "ControlRight", "MetaLeft", "MetaRight", "ShiftLeft", "ShiftRight"]);

export function shortcutFromKeyboardEvent(event: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "code">) {
  if (!event.code || MODIFIER_CODES.has(event.code)) return "";
  return [event.ctrlKey && "Ctrl", event.altKey && "Alt", event.shiftKey && "Shift", event.metaKey && "Meta", event.code]
    .filter(Boolean)
    .join("+");
}

export function shortcutLabel(value: string) {
  return value
    .replace(/\bKey([A-Z])\b/g, "$1")
    .replace(/\bDigit([0-9])\b/g, "$1")
    .replace(/ArrowLeft/g, "←")
    .replace(/ArrowRight/g, "→")
    .replace(/ArrowUp/g, "↑")
    .replace(/ArrowDown/g, "↓")
    .replace(/Space/g, "Espacio")
    .replace(/Escape/g, "Esc");
}

type ReaderSettingsProps = {
  open: boolean;
  boostSpeechRate: number;
  shortcuts: ShortcutMap;
  onClose: () => void;
  onBoostSpeechRateChange: (rate: number) => void;
  onShortcutChange: (action: ShortcutAction, shortcut: string) => void;
  onResetShortcuts: () => void;
};

export function ReaderSettings(props: ReaderSettingsProps) {
  const [recording, setRecording] = useState<ShortcutAction | null>(null);
  const [shortcutError, setShortcutError] = useState<{ action: ShortcutAction; message: string } | null>(null);

  useEffect(() => {
    if (!props.open || !recording) return;
    const capture = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      if (event.code === "Backspace" || event.code === "Delete") {
        props.onShortcutChange(recording, "");
        setShortcutError(null);
        setRecording(null);
        return;
      }
      const shortcut = shortcutFromKeyboardEvent(event);
      if (!shortcut) return;
      const conflict = findShortcutConflict(props.shortcuts, recording, shortcut);
      if (conflict) {
        const label = SHORTCUT_ACTIONS.find((action) => action.id === conflict)!.label;
        setShortcutError({ action: recording, message: `${shortcutLabel(shortcut)} ya está asignado a «${label}». Pulsa otra combinación o elimina primero ese atajo.` });
        return;
      }
      props.onShortcutChange(recording, shortcut);
      setShortcutError(null);
      setRecording(null);
    };
    window.addEventListener("keydown", capture, true);
    return () => window.removeEventListener("keydown", capture, true);
  }, [props, recording]);

  if (!props.open) return null;
  const close = () => {
    setRecording(null);
    setShortcutError(null);
    props.onClose();
  };
  const groups = Array.from(new Set(SHORTCUT_ACTIONS.map((action) => action.group)));

  return (
    <div className="settings-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="reader-settings-title">
        <header>
          <div><span>PERSONALIZACIÓN</span><h2 id="reader-settings-title">Settings</h2></div>
          <button type="button" onClick={close} aria-label="Cerrar Settings">×</button>
        </header>

        <div className="settings-content">
          <section className="settings-speed">
            <div><strong>Aceleración temporal</strong><small>Mantén pulsada la tecla asignada a «Acelerar lectura» en la sección Voz. Al soltarla, se recupera la velocidad normal.</small></div>
            <label>
              <input type="range" min="1" max="3" step="0.05" value={props.boostSpeechRate} onChange={(event) => props.onBoostSpeechRateChange(Number(event.target.value))} aria-label="Velocidad temporal al mantener la tecla de aceleración" />
              <output>{props.boostSpeechRate.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}×</output>
            </label>
          </section>

          <section className="settings-voice-note">
            <div><strong>Voces de Google</strong><small>El selector del lector ya muestra todas las voces que Chrome y tu dispositivo permiten usar directamente. Google Cloud ofrece catálogos adicionales Neural2, WaveNet y Chirp, pero son un servicio de pago separado y enviarían el texto a Google.</small></div>
            <a href="https://cloud.google.com/text-to-speech/docs/voices" target="_blank" rel="noreferrer">Ver catálogo oficial ↗</a>
          </section>

          <section className="settings-shortcuts">
            <div className="settings-section-title"><div><strong>Atajos de teclado</strong><small>Pulsa un campo y después la tecla o combinación que quieras. Cada combinación puede tener una sola función. Retroceso elimina el atajo.</small></div><button type="button" onClick={() => { setRecording(null); setShortcutError(null); props.onResetShortcuts(); }}>Restablecer</button></div>
            {groups.map((group) => (
              <div className="shortcut-group" key={group}>
                <h3>{group}</h3>
                {SHORTCUT_ACTIONS.filter((action) => action.group === group).map((action) => {
                  const shortcut = props.shortcuts[action.id];
                  const error = shortcutError?.action === action.id ? shortcutError.message : null;
                  return (
                    <div className="shortcut-row" key={action.id}>
                      <span>{action.label}</span>
                      <button className={`${recording === action.id ? "recording" : ""} ${error ? "conflict" : ""}`} type="button" onClick={() => { setRecording(action.id); setShortcutError(null); }} aria-label={`Asignar atajo a ${action.label}`} aria-describedby={error ? `shortcut-error-${action.id}` : undefined}>
                        {recording === action.id ? "Pulsa una tecla…" : shortcut ? shortcutLabel(shortcut) : "Sin asignar"}
                      </button>
                      {error && <p className="shortcut-error" id={`shortcut-error-${action.id}`} role="alert">{error}</p>}
                    </div>
                  );
                })}
              </div>
            ))}
          </section>
        </div>
      </section>
    </div>
  );
}
