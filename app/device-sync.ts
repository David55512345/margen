import { saveVaultValues, saveVaultSyncValue } from "./vault-store";

export type SyncScope = "highlights" | "whiteboard" | "review" | "chats";
export type DeviceSyncStatus = "idle" | "syncing" | "synced" | "offline" | "error";
const syncJobs = new Map<string, Promise<boolean>>();
const syncVersions = new Map<string, number>();

type SyncedDocument<T> = {
  scope: SyncScope;
  payload: T;
  revision: number;
  updatedAt: string;
};

function dirtyKey(bookKey: string, scope: SyncScope) {
  return `margen-sync-dirty:${scope}:${bookKey}`;
}

function setDirty(bookKey: string, scope: SyncScope, dirty: boolean) {
  try {
    if (dirty) window.localStorage.setItem(dirtyKey(bookKey, scope), "1");
    else window.localStorage.removeItem(dirtyKey(bookKey, scope));
  } catch { /* el dato principal permanece en su almacenamiento local */ }
}

function isDirty(bookKey: string, scope: SyncScope) {
  try { return window.localStorage.getItem(dirtyKey(bookKey, scope)) === "1"; } catch { return false; }
}

function report(status: DeviceSyncStatus, onStatus?: (status: DeviceSyncStatus) => void) {
  onStatus?.(status);
}

export async function saveSyncedDocument<T>(
  bookKey: string,
  scope: SyncScope,
  payload: T,
  onStatus?: (status: DeviceSyncStatus) => void,
) {
  if (!bookKey || typeof window === "undefined") return false;
  const key = `${bookKey}:${scope}`;
  const version = (syncVersions.get(key) ?? 0) + 1;
  syncVersions.set(key, version);
  setDirty(bookKey, scope, true);
  await saveVaultSyncValue(bookKey, scope, payload, true);
  if (!navigator.onLine) { report("offline", onStatus); return false; }
  report("syncing", onStatus);
  const job = (syncJobs.get(key) ?? Promise.resolve(true)).then(async () => {
    if (syncVersions.get(key) !== version) return true;
    try {
      const response = await fetch("/api/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookKey, scope, payload }),
      });
      if (!response.ok) throw new Error("sync failed");
      if (syncVersions.get(key) === version) {
        setDirty(bookKey, scope, false);
        await saveVaultSyncValue(bookKey, scope, payload, false);
        report("synced", onStatus);
      }
      return true;
    } catch {
      report(navigator.onLine ? "error" : "offline", onStatus);
      return false;
    }
  });
  syncJobs.set(key, job);
  try { return await job; } finally { if (syncJobs.get(key) === job) syncJobs.delete(key); }
}

export async function hydrateSyncedDocument<T>(
  bookKey: string,
  scope: SyncScope,
  localPayload: T,
  onStatus?: (status: DeviceSyncStatus) => void,
) {
  if (!bookKey || typeof window === "undefined") return localPayload;
  if (!navigator.onLine) { report("offline", onStatus); return localPayload; }
  if (isDirty(bookKey, scope)) {
    await saveSyncedDocument(bookKey, scope, localPayload, onStatus);
    return localPayload;
  }
  report("syncing", onStatus);
  try {
    const response = await fetch(`/api/sync?bookKey=${encodeURIComponent(bookKey)}&scope=${scope}`, { cache: "no-store" });
    if (!response.ok) throw new Error("sync failed");
    const body = await response.json() as { document: SyncedDocument<T> | null };
    if (body.document) {
      await saveVaultValues(bookKey, { [scope]: body.document.payload });
      report("synced", onStatus);
      return body.document.payload;
    }
    await saveSyncedDocument(bookKey, scope, localPayload, onStatus);
    return localPayload;
  } catch {
    report(navigator.onLine ? "error" : "offline", onStatus);
    return localPayload;
  }
}
