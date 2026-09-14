import { getReaderPosition, requestOwnerKey, saveReaderPosition } from "../../ai/repository";

export async function GET(request: Request) {
  const bookId = new URL(request.url).searchParams.get("bookId")?.slice(0, 200) ?? "";
  if (!bookId) return Response.json({ error: "bookId es obligatorio." }, { status: 400 });
  return Response.json({ position: await getReaderPosition(requestOwnerKey(request), bookId) });
}

export async function POST(request: Request) {
  const payload = await request.json() as Record<string, unknown>;
  const bookId = typeof payload.bookId === "string" ? payload.bookId.slice(0, 200) : "";
  const sectionIndex = Number(payload.sectionIndex);
  const maxReadSectionIndex = Number(payload.maxReadSectionIndex);
  const percent = Number(payload.percent);
  const cfi = typeof payload.cfi === "string" ? payload.cfi.slice(0, 2_000) : "";
  if (!bookId || !Number.isInteger(sectionIndex) || !Number.isInteger(maxReadSectionIndex) || !Number.isFinite(percent)) {
    return Response.json({ error: "Posición inválida." }, { status: 400 });
  }
  await saveReaderPosition({
    ownerKey: requestOwnerKey(request), bookId, sectionIndex,
    maxReadSectionIndex: Math.max(sectionIndex, maxReadSectionIndex), cfi,
    percent: Math.max(0, Math.min(100, Math.round(percent))),
  });
  return Response.json({ ok: true });
}
