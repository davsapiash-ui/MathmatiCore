/**
 * מודול 17: תור FIFO ועמידות במצב לא מקוון (Offline Queue & Sync Engine Spec)
 * אוגר אירועי טלמטריה מוקלדים (TelemetryPayload) ב-IndexedDB בעת ניתוק או כשל ומסנכרן אוטומטית בעת חידוש החיבור.
 * פרוטוקול התאוששות בן 5 שלבים אל מסד הנתונים Firestore (telemetry_logs).
 * קיבולת מקסימלית: 500 פעולות במבנה FIFO קשיח.
 * אפס מידע מזהה (Zero PII).
 */

import { doc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import type { TelemetryPayload, TelemetryEventType } from '@/types/telemetry';

/**
 * פריט בתור, במבנה שמודול 17 §ב מחייב:
 * idempotency_key, client_timestamp, session_id, student_id, exercise_id,
 * operation_type, payload — ולצידם retry_count לניהול ניסיונות חוזרים.
 *
 * refPath קיים רק לפריטים ישנים (כתיבות RTDB) שנאגרו לפני המעבר למבנה הזה,
 * והם ממשיכים להישלח דרך מטפל הסנכרון הרשום.
 */
export interface QueuedAction {
  id?: number;
  refPath?: string;
  /**
   * Module 22 §ה: a teacher→admin message written while offline is queued here
   * and sent through the named Cloud Function when the connection returns, so
   * the server-side anonymizer still runs on it. The payload carries a
   * client_message_id the function uses as the document id — redelivery
   * overwrites, never duplicates.
   */
  callable?: string;
  /**
   * מודול 14/20: מסמך מפגש שכתיבתו נכשלה (סיום מפגש 2, למשל) נכתב מחדש
   * עם החיבור — ב-merge, כך שחזרה על הכתיבה אינה דורסת אישור מורה שבינתיים
   * נכתב על אותו מסמך.
   */
  firestoreDoc?: { collection: string; docId: string };
  payload: any;
  timestamp: number;
  idempotency_key?: string;
  client_timestamp?: number;
  session_id?: string;
  student_id?: number;
  exercise_id?: string;
  operation_type?: TelemetryEventType;
  retry_count?: number;
  last_error?: string;
}

const DB_NAME = 'mathmaticore_offline_db';
const STORE_NAME = 'offline_telemetry_queue';
const LEGACY_STORE_NAME = 'offline_actions';
const DB_VERSION = 2;
/**
 * מודול 17: "A failed chunk is never discarded." התור יושב על הדיסק
 * (IndexedDB) — 500 פריטים היו תקרה שמחקה את הפריט הישן ביותר אחרי כמה
 * דקות של ניתוק במפגש פעיל. התקרה כאן היא הגנה מפני מצב פגום בלבד, לא
 * מדיניות: מפגש שלם של 45 דקות אינו מתקרב אליה.
 */
const MAX_QUEUE_CAPACITY = 50_000;
/** נפילה לזיכרון בלבד — כשאין IndexedDB כלל. כאן הזיכרון הוא הגבול. */
const MAX_MEMORY_FALLBACK = 5_000;

/**
 * אחרי כמה כישלונות רצופים פריט מוגדר "תקוע" ומדולג עד לריקון הבא.
 * הוא לעולם אינו נמחק בלי אישור שרת (מודול 17 §ג שלב 4) — רק מפסיק
 * לחסום את התור מאחוריו.
 */
const MAX_RETRIES_BEFORE_PARKING = 5;
/** השהיה מדורגת בין ניסיונות ריקון, עד תקרה. */
const RETRY_BACKOFF_MS = [2000, 4000, 8000, 16000, 30000];
/**
 * מודול 29 §ג: "ברשת פעילה, הסנכרון ל-Firestore מתבצע ברקע לפי סדר FIFO".
 * כל פריט שנכנס לתור מתזמן ריקון קצר אחריו; כמה פריטים ברצף חולקים ריקון אחד.
 */
const BACKGROUND_FLUSH_DELAY_MS = 1500;

/**
 * מודול 17 §ד: "אופליין = אייקון ענן אפור… אונליין מסונכרן = ענן ירוק".
 *  - 'offline' — no network;
 *  - 'pending' — the network is back (or up) but the queue still holds work
 *    that has not reached the server: what was stored while offline, or what
 *    a flush failed to deliver. Not green: nothing is synced yet;
 *  - 'synced'  — online, and the last flush left the queue empty.
 * An event waiting for its first background send (BACKGROUND_FLUSH_DELAY_MS)
 * is in flight, not a backlog: counting it would make the cloud blink on
 * every block the child drags. The count is taken when each flush ends.
 */
export type QueueSyncState = 'offline' | 'pending' | 'synced';

export class IndexedDBQueue {
  private static instance: IndexedDBQueue;
  private db: IDBDatabase | null = null;
  private memoryFallback: QueuedAction[] = [];
  // navigator.onLine is undefined outside a browser; only an explicit false is offline.
  private isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
  private isFlushing = false;
  private syncCallback: ((refPath: string, payload: any) => Promise<void>) | null = null;
  private consecutiveFlushFailures = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private backgroundFlushTimer: ReturnType<typeof setTimeout> | null = null;
  /** Something was enqueued while a flush was already running; flush again when it ends. */
  private flushAgainAfterCurrent = false;
  private currentFlush: Promise<void> | null = null;
  private pendingCount = 0;
  private pendingListeners: Array<(count: number) => void> = [];
  private syncStateListeners: Array<(state: QueueSyncState) => void> = [];
  private lastSyncState: QueueSyncState | null = null;

  private constructor() {
    this.initDB();
    this.setupNetworkListeners();
  }

  /** כמה אירועים ממתינים כרגע לסנכרון — למען החיווי השקט של מודול 17 §ד. */
  public getPendingCount(): number {
    return this.pendingCount;
  }

  /** מנוי על מספר האירועים הממתינים. מחזיר פונקציית ביטול. */
  public onPendingCountChange(listener: (count: number) => void): () => void {
    this.pendingListeners.push(listener);
    listener(this.pendingCount);
    return () => {
      this.pendingListeners = this.pendingListeners.filter((l) => l !== listener);
    };
  }

  private setPendingCount(count: number) {
    if (this.pendingCount === count) return;
    this.pendingCount = count;
    for (const l of this.pendingListeners) {
      try { l(count); } catch { /* a listener must never break the queue */ }
    }
    this.emitSyncState();
  }

  /** מודול 17 §ד: מצב הענן — ירוק רק כשהתור רוקן בפועל (ראו QueueSyncState). */
  public getSyncState(): QueueSyncState {
    if (!this.isOnline) return 'offline';
    return this.pendingCount > 0 ? 'pending' : 'synced';
  }

  /** מנוי על מצב הסנכרון. מחזיר פונקציית ביטול. */
  public onSyncStateChange(listener: (state: QueueSyncState) => void): () => void {
    this.syncStateListeners.push(listener);
    listener(this.getSyncState());
    return () => {
      this.syncStateListeners = this.syncStateListeners.filter((l) => l !== listener);
    };
  }

  private emitSyncState() {
    const state = this.getSyncState();
    if (state === this.lastSyncState) return;
    this.lastSyncState = state;
    for (const l of this.syncStateListeners) {
      try { l(state); } catch { /* a listener must never break the queue */ }
    }
  }

  private async refreshPendingCount(): Promise<void> {
    // Without a database getAll() IS the memory fallback — counting both
    // counted every waiting item twice.
    const items = this.db ? await this.getAll() : [];
    this.setPendingCount(items.length + this.memoryFallback.length);
  }

  /** מתזמן ניסיון ריקון נוסף בהשהיה מדורגת. */
  private scheduleRetry() {
    if (this.retryTimer || !this.isOnline) return;
    const idx = Math.min(this.consecutiveFlushFailures, RETRY_BACKOFF_MS.length - 1);
    const delay = RETRY_BACKOFF_MS[idx];
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.flushQueue().catch(console.error);
    }, delay);
  }

  /**
   * The queue used to be emptied only when the page loaded, when the browser
   * fired 'online', or after a failed attempt. The app never reloads during a
   * lesson, so on a stable network nothing a learner did reached telemetry_logs
   * until the next visit — and signing out cleared the queue first.
   */
  private scheduleBackgroundFlush() {
    if (!this.isOnline) return;
    if (this.isFlushing) {
      this.flushAgainAfterCurrent = true;
      return;
    }
    if (this.backgroundFlushTimer) return;
    this.backgroundFlushTimer = setTimeout(() => {
      this.backgroundFlushTimer = null;
      this.flushQueue().catch(console.error);
    }, BACKGROUND_FLUSH_DELAY_MS);
  }

  public static getInstance(): IndexedDBQueue {
    if (!IndexedDBQueue.instance) {
      IndexedDBQueue.instance = new IndexedDBQueue();
    }
    return IndexedDBQueue.instance;
  }

  private initDB(): Promise<IDBDatabase | null> {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      try {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          }
          if (!db.objectStoreNames.contains(LEGACY_STORE_NAME)) {
            db.createObjectStore(LEGACY_STORE_NAME, { keyPath: 'id', autoIncrement: true });
          }
        };

        request.onsuccess = (event) => {
          this.db = (event.target as IDBOpenDBRequest).result;
          resolve(this.db);
          // A parked item is never deleted (Module 17 §ג step 4), so it must get
          // another chance: each page load starts it again from zero attempts.
          // Otherwise an item refused five times for a reason that was later
          // fixed (a rules deploy, a returning sign-in) stays on the device forever.
          this.reviveParkedItems()
            .catch(() => {})
            // What a previous visit left unsent is a backlog from the first
            // moment, not only once the first flush ends (Module 17 §ד).
            .then(() => this.refreshPendingCount())
            .catch(() => {})
            .finally(() => {
              if (this.isOnline) this.flushQueue().catch(console.error);
            });
        };

        request.onerror = () => {
          console.warn('[IndexedDBQueue] IndexedDB open error, falling back to memory/storage.');
          resolve(null);
        };
      } catch (e) {
        console.warn('[IndexedDBQueue] IndexedDB initialization failed:', e);
        resolve(null);
      }
    });
  }

  private setupNetworkListeners() {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      this.isOnline = true;
      // Back online is not yet synced: with a backlog the cloud stays grey
      // until the flush below has delivered it (Module 17 §ג–§ד).
      this.emitSyncState();
      this.flushQueue().catch(console.error);
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.emitSyncState();
    });
  }

  public registerSyncHandler(handler: (refPath: string, payload: any) => Promise<void>) {
    this.syncCallback = handler;
  }

  /**
   * Enqueues a typed telemetry payload (or legacy refPath+payload) into the FIFO queue.
   */
  public async enqueue(arg1: any, arg2?: any): Promise<void> {
    let item: QueuedAction;

    if (typeof arg1 === 'string') {
      // Legacy signature: enqueue(refPath, payload) — an RTDB write, not a
      // telemetry event; it carries no Module 17 §ב fields of its own.
      item = {
        refPath: arg1,
        payload: arg2,
        timestamp: Date.now(),
        idempotency_key: arg2?.idempotency_key || `legacy_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        retry_count: 0,
      };
    } else {
      // Typed TelemetryPayload signature: enqueue(payload).
      // Module 17 §ב names the fields a queued operation must carry, so they
      // are stored flat beside the details payload rather than buried inside
      // it: a stuck item can then be identified (which learner, which meeting,
      // which exercise) without deserialising and re-parsing every record.
      const payload = arg1 as TelemetryPayload<TelemetryEventType>;
      item = {
        payload,
        timestamp: payload.client_timestamp || Date.now(),
        idempotency_key: payload.idempotency_key,
        client_timestamp: payload.client_timestamp,
        session_id: payload.session_id,
        student_id: payload.student_id,
        exercise_id: payload.exercise_id,
        operation_type: payload.event_type,
        retry_count: 0,
      };
    }

    await this.store(item);
    this.scheduleBackgroundFlush();
  }

  /**
   * Persists one queued item and, while offline, counts it as backlog at once.
   * Online, the flush that follows takes the count (see QueueSyncState).
   */
  private async store(item: QueuedAction): Promise<void> {
    await this.persist(item);
    if (!this.isOnline) await this.refreshPendingCount().catch(() => {});
  }

  /** Persists one queued item (IndexedDB, or the memory fallback when the database is unavailable). */
  private async persist(item: QueuedAction): Promise<void> {
    if (!this.db) {
      await this.initDB();
    }

    if (this.db) {
      await new Promise<void>((resolve) => {
        try {
          const targetStore = this.db!.objectStoreNames.contains(STORE_NAME) ? STORE_NAME : LEGACY_STORE_NAME;
          const tx = this.db!.transaction([targetStore], 'readwrite');
          const store = tx.objectStore(targetStore);
          const countReq = store.count();

          countReq.onsuccess = () => {
            if (countReq.result >= MAX_QUEUE_CAPACITY) {
              const cursorReq = store.openCursor();
              cursorReq.onsuccess = (e) => {
                const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
                if (cursor) {
                  store.delete(cursor.primaryKey);
                }
              };
            }
            store.add(item);
          };

          tx.oncomplete = () => resolve();
          tx.onerror = () => {
            this.memoryFallback.push(item);
            if (this.memoryFallback.length > MAX_MEMORY_FALLBACK) this.memoryFallback.shift();
            resolve();
          };
        } catch {
          this.memoryFallback.push(item);
          if (this.memoryFallback.length > MAX_MEMORY_FALLBACK) this.memoryFallback.shift();
          resolve();
        }
      });
    } else {
      this.memoryFallback.push(item);
      if (this.memoryFallback.length > MAX_MEMORY_FALLBACK) this.memoryFallback.shift();
    }
  }

  /** Module 22 §ה: queue a Cloud Function call (teacher→admin message) for delivery on reconnect. */
  public async enqueueCallable(name: string, payload: Record<string, unknown>, idempotencyKey: string): Promise<void> {
    const item: QueuedAction = {
      callable: name,
      payload,
      timestamp: Date.now(),
      idempotency_key: idempotencyKey,
      client_timestamp: Date.now(),
      retry_count: 0,
    };
    await this.store(item);
    this.scheduleBackgroundFlush();
  }

  /** Queue a Firestore document merge for delivery on reconnect (see QueuedAction.firestoreDoc). */
  public async enqueueFirestoreDoc(collection: string, docId: string, payload: Record<string, unknown>, idempotencyKey: string): Promise<void> {
    const item: QueuedAction = {
      firestoreDoc: { collection, docId },
      payload,
      timestamp: Date.now(),
      idempotency_key: idempotencyKey,
      client_timestamp: Date.now(),
      retry_count: 0,
    };
    await this.store(item);
    this.scheduleBackgroundFlush();
  }

  /** Gives every parked item a fresh set of attempts; called once per page load. */
  private async reviveParkedItems(): Promise<void> {
    if (!this.db) return;
    const targetStore = this.db.objectStoreNames.contains(STORE_NAME) ? STORE_NAME : LEGACY_STORE_NAME;
    await new Promise<void>((resolve) => {
      try {
        const tx = this.db!.transaction([targetStore], 'readwrite');
        const req = tx.objectStore(targetStore).openCursor();
        req.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (!cursor) return;
          if ((cursor.value?.retry_count ?? 0) >= MAX_RETRIES_BEFORE_PARKING) {
            cursor.update({ ...cursor.value, retry_count: 0 });
          }
          cursor.continue();
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /**
   * Sends what is waiting and resolves when that pass ends or the budget runs
   * out, whichever comes first. For sign-out: what the learner produced is sent
   * while the claims that authorise the write still exist, and before the
   * device forgets it. Never rejects.
   */
  public async flushWithin(budgetMs: number): Promise<void> {
    const pass = (this.currentFlush ?? Promise.resolve())
      .then(() => this.flushQueue())
      .catch(() => {});
    await Promise.race([pass, new Promise<void>((resolve) => setTimeout(resolve, budgetMs))]);
  }

  public async getAll(): Promise<QueuedAction[]> {
    if (!this.db) {
      await this.initDB();
    }

    if (this.db) {
      return new Promise((resolve) => {
        try {
          const targetStore = this.db!.objectStoreNames.contains(STORE_NAME) ? STORE_NAME : LEGACY_STORE_NAME;
          const tx = this.db!.transaction([targetStore], 'readonly');
          const store = tx.objectStore(targetStore);
          const req = store.getAll();

          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([...this.memoryFallback]);
        } catch {
          resolve([...this.memoryFallback]);
        }
      });
    }

    return [...this.memoryFallback];
  }

  public async clear(): Promise<void> {
    this.memoryFallback = [];
    await this.clearStore();
    this.setPendingCount(0);
  }

  private clearStore(): Promise<void> {
    if (!this.db) return Promise.resolve();

    return new Promise((resolve) => {
      try {
        const targetStore = this.db!.objectStoreNames.contains(STORE_NAME) ? STORE_NAME : LEGACY_STORE_NAME;
        const tx = this.db!.transaction([targetStore], 'readwrite');
        const store = tx.objectStore(targetStore);
        store.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /**
   * Module 17: 5-step recovery & synchronization protocol
   * 1. Detect online connectivity & verify Firestore reachability.
   * 2. Read FIFO items in bounded batches.
   * 3. Send to Firestore collection `telemetry_logs` with document ID = `idempotency_key`.
   * 4. Atomic delete from IndexedDB strictly upon server acknowledgment (`setDoc` resolved).
   * 5. Server enforces idempotent execution via `idempotency_key`.
   */
  public async flushQueue(): Promise<void> {
    if (this.isFlushing || !this.isOnline) return;
    this.isFlushing = true;
    let finished: () => void = () => {};
    this.currentFlush = new Promise<void>((resolve) => { finished = resolve; });

    try {
      if (!this.db) {
        await this.initDB();
      }

      let failures = 0;

      // Step 1 & 2: Process memory fallback items if any
      if (this.memoryFallback.length > 0) {
        const fallbackItems = [...this.memoryFallback];
        for (const item of fallbackItems) {
          try {
            if (!(await this.deliver(item))) break; // no delivery route yet
            this.memoryFallback = this.memoryFallback.filter((i) => i.idempotency_key !== item.idempotency_key);
          } catch (err) {
            // One undeliverable item must not strand everything behind it.
            failures++;
            item.retry_count = (item.retry_count ?? 0) + 1;
            item.last_error = String((err as Error)?.message ?? err);
            console.error('[IndexedDBQueue] Sync failed for memory item:', item.idempotency_key, err);
          }
        }
      }

      if (!this.db) {
        return;
      }

      const targetStore = this.db.objectStoreNames.contains(STORE_NAME) ? STORE_NAME : LEGACY_STORE_NAME;

      // Step 2: Read FIFO items in bounded batches of 20 items.
      // Paging starts after the last key this pass already looked at. Without
      // that, an item that fails and is (correctly) not deleted sits at the
      // head of the store and every batch re-reads the same 20 records.
      const BATCH_SIZE = 20;
      let hasMore = true;
      let lastSeenKey: number | null = null;

      while (hasMore && this.isOnline) {
        const batchItems = await new Promise<QueuedAction[]>((resolve) => {
          try {
            const tx = this.db!.transaction([targetStore], 'readonly');
            const store = tx.objectStore(targetStore);
            const range = lastSeenKey === null ? undefined : IDBKeyRange.lowerBound(lastSeenKey, true);
            const req = store.openCursor(range);
            const items: QueuedAction[] = [];

            req.onsuccess = (e) => {
              const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
              if (cursor && items.length < BATCH_SIZE) {
                items.push({ ...cursor.value, id: cursor.primaryKey as number });
                cursor.continue();
              } else {
                resolve(items);
              }
            };
            req.onerror = () => resolve([]);
          } catch {
            resolve([]);
          }
        });

        if (batchItems.length === 0) {
          hasMore = false;
          break;
        }

        // Step 3, 4, 5: Write to Firestore telemetry_logs and delete on server Ack
        for (const item of batchItems) {
          if (item.id !== undefined) lastSeenKey = item.id;

          // A repeatedly failing item is parked, never discarded: Module 17 §ג
          // allows removal only on a server Ack. It simply stops being retried
          // in this pass so the queue behind it keeps draining.
          if ((item.retry_count ?? 0) >= MAX_RETRIES_BEFORE_PARKING) continue;

          try {
            if (!(await this.deliver(item))) {
              hasMore = false;
              break; // no delivery route registered yet
            }

            // Step 4: Atomic delete from IndexedDB upon server Ack
            if (item.id !== undefined && this.db) {
              await this.deleteById(targetStore, item.id);
            }
          } catch (err) {
            failures++;
            const nextCount = (item.retry_count ?? 0) + 1;
            console.error(
              `[IndexedDBQueue] Sync failed for item ${item.idempotency_key} (attempt ${nextCount}):`,
              err
            );
            await this.recordFailure(targetStore, item, nextCount, err);
          }
        }

        if (batchItems.length < BATCH_SIZE) {
          hasMore = false;
        }
      }

      this.consecutiveFlushFailures = failures > 0 ? this.consecutiveFlushFailures + 1 : 0;
      if (failures > 0) this.scheduleRetry();
    } finally {
      this.isFlushing = false;
      this.currentFlush = null;
      finished();
      await this.refreshPendingCount().catch(() => {});
      if (this.flushAgainAfterCurrent) {
        this.flushAgainAfterCurrent = false;
        this.scheduleBackgroundFlush();
      }
    }
  }

  /**
   * שולח פריט אחד ליעדו. refPath שייך ל-RTDB דרך מטפל הסנכרון הרשום,
   * וכל השאר הם אירועי טלמטריה מוקלדים שנכתבים ל-telemetry_logs עם
   * idempotency_key כמזהה המסמך (שלבים 3 ו-5 במודול 17 §ג).
   *
   * מחזיר false אם אין עדיין נתיב מסירה — הפריט נשאר בתור.
   */
  private async deliver(item: QueuedAction): Promise<boolean> {
    // Loaded lazily: '@/infrastructure/firebase' initialises FirebaseSyncService,
    // which imports this queue — a static import here is a cycle.
    const { firestore, functions } = await import('@/infrastructure/firebase');
    if (item.callable) {
      await httpsCallable(functions, item.callable)(item.payload);
      return true;
    }
    if (item.firestoreDoc) {
      await setDoc(doc(firestore, item.firestoreDoc.collection, item.firestoreDoc.docId), item.payload, { merge: true });
      return true;
    }
    if (item.refPath) {
      if (!this.syncCallback) return false;
      await this.syncCallback(item.refPath, item.payload);
      return true;
    }
    if (item.payload && item.payload.event_type && item.idempotency_key) {
      await setDoc(doc(firestore, 'telemetry_logs', item.idempotency_key), {
        ...item.payload,
        synced_at: Date.now(),
      });
    }
    return true;
  }

  private deleteById(storeName: string, id: number): Promise<void> {
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction([storeName], 'readwrite');
        tx.objectStore(storeName).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /** מעדכן את מונה הניסיונות של פריט שנכשל, בלי למחוק אותו. */
  private recordFailure(
    storeName: string,
    item: QueuedAction,
    nextCount: number,
    err: unknown
  ): Promise<void> {
    if (item.id === undefined || !this.db) return Promise.resolve();
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction([storeName], 'readwrite');
        tx.objectStore(storeName).put({
          ...item,
          retry_count: nextCount,
          last_error: String((err as Error)?.message ?? err).slice(0, 300),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  public getOnlineStatus(): boolean {
    return this.isOnline;
  }

  public async clearAll(): Promise<void> {
    this.memoryFallback = [];
    await this.clearAllStores();
    this.setPendingCount(0);
  }

  private clearAllStores(): Promise<void> {
    if (!this.db) return Promise.resolve();
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction([STORE_NAME, LEGACY_STORE_NAME], 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        tx.objectStore(LEGACY_STORE_NAME).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}

export const indexedDBQueue = IndexedDBQueue.getInstance();
