/**
 * Client-side handoff for the "Sign" PDF flow.
 *
 * The editor exports the document to PDF and the sign page needs it back as a
 * `File`. An in-memory hand-off only works inside a single tab, so opening
 * `/sign` in a new tab landed on an empty page.
 *
 * Instead the PDF is parked in IndexedDB (blobs are structured-cloneable, so
 * the browser stores them as-is) and the new tab is linked to the entry via a
 * one-shot key: `/sign?blob=<key>`. `takeSignFile()` deletes the entry as it
 * reads it, so a refresh or a stale link can never restore the same document
 * twice. Entries that are never claimed are dropped after `TTL_MS`.
 */
export type SignHandoffRecord = {
  id: string;
  file: File;
  createdAt: number;
};

const DB_NAME = "asta:sign-handoff";
const DB_VERSION = 1;
const FILES_STORE = "files";
const CREATED_INDEX = "by-created";
const TTL_MS = 10 * 60 * 1000;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(FILES_STORE)) {
        const store = db.createObjectStore(FILES_STORE, { keyPath: "id" });
        store.createIndex(CREATED_INDEX, "createdAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * Parks a PDF for the signing tab and returns the key that claims it.
 * Callers link to `/sign?blob=<key>`.
 */
export async function stashSignFile(file: File): Promise<string> {
  if (typeof indexedDB === "undefined") {
    throw new Error("This browser cannot pass the document to the signing tab.");
  }
  const db = await openDb();
  const id = crypto.randomUUID();
  const now = Date.now();

  const tx = db.transaction(FILES_STORE, "readwrite");
  const store = tx.objectStore(FILES_STORE);
  const record: SignHandoffRecord = { id, file, createdAt: now };
  store.put(record);

  // Drop entries nobody ever claimed, in the same transaction, so abandoned
  // exports don't pile up in the browser.
  const cutoff = now - TTL_MS;
  const cursorReq = store
    .index(CREATED_INDEX)
    .openKeyCursor(IDBKeyRange.upperBound(cutoff));
  cursorReq.onsuccess = () => {
    const cursor = cursorReq.result;
    if (!cursor) return;
    store.delete(cursor.primaryKey);
    cursor.continue();
  };

  await txDone(tx);
  return id;
}

/** Claims and removes a stashed PDF, or returns null when the key is unknown. */
export async function takeSignFile(id: string): Promise<File | null> {
  if (typeof indexedDB === "undefined" || !id) return null;
  try {
    const db = await openDb();
    const tx = db.transaction(FILES_STORE, "readwrite");
    const store = tx.objectStore(FILES_STORE);
    const record = await idbRequest<SignHandoffRecord | undefined>(
      store.get(id),
    );
    store.delete(id);
    await txDone(tx);
    if (!record) return null;
    // Re-wrap: some engines hand back a bare Blob after the round-trip.
    return new File([record.file], record.file.name, {
      type: record.file.type,
    });
  } catch {
    // A missing or blocked database simply means "no handoff document".
    return null;
  }
}
