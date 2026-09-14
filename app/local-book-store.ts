const DB_NAME = "lector-epub-library";
const DB_VERSION = 1;
const STORE_NAME = "books";
const LAST_BOOK_KEY = "last-opened";

type StoredEpub = {
  id: typeof LAST_BOOK_KEY;
  name: string;
  blob: Blob;
  savedAt: number;
};

function openBookDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionFinished(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

/** Guarda únicamente el último EPUB. El archivo permanece en este navegador. */
export async function saveLastEpub(name: string, data: ArrayBuffer) {
  if (typeof indexedDB === "undefined") return false;
  try {
    const database = await openBookDatabase();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const stored: StoredEpub = {
      id: LAST_BOOK_KEY,
      name,
      blob: new Blob([data], { type: "application/epub+zip" }),
      savedAt: Date.now(),
    };
    transaction.objectStore(STORE_NAME).put(stored);
    await transactionFinished(transaction);
    database.close();
    return true;
  } catch {
    // La lectura sigue funcionando si el navegador no concede espacio local.
    return false;
  }
}

/** Recupera el último EPUB sin subirlo ni solicitar de nuevo acceso al archivo. */
export async function loadLastEpub() {
  if (typeof indexedDB === "undefined") return null;
  try {
    const database = await openBookDatabase();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(LAST_BOOK_KEY);
    const stored = await new Promise<StoredEpub | undefined>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as StoredEpub | undefined);
      request.onerror = () => reject(request.error);
    });
    await transactionFinished(transaction);
    database.close();
    if (!stored?.blob || !stored.name) return null;
    return new File([stored.blob], stored.name, {
      type: "application/epub+zip",
      lastModified: stored.savedAt,
    });
  } catch {
    return null;
  }
}
