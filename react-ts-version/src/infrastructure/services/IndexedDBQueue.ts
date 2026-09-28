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
  /** See QueuedAction.skipFieldsIfEvaluated. */
  skipFieldsIfEvaluated?: EvaluatedGuard;
}

/**
 * Fields the server computes (sessionTrigger.ts) and mirrors to RTDB. A late
 * re-send must not overwrite them: when the Firestore document already carries
 * evaluated_at, these fields are left out of the RTDB write.
 */
export interface EvaluatedGuard {
  collection: string;
  docId: string;
  fields: string[];
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
  /** See EvaluatedGuard. */
  skipFieldsIfEvaluated?: EvaluatedGuard;
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
   * deliveredWhen: the document is read BEFORE the write; if it already
   * carries these values the item counts as delivered and nothing is written.
   * The meeting-2 session document uses { is_completed: true }: once it is on
   * the server the trigger has scored it, and a late re-send with merge:true
   * would overwrite the server's score with the client's (sessionTrigger.ts
   * does not run again for a document that was already completed).
   */
  firestoreDoc?: { collection: string; docId: string; deliveredWhen?: Record<string, unknown> };
  /**
   * Whose item this is: `student:{N}` or `{role}:{hash}` (useAuthStore
   * queueOwnerOf), taken from the identity signed in when it was queued, or
   * inferred from the item (inferOwner). Signing out no longer deletes what was not
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
  /** How many times the server REFUSED this item (permission-denied, invalid-argument…). */
  retry_count?: number;
  /** How many times delivery failed in a transient-looking way (unavailable, internal, unauthenticated…). */
  transient_count?: number;
  /** What the last failure was: the network (no answer), another transient-looking error, or a refusal. */
  last_failure_kind?: FailureKind;
  /** When the item was last parked by the transient threshold (see nextReviveAt). */
  parked_at?: number;
  /** How many times the revive timer has given this item another probe (see nextReviveAt). */
  revive_count?: number;
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
 * אחרי כמה כישלונות פריט מוגדר "תקוע" ומדולג עד טעינת הדף הבאה. הוא לעולם
 * אינו נמחק בלי אישור שרת (מודול 17 §ג שלב 4) — רק מפסיק לחסום את התור
 * מאחוריו. כל כישלון עוצר את מעבר הריקון (FIFO קשוח, מודול 29 §ג) ונספר:
 * סירוב שרת 5 פעמים, כשל שנראה חולף 20 פעמים. בלי תקרה לכשל "חולף",
 * פונקציה שמחזירה internal בכל קריאה חסמה את התור לתמיד.
 */
const MAX_RETRIES_BEFORE_PARKING = 5;
const MAX_TRANSIENT_BEFORE_PARKING = 20;

export function isParked(item: QueuedAction): boolean {
  return (item.retry_count ?? 0) >= MAX_RETRIES_BEFORE_PARKING
    || (item.transient_count ?? 0) >= MAX_TRANSIENT_BEFORE_PARKING;
}

export type FailureKind = 'network' | 'transient' | 'refusal';

/**
 * Parked by the transient threshold only — not by real refusals. These are
 * revived without a reload, so a tab left open through an outage does not
 * keep a child on "ממתין לאישור" until someone reloads it:
 *  - on the browser 'online' event, and after a successful delivery in a
 *    later pass — only an item whose last failure was the NETWORK. A success
 *    proves the server answers; an item that failed with `internal` while
 *    it answered is not retried just because something else went through;
 *  - by the revive timer, per item, with exponential backoff (nextReviveAt).
 * A revive is ONE probe (transient_count = threshold − 1): if it fails, the
 * item is parked again at once and the pass moves on past it. Giving it 20
 * more attempts made an always-failing item at the head re-block the queue
 * for ~8 minutes on every cycle (review R1).
 * Refusal-parked items (retry_count ≥ 5) are revived on page load only, as before.
 */
export function isTransientParked(item: QueuedAction): boolean {
  return (item.retry_count ?? 0) < MAX_RETRIES_BEFORE_PARKING
    && (item.transient_count ?? 0) >= MAX_TRANSIENT_BEFORE_PARKING;
}
const REVIVE_BACKOFF_BASE_MS = 2 * 60 * 1000;
const REVIVE_BACKOFF_CAP_MS = 60 * 60 * 1000;

/** When the revive timer next probes a transient-parked item: 2, 4, 8, 16, 32 minutes after it was parked, then 60. */
export function nextReviveAt(item: QueuedAction): number {
  const wait = Math.min(REVIVE_BACKOFF_BASE_MS * 2 ** (item.revive_count ?? 0), REVIVE_BACKOFF_CAP_MS);
  return (item.parked_at ?? 0) + wait;
}

/** The fields that give a transient-parked item one probe. `timer`: counts toward its backoff. */
function probeFields(item: QueuedAction, timer: boolean): Partial<QueuedAction> {
  return {
    transient_count: MAX_TRANSIENT_BEFORE_PARKING - 1,
    ...(timer ? { revive_count: (item.revive_count ?? 0) + 1 } : {}),
  };
}
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

/** No answer at all: the network is down (Firestore `unavailable`, RTDB "Client is offline", a failed fetch). */
export function isUnreachable(err: unknown): boolean {
  const code = errorCodeOf(err);
  if (code) return code === 'unavailable' || code === 'network-request-failed' || code === 'network-error' || code === 'disconnected';
  return /offline|network|failed to fetch|unavailable/i.test(errorMessageOf(err));
}

/**
 * A read made BEFORE a write (to check it is not already delivered) fails at
 * once while offline, where the write it guards would simply have waited. That
 * failure is the network, not the item: it is marked so it does not count
 * toward parking — the pass stops and the item waits, like the write did.
 */
export function preReadFailure(err: unknown): unknown {
  if (!isUnreachable(err)) return err;
  const marked = err instanceof Error ? err : new Error(errorMessageOf(err));
  return Object.assign(marked, { queueUnreached: true });
}

function isMarkedUnreached(err: unknown): boolean {
  return Boolean((err as { queueUnreached?: boolean } | null)?.queueUnreached);
}

/**
 * A failure that looks transient: the item may well be fine. It counts toward
 * the higher parking threshold (MAX_TRANSIENT_BEFORE_PARKING); a refusal or an
 * error the queue cannot classify counts toward the lower one.
 */
export function isTransientFailure(err: unknown): boolean {
  if (isPermissionDenied(err)) return false;
  const code = errorCodeOf(err);
  if (code) return TRANSIENT_CODES.has(code);
  return /network|offline|timeout|timed out|unavailable|disconnect|failed to fetch/i.test(errorMessageOf(err));
}

/**
 * מודול 17 §ד: "אופליין = אייקון ענן אפור… אונליין מסונכרן = ענן ירוק".
 *  - 'offline' — the browser has no network;
 *  - 'pending' — the queue holds work of this identity that has not been
 *    acknowledged — including an item enqueued a moment ago;
 *  - 'synced'  — nothing of this identity is waiting.
 * Module 17 §ג step 1 ("אימות נגישות לשרת") is the Ack itself: an item leaves
 * the count only when the server acknowledged it, so green is reachable only
 * through a server that answered. There is no separate connection probe — an
 * RTDB websocket blocked by a school network must not stop Firestore telemetry.
 */
export type QueueSyncState = 'offline' | 'pending' | 'synced';

type Attempt = 'delivered' | 'no-route';

/** The gate fields a late meeting-2 completion must not write over an approval. */
export const GATE_PENDING_FIELDS = ['teacher_gate_approved', 'routeStatus'];
/** The fields sessionTrigger.ts computes and mirrors to RTDB (see EvaluatedGuard). */
export const SERVER_SCORED_FIELDS = ['session_score_percent', 'matrix_recommended_path'];

/** Owner of an item nobody can attribute to a learner: any staff identity may send it. */
export const ANY_STAFF_OWNER = 'staff:*';

function learnerOwner(n: unknown): string | null {
  const num = typeof n === 'number' ? n : Number(String(n ?? '').trim());
  return Number.isInteger(num) && num >= 1 && num <= 12 ? `student:${num}` : null;
}

/**
 * The owner of an item stored without one — by an older version, or with
 * nobody signed in. A learner's item names the learner: telemetry carries
 * student_id, an RTDB path carries student_user{N}, a session or reflection
 * document id ends in _student_{N}. Anything else (a teacher's queued message,
 * for one) is sent only while a staff identity is signed in.
 */
export function inferOwner(item: QueuedAction): string {
  if (item.owner) return item.owner;
  // The teacher's gate mirror names the LEARNER in its path, but only the
  // teacher may write it (rtdbDeliveryOf recognises it by the same key).
  if (String(item.idempotency_key ?? item.payload?.idempotency_key ?? '').startsWith('gate_mirror_')) return ANY_STAFF_OWNER;
  const fromTelemetry = learnerOwner(item.student_id ?? (item.payload?.event_type ? item.payload?.student_id : undefined));
  if (fromTelemetry) return fromTelemetry;
  const path = item.refPath ?? '';
  const m = /^(?:users\/students|telemetry_events)\/(?:student_user|student_|user)?(\d{1,2})(?:\/|$)/.exec(path);
  if (m) return learnerOwner(m[1]) ?? ANY_STAFF_OWNER;
  if (item.firestoreDoc) {
    const d = /_student_(\d{1,2})$/.exec(item.firestoreDoc.docId);
    const fromDoc = learnerOwner(d?.[1]) ?? learnerOwner(item.payload?.student_id);
    if (fromDoc) return fromDoc;
  }
  return ANY_STAFF_OWNER;
}

/**
 * How a queued RTDB item is delivered. Items stored before rtdbMode existed
 * were all replayed as children; the three that meant "merge these fields"
 * are recognised by what they are, so what already sits on a device is
 * delivered where it belongs once this version loads.
 */
export function rtdbDeliveryOf(item: QueuedAction): RtdbDelivery {
  if (item.rtdbMode) {
    return {
      mode: item.rtdbMode,
      ...(item.skipFieldsIfGateApproved ? { skipFieldsIfGateApproved: item.skipFieldsIfGateApproved } : {}),
      ...(item.skipFieldsIfEvaluated ? { skipFieldsIfEvaluated: item.skipFieldsIfEvaluated } : {}),
    };
  }
  const key = String(item.idempotency_key ?? item.payload?.idempotency_key ?? '');
  if (key.startsWith('s2_done_rtdb_')) {
    const num = key.replace(/\D/g, '') || '1';
    return {
      mode: 'merge',
      skipFieldsIfGateApproved: GATE_PENDING_FIELDS,
      skipFieldsIfEvaluated: { collection: 'sessions', docId: `session_02_student_${num}`, fields: SERVER_SCORED_FIELDS },
    };
  }
  if (key.startsWith('gate_mirror_') || /\/sessionState$/.test(item.refPath ?? '')) return { mode: 'merge' };
  return { mode: 'child' };
}

type FailureCounts = Pick<QueuedAction, 'retry_count' | 'transient_count' | 'last_error' | 'last_failure_kind' | 'parked_at'>;

/** The item's counters after one more failure (see isParked). */
function failureCounts(item: QueuedAction, err: unknown): FailureCounts {
  const last_error = errorMessageOf(err).slice(0, 300);
  if (isMarkedUnreached(err)) {
    return { retry_count: item.retry_count ?? 0, transient_count: item.transient_count ?? 0, last_error, last_failure_kind: 'network' };
  }
  const transient = isTransientFailure(err);
  const transient_count = (item.transient_count ?? 0) + (transient ? 1 : 0);
  return {
    retry_count: (item.retry_count ?? 0) + (transient ? 0 : 1),
    transient_count,
    last_error,
    last_failure_kind: !transient ? 'refusal' : isUnreachable(err) ? 'network' : 'transient',
    ...(transient && transient_count >= MAX_TRANSIENT_BEFORE_PARKING ? { parked_at: Date.now() } : {}),
  };
}

/**
 * The values that mean a Firestore item is already delivered. Session-2
 * completion documents stored by an older version carry none; they are
 * recognised by their key and get the same check as new ones.
 */
function deliveredWhenOf(item: QueuedAction): Record<string, unknown> | undefined {
  if (item.firestoreDoc?.deliveredWhen) return item.firestoreDoc.deliveredWhen;
  if (item.firestoreDoc?.collection === 'sessions' && String(item.idempotency_key ?? '').startsWith('s2_done_doc_')) {
    return { is_completed: true };
  }
  return undefined;
}

function matches(data: unknown, expected: Record<string, unknown>): boolean {
  const d = (data ?? {}) as Record<string, unknown>;
  return Object.entries(expected).every(([k, v]) => d[k] === v);
}

export class IndexedDBQueue {
  private static instance: IndexedDBQueue;
  private db: IDBDatabase | null = null;
  private memoryFallback: QueuedAction[] = [];
  // navigator.onLine is undefined outside a browser; only an explicit false is offline.
  private browserOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
  private isFlushing = false;
  private syncCallback: RtdbSyncHandler | null = null;
  private ownerResolver: (() => string | null) | null = null;
  private lastOwner: string | null | undefined = undefined;
  private consecutiveFlushFailures = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private transientReviveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Whether the last recount saw an item parked by the transient threshold. */
  private hasTransientParked = false;
  /** The earliest nextReviveAt among transient-parked items, from the last recount. */
  private nextTransientReviveAt: number | null = null;
  private transientReviveTimerAt: number | null = null;
  /** The browser came back online: the next pass first revives transient-parked items. */
  private reviveTransientOnNextPass = false;
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
    return this.browserOnline;
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

  /** מודול 17 §ד: מצב הענן — ירוק רק כשהשרת אישר כל מה שבתור (ראו QueueSyncState). */
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
   * Whether this identity can deliver the item. Nobody signed in delivers
   * nothing: the claims that authorise a write are gone, and every attempt
   * would be refused and park the item. Without a registered resolver (a
   * test of the queue alone) every item is deliverable.
   */
  private belongsToCurrentOwner(item: QueuedAction, owner: string | null = this.currentOwner()): boolean {
    if (!this.ownerResolver) return true;
    if (!owner) return false;
    const itemOwner = inferOwner(item);
    if (itemOwner === ANY_STAFF_OWNER) return !owner.startsWith('student:');
    return itemOwner === owner;
  }

  private async refreshPendingCount(): Promise<void> {
    // Without a database getAll() IS the memory fallback — counting both
    // counted every waiting item twice.
    const items = this.db ? await this.getAll() : [];
    const all = [...items, ...this.memoryFallback];
    const parked = all.filter(isTransientParked);
    this.hasTransientParked = parked.length > 0;
    this.nextTransientReviveAt = parked.length ? Math.min(...parked.map(nextReviveAt)) : null;
    this.setPendingCount(all.filter((i) => this.belongsToCurrentOwner(i)).length);
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
      // Items the network parked get a probe in the next pass (isTransientParked).
      this.reviveTransientOnNextPass = true;
      this.onBackOnline();
    });

    window.addEventListener('offline', () => {
      this.browserOnline = false;
      this.refreshPendingCount().catch(() => {}).then(() => this.emitSyncState());
    });
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
    options: { skipFieldsIfGateApproved?: string[]; skipFieldsIfEvaluated?: EvaluatedGuard } = {}
  ): Promise<void> {
    await this.store({
      refPath,
      rtdbMode: 'merge',
      ...(options.skipFieldsIfGateApproved?.length ? { skipFieldsIfGateApproved: options.skipFieldsIfGateApproved } : {}),
      ...(options.skipFieldsIfEvaluated ? { skipFieldsIfEvaluated: options.skipFieldsIfEvaluated } : {}),
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
    if (!item.owner) item.owner = this.currentOwner() ?? inferOwner(item);
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

  /**
   * Gives transient-parked items one probe each (see isTransientParked):
   *  - 'network': those whose last failure was the network (the 'online'
   *    event, a successful delivery);
   *  - 'due': those whose nextReviveAt has come (the revive timer).
   * `except`: items parked in the pass that is ending — they get their next
   * chance in a later one. Returns how many.
   */
  private async reviveTransientParked(which: 'network' | 'due', except: Set<unknown> = new Set()): Promise<number> {
    const now = Date.now();
    const eligible = (item: QueuedAction) =>
      isTransientParked(item) &&
      (which === 'network' ? item.last_failure_kind === 'network' : nextReviveAt(item) <= now);
    let revived = 0;
    for (const item of this.memoryFallback) {
      if (eligible(item) && !except.has(item)) { Object.assign(item, probeFields(item, which === 'due')); revived++; }
    }
    if (!this.db) return revived;
    const targetStore = this.db.objectStoreNames.contains(STORE_NAME) ? STORE_NAME : LEGACY_STORE_NAME;
    await new Promise<void>((resolve) => {
      try {
        const tx = this.db!.transaction([targetStore], 'readwrite');
        const req = tx.objectStore(targetStore).openCursor();
        req.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (!cursor) return;
          const value = (cursor.value ?? {}) as QueuedAction;
          if (eligible(value) && !except.has(cursor.primaryKey)) {
            cursor.update({ ...value, ...probeFields(value, which === 'due') });
            revived++;
          }
          cursor.continue();
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
    return revived;
  }

  /** While something is parked by the transient threshold, wake up when the first of them is due (nextReviveAt). */
  private scheduleTransientRevive() {
    const at = this.nextTransientReviveAt;
    if (at === null) return;
    if (this.transientReviveTimer && this.transientReviveTimerAt !== null && this.transientReviveTimerAt <= at) return;
    if (this.transientReviveTimer) clearTimeout(this.transientReviveTimer);
    this.transientReviveTimerAt = at;
    this.transientReviveTimer = setTimeout(() => {
      this.transientReviveTimer = null;
      this.transientReviveTimerAt = null;
      this.reviveTransientParked('due')
        .catch(() => 0)
        .then(() => this.flushQueue())
        .catch(console.error);
    }, Math.max(0, at - Date.now()));
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
          if (isParked(cursor.value ?? {})) {
            cursor.update({ ...cursor.value, retry_count: 0, transient_count: 0 });
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
   * 1. Detect online connectivity (browser flag); the server's Ack is the proof it is reachable.
   * 2. Read FIFO items in bounded batches.
   * 3. Send each to its destination (telemetry_logs with document ID = `idempotency_key`, …).
   * 4. Atomic delete from IndexedDB strictly upon server acknowledgment.
   * 5. Server enforces idempotent execution via `idempotency_key`.
   *
   * Strict FIFO (Module 29 §ג): the pass ends at the first item that did not
   * reach the server; nothing behind it is sent before it. Only an item that
   * has failed often enough to be parked (isParked: 5 refusals or 20
   * transient-looking failures) is passed over, so one poison item cannot
   * hold the queue for ever. It is kept: an item parked by refusals is revived
   * on the next page load, one parked by transient failures sooner (see
   * isTransientParked). A pre-read that finds the network down does not count
   * at all (preReadFailure).
   *
   * Nothing is sent while nobody is signed in: without claims every write
   * would be refused, and the refusals would park the items.
   *
   * asOwner: send as this identity rather than whoever is signed in when the
   * pass starts — sign-out clears the auth store before its flush runs.
   */
  public async flushQueue(asOwner?: string | null): Promise<void> {
    if (this.isFlushing || !this.isOnline) return;
    const owner = asOwner !== undefined ? asOwner : this.currentOwner();
    if (this.ownerResolver && !owner) return;
    this.isFlushing = true;
    let finished: () => void = () => {};
    this.currentFlush = new Promise<void>((resolve) => { finished = resolve; });

    try {
      if (!this.db) {
        await this.initDB();
      }
      if (this.reviveTransientOnNextPass) {
        this.reviveTransientOnNextPass = false;
        if (this.hasTransientParked) await this.reviveTransientParked('network').catch(() => 0);
      }

      let failures = 0;
      let stopped = false;
      let delivered = 0;
      // Items parked in this pass: revived in a later one, not at its end.
      const parkedNow = new Set<unknown>();

      // Step 1 & 2: Process memory fallback items if any
      if (this.memoryFallback.length > 0) {
        for (const item of [...this.memoryFallback]) {
          if (isParked(item)) continue;
          if (!this.belongsToCurrentOwner(item, owner)) continue;
          try {
            if ((await this.attempt(item)) === 'no-route') { stopped = true; break; }
            this.memoryFallback = this.memoryFallback.filter((i) => i !== item);
            delivered++;
          } catch (err) {
            failures++;
            Object.assign(item, failureCounts(item, err));
            console.error('[IndexedDBQueue] Sync failed for memory item:', item.idempotency_key, err);
            if (isParked(item)) { parkedNow.add(item); continue; } // parked just now: the queue behind it may move on
            stopped = true;
            break;
          }
        }
      }

      if (!this.db || stopped) {
        if (delivered > 0) await this.afterPass(parkedNow);
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

          // A repeatedly failing item is parked, never discarded: Module 17 §ג
          // allows removal only on a server Ack.
          if (isParked(item)) continue;
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
            delivered++;
          } catch (err) {
            failures++;
            const counts = failureCounts(item, err);
            console.error(
              `[IndexedDBQueue] Sync failed for item ${item.idempotency_key} (refusals ${counts.retry_count}, transient ${counts.transient_count}):`,
              err
            );
            await this.recordFailure(targetStore, item, counts);
            // Parked just now: the queue behind it may move on.
            if (isParked({ ...item, ...counts })) { parkedNow.add(item.id); continue; }
            // Strict FIFO: the pass ends here, and the retry starts from this item.
            hasMore = false;
            break;
          }
        }

        if (batchItems.length < BATCH_SIZE) {
          hasMore = false;
        }
      }

      if (delivered > 0) await this.afterPass(parkedNow);
      this.noteFlushOutcome(failures);
    } finally {
      this.isFlushing = false;
      this.currentFlush = null;
      finished();
      await this.refreshPendingCount().catch(() => {});
      this.scheduleTransientRevive();
      if (this.flushAgainAfterCurrent) {
        this.flushAgainAfterCurrent = false;
        this.scheduleBackgroundFlush();
      }
    }
  }

  /**
   * A delivery succeeded, so the server answers: what the NETWORK parked in an
   * earlier pass gets a probe now. An item that failed while the server
   * answered (`internal`…) waits for its own timer (nextReviveAt).
   */
  private async afterPass(parkedNow: Set<unknown>): Promise<void> {
    if (!this.hasTransientParked) return; // from the recount that ended the previous pass
    const revived = await this.reviveTransientParked('network', parkedNow).catch(() => 0);
    if (revived > 0) this.flushAgainAfterCurrent = true;
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
      const ref = doc(firestore, item.firestoreDoc.collection, item.firestoreDoc.docId);
      // Read before writing: a document that already carries these values IS
      // this write, delivered — and re-sending it with merge:true would
      // overwrite what the server computed since (Module 23 §ב score).
      const deliveredWhen = deliveredWhenOf(item);
      if (deliveredWhen) {
        let snap;
        try {
          snap = await getDoc(ref);
        } catch (err) {
          throw preReadFailure(err);
        }
        if (snap.exists() && matches(snap.data(), deliveredWhen)) return true;
      }
      await setDoc(ref, item.payload, { merge: true });
      return true;
    }
    if (item.refPath) {
      if (!this.syncCallback) return false;
      const { mode, skipFieldsIfGateApproved, skipFieldsIfEvaluated } = rtdbDeliveryOf(item);
      // A child write needs its key in the payload; items stored by the legacy
      // enqueue(refPath, payload) form may carry it on the item only.
      const payload = mode === 'child' && item.payload && typeof item.payload === 'object' && !item.payload.idempotency_key && item.idempotency_key
        ? { ...item.payload, idempotency_key: item.idempotency_key }
        : item.payload;
      await this.syncCallback(item.refPath, payload, {
        mode,
        ...(skipFieldsIfGateApproved ? { skipFieldsIfGateApproved } : {}),
        ...(skipFieldsIfEvaluated ? { skipFieldsIfEvaluated } : {}),
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
      const deliveredWhen = deliveredWhenOf(item);
      target = { ...item.firestoreDoc, ...(deliveredWhen ? { deliveredWhen } : {}) };
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
      return matches(snap.data(), target.deliveredWhen ?? {});
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
    counts: FailureCounts
  ): Promise<void> {
    if (item.id === undefined || !this.db) return Promise.resolve();
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction([storeName], 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.get(item.id!);
        req.onsuccess = () => {
          if (req.result === undefined) return; // delivered elsewhere — do not bring it back
          store.put({ ...req.result, ...counts });
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
