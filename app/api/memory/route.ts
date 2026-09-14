import { getBookMemory, getChapterMemories, getReaderPosition, requestOwnerKey, upsertBookMemory } from "../../ai/repository";
import type { BookProfile } from "../../study-contract";

type RegisterBookRequest = {
  bookId: string;
  legacyKey: string;
  title: string;
  author: string;
  toc: string[];
  initialProfile: BookProfile;
};

export async function GET(request: Request) {
  const bookId = new URL(request.url).searchParams.get("bookId")?.slice(0, 200) ?? "";
  if (!bookId) return Response.json({ error: "bookId es obligatorio." }, { status: 400 });
  const ownerKey = requestOwnerKey(request);
  const [book, chapters, position] = await Promise.all([
    getBookMemory(ownerKey, bookId),
    getChapterMemories(ownerKey, bookId),
    getReaderPosition(ownerKey, bookId),
  ]);
  return Response.json({ book, chapters, position });
}

export async function POST(request: Request) {
  const payload = await request.json() as Partial<RegisterBookRequest>;
  if (!payload.bookId || !payload.legacyKey || !payload.title || !payload.author || !Array.isArray(payload.toc) || !payload.initialProfile) {
    return Response.json({ error: "Datos del libro incompletos." }, { status: 400 });
  }
  const ownerKey = requestOwnerKey(request);
  const existing = await getBookMemory(ownerKey, payload.bookId);
  const row = await upsertBookMemory({
    ownerKey,
    bookId: payload.bookId.slice(0, 200),
    legacyKey: payload.legacyKey.slice(0, 500),
    title: payload.title.slice(0, 500),
    author: payload.author.slice(0, 500),
    toc: payload.toc.map((item) => String(item).slice(0, 500)).slice(0, 1_000),
    profile: existing?.profile ?? payload.initialProfile,
  });
  const position = await getReaderPosition(ownerKey, payload.bookId);
  return Response.json({ book: { ...row, profile: existing?.profile ?? payload.initialProfile }, position });
}
