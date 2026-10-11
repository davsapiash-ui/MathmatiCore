/**
 * This device's copies of a learner's workspace — the board state kept for an
 * offline reload (PRD Module 4 §ב, Module 8 §א: "IndexedDB משמש לשמירה מקומית
 * (Persistence) בעת ניתוק", Module 17). Owner, 11.10.2026: in IndexedDB, not
 * in localStorage. Same keys and the same JSON as before
 * (FirebaseSyncService: mathmaticore_session_cache_<id>[_m<N>]).
 *
 * The callers read synchronously (a restore decides at once which copy to
 * use), so the copies are also held in memory: every write goes to memory at
 * once and to IndexedDB behind it, and IndexedDB is read into memory once, at
 * start (`deviceCopiesReady` — main.tsx waits for it, at most a moment, before
 * the first render). A copy saved by an older version in localStorage is moved
 * into IndexedDB once, and removed from localStorage only after IndexedDB has
 * it; until then it is read from where it is. Without IndexedDB (a private
 * window that refuses it), the copies live in memory for the page's life and
 * old copies are still read from localStorage. Every storage call is guarded:
 * a storage error never breaks the workspace.
 */

const DB_NAME = 'mathmaticore_device_copies';
const STORE = 'copies';
/** The prefix of every copy key (FirebaseSyncService.deviceCacheKey). */
export const DEVICE_COPY_PREFIX = 'mathmaticore_session_cache_';

const mirror = new Map<string, string>();
/** Removed in this page: an older copy — read late from IndexedDB, or left in localStorage — must not come back. */
const removedEarly = new Set<string>();
let hydrated = false;
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function write(op: (store: IDBObjectStore) => void): Promise<boolean> {
  return openDb().then(
    (db) =>
      new Promise<boolean>((resolve) => {
        if (!db) return resolve(false);
        try {
          const tx = db.transaction(STORE, 'readwrite');
          op(tx.objectStore(STORE));
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
          tx.onabort = () => resolve(false);
        } catch {
          resolve(false);
        }
      })
  );
}

function readAll(db: IDBDatabase): Promise<Array<[string, unknown]>> {
  return new Promise((resolve) => {
    const out: Array<[string, unknown]> = [];
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return resolve(out);
        out.push([String(cursor.key), cursor.value]);
        cursor.continue();
      };
      req.onerror = () => resolve(out);
    } catch {
      resolve(out);
    }
  });
}

function legacyKeys(): string[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(DEVICE_COPY_PREFIX)) keys.push(k);
    }
    return keys;
  } catch {
    return [];
  }
}

function legacyRead(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

function legacyRemove(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

async function hydrate(): Promise<void> {
  const db = await openDb();
  if (db) {
    for (const [key, value] of await readAll(db)) {
      // A copy written or removed in this page before the read is newer.
      if (typeof value === 'string' && !mirror.has(key) && !removedEarly.has(key)) mirror.set(key, value);
    }
    // The one-time move of an older version's copies out of localStorage.
    for (const key of legacyKeys()) {
      const value = legacyRead(key);
      if (value === null) continue;
      if (!mirror.has(key) && !removedEarly.has(key)) mirror.set(key, value);
      const keep = mirror.get(key);
      const stored = keep === undefined ? true : await write((s) => s.put(keep, key));
      if (stored) legacyRemove(key);
    }
  }
  hydrated = true;
}

/** Resolves once IndexedDB has been read into memory (or found unavailable). Never rejects. */
export const deviceCopiesReady: Promise<void> = hydrate().catch(() => {
  hydrated = true;
});

/** Whether the copies stored on this device have been read (tests, diagnostics). */
export function deviceCopiesHydrated(): boolean {
  return hydrated;
}

/** The copy under `key` (its JSON), or null. */
export function readDeviceCopy(key: string): string | null {
  const v = mirror.get(key);
  if (v !== undefined) return v;
  if (removedEarly.has(key)) return null;
  // A copy an older version saved in localStorage, not moved yet.
  return legacyRead(key);
}

/** Keep `json` under `key`: in memory at once, in IndexedDB behind it. */
export function writeDeviceCopy(key: string, json: string): void {
  mirror.set(key, json);
  removedEarly.delete(key);
  void write((s) => s.put(json, key));
}

/** Drop the copy under `key`, wherever it is. */
export function removeDeviceCopy(key: string): void {
  mirror.delete(key);
  removedEarly.add(key);
  legacyRemove(key);
  void write((s) => s.delete(key));
}

/** Tests only: forget the in-memory copies (a "new device"). */
export function resetDeviceCopiesForTests(): void {
  mirror.clear();
  removedEarly.clear();
}
