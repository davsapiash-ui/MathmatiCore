/**
 * מודול 17: תור FIFO ועמידות במצב לא מקוון (Offline Queue & Sync Engine Spec)
 * אוגר אירועי טלמטריה מוקלדים (TelemetryPayload) ב-IndexedDB בעת ניתוק או כשל ומסנכרן אוטומטית בעת חידוש החיבור.
 * פרוטוקול התאוששות בן 5 שלבים אל מסד הנתונים Firestore (telemetry_logs).
 * מבנה FIFO קשיח (מודול 29 §ג).
 * אפס מידע מזהה (Zero PII).
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import type { TelemetryPayload, TelemetryEventType } from '@/types/telemetry';

/**
 * How a queued RTDB item is written when it is delivered.
 *  - 'child' — `set(refPath/idempotency_key, payload)`: the item IS a child
 *    record (a recording chunk, its metadata). The key makes redelivery an
 *    overwrite, never a duplicate.
 *  - 'merge' — `update(refPath, payload)` without the idempotency key: the
 *    item is a set of fields of the record at refPath (the gate mirror, the
 *    meeting-2 completion, sessionState). Replaying it at a child node, as
 *    every RTDB item used to be, wrote the fields where nothing reads them.
 */
export type RtdbWriteMode = 'child' | 'merge';

/** What the registered RTDB delivery handler is told about the item it writes. */
export interface RtdbDelivery {
  mode: RtdbWriteMode;
  /** See QueuedAction.skipFieldsIfGateApproved. */
  skipFieldsIfGateApproved?: string[];
}

export type RtdbSyncHandler = (refPath: string, payload: any, delivery: RtdbDelivery) => Promise<void>;

/**
 * פריט בתור, במבנה שמודול 17 §ב מחייב:
 * idempotency_key, client_timestamp, session_id, student_id, exercise_id,
 * operation_type, payload — ולצידם retry_count לניהול ניסיונות חוזרים.
 *
 * refPath — כתיבת RTDB, שנשלחת דרך מטפל הסנכרון הרשום (ראו RtdbWriteMode).
 */
export interface QueuedAction {
  id?: number;
  refPath?: string;
  /** Absent on items stored before 'merge' existed: those were all child writes. */
  rtdbMode?: RtdbWriteMode;
  /**
   * A merge that must not undo the teacher's gate decision (Module 20): when
   * the record at refPath is already approved at delivery time, these fields
   * are left out of the write. The meeting-2 completion carries
   * teacher_gate_approved:false and routeStatus:'PENDING_TEACHER_APPROVAL';
   * replayed late, over an approval, they would lock the child out again.
   */
  skipFieldsIfGateApproved?: string[];
  /**
   * Module 22 §ה: a teacher→admin message written while offline is queued here
   * and sent through the named Cloud Function when the connection returns, so
   * the server-side anonymizer still runs on it. The payload carries a
   * client_message_id the function uses as the document id — redelivery
   * overwrites, never duplicates.
   */
  callable?: string;
  /**
   * מסמך Firestore שנכתב דרך התור (סיום מפגש 2, למשל) — ב-merge, כך
   * שחזרה על הכתיבה אינה מכפילה.
   *
   * deliveredWhen: when the server refuses the write, the document is read,
   * and if it already carries these values the item counts as delivered
   * (see IndexedDBQueue.alreadyOnServer).
   */
  firestoreDoc?: { collection: string; docId: string; deliveredWhen?: Record<string, unknown> };
  /**
   * Whose item this is: `student:{N}` or `staff:{uid}`, taken from the identity
   * signed in when it was queued. Signing out no longer deletes what was not
   * delivered (Module 17 §ג step 4), so the device can hold one learner's items
   * while another is signed in. Those cannot be delivered with the other
   * learner's claims; they wait for their own owner instead of being refused.
   */
  owner?: string | null;
  payload: any;
  timestamp: number;
  idempotency_key?: string;
  client_timestamp?: number;
  session_id?: string;
  student_id?: number;
  exercise_id?: string;
  operation_type?: TelemetryEventType;
  /** How many times the server REFUSED this item. Network failures do not count. */
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
 * אחרי כמה סירובי שרת פריט מוגדר "תקוע" ומדולג עד טעינת הדף הבאה.
 * הוא לעולם אינו נמחק בלי אישור שרת (מודול 17 §ג שלב 4) — רק מפסיק
 * לחסום את התור מאחוריו. כשל רשת אינו סירוב ואינו נספר כאן: פריט שלא
 * הגיע לשרת עוצר את התור עד שיגיע (FIFO קשוח, מודול 29 §ג).
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
 * Collections whose documents are create-only in firestore.rules
 * (`allow update: if false`). Redelivering an item whose first write was
 * stored but whose Ack was lost is refused there — and the document that is
 * already on the server IS that Ack.
 */
const CREATE_ONLY_COLLECTIONS = new Set(['telemetry_logs', 'srl_reflections']);

/**
 * Error codes that mean "the server could not be reached or did not answer",
 * not "the server refused this item". Firestore, Functions (`functions/…`)
 * and RTDB (`PERMISSION_DENIED`-style) codes are normalised first.
 */
const TRANSIENT_CODES = new Set([
  'unavailable',
  'deadline-exceeded',
  'cancelled',
  'resource-exhausted',
  'aborted',
  'unauthenticated',
  'internal',
  'unknown',
  'network-request-failed',
  'disconnected',
  'network-error',
]);

function errorCodeOf(err: unknown): string {
  const raw = String((err as { code?: unknown } | null)?.code ?? '');
  return raw.replace(/^(functions|firestore|auth|database)\//, '').replace(/_/g, '-').toLowerCase();
}

function errorMessageOf(err: unknown): string {
  return String((err as Error | null)?.message ?? err ?? '');
}

export function isPermissionDenied(err: unknown): boolean {
  return errorCodeOf(err) === 'permission-denied' || /permission[-_ ]denied/i.test(errorMessageOf(err));
}

/**
 * A network-level failure: the item may well be fine, the server just was not
 * reached. Anything else — a refusal (permission-denied, invalid-argument…) or
 * an error the queue cannot classify — counts toward parking, so one bad item
 * cannot hold the queue for ever.
 */
export function isTransientFailure(err: unknown): boolean {
  if (isPermissionDenied(err)) return false;
  const code = errorCodeOf(err);
  if (code) return TRANSIENT_CODES.has(code);
  return /network|offline|timeout|timed out|unavailable|disconnect|failed to fetch/i.test(errorMessageOf(err));
}

/**
 * מודול 17 §ד: "אופליין = אייקון ענן אפור… אונליין מסונכרן = ענן ירוק".
 *  - 'offline' — no network, or the server is not reachable (RTDB `.info/connected`);
 *  - 'pending' — connected, but the queue still holds work that has not
 *    reached the server — including an item enqueued a moment ago;
 *  - 'synced'  — connected, and nothing of this identity is waiting.
 */
export type QueueSyncState = 'offline' | 'pending' | 'synced';

type Attempt = 'delivered' | 'no-route';

/** The gate fields a late meeting-2 completion must not write over an approval. */
export const GATE_PENDING_FIELDS = ['teacher_gate_approved', 'routeStatus'];

/**
 * How a queued RTDB item is delivered. Items stored before rtdbMode existed
 * were all replayed as children; the three that meant "merge these fields"
 * are recognised by what they are, so what already sits on a device is
 * delivered where it belongs once this version loads.
 */
export function rtdbDeliveryOf(item: QueuedAction): RtdbDelivery {
  if (item.rtdbMode) {
    return { mode: item.rtdbMode, ...(item.skipFieldsIfGateApproved ? { skipFieldsIfGateApproved: item.skipFieldsIfGateApproved } : {}) };
  }
  const key = String(item.idempotency_key ?? item.payload?.idempotency_key ?? '');
  if (key.startsWith('s2_done_rtdb_')) return { mode: 'merge', skipFieldsIfGateApproved: GATE_PENDING_FIELDS };
  if (key.startsWith('gate_mirror_') || /\/sessionState$/.test(item.refPath ?? '')) return { mode: 'merge' };
  return { mode: 'child' };
}

export class IndexedDBQueue {
  private static instance: IndexedDBQueue;
  private db: IDBDatabase | null = null;
  private memoryFallback: QueuedAction[] = [];
  // navigator.onLine is undefined outside a browser; only an explicit false is offline.
  private browserOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
  /**
   * Module 17 §ג step 1: "אימות נגישות לשרת". Reported by the sync service
   * from RTDB `.info/connected`; unknown (true) until something reports it.
   */
  private serverReachable = true;
  private isFlushing = false;
  private syncCallback: RtdbSyncHandler | null = null;
  private ownerResolver: (() => string | null) | null = null;
  private lastOwner: string | null | undefined = undefined;
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

  private get isOnline(): boolean {
    return this.browserOnline && this.serverReachable;
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

  /** מודול 17 §ד: מצב הענן — ירוק רק כשהתור רוקן בפועל והשרת נגיש (ראו QueueSyncState). */
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

  /** The identity signed in now, as recorded on queued items; null when nobody is. */
  private currentOwner(): string | null {
    if (!this.ownerResolver) return null;
    try { return this.ownerResolver(); } catch { return null; }
  }

  /**
   * Whether the identity signed in now can deliver this item. An item with no
   * owner (queued before owners existed, or with nobody signed in) is tried by
   * whoever is signed in, as before.
   */
  private belongsToCurrentOwner(item: QueuedAction, owner: string | null = this.currentOwner()): boolean {
    if (!item.owner || !this.ownerResolver) return true;
    return item.owner === owner;
  }

  private async refreshPendingCount(): Promise<void> {
    // Without a database getAll() IS the memory fallback — counting both
    // counted every waiting item twice.
    const items = this.db ? await this.getAll() : [];
    const count = [...items, ...this.memoryFallback].filter((i) => this.belongsToCurrentOwner(i)).length;
    this.setPendingCount(count);
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
   * until the next visit.
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

  /** The connection is usable again: recount what is waiting, then send it. */
  private onBackOnline() {
    // Back online is not yet synced: with a backlog the cloud stays grey
    // until the flush below has delivered it (Module 17 §ג–§ד).
    this.refreshPendingCount()
      .catch(() => {})
      .then(() => { this.emitSyncState(); return this.flushQueue(); })
      .catch(console.error);
  }

  private setupNetworkListeners() {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      this.browserOnline = true;
      this.onBackOnline();
    });

    window.addEventListener('offline', () => {
      this.browserOnline = false;
      this.refreshPendingCount().catch(() => {}).then(() => this.emitSyncState());
    });
  }

  /**
   * Module 17 §ג step 1 — "אימות נגישות לשרת". The browser's online flag says
   * only that a network exists; the sync service reports whether the server
   * answers (RTDB `.info/connected`). Both must hold for the queue to send and
   * for the cloud to turn green.
   */
  public setServerReachable(reachable: boolean) {
    if (this.serverReachable === reachable) return;
    const wasOnline = this.isOnline;
    this.serverReachable = reachable;
    if (!wasOnline && this.isOnline) {
      this.onBackOnline();
    } else {
      this.emitSyncState();
    }
  }

  public registerSyncHandler(handler: RtdbSyncHandler) {
    this.syncCallback = handler;
  }

  /**
   * Tells the queue who is signed in (see QueuedAction.owner). Registered by
   * the auth store, which calls notifyOwnerChanged() on every sign-in and sign-out.
   */
  public registerOwnerResolver(resolver: () => string | null) {
    this.ownerResolver = resolver;
    this.lastOwner = this.currentOwner();
  }

  /** A sign-in or sign-out: this identity's backlog is recounted and, if it can be, sent. */
  public notifyOwnerChanged() {
    const owner = this.currentOwner();
    if (owner === this.lastOwner) return;
    this.lastOwner = owner;
    this.refreshPendingCount()
      .catch(() => {})
      .then(() => { if (owner && this.isOnline) return this.flushQueue(); })
      .catch(console.error);
  }

  /**
   * Enqueues a typed telemetry payload (or legacy refPath+payload) into the FIFO queue.
   * The legacy form `enqueue(refPath, payload)` is a CHILD write
   * (refPath/idempotency_key); for fields of the record at refPath use enqueueRtdbMerge.
   */
  public async enqueue(arg1: any, arg2?: any): Promise<void> {
    let item: QueuedAction;

    if (typeof arg1 === 'string') {
      // Legacy signature: enqueue(refPath, payload) — an RTDB child write, not a
      // telemetry event; it carries no Module 17 §ב fields of its own.
      item = {
        refPath: arg1,
        rtdbMode: 'child',
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
  }

  /**
   * Queues a CHILD record: delivered as `set(refPath/idempotencyKey, payload)`.
   * For recording chunks and their metadata (Module 21): enqueue first, and the
   * background flush sends it — a reload before the write lands loses nothing.
   */
  public async enqueueRtdbChild(refPath: string, payload: Record<string, unknown>, idempotencyKey: string): Promise<void> {
    await this.store({
      refPath,
      rtdbMode: 'child',
      payload: { ...payload, idempotency_key: idempotencyKey },
      timestamp: Date.now(),
      idempotency_key: idempotencyKey,
      client_timestamp: Date.now(),
      retry_count: 0,
    });
  }

  /**
   * Queues FIELDS of the record at refPath: delivered as
   * `update(refPath, fields)` — the idempotency key is not written. Replaying
   * the same fields is idempotent by itself.
   */
  public async enqueueRtdbMerge(
    refPath: string,
    fields: Record<string, unknown>,
    idempotencyKey: string,
    options: { skipFieldsIfGateApproved?: string[] } = {}
  ): Promise<void> {
    await this.store({
      refPath,
      rtdbMode: 'merge',
      ...(options.skipFieldsIfGateApproved?.length ? { skipFieldsIfGateApproved: options.skipFieldsIfGateApproved } : {}),
      payload: { ...fields },
      timestamp: Date.now(),
      idempotency_key: idempotencyKey,
      client_timestamp: Date.now(),
      retry_count: 0,
    });
  }

  /** Module 22 §ה: queue a Cloud Function call (teacher→admin message) for delivery on reconnect. */
  public async enqueueCallable(name: string, payload: Record<string, unknown>, idempotencyKey: string): Promise<void> {
    await this.store({
      callable: name,
      payload,
      timestamp: Date.now(),
      idempotency_key: idempotencyKey,
      client_timestamp: Date.now(),
      retry_count: 0,
    });
  }

  /**
   * Queue a Firestore document write (`setDoc(…, { merge: true })`). For a
   * create-only collection (telemetry_logs, srl_reflections) a document that
   * already exists counts as the Ack; `deliveredWhen` extends that to other
   * collections (see QueuedAction.firestoreDoc).
   */
  public async enqueueFirestoreDoc(
    collection: string,
    docId: string,
    payload: Record<string, unknown>,
    idempotencyKey: string,
    options: { deliveredWhen?: Record<string, unknown> } = {}
  ): Promise<void> {
    await this.store({
      firestoreDoc: { collection, docId, ...(options.deliveredWhen ? { deliveredWhen: options.deliveredWhen } : {}) },
      payload,
      timestamp: Date.now(),
      idempotency_key: idempotencyKey,
      client_timestamp: Date.now(),
      retry_count: 0,
    });
  }

  /**
   * Persists one queued item and counts it as waiting at once (Module 17 §ד):
   * the cloud is not green over an item that has not reached the server, even
   * for the moment before the background flush sends it.
   */
  private async store(item: QueuedAction): Promise<void> {
    if (item.owner === undefined) item.owner = this.currentOwner();
    await this.persist(item);
    if (this.belongsToCurrentOwner(item)) this.setPendingCount(this.pendingCount + 1);
    this.scheduleBackgroundFlush();
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
   * out, whichever comes first. For sign-out: what the identity produced is
   * sent while the claims that authorise the write still exist. What is not
   * acknowledged stays queued (Module 17 §ג step 4). Never rejects.
   */
  public async flushWithin(budgetMs: number, asOwner?: string | null): Promise<void> {
    const pass = (this.currentFlush ?? Promise.resolve())
      .then(() => this.flushQueue(asOwner))
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

  /**
   * Module 17: 5-step recovery & synchronization protocol
   * 1. Detect online connectivity & verify server reachability (browser flag + RTDB .info/connected).
   * 2. Read FIFO items in bounded batches.
   * 3. Send each to its destination (telemetry_logs with document ID = `idempotency_key`, …).
   * 4. Atomic delete from IndexedDB strictly upon server acknowledgment.
   * 5. Server enforces idempotent execution via `idempotency_key`.
   *
   * Strict FIFO (Module 29 §ג): the pass ends at the first item that did not
   * reach the server; nothing behind it is sent before it. Only an item the
   * server has refused MAX_RETRIES_BEFORE_PARKING times is parked and passed
   * over, so one poison item cannot hold the queue for ever.
   *
   * asOwner: send as this identity rather than whoever is signed in when the
   * pass starts — sign-out clears the auth store before its flush runs.
   */
  public async flushQueue(asOwner?: string | null): Promise<void> {
    if (this.isFlushing || !this.isOnline) return;
    const owner = asOwner !== undefined ? asOwner : this.currentOwner();
    this.isFlushing = true;
    let finished: () => void = () => {};
    this.currentFlush = new Promise<void>((resolve) => { finished = resolve; });

    try {
      if (!this.db) {
        await this.initDB();
      }

      let failures = 0;
      let stopped = false;

      // Step 1 & 2: Process memory fallback items if any
      if (this.memoryFallback.length > 0) {
        for (const item of [...this.memoryFallback]) {
          if ((item.retry_count ?? 0) >= MAX_RETRIES_BEFORE_PARKING) continue;
          if (!this.belongsToCurrentOwner(item, owner)) continue;
          try {
            if ((await this.attempt(item)) === 'no-route') { stopped = true; break; }
            this.memoryFallback = this.memoryFallback.filter((i) => i !== item);
          } catch (err) {
            failures++;
            const refused = !isTransientFailure(err);
            if (refused) item.retry_count = (item.retry_count ?? 0) + 1;
            item.last_error = errorMessageOf(err).slice(0, 300);
            console.error('[IndexedDBQueue] Sync failed for memory item:', item.idempotency_key, err);
            if (refused && (item.retry_count ?? 0) >= MAX_RETRIES_BEFORE_PARKING) continue;
            stopped = true;
            break;
          }
        }
      }

      if (!this.db || stopped) {
        this.noteFlushOutcome(failures);
        return;
      }

      const targetStore = this.db.objectStoreNames.contains(STORE_NAME) ? STORE_NAME : LEGACY_STORE_NAME;

      // Step 2: Read FIFO items in bounded batches of 20 items.
      // Paging starts after the last key this pass already looked at, so the
      // parked items and other identities' items it passed over are not re-read.
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

        // Step 3, 4, 5: deliver, and delete on server Ack
        for (const item of batchItems) {
          if (item.id !== undefined) lastSeenKey = item.id;

          // A repeatedly refused item is parked, never discarded: Module 17 §ג
          // allows removal only on a server Ack.
          if ((item.retry_count ?? 0) >= MAX_RETRIES_BEFORE_PARKING) continue;
          // Another identity's item: it waits for its owner's next sign-in.
          if (!this.belongsToCurrentOwner(item, owner)) continue;

          try {
            if ((await this.attempt(item)) === 'no-route') {
              hasMore = false;
              break; // no delivery route registered yet — nothing behind it goes first
            }

            // Step 4: Atomic delete from IndexedDB upon server Ack
            if (item.id !== undefined && this.db) {
              await this.deleteById(targetStore, item.id);
            }
          } catch (err) {
            failures++;
            const refused = !isTransientFailure(err);
            const nextCount = (item.retry_count ?? 0) + (refused ? 1 : 0);
            console.error(
              `[IndexedDBQueue] Sync failed for item ${item.idempotency_key} (${refused ? `refusal ${nextCount}` : 'not reached'}):`,
              err
            );
            await this.recordFailure(targetStore, item, nextCount, err);
            // Parked just now: the queue behind it may move on.
            if (refused && nextCount >= MAX_RETRIES_BEFORE_PARKING) continue;
            // Strict FIFO: the pass ends here, and the retry starts from this item.
            hasMore = false;
            break;
          }
        }

        if (batchItems.length < BATCH_SIZE) {
          hasMore = false;
        }
      }

      this.noteFlushOutcome(failures);
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

  private noteFlushOutcome(failures: number) {
    this.consecutiveFlushFailures = failures > 0 ? this.consecutiveFlushFailures + 1 : 0;
    if (failures > 0) this.scheduleRetry();
  }

  /**
   * One delivery attempt. A refusal of a write that is already on the server
   * (its first delivery was stored, the Ack was lost) is that Ack: the item
   * counts as delivered. Throws on any other failure.
   */
  private async attempt(item: QueuedAction): Promise<Attempt> {
    try {
      return (await this.deliver(item)) ? 'delivered' : 'no-route';
    } catch (err) {
      if (isPermissionDenied(err) && (await this.alreadyOnServer(item))) return 'delivered';
      throw err;
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
      const { mode, skipFieldsIfGateApproved } = rtdbDeliveryOf(item);
      // A child write needs its key in the payload; items stored by the legacy
      // enqueue(refPath, payload) form may carry it on the item only.
      const payload = mode === 'child' && item.payload && typeof item.payload === 'object' && !item.payload.idempotency_key && item.idempotency_key
        ? { ...item.payload, idempotency_key: item.idempotency_key }
        : item.payload;
      await this.syncCallback(item.refPath, payload, {
        mode,
        ...(skipFieldsIfGateApproved ? { skipFieldsIfGateApproved } : {}),
      });
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

  /**
   * After a permission-denied: is this write already on the server?
   *  - telemetry_logs / srl_reflections are create-only. The retry of a write
   *    whose Ack was lost is refused — and the stored document is the Ack.
   *    (The learner may read its own document there; firestore.rules.)
   *  - any other Firestore item: only when the document carries every value in
   *    `deliveredWhen`.
   * A document that cannot be read counts as not delivered.
   */
  private async alreadyOnServer(item: QueuedAction): Promise<boolean> {
    let target: { collection: string; docId: string; deliveredWhen?: Record<string, unknown> } | null = null;
    if (item.firestoreDoc) {
      target = item.firestoreDoc;
    } else if (!item.callable && !item.refPath && item.payload?.event_type && item.idempotency_key) {
      target = { collection: 'telemetry_logs', docId: item.idempotency_key };
    }
    if (!target) return false;
    const createOnly = CREATE_ONLY_COLLECTIONS.has(target.collection);
    if (!createOnly && !target.deliveredWhen) return false;
    try {
      const { firestore } = await import('@/infrastructure/firebase');
      const snap = await getDoc(doc(firestore, target.collection, target.docId));
      if (!snap.exists()) return false;
      if (createOnly && !target.deliveredWhen) return true;
      const data = (snap.data() ?? {}) as Record<string, unknown>;
      return Object.entries(target.deliveredWhen ?? {}).every(([k, v]) => data[k] === v);
    } catch {
      return false;
    }
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

  /**
   * Records a failed attempt on the stored item, without deleting it — and
   * without recreating it: if it is gone (another tab delivered it and deleted
   * it meanwhile), a put() would have written it back and sent it again.
   */
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
        const store = tx.objectStore(storeName);
        const req = store.get(item.id!);
        req.onsuccess = () => {
          if (req.result === undefined) return; // delivered elsewhere — do not bring it back
          store.put({
            ...req.result,
            retry_count: nextCount,
            last_error: errorMessageOf(err).slice(0, 300),
          });
        };
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

  /**
   * Empties the queue, delivered or not. For tests and an explicit reset only:
   * Module 17 §ג step 4 deletes an item only on a server Ack, so no sign-out,
   * expiry or role switch may call this (see unifiedLogout).
   */
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

// --- Enqueue-first writes -------------------------------------------------
// Module 17 §ב: IndexedDB is the durable buffer. A write made straight to the
// SDK while offline lives only in the SDK's memory and is lost on a reload;
// these helpers put the write in the queue FIRST, and the background flush
// delivers it in FIFO order. They resolve once the item is stored on the device.

/**
 * Module 21: one recording chunk. Delivered as
 * `set(chunksPath/chunkKey, { data, idempotency_key: chunkKey })` — the shape
 * the replay reader already accepts for a re-sent chunk.
 */
export function queueRecordingChunk(chunksPath: string, chunkKey: string, data: string): Promise<void> {
  return indexedDBQueue.enqueueRtdbChild(chunksPath, { data }, chunkKey);
}

/** Module 21: a chunk's metadata. Delivered as `set(metadataPath/chunkKey, { ...meta, idempotency_key: chunkKey })`. */
export function queueRecordingChunkMetadata(metadataPath: string, chunkKey: string, meta: Record<string, unknown>): Promise<void> {
  return indexedDBQueue.enqueueRtdbChild(metadataPath, meta, chunkKey);
}

/**
 * Module 16: the meeting-8 reflection document `srl_reflections/{docId}`.
 * srl_reflections is create-only: if the first delivery was stored and its Ack
 * lost, the refused retry finds the document and counts as delivered.
 */
export function queueSRLReflection(docId: string, reflection: Record<string, unknown>): Promise<void> {
  return indexedDBQueue.enqueueFirestoreDoc('srl_reflections', docId, reflection, `srl_reflection_${docId}`);
}
