export type ReadingChunkVoiceCommand =
  | { action: "previous" | "next"; count: number }
  | { action: "repeat"; count: 1 };

export type ReadingParagraphVoiceCommand = { action: "previous" | "next" | "repeat" };

export function normalizeReaderVoiceText(value: string) {
  return value
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseReadingChunkVoiceCommand(value: string): ReadingChunkVoiceCommand | null {
  const spoken = normalizeReaderVoiceText(value);
  if (/^(repite|repetir)( (este|el|ultimo) (chunk|fragmento|oracion|frase))?$/.test(spoken)) {
    return { action: "repeat", count: 1 };
  }

  const words = spoken.split(" ").filter(Boolean);
  if (!words.length) return null;
  const limitedCount = Math.min(3, words.length);
  if (words.every((word) => word === "anterior")) {
    return { action: "previous", count: limitedCount };
  }
  if (words.every((word) => word === "siguiente")) {
    return { action: "next", count: limitedCount };
  }
  return null;
}

export function parseReadingParagraphVoiceCommand(value: string): ReadingParagraphVoiceCommand | null {
  const spoken = normalizeReaderVoiceText(value);
  if (/^(siguiente|avanza|avanzar)( (al|el))? parrafo$|^parrafo siguiente$/.test(spoken)) return { action: "next" };
  if (/^(anterior|retrocede|retroceder|vuelve)( (al|el))? parrafo$|^parrafo anterior$/.test(spoken)) return { action: "previous" };
  if (/^(repite|repetir)( (este|el|ultimo))? parrafo$/.test(spoken)) return { action: "repeat" };
  return null;
}
