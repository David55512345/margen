import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { learningProgress } from "../../../db/schema";

function ownerKey(request: Request) {
  return request.headers.get("oai-authenticated-user-id") || "site-owner";
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(request: Request) {
  const bookKey = clean(new URL(request.url).searchParams.get("bookKey"), 500);
  if (!bookKey) return Response.json({ error: "bookKey es obligatorio." }, { status: 400 });

  const progress = await getDb().select().from(learningProgress)
    .where(and(eq(learningProgress.ownerKey, ownerKey(request)), eq(learningProgress.bookKey, bookKey)));
  return Response.json({ progress });
}

export async function POST(request: Request) {
  const payload = await request.json() as Record<string, unknown>;
  const values = {
    ownerKey: ownerKey(request),
    bookKey: clean(payload.bookKey, 500),
    chapterKey: clean(payload.chapterKey, 500),
    phase: clean(payload.phase, 30),
    completed: payload.completed === true,
    payload: JSON.stringify(payload.payload ?? {}).slice(0, 50_000),
    updatedAt: new Date().toISOString(),
  };
  if (!values.bookKey || !values.chapterKey || !["pretest", "posttest", "feynman"].includes(values.phase)) {
    return Response.json({ error: "Progreso de aprendizaje inválido." }, { status: 400 });
  }

  const [progress] = await getDb().insert(learningProgress).values(values)
    .onConflictDoUpdate({
      target: [learningProgress.ownerKey, learningProgress.bookKey, learningProgress.chapterKey, learningProgress.phase],
      set: { completed: values.completed, payload: values.payload, updatedAt: values.updatedAt },
    })
    .returning();
  return Response.json({ progress });
}
