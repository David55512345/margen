import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { syncedDocuments } from "../../../db/schema";

const ALLOWED_SCOPES = new Set(["highlights", "whiteboard", "review", "chats"]);

function ownerKey(request: Request) {
  return request.headers.get("oai-authenticated-user-id") || "site-owner";
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parsePayload(value: string) {
  try { return JSON.parse(value) as unknown; } catch { return null; }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const bookKey = clean(url.searchParams.get("bookKey"), 500);
  const scope = clean(url.searchParams.get("scope"), 40);
  if (!bookKey || !ALLOWED_SCOPES.has(scope)) {
    return Response.json({ error: "Documento de sincronización inválido." }, { status: 400 });
  }

  const [document] = await getDb().select().from(syncedDocuments).where(and(
    eq(syncedDocuments.ownerKey, ownerKey(request)),
    eq(syncedDocuments.bookKey, bookKey),
    eq(syncedDocuments.scope, scope),
  ));
  return Response.json({ document: document ? {
    scope: document.scope,
    payload: parsePayload(document.payload),
    revision: document.revision,
    updatedAt: document.updatedAt,
  } : null });
}

export async function PUT(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const bookKey = clean(body.bookKey, 500);
  const scope = clean(body.scope, 40);
  if (!bookKey || !ALLOWED_SCOPES.has(scope)) {
    return Response.json({ error: "Documento de sincronización inválido." }, { status: 400 });
  }
  const payload = JSON.stringify(body.payload ?? null);
  if (payload.length > 1_000_000) {
    return Response.json({ error: "El documento supera el tamaño permitido." }, { status: 413 });
  }
  const now = new Date().toISOString();
  const owner = ownerKey(request);
  const [document] = await getDb().insert(syncedDocuments).values({
    ownerKey: owner,
    bookKey,
    scope,
    payload,
    revision: 1,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [syncedDocuments.ownerKey, syncedDocuments.bookKey, syncedDocuments.scope],
    set: {
      payload,
      revision: sql`${syncedDocuments.revision} + 1`,
      updatedAt: now,
    },
  }).returning();

  return Response.json({ document: {
    scope: document.scope,
    payload: parsePayload(document.payload),
    revision: document.revision,
    updatedAt: document.updatedAt,
  } });
}
