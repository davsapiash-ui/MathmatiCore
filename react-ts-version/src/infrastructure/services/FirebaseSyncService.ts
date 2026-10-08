import { ref, set, get, update, runTransaction, serverTimestamp, onValue, onDisconnect, push, type DataSnapshot } from 'firebase/database';
import { database, firestore, serverNow } from '@/infrastructure/firebase';
import {
  WORKSPACE_SAVED_AT_KEY,
  WORKSPACE_STARTED_WITHOUT_RECORD_KEY,
  workspaceSavedAt,
  isRestorableFor,
  keepsFreshStartWork,
} from '@/core/workspaceSnapshot';
import {
  COMPLETED_MEETINGS_KEY,
  WORKSPACE_BY_MEETING_KEY,
  meetingKey,
  isMeetingNumber,
  workspaceByMeetingField,
  completedMeetingField,
  resetMeetingOf,
  savedSnapshotOfMeeting,
} from '@/core/meetingCompletion';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuthStore } from '@/application/useAuthStore';
import { useWorkspaceStore, getActiveTasks, resolveLearningPath, type WorkspaceInitialization } from '@/application/useWorkspaceStore';
import { useStore, type QMatrix, type TraceData } from '@/application/useStore';
import { normalizeStudentId } from '@/application/useChatStore';

/** How long database writes of the workspace state are coalesced (ms). */
export const REMOTE_SYNC_WINDOW_MS = 500;
import { hasEnhancedSupport, ENHANCED_SUPPORT_PROFILE_ID } from '@/core/supportProfile';
import { PILOT_SCHOOL_ID, PILOT_SCHOOL_NAME, PILOT_CLASS_ID, PILOT_CLASS_NAME, PILOT_CLASS_CAPACITY, DEFAULT_CLASS_TYPE } from '@/core/pilotInstitution';
import { useAdminStore, type School, type Teacher, type ClassRoom } from '@/application/useAdminStore';
import { throttledRtdbUpdate, rtdbUpdateNow, flushThrottledWrites, dropPendingFields } from './ThrottledRtdbWriter';
import { indexedDBQueue, GATE_PENDING_FIELDS, SERVER_SCORED_FIELDS, preReadFailure, type RtdbDelivery } from './IndexedDBQueue';
import { recordRecentTelemetry } from './recentTelemetry';
import type { SessionDocument, PedagogicalPath } from '@/types';
import {
  type TelemetryPayload,
  type TelemetryEventType,
  type TelemetryDetailsMap,
  type HesitationDetectedDetails,
  type PlaceCuesShownDetails,
  type SocraticCardShownDetails,
  type SocraticOptionSelectedDetails,
  type UndoExecutedDetails,
  validateTelemetryColumnIndexRule,
} from '@/types/telemetry';

type WorkspaceStoreState = ReturnType<typeof useWorkspaceStore.getState>;

/**
 * Module 23א: what a device writes when it takes up a teacher's reset
 * (forceReload). The server already cleared the meeting's workspaceState and
 * sessionState; a write of the reset meeting sent a moment before (the
 * throttle window, or the database's own offline queue) could still land
 * after that. This write, sent last, clears them again.
 */
export const TEACHER_RESET_FIELDS = { forceReload: null, workspaceState: null, sessionState: null } as const;

/**
 * Module 23א §ג: the server time at which this device took up a teacher's
 * reset, written in the same update that clears forceReload. The server's
 * late-recording check (functions/src/lateRecordings.ts) reads it: a recording
 * chunk minted after it is part of the learner's new run, not a late chunk.
 */
export const RESET_ACK_FIELD = 'reset_acknowledged_at';
export const resetAcknowledgement = (): Record<string, object> => ({ [RESET_ACK_FIELD]: serverTimestamp() });

/**
 * TEACHER_RESET_FIELDS for the reset as the record names it (resetMeetingOf):
 * the reset meeting's saved copy and finished mark are cleared again too
 * (catch-up, 2.10.2026) — a copy of that meeting sent a moment before the
 * reset would otherwise bring it back when the meeting is reopened. A full
 * reset clears both maps. When the record does not say which meeting, only
 * the fields above: the other meetings' copies on the record are kept.
 */
export function teacherResetFields(resetMeeting: number | 'all' | null): Record<string, null> {
  const fields: Record<string, null> = { ...TEACHER_RESET_FIELDS };
  if (resetMeeting === 'all') {
    fields[WORKSPACE_BY_MEETING_KEY] = null;
    fields[COMPLETED_MEETINGS_KEY] = null;
  } else if (isMeetingNumber(resetMeeting)) {
    fields[workspaceByMeetingField(resetMeeting)] = null;
    fields[completedMeetingField(resetMeeting)] = null;
  }
  return fields;
}

/**
 * How the copy of meeting N goes to workspaceByMeeting/m{N} (catch-up,
 * 2.10.2026): inside the record's own throttled update with workspaceState,
 * unless the two copies together would pass the 50KB limit of one update
 * (Module 5) — then as a second update of its own, on the map's path. A
 * meeting outside 1–8 has no per-meeting copy.
 */
export function perMeetingCopyWrite(
  recordKey: string,
  meeting: number,
  stampedPayload: Record<string, unknown>,
  recordFields: Record<string, unknown>
): { inRecordUpdate: boolean; separate: { path: string; fields: Record<string, unknown> } | null } {
  if (!isMeetingNumber(meeting)) return { inRecordUpdate: false, separate: null };
  const together = { ...recordFields, [workspaceByMeetingField(meeting)]: stampedPayload };
  if (payloadByteSize(together) <= MAX_PAYLOAD_BYTES) return { inRecordUpdate: true, separate: null };
  return {
    inRecordUpdate: false,
    separate: { path: `users/students/${recordKey}/${WORKSPACE_BY_MEETING_KEY}`, fields: { [meetingKey(meeting)]: stampedPayload } },
  };
}

/** How long the record a reset was read from names the reset a screen takes up (ms). */
const RESET_RECORD_FRESH_MS = 10_000;

/** The meetings a device keeps a copy of (Module 14: eight). */
const MEETINGS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/** This device's copy of a learner's workspace: the latest one, of whatever meeting. */
const deviceCacheKey = (studentId: string) => `mathmaticore_session_cache_${studentId}`;
/** This device's copy of one meeting (catch-up, 2.10.2026). */
const deviceMeetingCacheKey = (studentId: string, meeting: number) => `${deviceCacheKey(studentId)}_${meetingKey(meeting)}`;

/**
 * The ONE key a teacher's record lives under in RTDB users/teachers, and the
 * id the admin console, the teacher-admin chat (sendTeacherAdminMessage and
 * the dashboard's own filter) and the class documents all agree on: the
 * e-mail with RTDB's forbidden characters replaced. Every path that used to
 * derive its own variant (local part for @edu-haifa, raw uid, "teacher_"
 * prefix) produced a second, orphaned record for the same person.
 */
export function teacherRecordKey(email: string): string {
  return String(email || '').toLowerCase().trim().replace(/[@.#$[\]]/g, '_');
}

export function extractTeacherId(email?: string | null, uid?: string | null): string {
  if (email && typeof email === 'string') {
    const cleaned = email
      .replace(/^teacher_/, '')
      .replace(/@mathmaticore\.local$/, '');
    if (cleaned.endsWith('@edu-haifa.org.il')) {
      return cleaned.replace('@edu-haifa.org.il', '');
    }
    return cleaned.replace(/[.@#$[\]]/g, '_');
  }
  if (uid && typeof uid === 'string') {
    const cleaned = uid
      .replace(/^teacher_/, '')
      .replace(/@mathmaticore\.local$/, '');
    if (cleaned.endsWith('@edu-haifa.org.il')) {
      return cleaned.replace('@edu-haifa.org.il', '');
    }
    return cleaned.replace(/[.@#$[\]]/g, '_');
  }
  return 'teacher_default';
}

// --- PRD v4 Schema Interfaces ---
export interface TeacherProfile {
  id: string;
  email: string;
  name: string;
  classes: string[];
}

export interface Classroom {
  id: string;
  teacher_id: string;
  name: string;
  anonymous_students: string[];
}

export interface SessionState {
  student_id: string;
  session_number: number; // 1-8
  status: 'active' | 'locked' | 'completed';
  current_path: 'green_path' | 'remediation_path' | null;
  hesitation_seconds?: number;
  error_count?: number;
  physical_override?: boolean;
  last_alert?: string;
}

export interface TelemetryEvent {
  event_type: 'vector_replay';
  session_id: string;
  timestamp: number;
  interaction_data: Record<string, any>;
  somatic_indicators: {
    hesitation_detected?: boolean;
    undo_triggered?: boolean;
    [key: string]: any;
  };
}

/**
 * Monotonic progress updater function for highestCompletedMeeting.
 * Ensures meeting progress moves strictly forward (monotonic).
 * Returns the new meeting number if it is higher than currentVal, otherwise returns undefined (aborts / no-op in Firebase runTransaction).
 * If currentVal is corrupt / NaN / invalid, logs a warning and falls back to 0 so new progress can heal the node.
 */
export function calculateMonotonicMeetingUpdate(currentVal: any, newMeeting: number): number | undefined {
  let currentNum = typeof currentVal === 'number' ? currentVal : (currentVal ? Number(currentVal) : 0);
  if (Number.isNaN(currentNum)) {
    console.warn(`[FirebaseSyncService] Invalid non-numeric highestCompletedMeeting detected in DB:`, currentVal);
    currentNum = 0;
  }
  const parsedNew = typeof newMeeting === 'number' ? newMeeting : Number(newMeeting);
  if (Number.isNaN(parsedNew) || parsedNew < 1) {
    return undefined;
  }
  const boundedNew = Math.min(Math.floor(parsedNew), 8);
  if (boundedNew > currentNum) {
    return boundedNew;
  }
  return undefined;
}

/** מספר תלמיד תקף לפיילוט: מספר שלם בין 1 ל-12 בלבד. */
function asPilotStudentNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}

/**
 * מודול 5 / חוקי Firestore §4: student_id באירוע טלמטריה חייב להיות בדיוק
 * מספר התלמיד המאומת (1-12).
 *
 * מקורות לפי סדר אמינות:
 *   1. מספר שהמזמין העביר במפורש.
 *   2. השדה student_id של המשתמש המחובר — עבר אימות 1-12 בכניסה.
 *   3. מחרוזת מזהה בצורה המוכרת student_user{N} / student_{N} / {N}.
 *
 * מזהה שאינו באחת מהצורות האלה (למשל מזהה Auth אקראי שבמקרה יש בו ספרה)
 * מחזיר null. עדיף חור בנתונים על פני נתון שמיוחס לילד הלא נכון.
 */
export function resolveTelemetryStudentId(
  explicit: number | string | undefined,
  currentUserId: string | null
): number | null {
  const fromExplicitNumber = asPilotStudentNumber(explicit);
  if (typeof explicit === 'number') return fromExplicitNumber;

  const fromAuth = asPilotStudentNumber(useAuthStore.getState().user?.student_id);
  if (fromAuth !== null) return fromAuth;

  const parseKnownShape = (raw: string | undefined | null): number | null => {
    if (!raw) return null;
    const m = /^(?:student_user|student_|user)?(\d{1,2})$/.exec(String(raw).trim().toLowerCase());
    return m ? asPilotStudentNumber(parseInt(m[1], 10)) : null;
  };

  return parseKnownShape(explicit as string | undefined) ?? parseKnownShape(currentUserId);
}

/** מגבלת המטען לעדכון בודד, לפי מודול 5. */
export const MAX_PAYLOAD_BYTES = 50 * 1024;

/** גודל אמיתי בבייטים של UTF-8. */
export function payloadByteSize(value: unknown): number {
  const json = JSON.stringify(value) ?? '';
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(json).length;
  // סביבות ללא TextEncoder: אומדן שמרני, לא הערכת חסר.
  return unescape(encodeURIComponent(json)).length;
}

/**
 * מחזיר מטען שגודלו בפועל אינו עולה על 50KB.
 *
 * הגרסה הקודמת מדדה את אורך המחרוזת ולא את מספר הבייטים. במסך שכולו
 * עברית כל תו הוא שני בייטים ב-UTF-8, ולכן מטען שנמדד כ-40KB יכול היה
 * להיות 75KB בפועל ולעבור את הבדיקה. בנוסף היא קיצצה את qflow.results
 * לעשרים המפתחות האחרונים — אבל יש שם שבע משימות בלבד, כך שהתנאי לא
 * התקיים אף פעם, והמטען נכתב כמות שהוא.
 *
 * כאן הקיצוץ נמדד מחדש אחרי כל שלב, ואם גם אחריו המטען חורג — נשמר
 * הגרעין המינימלי שמאפשר שחזור מצב, ונרשמת שגיאה. אין מצב שבו מטען
 * חורג נכתב בשקט.
 */
export function enforceMaxPayloadBytes(data: Record<string, any>): Record<string, any> {
  if (payloadByteSize(data) <= MAX_PAYLOAD_BYTES) return data;

  console.warn(
    `[FirebaseSyncService] Payload is ${payloadByteSize(data)} bytes, over the ${MAX_PAYLOAD_BYTES}-byte limit. Trimming.`
  );

  // 1. הכבד ביותר בדרך כלל: תיאור המשימה הנוכחית במלל (titleHe, instructionHe).
  // המפתח במטען הוא activeTask. הקיצוץ כוון ל-currentTask, שאינו קיים במטען,
  // ולכן לא קיצץ דבר — ומטען של 51KB קרס ישר לגרעין המינימלי של 8 שדות.
  const trimmed: Record<string, any> = { ...data };
  if (trimmed.activeTask && typeof trimmed.activeTask === 'object') {
    const { id, numberA, numberB, isSubtraction } = trimmed.activeTask;
    trimmed.activeTask = { id, numberA, numberB, isSubtraction };
  }
  if (payloadByteSize(trimmed) <= MAX_PAYLOAD_BYTES) return trimmed;

  // 2. היסטוריית זרימת האבחון, החדשות ביותר תחילה.
  const results = trimmed.qflow?.results;
  if (results && typeof results === 'object') {
    const keys = Object.keys(results);
    for (let keep = Math.floor(keys.length / 2); keep >= 1; keep = Math.floor(keep / 2)) {
      const recent = keys.slice(-keep);
      trimmed.qflow = { ...trimmed.qflow, results: Object.fromEntries(recent.map((k) => [k, results[k]])) };
      if (payloadByteSize(trimmed) <= MAX_PAYLOAD_BYTES) return trimmed;
    }
  }

  // 3. גרעין מינימלי לשחזור מצב. עדיף מטען חלקי שנרשם מעל למגבלה שנחצתה.
  const core = {
    sessionNumber: data.sessionNumber,
    standardTaskIdx: data.standardTaskIdx,
    flowStatus: data.flowStatus,
    keyboardState: data.keyboardState,
    undoCount: data.undoCount,
    hesitationCount: data.hesitationCount,
    hasInteracted: data.hasInteracted,
    isASD: data.isASD,
  };
  console.error(
    '[FirebaseSyncService] Payload still over the limit after trimming; syncing the minimal state core only.'
  );
  return core;
}

/**
 * Module 17: writes one queued RTDB item.
 *  - 'child' (recording chunks, their metadata, milestones): `set` at
 *    refPath/idempotency_key — redelivery overwrites the same child.
 *  - 'merge' (the gate mirror, the meeting-2 completion, sessionState):
 *    `update` of the record at refPath itself, without the idempotency key.
 *    Every queued RTDB item used to be replayed as a child, so these fields
 *    landed under users/students/{id}/{key}, where nothing reads them.
 * skipFieldsIfGateApproved: when the record is already approved by the
 * teacher (Module 20), those fields are left out, so a late replay of the
 * meeting-2 completion cannot lock the child out again. Only the two gate
 * fields are read, not the learner's whole record.
 * SERVER_SCORED_FIELDS (the score and the recommended path) are never
 * written from here. Only sessionTrigger.ts computes and mirrors them (PRD
 * Module 20: "בטריגר עצמאי על סיום המפגש"), and the rules refuse a learner
 * write that sets or changes them (owner, 29.9.2026). A meeting-2 completion
 * stored on a device by an earlier version still carries the client's
 * number; it is left out, so the item is delivered instead of refused.
 */
export async function deliverQueuedRtdbWrite(refPath: string, payload: any, delivery?: RtdbDelivery): Promise<void> {
  if (delivery?.mode !== 'merge') {
    const key = payload?.idempotency_key;
    if (!key) throw new Error('invalid-argument: a queued child write has no idempotency_key');
    await set(ref(database, `${refPath}/${key}`), payload);
    return;
  }
  const { idempotency_key: _key, ...fields } = (payload ?? {}) as Record<string, unknown>;
  const guarded = delivery.skipFieldsIfGateApproved ?? [];
  if (guarded.length > 0) {
    // A pre-read that fails because the network is down does not count
    // toward parking (preReadFailure): the item waits, as the write would.
    const [approvedSnap, routeSnap] = await Promise.all([
      get(ref(database, `${refPath}/teacher_gate_approved`)),
      get(ref(database, `${refPath}/routeStatus`)),
    ]).catch((err) => { throw preReadFailure(err); });
    const approved = approvedSnap?.val?.() === true || routeSnap?.val?.() === 'APPROVED';
    if (approved) for (const field of guarded) delete fields[field];
  }
  for (const field of SERVER_SCORED_FIELDS) delete fields[field];
  if (Object.keys(fields).length === 0) return;
  await update(ref(database, refPath), fields);
}

/**
 * sessionState.error_count, the radar tile's "טעויות": the wrong answers of the
 * exercise on screen — wrong submissions and wrong typed digits, or the failed
 * board checks of a representation exercise (the counts PROBLEM_COMPLETE
 * carries). It used to be the undo count, so the tile showed the undos twice
 * and a learner who erred without pressing undo showed "טעויות: 0"; an undo is
 * self-correction, not a mistake.
 */
export function liveMistakeCount(state: {
  consecutiveErrorCount?: number;
  boardCheckFailures?: number;
  boardCheckFailuresTaskId?: string | null;
}): number {
  const boardChecks = state.boardCheckFailuresTaskId ? state.boardCheckFailures || 0 : 0;
  return Math.max(state.consecutiveErrorCount || 0, boardChecks);
}

export class FirebaseSyncService {
  private static instance: FirebaseSyncService;
  private unsubscribeWorkspace: (() => void) | null = null;
  /** The last payload sent — a store change that leaves it untouched is not synced again. */
  private lastSyncedPayloadKey: string | null = null;
  /** The database writes of the latest payload, sent once per window (PRD Module 5 §ב: local-first, event-driven). */
  private pendingRemoteSync: (() => void) | null = null;
  private remoteSyncTimer: ReturnType<typeof setTimeout> | null = null;
  // Page hide: the latest state goes out now — the throttled writer's pending
  // window would otherwise die with the page.
  private readonly flushRemoteSyncOnPageHide = () => { this.flushRemoteSync(); flushThrottledWrites(); };
  /** The coaching-card state last published to the radar; null until the first change is seen. */
  private lastPublishedCardOpen: boolean | null = null;
  private unsubscribeFirebase: (() => void) | null = null;
  private currentUserId: string | null = null;
  /**
   * The record's helpRequested as last seen; undefined until the first
   * snapshot. The call-teacher button follows the record only when this value
   * changes, so a snapshot that arrives while the learner's own press is still
   * inside the write throttle does not undo the press.
   */
  private lastRemoteHelpRequested: boolean | undefined = undefined;
  /**
   * True from startSync until the learner record's first snapshot. Nothing is
   * written to the record meanwhile. Without a connection that snapshot never
   * comes, so this can last the whole lesson.
   */
  private isInitialLoad = false;
  /**
   * Module 17, while isInitialLoad: the meeting the store was last started or
   * restored to, and that state's payload as this device last saved it. The
   * start or restore itself is not new work and is not saved again: saved
   * again it would take a new stamp and could then beat a later copy on the
   * record (X55). Every change after it is saved on this device.
   */
  private localBaseline: { marker: WorkspaceInitialization; payloadKey: string } | null = null;
  /**
   * The meeting a teacher's reset discarded (discardUnsentWorkspace). Its
   * state is never saved again, on this device or on the record; the next
   * start or restore is a new meeting and is saved as usual.
   */
  private discardedStart: WorkspaceInitialization | null = null;
  /**
   * The learner record as last seen carrying a teacher's reset (forceReload);
   * which meeting was reset is read from it (resetMeetingOf). Kept after the
   * flag is cleared: a screen may take up the reset after this service did.
   */
  private lastResetRecord: Record<string, unknown> | null = null;
  private lastResetSeenAt = 0;
  /** "{record key}|{meeting}" whose finished mark this page already sent (markMeetingCompleted). */
  private readonly completedMarksSent = new Set<string>();
  private unsubscribeSchools: (() => void) | null = null;
  private unsubscribeClasses: (() => void) | null = null;
  private unsubscribePublicClasses: (() => void) | null = null;
  private unsubscribeTeachers: (() => void) | null = null;
  private unsubscribeGlobalStudentLimit: (() => void) | null = null;

  private constructor() {
    this.setupNetworkListeners();
    // Module 17: RTDB delivery path for queued items (see RtdbWriteMode).
    indexedDBQueue.registerSyncHandler((refPath, payload, delivery) => deliverQueuedRtdbWrite(refPath, payload, delivery));
    // Delay initialization to avoid circular dependency with stores
    setTimeout(() => this.init(), 0);
  }

  public static getInstance(): FirebaseSyncService {
    if (!FirebaseSyncService.instance) {
      FirebaseSyncService.instance = new FirebaseSyncService();
    }
    return FirebaseSyncService.instance;
  }

  public static async syncPhysicalOverride(
    studentId: string,
    overrideData: {
      routeStatus: string;
      difficultyRecommendation: string;
      isASD: boolean;
      physicalOverride: boolean;
      physicalOverrideActive?: boolean;
      overrideUpdatedAt: number;
    }
  ) {
    return FirebaseSyncService.getInstance().syncPhysicalOverride(studentId, overrideData);
  }

  private init() {
    // Check initial auth state
    const initialAuth = typeof useAuthStore?.getState === 'function' ? useAuthStore.getState() : { isAuthenticated: false, user: null, role: null };
    this.syncSharedListeners(initialAuth.isAuthenticated);

    if (initialAuth.isAuthenticated && initialAuth.user) {
      const initialRoles = Array.isArray(initialAuth.role) ? initialAuth.role : [initialAuth.role];
      if (initialRoles.includes('student')) {
        const userId = initialAuth.user.uid || initialAuth.user.id || initialAuth.user.email?.split('@')[0];
        if (userId) {
          this.currentUserId = userId;
          this.startSync(userId, initialAuth.user);
        }
      }
      if (initialRoles.includes('admin')) {
        this.startAdminSync();
      }
    }

    // Subscribe to auth changes
    if (typeof useAuthStore?.subscribe === 'function') {
      useAuthStore.subscribe((authState) => {
        this.syncSharedListeners(authState.isAuthenticated);

      const authRoles = Array.isArray(authState.role) ? authState.role : [authState.role];
      const isStudent = authRoles.includes('student');
      const isAdmin = authRoles.includes('admin');

      if (authState.isAuthenticated && authState.user && isStudent) {
        const newUserId = authState.user.uid || authState.user.id || authState.user.email?.split('@')[0];
        if (newUserId && newUserId !== this.currentUserId) {
          this.currentUserId = newUserId;
          this.startSync(newUserId, authState.user);
        }
      } else {
        this.stopSync();
      }

      if (authState.isAuthenticated && isAdmin) {
        this.startAdminSync();
      } else {
        this.stopAdminSync();
      }
    });
    }
  }

  private startSync(rawStudentId: string, userData: Record<string, unknown>) {
    this.stopSync();

    const studentId = normalizeStudentId(rawStudentId);
    this.currentUserId = studentId;
    const studentRef = ref(database, `users/students/${studentId}`);
    // Set online presence — through the one throttled writer of this record
    // (PRD 18: at most one client write per 1000 ms).
    const statusRef = ref(database, `users/students/${studentId}/isOnline`);
    try {
      onDisconnect(statusRef).set(false);
      onDisconnect(ref(database, `users/students/${studentId}/lastPing`)).set(0);
    } catch {}
    throttledRtdbUpdate(`users/students/${studentId}`, {
      isOnline: true,
      onlineStatus: 'active',
      lastPing: serverTimestamp(),
      lastActivityTimestamp: Date.now(),
      hasJoinedSession: true,
    }).catch(() => {});
    
    this.isInitialLoad = true;
    this.lastSyncedPayloadKey = null;
    this.lastRemoteHelpRequested = undefined;
    this.localBaseline = null;
    this.discardedStart = null;
    this.lastResetRecord = null;
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.removeEventListener('pagehide', this.flushRemoteSyncOnPageHide);
      window.addEventListener('pagehide', this.flushRemoteSyncOnPageHide);
    }

    // Load initial state from Firebase and keep it synced LIVE
    this.unsubscribeFirebase = onValue(studentRef, (snapshot: DataSnapshot) => {
      // The first snapshot since startSync: a meeting started or restored
      // without the record now meets the record's copy
      // (settleStartWithoutRecord). Not on a teacher's reset (forceReload),
      // which the page reload carries out.
      const firstSnapshot = this.isInitialLoad;
      let learnerRecord: Record<string, unknown> | null = null;
      let mayReceiveDeviceWork = false;
      const teacherControls: Record<string, unknown> = {};
      try {
        if (snapshot.exists()) {
          const rawData = snapshot.val();
          const data = (rawData && typeof rawData === 'object') ? rawData : {};
          // NOTE: We deliberately do NOT restore workspaceState from Firebase here.
          // StudentWorkspacePage.initSession() is the single source of truth for
          // session state. Overwriting it from Firebase mid-session causes race conditions
          // and could reset a live student's work. The one exception is the first
          // snapshot after a meeting was started afresh without the record
          // (settleStartWithoutRecord, Module 17).
          
          if (data.forceReload) {
            // Teacher initiated a deep reset. Reload the browser to clear local memory.
            // Nothing of the reset meeting that is still waiting goes out after
            // it, and this write — the last one — carries the reset again.
            this.lastResetRecord = data;
            this.lastResetSeenAt = Date.now();
            const resetMeeting = resetMeetingOf(data);
            this.discardUnsentWorkspace(resetMeeting);
            update(studentRef, { ...teacherResetFields(resetMeeting), ...resetAcknowledgement() }).then(() => {
              window.location.reload();
            }).catch((err) => {
              console.error("Failed to clear forceReload flag:", err);
              window.location.reload();
            });
            return;
          }
          learnerRecord = data;
          mayReceiveDeviceWork = true;

          // Real-time synchronization of teacher adaptations to student workspace
          const wsOverrides: Record<string, any> = {};
          if (data.isASD !== undefined && data.isASD !== useWorkspaceStore.getState().isASD) {
            wsOverrides.isASD = Boolean(data.isASD);
          }
          // PRD Modules 9/19: the authoritative support profile. Module 19 §ב:
          // "שינוי פרופיל במהלך תרגיל פעיל נשמר כהתאמה ממתינה (Pending
          // Adaptation) ומוחל אך ורק במעבר לתרגיל הבא" — it used to be copied
          // straight into the store, so the keyboard lock and the addition grid
          // switched on or off in the exercise on screen. The store applies it
          // at once only while no exercise is in progress. The snapshot is the
          // whole record, so a record with neither field has no profile.
          useWorkspaceStore.getState().receiveSupportProfile(hasEnhancedSupport(data) ? ENHANCED_SUPPORT_PROFILE_ID : null);
          // PRD 29 §ב ("helpRequested המאפשר מיתוג דו-כיווני לקריאת עזרה"):
          // the call-teacher button follows the record. A call survives an
          // exercise change and a reload, and once the teacher marks it
          // handled the next press calls again instead of taking back a call
          // that is no longer there.
          const remoteHelpRequested = data.helpRequested === true;
          if (remoteHelpRequested !== this.lastRemoteHelpRequested) {
            this.lastRemoteHelpRequested = remoteHelpRequested;
            if (useWorkspaceStore.getState().hasRequestedBasicHelp !== remoteHelpRequested) {
              wsOverrides.hasRequestedBasicHelp = remoteHelpRequested;
            }
          }
          const targetBoardLocked = data.isBoardLocked !== undefined
            ? Boolean(data.isBoardLocked)
            : false;
          if (targetBoardLocked !== useWorkspaceStore.getState().isBoardLocked) {
            wsOverrides.isBoardLocked = targetBoardLocked;
          }
          teacherControls.isBoardLocked = targetBoardLocked;
          if (data.isASD !== undefined) teacherControls.isASD = Boolean(data.isASD);
          if (Object.keys(wsOverrides).length > 0) {
            useWorkspaceStore.setState(wsOverrides);
          }

          // Update the top-level useStore so StudentHub knows about route approvals, adaptations, and Q-Matrix
          const currentStudents = useStore.getState().students;
          const additionEnabled = Boolean(data.additionBoardEnabled || data.forceAdditionHelper);
          const updatedStudent = {
            ...(currentStudents[studentId] || currentStudents[rawStudentId] || {}),
            // Merge Firebase data: qMatrixResults, traceData, route info
            ...(data.qMatrixResults && { qMatrixResults: data.qMatrixResults }),
            ...(data.traceData && { traceData: data.traceData }),
            ...(data.completedMeeting2 !== undefined && { completedMeeting2: data.completedMeeting2 }),
            ...(data.highestCompletedMeeting !== undefined && { highestCompletedMeeting: data.highestCompletedMeeting }),
            ...(data.routeRecommendation !== undefined && { routeRecommendation: data.routeRecommendation }),
            ...(data.routeStatus !== undefined && { routeStatus: data.routeStatus }),
            ...(data.difficultyRecommendation !== undefined && { difficultyRecommendation: data.difficultyRecommendation }),
            ...(data.isASD !== undefined && { isASD: data.isASD }),
            ...(data.physicalOverride !== undefined && { physicalOverride: data.physicalOverride }),
            ...(data.overrideUpdatedAt !== undefined && { overrideUpdatedAt: data.overrideUpdatedAt }),
            ...(data.isOnline !== undefined && { isOnline: data.isOnline }),
            // The snapshot is the whole record: a copy the teacher's reset
            // cleared is gone, not kept from before — the lobby opened the
            // reset meeting from it again (Module 23א).
            workspaceState: data.workspaceState ?? undefined,
            // Which meetings are finished (catch-up, 2.10.2026); a reset's
            // removal is followed the same way.
            completedMeetings: data[COMPLETED_MEETINGS_KEY] ?? undefined,
            ...(data.additionBoardEnabled !== undefined || data.forceAdditionHelper !== undefined ? { additionBoardEnabled: additionEnabled } : {}),
            ...(data.forceAdditionHelper !== undefined && { forceAdditionHelper: data.forceAdditionHelper }),
            ...(data.scaffoldLevel !== undefined && { scaffoldLevel: data.scaffoldLevel }),
            // The snapshot is the whole record: a path the server reset to null
            // is gone, not kept from before (Module 26 — no path, no bank).
            pedagogicalPath: data.pedagogicalPath ?? undefined,
            // A learner approved before 2.9.2026 carries only the gate's own field (recordLearningPath).
            teacher_selected_path: data.teacher_selected_path ?? undefined,
            ...(data.teacher_gate_approved !== undefined && { teacher_gate_approved: data.teacher_gate_approved }),
            ...(targetBoardLocked !== undefined && { isBoardLocked: targetBoardLocked }),
            ...((data.support_profile_id !== undefined || data.enhanced_support_profile !== undefined) && {
              support_profile_id: hasEnhancedSupport(data) ? ENHANCED_SUPPORT_PROFILE_ID : null,
            }),
          };
          useStore.setState({
            students: {
              ...currentStudents,
              [studentId]: updatedStudent,
              ...(rawStudentId !== studentId ? { [rawStudentId]: updatedStudent } : {})
            },
            firebaseLoaded: true
          });
        } else {
          // Initialize user in Firebase
          set(studentRef, {
            profile: userData,
            workspaceState: this.getSyncableWorkspaceState(),
            traceData: { hesitation_events: 0, undo_clicks: 0 },
            lastActive: serverTimestamp(),
            completedMeeting2: false,
            highestCompletedMeeting: 0,
            routeStatus: null,
            additionBoardEnabled: false
          });
          useStore.setState({ firebaseLoaded: true });
          mayReceiveDeviceWork = true;
        }
      } catch (e) {
        console.error("Firebase sync error:", e);
      } finally {
        this.isInitialLoad = false;
        if (firstSnapshot) {
          this.localBaseline = null;
          if (mayReceiveDeviceWork) this.settleStartWithoutRecord(learnerRecord, teacherControls);
        }
      }
    });


    // Subscribe to local Workspace changes and push to Firebase
    this.unsubscribeWorkspace = useWorkspaceStore.subscribe((state) => this.syncWorkspaceState(state));
    // A meeting already started or restored before this subscription is the
    // baseline too, not new work.
    this.adoptLocalBaseline(useWorkspaceStore.getState());
  }

  /**
   * The learner's own workspace: the store was started or restored for the
   * learner this sync runs for, on the meeting it now holds. Null while the
   * store holds defaults, or another learner's or another meeting's state.
   */
  private initializedForThisLearner(state: WorkspaceStoreState): WorkspaceInitialization | null {
    const marker = state.workspaceInitializedFor;
    if (!marker || !marker.learner || !this.currentUserId) return null;
    if (normalizeStudentId(marker.learner) !== normalizeStudentId(this.currentUserId)) return null;
    return marker.meeting === state.sessionNumber ? marker : null;
  }

  /**
   * The rule this sync writes the workspace to the learner record by, for
   * any other writer of workspace fields (StudentWorkspacePage's board
   * fields): this learner's record has been read (its first snapshot), and
   * the store holds this learner's own meeting — started or restored for
   * them, on this meeting, and not one a teacher's reset discarded.
   */
  public mayWriteWorkspaceToRecord(learnerUid: string, meeting: number): boolean {
    if (this.isInitialLoad || !this.currentUserId || !learnerUid) return false;
    if (normalizeStudentId(learnerUid) !== normalizeStudentId(this.currentUserId)) return false;
    const own = this.initializedForThisLearner(useWorkspaceStore.getState());
    return own !== null && own !== this.discardedStart && own.meeting === meeting;
  }

  private adoptLocalBaseline(state: WorkspaceStoreState) {
    if (!this.isInitialLoad) return;
    const marker = this.initializedForThisLearner(state);
    this.localBaseline = marker ? { marker, payloadKey: JSON.stringify(this.buildSyncPayload()) } : null;
  }

  /**
   * One store change: this device's copy at once, the learner record once per
   * window (scheduleRemoteSync).
   *
   * Module 17. Only the learner's own workspace is ever saved
   * (initializedForThisLearner). Until the meeting page starts or restores a
   * meeting the store holds defaults — meeting 1, an empty board — and they
   * must never replace a good copy: after a sign-in or a reload the learner
   * waits in the lobby with those defaults, and a teacher's board lock copied
   * into the store used to write them over the record's copy and this
   * device's, so the meeting then started again from its first exercise.
   *
   * Until the record's first snapshot (isInitialLoad) nothing is written to
   * the record — it may hold a later copy (X55), and without a connection it
   * never arrives — but this device's copy is. This used to return here
   * unconditionally, so what a learner did after a reload without a
   * connection was saved nowhere, and a second reload lost it.
   */
  private syncWorkspaceState(state: WorkspaceStoreState) {
    const recordOpen = !this.isInitialLoad;

    if (recordOpen) {
      // Module 18 §ב: RED is "כרטיס חניכה סוקרטי פעיל כעת". isSocraticActive was
      // set when the card opened and cleared only by a correct answer in it. The
      // card also closes by its X, by "הבנתי", three seconds after a typed digit,
      // on the next exercise and on a reload — none of which told the radar, so
      // a tile stayed red for the rest of the lesson and into the next one.
      const cardOpen = state.helpState === 'socratic';
      if (cardOpen !== this.lastPublishedCardOpen && this.currentUserId) {
        this.lastPublishedCardOpen = cardOpen;
        const canonical = normalizeStudentId(this.currentUserId);
        for (const key of new Set([canonical, this.currentUserId])) {
          if (key) throttledRtdbUpdate(`users/students/${key}`, { isSocraticActive: cardOpen }).catch(() => {});
        }
      }
    }

    const own = this.initializedForThisLearner(state);
    if (!own || own === this.discardedStart) return;

    const sanitizedPayload = this.buildSyncPayload();
    const studentKeys = this.learnerRecordKeys();

    // The same synced state again (a focus change, a toast, the device-lock
    // echo) is not a new event: PRD Module 5 §ב, "סנכרון… מבוסס אירועים בלבד".
    const payloadKey = JSON.stringify(sanitizedPayload);

    if (!recordOpen) {
      const baseline = this.localBaseline;
      if (!baseline || baseline.marker !== own) {
        // The start or restore itself (see localBaseline).
        this.localBaseline = { marker: own, payloadKey };
        return;
      }
      if (payloadKey === baseline.payloadKey) return;
      baseline.payloadKey = payloadKey;
      // lastSyncedPayloadKey is left alone: the record has not had this yet.
      // A meeting started afresh without the record says so in its copy, so a
      // reload that restores the copy still settles it against the record
      // by the fresh-start rule (useWorkspaceStore restoreSession,
      // settleStartWithoutRecord). Copies saved with the record open never
      // carry it.
      this.saveWorkspaceOnDevice({
        ...sanitizedPayload,
        [WORKSPACE_SAVED_AT_KEY]: this.nextSavedAt(),
        ...(own.restoredSavedAt === null ? { [WORKSPACE_STARTED_WITHOUT_RECORD_KEY]: true } : {}),
      });
      return;
    }

    if (payloadKey === this.lastSyncedPayloadKey) return;
    this.lastSyncedPayloadKey = payloadKey;

    // One stamp on both copies — the local cache and the record — on the
    // server's clock, never the device's. A reload compares the two by it
    // (newerWorkspaceSnapshot): the server copy wins unless this device
    // holds a strictly later state it has not sent yet.
    const stampedPayload = { ...sanitizedPayload, [WORKSPACE_SAVED_AT_KEY]: this.nextSavedAt() };

    // Save locally at once (a reload reads it), and send the database writes
    // of the latest state once per short window, so the main thread is never
    // behind a burst of writes ("הממשק מגיב מיידית בצד הלקוח").
    this.saveWorkspaceOnDevice(stampedPayload);

    const standardTaskIdx = state.standardTaskIdx;
    const flowStatus = state.flowStatus;
    const keyboardState = state.keyboardState;
    const meeting = state.sessionNumber;
    this.pendingRemoteSync = () => {
      studentKeys.forEach(key => {
        const recordFields: Record<string, unknown> = {
          workspaceState: stampedPayload,
          lastActive: serverTimestamp(),
          currentTaskIdx: standardTaskIdx,
          activeStep: standardTaskIdx + 1,
          lastActivityTimestamp: Date.now(),
          onlineStatus: 'active'
        };
        // Catch-up (2.10.2026): the same copy is kept per meeting, so it is
        // still there when the class moved on and this meeting is reopened
        // (workspaceByMeeting, core/meetingCompletion.ts).
        const byMeeting = perMeetingCopyWrite(key, meeting, stampedPayload, recordFields);
        // An older copy still waiting on the other route must not land after this one.
        if (byMeeting.inRecordUpdate) {
          dropPendingFields(`users/students/${key}/${WORKSPACE_BY_MEETING_KEY}`, [meetingKey(meeting)]);
          recordFields[workspaceByMeetingField(meeting)] = stampedPayload;
        } else if (byMeeting.separate) {
          dropPendingFields(`users/students/${key}`, [workspaceByMeetingField(meeting)]);
        }
        throttledRtdbUpdate(`users/students/${key}`, recordFields).catch((err) => {
          this.handlePermissionOrAuthError(err);
        });
        if (byMeeting.separate) {
          throttledRtdbUpdate(byMeeting.separate.path, byMeeting.separate.fields).catch((err) => {
            this.handlePermissionOrAuthError(err);
          });
        }
      });

      if (this.currentUserId) {
        // Module 20/26: the path is the one the teacher approved, mirrored on the
        // student record. A local hesitation/undo heuristic used to be written
        // here instead, so the dashboard could show a path that contradicted
        // the approved one.
        // The bank the meeting runs on; null (no path yet) clears the field.
        const currentPath = state.activeBankPath ?? resolveLearningPath();
        const sessionStatus: 'active' | 'locked' | 'completed' = flowStatus === 'sessionDone'
          ? 'completed'
          : keyboardState === 'LOCKED' ? 'locked' : 'active';

        const sessionState: SessionState = {
          student_id: this.currentUserId,
          session_number: state.sessionNumber,
          status: sessionStatus,
          current_path: currentPath,
          hesitation_seconds: (state.hesitationCount || 0) * 5,
          error_count: liveMistakeCount(state),
        };
        this.syncSessionState(this.currentUserId, sessionState).catch((err) => {
          console.warn('[FirebaseSyncService] syncSessionState notice:', err);
        });
      }
    };
    this.scheduleRemoteSync();
  }

  /** Every key this learner's record is written under (the canonical one and its legacy mirrors). */
  private learnerRecordKeys(): string[] {
    const normId = normalizeStudentId(this.currentUserId || '');
    const rawNum = (this.currentUserId || '').replace(/[^0-9]/g, '');
    return Array.from(new Set([this.currentUserId, normId, rawNum ? `student_user${rawNum}` : null, rawNum ? `user${rawNum}` : null].filter(Boolean) as string[]));
  }

  /**
   * Module 23א: the teacher reset this learner's meeting (forceReload). The
   * reset meeting's state that is still waiting to be sent is dropped — the
   * coalescing window here and the throttled writer's — together with this
   * device's copy of it, and that meeting is never saved again. Otherwise a
   * board the learner changed a moment before the reset was written after it
   * and undid it. Called by this service's own listener and by every screen
   * that takes up the reset (acknowledgeTeacherReset); running twice is harmless.
   *
   * Catch-up (2.10.2026): this device keeps a copy per meeting. A reset of
   * one meeting (resetMeetingOf) drops that meeting's copy only, so the other
   * meetings still resume where the learner stopped; a full reset, or a reset
   * the record does not name, drops them all. Unsent copies and finished
   * marks of the per-meeting maps are dropped with the workspace.
   */
  public discardUnsentWorkspace(resetMeeting: number | 'all' | null = null) {
    if (this.remoteSyncTimer) {
      clearTimeout(this.remoteSyncTimer);
      this.remoteSyncTimer = null;
    }
    this.pendingRemoteSync = null;
    for (const key of this.learnerRecordKeys()) {
      dropPendingFields(`users/students/${key}`, ['workspaceState', 'sessionState', WORKSPACE_BY_MEETING_KEY, COMPLETED_MEETINGS_KEY]);
      dropPendingFields(`users/students/${key}/${WORKSPACE_BY_MEETING_KEY}`, MEETINGS.map(meetingKey));
      this.clearLocalSessionProgress(key, isMeetingNumber(resetMeeting) ? resetMeeting : undefined);
    }
    for (const tag of Array.from(this.completedMarksSent)) {
      if (!isMeetingNumber(resetMeeting) || tag.endsWith(`|${resetMeeting}`)) this.completedMarksSent.delete(tag);
    }
    const discarded = this.initializedForThisLearner(useWorkspaceStore.getState());
    if (discarded) this.discardedStart = discarded;
  }

  /**
   * The meeting a teacher's reset restarted (resetMeetingOf), from the record
   * a screen saw with forceReload on it, else from the last record this
   * service saw carrying a reset; null when neither says.
   */
  public resetMeetingSeen(resetRecord?: Record<string, unknown> | null): number | 'all' | null {
    if (resetRecord) return resetMeetingOf(resetRecord);
    const seen = this.lastResetRecord;
    // Only the reset being taken up now: one seen earlier names another meeting.
    if (!seen || Date.now() - this.lastResetSeenAt > RESET_RECORD_FRESH_MS) return null;
    return resetMeetingOf(seen);
  }

  /** This device's copy, under each key the learner's copy is read by. */
  private saveWorkspaceOnDevice(stampedPayload: Record<string, unknown>) {
    const normId = normalizeStudentId(this.currentUserId || '');
    if (normId) this.saveSessionProgressLocally(normId, stampedPayload);
    if (this.currentUserId && this.currentUserId !== normId) {
      this.saveSessionProgressLocally(this.currentUserId, stampedPayload);
    }
  }

  /** The latest copy saved on this device for this learner (of this meeting, when given), or null. */
  private newestDeviceCopy(meeting?: number): Record<string, unknown> | null {
    const normId = normalizeStudentId(this.currentUserId || '');
    let newest: Record<string, unknown> | null = null;
    for (const key of new Set([normId, this.currentUserId])) {
      if (!key) continue;
      const copy = this.getLocalSessionProgress(key, meeting);
      if (copy && (!newest || workspaceSavedAt(copy) > workspaceSavedAt(newest))) newest = copy;
    }
    return newest;
  }

  /**
   * The stamp of the next saved copy: the server's clock, and never at or
   * before the copy this device saved last. After a reload without a
   * connection the server offset is 0 until the database answers, so
   * serverNow() is only the device clock — on a tablet whose clock is behind,
   * earlier than the copy it saved a minute before. A stamp that went
   * backwards would lose the new work at the next reload to the older copy on
   * the record (newerWorkspaceSnapshot keeps the record's copy unless this
   * device's is strictly later).
   */
  private nextSavedAt(): number {
    const meeting = useWorkspaceStore.getState().sessionNumber;
    const lastSaved = Math.max(
      workspaceSavedAt(this.newestDeviceCopy()),
      isMeetingNumber(meeting) ? workspaceSavedAt(this.newestDeviceCopy(meeting)) : 0
    );
    return Math.max(serverNow(), lastSaved + 1);
  }

  /**
   * Module 17, on the record's first snapshot after the meeting was started
   * or restored without it (a reload without a connection, or before the
   * record loaded). The meeting on screen was chosen without the record's
   * copy; now the two meet.
   *
   * Started afresh (no copy of the meeting on this device), or restored from
   * a copy of such a start saved before any record arrived
   * (WORKSPACE_STARTED_WITHOUT_RECORD_KEY): the record's copy of the meeting
   * is restored, unless the fresh start's work is kept by keepsFreshStartWork
   * (further into the meeting; at equal progress, newer and not empty). The
   * restore is a store change like any other, so both copies then get the
   * record's state, stamped later than anything this device saved: the fresh
   * start is never pushed over the record's progress, and the next reload
   * cannot bring it back. Work that is kept goes to the record at once.
   *
   * Restored from this device's copy of a meeting the record had seen: when
   * the record's copy is later than that one, it was written elsewhere after
   * it, and the page restores it instead (StudentWorkspacePage, X55 — the
   * same comparison). Writing this device's copy first would overwrite it.
   * Otherwise, if this device's copy of the meeting is strictly later than the
   * record's, the record gets it now — the learner may not touch the board
   * again before the lesson ends, and the next change would be the first to
   * send it.
   */
  private settleStartWithoutRecord(learnerRecord: Record<string, unknown> | null, teacherControls: Record<string, unknown>) {
    try {
      const state = useWorkspaceStore.getState();
      const start = this.initializedForThisLearner(state);
      if (!start) return;
      // The record's copy of THIS meeting: workspaceState, or — when the class
      // has moved on and this meeting was reopened for catch-up — its own copy
      // in workspaceByMeeting. Only the first used to count, so a meeting
      // started without the record was then sent over the copy it had saved.
      const record = savedSnapshotOfMeeting(learnerRecord, start.meeting) ?? (learnerRecord?.workspaceState as Record<string, unknown> | null | undefined);
      const deviceCopy = this.newestDeviceCopy(start.meeting);
      if (start.restoredSavedAt === null) {
        if (isRestorableFor(record, start.meeting) && !keepsFreshStartWork(record, deviceCopy, start.meeting)) {
          state.restoreSession(record);
          // restoreSession clears the board lock and takes isASD from the copy;
          // the teacher's values on the record stand.
          useWorkspaceStore.setState(teacherControls);
          return;
        }
        if (isRestorableFor(deviceCopy, start.meeting)) this.syncWorkspaceState(state);
        return;
      }
      if (workspaceSavedAt(record) > start.restoredSavedAt) {
        return;
      }
      if (!isRestorableFor(deviceCopy, start.meeting)) return;
      if (workspaceSavedAt(deviceCopy) <= workspaceSavedAt(record)) return;
      this.syncWorkspaceState(state);
    } catch (e) {
      console.error('[FirebaseSyncService] Could not settle the meeting started without the learner record:', e);
    }
  }

  /** The workspace payload both copies are written from. */
  private buildSyncPayload(): Record<string, any> {
    // Teacher-controlled authority fields (isBoardLocked, pendingAdaptation, support_profile_id)
    // are strictly omitted so the student client never overwrites teacher controls in RTDB
    // (isBoardLocked is forced to false below).
    //
    // One snapshot for both writers. This object used to be built here a
    // second time, and the two drifted: every field added to
    // getSyncableWorkspaceState — the wrong-answer streak and board-check
    // counters (22.9.2026), the meeting 1 progress flags — reached only the
    // record's creation, never the in-lesson sync that restoreSession
    // actually reads, so a reload still reset them.
    const syncableData: Record<string, any> = this.getSyncableWorkspaceState();

    // מודול 5: "Validate payload size (≤50KB) before every update".
    const updatePayload = enforceMaxPayloadBytes(syncableData);

    // Clean all undefined values to guarantee Firebase Realtime Database compatibility
    const sanitizedPayload = JSON.parse(JSON.stringify(updatePayload, (_k, v) => (v === undefined ? null : v)));

    // Authority Guard: explicitly clear any stale board lock in workspaceState
    sanitizedPayload.isBoardLocked = false;
    delete sanitizedPayload.pendingAdaptation;
    delete sanitizedPayload.support_profile_id;
    delete sanitizedPayload.enhanced_support_profile;
    delete sanitizedPayload.teacher_gate_approved;
    delete sanitizedPayload.routeStatus;
    delete sanitizedPayload.physicalOverride;
    return sanitizedPayload;
  }

  /** Database writes go out once per window; the latest payload wins. */
  private scheduleRemoteSync() {
    if (this.remoteSyncTimer) return;
    this.remoteSyncTimer = setTimeout(() => {
      this.remoteSyncTimer = null;
      this.flushRemoteSync();
    }, REMOTE_SYNC_WINDOW_MS);
  }

  /** Send what is pending now (page hide, sign-out, tests). */
  public flushRemoteSync() {
    if (this.remoteSyncTimer) {
      clearTimeout(this.remoteSyncTimer);
      this.remoteSyncTimer = null;
    }
    const run = this.pendingRemoteSync;
    this.pendingRemoteSync = null;
    if (run) run();
  }

  private getSyncableWorkspaceState() {
    const state = useWorkspaceStore.getState();
    const activeTasks = getActiveTasks(state);
    const currentTask = activeTasks[state.standardTaskIdx] || null;

    const raw = {
      sessionNumber: state.sessionNumber,
      isASD: state.isASD,
      standardTaskIdx: state.standardTaskIdx,
      qflow: state.qflow,
      flowStatus: state.flowStatus,
      counts: state.counts,
      answerDigits: state.answerDigits,
      carryDigits: state.carryDigits,
      probeAnswer: state.probeAnswer,
      selectedChoiceId: state.selectedChoiceId,
      isBoardLocked: state.isBoardLocked,
      keyboardState: state.keyboardState,
      undoCount: state.undoCount,
      hesitationCount: state.hesitationCount,
      // This meeting's U, E and G (E1), so a reload keeps the closing sentence
      // the child earned. Counts only — the index is never stored for the child.
      meetingPersistence: state.meetingPersistence,
      // The opening screen of station 2 or 8 was already passed (owner, 27.9.2026).
      openingScreenSeen: state.openingScreenSeen,
      hasInteracted: state.hasInteracted,
      // What a meeting 1 step or exercise is decided by. restoreSession read
      // most of these already, but they were never written, so a reload
      // turned a done step or a done conversion back into "not yet".
      blocksAddedCount: state.blocksAddedCount,
      hasDeletedBlock: state.hasDeletedBlock,
      hasClearedBoard: state.hasClearedBoard,
      hasGrouped: state.hasGrouped,
      hasUngrouped: state.hasUngrouped,
      // Module 9 §א: which columns the blocks already converted — the
      // enhanced-support keyboard opens column by column on these.
      conversionsByColumn: state.conversionsByColumn,
      // Per-exercise counters that decide the coaching card: the second
      // wrong answer in a row (register 17) and the board checks that failed
      // (Module 5 §ג PROBLEM_COMPLETE). They were not in the snapshot, so a
      // refresh mid-exercise silently reset them and the card that was one
      // wrong answer away never came. Each carries the exercise it counts
      // for; the store ignores a value that belongs to another exercise.
      wrongAnswerStreak: state.wrongAnswerStreak,
      wrongAnswerTaskId: state.wrongAnswerTaskId,
      boardCheckFailures: state.boardCheckFailures,
      boardCheckFailuresTaskId: state.boardCheckFailuresTaskId,
      // Station 2: a wrong digit typed in the task on screen (PRD 23 §ב). Not
      // saved, a reload forgot it, and the task was then recorded as solved
      // on the first attempt.
      hasDigitErrorInTask: state.hasDigitErrorInTask === true,
      // Stations 3–7: the result row's place-cue scaffold stays to the end of
      // the exercise (register 28). Not saved, a reload took it away and the
      // next place error logged a second PLACE_CUES_SHOWN for one exercise.
      placeCuesShown: state.placeCuesShown === true,
      // The coaching cards that come in levels, already shown in this exercise
      // (C5 before the column's card, C4 once): not saved, a reload showed the
      // first level again (owner, 30.9.2026). Carries its exercise id.
      socraticCardKinds: state.socraticCardKinds ?? null,
      // …and the cards opened, with the same lifetime (final review,
      // 2.10.2026): without them a reload restarted "twice at most" and "never
      // after a right answer".
      socraticCardHistory: state.socraticCardHistory ?? null,
      // Subtraction: the board held the first number, and taking away started.
      takeAwayTrack: state.takeAwayTrack ?? null,
      // Column dimming only (view): the skeleton's board has held the number
      // its board work starts from — a reload mid-computation keeps the focus.
      heldFromTrack: state.heldFromTrack ?? null,
      // Stations 3 and 7: the single answer box as it was at the last press of
      // "התקדם". Not saved, a reload recorded its unchanged digits again.
      lastSubmittedAnswer: typeof state.lastSubmittedAnswer === 'string' ? state.lastSubmittedAnswer : null,
      // The representations already recorded in a two-ways exercise (stations
      // 2, 3, 7). restoreSession read them, but they were never saved, so a
      // reload set "הוספת ייצוג" back to (1/2).
      q3Reps: state.q3Reps,
      // Meeting 8's reflection board: the stage and the answers chosen so far
      // (Module 16 §ב). Kept only on screen, so a reload started the board
      // again at stage 1 with nothing chosen.
      reflectionDraft: state.reflectionDraft,
      // The chosen branch travels with the index that points into it (restoreSession
      // rebuilds the branch tasks from it), and the radar's "אתגר / ביסוס" badge reads it.
      selectedBranch: state.selectedBranch ?? null,
      // Module 26: the bank the meeting is pinned to. Without it a reload
      // re-resolved the path, and before the learner record arrived that was
      // the green bank for every learner.
      activeBankPath: state.activeBankPath ?? null,
      // Register 18 / decision ב: the grid's return tab, and an open grid,
      // belong to the meeting and survive a reload.
      additionHelperOffered: Boolean(state.additionHelperOffered),
      isAdditionHelperOpen: Boolean(state.isAdditionHelperOpen),
      helpRequested: Boolean(state.helpRequested),
      // PRD Module 11: the last actions stay undoable after a reload too
      // (capped at UNDO_STACK_CAP frames; restoreSession already reads it).
      // The database drops empty objects: a frame saved before the first digit
      // would come back without its (empty) input, and undo would then leave
      // that digit on screen. hasInput says the frame had one.
      // hasConversions does the same for a conversion frame saved before any conversion.
      undoStack: state.undoStack.map((frame) => ({
        ...frame,
        hasInput: frame.answerDigits !== undefined,
        hasConversions: frame.conversionsByColumn !== undefined,
      })),
      // The hidden digits of a skeleton exercise (meetings 4–8) were never saved:
      // a reload lost them, and the next undo brought a lost one back.
      operandDigits: state.operandDigits,
      activeTask: currentTask ? {
        id: currentTask.id,
        titleHe: currentTask.titleHe,
        instructionHe: currentTask.instructionHe,
        numberA: currentTask.numberA ?? null,
        numberB: currentTask.numberB ?? null,
        isSubtraction: currentTask.isSubtraction ?? false,
      } : null,
    };

    return JSON.parse(JSON.stringify(raw, (_k, v) => (v === undefined ? null : v)));
  }

  private stopSync() {
    // The last synced state first, then the offline mark sent at once and
    // merged with it — so a pending "online" write can never land after it.
    if (this.unsubscribeWorkspace) {
      this.flushRemoteSync();
      this.unsubscribeWorkspace();
      this.unsubscribeWorkspace = null;
    }
    this.localBaseline = null;
    this.discardedStart = null;
    if (this.currentUserId) {
      rtdbUpdateNow(`users/students/${this.currentUserId}`, { isOnline: false }).catch((err) => {
        console.error("Failed to set student offline during logout:", err);
      });
      this.currentUserId = null;
    }
    if (this.unsubscribeFirebase) {
      this.unsubscribeFirebase();
      this.unsubscribeFirebase = null;
    }
  }

  public async loadTeacher(teacherId: string) {
    const teacherRef = ref(database, `users/teachers/${teacherId}`);
    const snapshot = await get(teacherRef);
    return snapshot.val();
  }

  public async authenticateTeacher(ssoEmail: string) {
    const teacherRef = ref(database, `users/teachers/${ssoEmail}`);
    const snapshot = await get(teacherRef);
    if (!snapshot.exists()) return null;
    return snapshot.val();
  }

  public async registerTeacher(teacherData: Record<string, unknown>) {
    const id = (teacherData.id || teacherData.ssoEmail || teacherData.uid) as string;
    if (!id) throw new Error("Missing teacher ID for registration");
    const dataToSave = {
      ...teacherData,
      id,
      licenseActive: false, // Security rules require licenseActive to be false upon new registration
    };
    const teacherRef = ref(database, `users/teachers/${id}`);
    await set(teacherRef, dataToSave);
  }

  // --- NEW: Sync specific fields to Firebase directly ---
  public async syncQMatrix(rawStudentId: string, qMatrixUpdates: Partial<QMatrix>) {
    if (!rawStudentId) return;
    const studentId = normalizeStudentId(rawStudentId);
    const qMatrixRef = ref(database, `users/students/${studentId}/qMatrixResults`);
    await update(qMatrixRef, qMatrixUpdates).catch((err) => {
      console.error(`[FirebaseSyncService] Failed to sync Q-Matrix for ${studentId}:`, err);
      throw err;
    });
    if (rawStudentId !== studentId) {
      await update(ref(database, `users/students/${rawStudentId}/qMatrixResults`), qMatrixUpdates).catch((err) => {
        console.warn(`[FirebaseSyncService] Legacy Q-Matrix mirror notice for ${rawStudentId}:`, err);
      });
    }
  }

  public async syncTraceData(rawStudentId: string, traceDataUpdates: Partial<TraceData>) {
    if (!rawStudentId) return;
    const studentId = normalizeStudentId(rawStudentId);
    // PRD 18: at most one write per second to the learner record. traceData is
    // logged on every digit and block action, so it joins the same throttled
    // window as every other lesson-time write (as `traceData/<field>` keys).
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(traceDataUpdates)) fields[`traceData/${k}`] = v;
    if (Object.keys(fields).length === 0) return;
    // Not awaited: the window resolves up to a second later, and no caller
    // needs to wait for it (the live telemetry update does the same).
    throttledRtdbUpdate(`users/students/${studentId}`, fields).catch((err) => {
      console.error(`[FirebaseSyncService] Failed to sync trace data for ${studentId}:`, err);
    });
    if (rawStudentId !== studentId) {
      throttledRtdbUpdate(`users/students/${rawStudentId}`, fields).catch((err) => {
        console.warn(`[FirebaseSyncService] Legacy trace data mirror notice for ${rawStudentId}:`, err);
      });
    }
  }

  public async syncConceptMastery(rawStudentId: string, masteryUpdates: any) {
    if (!rawStudentId) return;
    const studentId = normalizeStudentId(rawStudentId);
    const masteryRef = ref(database, `users/students/${studentId}/conceptMastery`);
    await update(masteryRef, masteryUpdates).catch((err) => {
      console.error(`[FirebaseSyncService] Failed to sync concept mastery for ${studentId}:`, err);
      throw err;
    });
    if (rawStudentId !== studentId) {
      await update(ref(database, `users/students/${rawStudentId}/conceptMastery`), masteryUpdates).catch((err) => {
        console.warn(`[FirebaseSyncService] Legacy concept mastery mirror notice for ${rawStudentId}:`, err);
      });
    }
  }

  public async syncLiveSessionMetrics(rawStudentId: string, metricsUpdates: any) {
    if (!rawStudentId) return;
    const studentId = normalizeStudentId(rawStudentId);
    const metricsRef = ref(database, `users/students/${studentId}/live_session_metrics`);
    await update(metricsRef, metricsUpdates).catch((err) => {
      console.error(`[FirebaseSyncService] Failed to sync live session metrics for ${studentId}:`, err);
      throw err;
    });
    if (rawStudentId !== studentId) {
      await update(ref(database, `users/students/${rawStudentId}/live_session_metrics`), metricsUpdates).catch((err) => {
        console.warn(`[FirebaseSyncService] Legacy metrics mirror notice for ${rawStudentId}:`, err);
      });
    }
  }

  // syncApproveRoute() was removed deliberately. It wrote teacher_gate_approved
  // and routeStatus:'APPROVED' to RTDB with no Firestore write, no session-2
  // completion check and no pedagogical path — a second, unverified gate
  // approval competing with Module 20's single source of truth. Every gate
  // approval now goes through core/teacherGate.ts, which writes the
  // SessionDocument first and mirrors to RTDB only as transport.

  public async syncPhysicalOverride(
    studentId: string,
    overrideInput: boolean | {
      routeStatus?: string;
      difficultyRecommendation?: string;
      isASD?: boolean;
      physicalOverride?: boolean;
      physicalOverrideActive?: boolean;
      overrideUpdatedAt?: number;
    }
  ) {
    if (!studentId) return;

    const overrideData = typeof overrideInput === 'boolean' 
      ? { physicalOverride: overrideInput }
      : overrideInput;

    // Module 20: the gate override is NEVER implied. The old `?? true` default
    // meant that saving any learning-conditions payload (ASD toggle, scaffold
    // level) silently stamped physicalOverride: true — and the student route
    // guard treats that flag as a full bypass of the teacher approval gate.
    const isPhysical = overrideData.physicalOverride ?? false;
    const isASD = overrideData.isASD ?? false;
    const updatedAt = overrideData.overrideUpdatedAt ?? Date.now();

    // routeStatus is the teacher-gate decision (Module 20) and is owned by
    // core/teacherGate.ts. This function used to default a missing routeStatus
    // to 'APPROVED' and write it unconditionally, so saving unrelated learning
    // conditions (scaffold, ASD, addition helper) for a learner still
    // PENDING_TEACHER_APPROVAL silently unlocked them into session 3 with no
    // gate decision ever made — and left Firestore (no teacher_gate_approved)
    // disagreeing with RTDB. Gate fields are written only when the caller
    // explicitly supplies them; the same applies to difficultyRecommendation.
    // The gate flags are written ONLY when the caller explicitly supplies
    // them — a learning-conditions save must neither grant nor revoke a gate
    // decision made elsewhere.
    const gateFlagsSupplied =
      overrideData.physicalOverride !== undefined || overrideData.physicalOverrideActive !== undefined;
    const studentOverridePayload = {
      ...(overrideData.routeStatus !== undefined && { routeStatus: overrideData.routeStatus }),
      ...(overrideData.difficultyRecommendation !== undefined && {
        difficultyRecommendation: overrideData.difficultyRecommendation,
      }),
      isASD: isASD,
      ...(gateFlagsSupplied && {
        physicalOverride: isPhysical,
        physicalOverrideActive: overrideData.physicalOverrideActive ?? isPhysical,
      }),
      overrideUpdatedAt: updatedAt,
    };

    await update(ref(database, `users/students/${studentId}`), {
      ...studentOverridePayload,
      'workspaceState/isASD': isASD,
    }).catch((err) => {
      console.error(`[FirebaseSyncService] Failed to sync physical override for ${studentId}:`, err);
      throw err;
    });

    await update(ref(database, `students/${studentId}`), studentOverridePayload).catch((err) => {
      console.warn(`[FirebaseSyncService] Legacy students collection mirror notice for ${studentId}:`, err);
    });
  }

  // --- Module 17: FIFO Offline Sync Queue (IndexedDB persistence; LocalStorage is strictly forbidden for queues) ---
  private offlineTelemetryQueue: Array<{ refPath: string, payload: any, idempotency_key: string }> = [];
  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;

  private setupNetworkListeners() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.flushOfflineQueue();
      });
      window.addEventListener('offline', () => {
        this.isOnline = false;
      });
    }
  }

  private generateQueueIdempotencyKey(): string {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `idem_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }

  /**
   * Legacy migration only (Module 17): drains a queue persisted by older client
   * versions into localStorage, then removes the key. New writes never touch
   * localStorage — IndexedDB is the sole durable buffer for the sync queue.
   */
  private loadOfflineQueueFromStorage() {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem('mathmaticore_offline_queue');
      if (raw) {
        const items = JSON.parse(raw);
        if (Array.isArray(items)) {
          this.offlineTelemetryQueue = items
            .slice(-500)
            .filter((it: any) => it && typeof it.refPath === 'string')
            .map((it: any) => ({
              refPath: it.refPath,
              payload: it.payload,
              idempotency_key: it.idempotency_key || this.generateQueueIdempotencyKey(),
            }));
        }
        localStorage.removeItem('mathmaticore_offline_queue');
      }
    } catch (e) {
      console.warn("Failed to migrate legacy offline telemetry queue:", e);
    }
  }

  private enqueueOfflineTransaction(refPath: string, payload: any) {
    const idempotency_key = payload?.idempotency_key || this.generateQueueIdempotencyKey();
    this.offlineTelemetryQueue.push({ refPath, payload, idempotency_key });
    // Queue capacity is 500 items in strict FIFO order; oldest transaction drops on overflow
    if (this.offlineTelemetryQueue.length > 500) {
      this.offlineTelemetryQueue.shift();
      console.warn("Offline telemetry queue exceeded 500 items. Dropping oldest transaction.");
    }
    // Module 17: durable persistence goes to IndexedDB only, carrying the idempotency key
    indexedDBQueue.enqueue(refPath, { ...payload, idempotency_key }).catch(() => {});
  }

  private async flushOfflineQueue() {
    this.loadOfflineQueueFromStorage();
    if (this.offlineTelemetryQueue.length === 0) {
      indexedDBQueue.flushQueue().catch(() => {});
      return;
    }
    console.info(`Flushing ${this.offlineTelemetryQueue.length} transactions from offline queue.`);
    const queueToFlush = [...this.offlineTelemetryQueue];
    this.offlineTelemetryQueue = [];

    for (const transaction of queueToFlush) {
      try {
        // Idempotent write: the deterministic child key makes retries overwrite instead of duplicate
        await set(ref(database, `${transaction.refPath}/${transaction.idempotency_key}`), transaction.payload);
      } catch (e) {
        console.error("Failed to flush transaction, re-queueing:", e);
        this.enqueueOfflineTransaction(transaction.refPath, { ...transaction.payload, idempotency_key: transaction.idempotency_key });
      }
    }

    // Drain items persisted in IndexedDB; shared idempotency keys make this a no-op for already-sent events
    indexedDBQueue.flushQueue().catch(() => {});
  }

  // --- PRD V2.0 Section 7: Offline-First Resilience (Session Progress Cache) ---
  //
  // Two kinds of copy per learner (catch-up, 2.10.2026): the latest copy, of
  // whatever meeting (the one key there always was, read by every one-argument
  // caller), and one copy per meeting. A meeting started without a connection
  // replaces the latest copy but never another meeting's own copy, so a
  // meeting reopened for catch-up still finds what this device saved of it.
  public saveSessionProgressLocally(studentId: string, sessionData: any): void {
    if (typeof window === 'undefined' || !studentId) return;
    try {
      const json = JSON.stringify({
        ...sessionData,
        updatedAt: Date.now()
      });
      localStorage.setItem(deviceCacheKey(studentId), json);
      const meeting = sessionData?.sessionNumber;
      if (isMeetingNumber(meeting)) localStorage.setItem(deviceMeetingCacheKey(studentId, meeting), json);
    } catch (e) {
      console.warn("Failed to cache session progress locally:", e);
    }
  }

  /**
   * This device's copy. Without a meeting: the latest copy, of whatever
   * meeting (as always). With one: this device's copy of that meeting — its
   * own copy, or the latest copy when that is of this meeting and later (saved
   * before per-meeting copies existed); null when there is neither.
   */
  public getLocalSessionProgress(studentId: string, meeting?: number): any | null {
    if (typeof window === 'undefined' || !studentId) return null;
    const read = (key: string) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    };
    try {
      if (meeting === undefined) return read(deviceCacheKey(studentId));
      if (!isMeetingNumber(meeting)) return null;
      let own: any = null;
      let latest: any = null;
      try { own = read(deviceMeetingCacheKey(studentId, meeting)); } catch { own = null; }
      try { latest = read(deviceCacheKey(studentId)); } catch { latest = null; }
      if (latest?.sessionNumber !== meeting) latest = null;
      if (!own) return latest;
      if (!latest) return own;
      return workspaceSavedAt(latest) > workspaceSavedAt(own) ? latest : own;
    } catch (e) {
      console.warn("Failed to retrieve local session progress:", e);
      return null;
    }
  }

  /**
   * Drops this device's copies. Without a meeting: every copy of this learner
   * (the latest and each meeting's). With one: that meeting's copy, and the
   * latest copy only when it is of that meeting.
   */
  public clearLocalSessionProgress(studentId: string, meeting?: number): void {
    if (typeof window === 'undefined' || !studentId) return;
    try {
      if (meeting === undefined) {
        localStorage.removeItem(deviceCacheKey(studentId));
        for (const m of MEETINGS) localStorage.removeItem(deviceMeetingCacheKey(studentId, m));
        return;
      }
      if (!isMeetingNumber(meeting)) return;
      localStorage.removeItem(deviceMeetingCacheKey(studentId, meeting));
      let latestMeeting: unknown;
      try { latestMeeting = JSON.parse(localStorage.getItem(deviceCacheKey(studentId)) || 'null')?.sessionNumber; } catch { latestMeeting = meeting; }
      // A latest copy that names no meeting cannot be told apart: it goes too.
      if (latestMeeting === meeting || !isMeetingNumber(latestMeeting)) localStorage.removeItem(deviceCacheKey(studentId));
    } catch {
      // ignore
    }
  }

  /**
   * Catch-up (2.10.2026): meeting N is finished — completedMeetings/m{N} on
   * the learner record, on the server's clock, under both spellings of the
   * learner's id (as syncHighestCompletedMeeting). Sent once per meeting: not
   * again from this page, and not when the record already carries the mark.
   * Never removed here; a teacher's reset of the meeting removes it.
   * The caller checks isSupersededByOtherDevice.
   */
  public markMeetingCompleted(studentId: string, meeting: number): void {
    if (!studentId || !isMeetingNumber(meeting)) return;
    const normId = normalizeStudentId(studentId);
    const students = (typeof useStore?.getState === 'function' ? useStore.getState().students : {}) as Record<string, any>;
    const alreadyOnRecord = [studentId, normId].some((id) => Boolean(students?.[id]?.completedMeetings?.[meetingKey(meeting)]));
    for (const id of new Set([studentId, normId])) {
      const tag = `${id}|${meeting}`;
      if (alreadyOnRecord || this.completedMarksSent.has(tag)) continue;
      this.completedMarksSent.add(tag);
      throttledRtdbUpdate(`users/students/${id}`, { [completedMeetingField(meeting)]: serverTimestamp() }).catch((err) => {
        this.completedMarksSent.delete(tag);
        console.error(`[FirebaseSyncService] Could not mark meeting ${meeting} finished on ${id}:`, err);
      });
    }
  }

  // --- PRD V2.0 Section 7: Milestone Telemetry Logging ---
  public async logMilestoneEvent(
    studentId: string,
    sessionId: string,
    milestoneType: 'GROUP' | 'UNGROUP' | 'INPUT_SUBMIT' | 'UNDO' | 'SOCRATIC_SUBMIT' | 'DELETE_TRASH',
    details: Record<string, any>
  ): Promise<void> {
    if (!studentId) return;
    const milestonePayload = {
      event_type: 'milestone',
      milestone_type: milestoneType,
      session_id: sessionId,
      timestamp: Date.now(),
      details
    };

    if (!this.isOnline) {
      this.enqueueOfflineTransaction(`users/students/${studentId}/milestones`, milestonePayload);
      return;
    }

    try {
      const milestoneRef = push(ref(database, `users/students/${studentId}/milestones`));
      await set(milestoneRef, milestonePayload);
    } catch {
      this.enqueueOfflineTransaction(`users/students/${studentId}/milestones`, milestonePayload);
    }
  }

  // --- Module 5 & Module 17: Canonical Telemetry Emitter ---
  /**
   * Unified single entry point for all 13 telemetry event types.
   * 1. Constructs typed TelemetryPayload<T> with UUID idempotency_key.
   * 2. Validates column_index rule per Module 5 §C.
   * 3. Performs RTDB live-state write to users/students/{studentId} (Presence, lastAction, error_category, etc.).
   * 4. Enqueues payload into IndexedDB FIFO queue for resilient sync to Firestore telemetry_logs.
   */
  public async emitTelemetry<T extends TelemetryEventType>(event: {
    session_id: string;
    student_id?: number | string;
    exercise_id: string;
    event_type: T;
    column_index?: number;
    details: TelemetryDetailsMap[T];
  }): Promise<TelemetryPayload<T> | null> {
    // The teacher's demonstration board (Module 15, ProjectorSandboxPage) runs
    // on the learners' workspace store, so it raised their events too. It is
    // no learner's work: nothing is recorded, and nothing is logged as dropped.
    if (useWorkspaceStore.getState().projectorBoard) return null;

    // 1. Resolve the numeric student_id (strictly 1-12, per Module 5 and the
    //    Firestore rule that telemetry_logs.student_id must equal the
    //    authenticated learner). This must never guess: filing one learner's
    //    events under another corrupts the research record silently, and no
    //    later pass can tell which rows were mis-attributed.
    const numStudentId = resolveTelemetryStudentId(event.student_id, this.currentUserId);
    if (numStudentId === null) {
      console.error(
        `[FirebaseSyncService] Telemetry dropped: cannot resolve a pilot student id (1-12) for event '${event.event_type}'.`,
        { student_id: event.student_id, currentUserId: this.currentUserId }
      );
      return null;
    }

    const normUid = `student_user${numStudentId}`;
    const rawStudentUid = `student_${numStudentId}`;

    // 2. Generate UUID idempotency_key
    const idempotency_key = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `telemetry_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // 3. Build TelemetryPayload<T>
    const payload: TelemetryPayload<T> = {
      idempotency_key,
      client_timestamp: Date.now(),
      session_id: event.session_id || 'session_1',
      student_id: numStudentId,
      exercise_id: event.exercise_id || 'ex_1',
      event_type: event.event_type,
      ...(event.column_index !== undefined ? { column_index: event.column_index } : {}),
      details: event.details,
    };

    // Owner decision E1 (27.9.2026, register deviation 24): the closing
    // sentence is chosen by this meeting's U, E and G. They are counted here,
    // from the very events the server will count, so the two cannot disagree.
    useWorkspaceStore.getState().recordPersistenceEvent(payload);
    // PRD Module 13 §א: the Socratic engine reads the learner's real recent steps.
    recordRecentTelemetry(payload);

    // 4. Validate column_index rule (Module 5 §C)
    const validation = validateTelemetryColumnIndexRule(payload);
    if (!validation.isValid) {
      console.warn(`[FirebaseSyncService] Telemetry validation warning for ${event.event_type}:`, validation.reason);
    }

    // 5. Unified RTDB live-state snapshot update (Module 4 & Module 18)
    const rtdbLiveUpdate: Record<string, any> = {
      lastPing: serverTimestamp(),
      lastActivityTimestamp: Date.now(),
      onlineStatus: 'active',
    };

    // Derive Hebrew lastAction label
    const eventLabels: Record<TelemetryEventType, string> = {
      BOARD_CLEARED: 'ניקוי בית המספרים בפח האשפה',
      SESSION_START: 'תחילת מפגש למידה',
      PROBLEM_LOAD: 'טעינת תרגיל במרחב העבודה',
      BLOCK_DRAG_COMPLETE: 'גרירת לבנה בבית המספרים',
      REGROUPING_TRIGGERED: 'הפעלת המרה / פריטה',
      REGROUPING_SUCCESS: 'השלמת פריטה / קיבוץ בהצלחה',
      DIGIT_ENTERED: 'הקלדת ספרה',
      DIGIT_DELETED: 'מחיקת ספרה (בקרה עצמית)',
      UNDO_EXECUTED: 'ביטול פעולה (Undo)',
      HESITATION_DETECTED: 'היסוס קוגניטיבי (45 שנ׳)',
      SOCRATIC_CARD_SHOWN: 'כרטיס החניכה נפתח',
      SOCRATIC_OPTION_SELECTED: 'בחירת תשובה בכרטיס חניכה',
      PROBLEM_COMPLETE: 'השלמת תרגיל בהצלחה',
      REFLECTION_SUBMITTED: 'הגשת רפלקציה SRL',
      ADAPTIVE_GRID_TOGGLED: 'לוח החיבור נפתח או נסגר',
      KEYBOARD_LOCK_BLOCKED: 'ניסיון הקלדה לפני המרה בלבני הדינס',
      HELP_REQUESTED: 'קריאה שקטה למורה',
      HELP_WITHDRAWN: 'ביטל את הקריאה למורה',
      CHAT_HELP_REQUESTED: 'ביקש עזרה מהצ׳אט',
      PLACE_CUES_SHOWN: 'ספרה בתיבה של טור אחר: הופיעו צבעי הטורים וכותרותיהם',
    };
    rtdbLiveUpdate.lastAction = eventLabels[event.event_type] || event.event_type;
    // The enhanced profile always has the colours; only the labels appear
    // (register 28) — the words of the learner's timeline (LearnerJourneyService).
    if (event.event_type === 'PLACE_CUES_SHOWN' && (event.details as PlaceCuesShownDetails | undefined)?.profile === 'enhanced') {
      rtdbLiveUpdate.lastAction = 'ספרה בתיבה של טור אחר: הופיעו כותרות הטורים';
    }

    // Special event-driven RTDB state mappings
    if (event.event_type === 'HESITATION_DETECTED') {
      rtdbLiveUpdate.hesitationSeconds = (event.details as HesitationDetectedDetails).hesitation_seconds;
    } else if (event.event_type === 'SOCRATIC_CARD_SHOWN') {
      rtdbLiveUpdate.isSocraticActive = true;
      const details = event.details as SocraticCardShownDetails;
      if (details.error_category) {
        rtdbLiveUpdate.error_category = details.error_category;
        // PRD v7.1 Module 18: the radar detail layer shows the learner's
        // classification DISTRIBUTION for the current session, so every
        // classification is tallied per session, not just the latest one.
        const sessionNum = useWorkspaceStore.getState().sessionNumber || 1;
        runTransaction(
          ref(database, `users/students/${normUid}/errorCategoryDistribution/session_${sessionNum}/${details.error_category}`),
          (current) => (typeof current === 'number' ? current : 0) + 1
        ).catch(() => {});
      }
    } else if (event.event_type === 'SOCRATIC_OPTION_SELECTED') {
      const details = event.details as SocraticOptionSelectedDetails;
      if (details.is_correct) {
        rtdbLiveUpdate.isSocraticActive = false;
      }
    } else if (event.event_type === 'UNDO_EXECUTED') {
      rtdbLiveUpdate['workspaceState/undoCount'] = (event.details as UndoExecutedDetails).undo_stack_depth_before;
    }

    // Write live snapshot to RTDB for both student aliases — merged into the
    // record's one write per window (PRD 18: at most once per 1000 ms). It used
    // to be a write of its own on every event: ten block drops, ten writes.
    throttledRtdbUpdate(`users/students/${normUid}`, rtdbLiveUpdate).catch(() => {});
    if (normUid !== rawStudentUid) {
      throttledRtdbUpdate(`users/students/${rawStudentUid}`, rtdbLiveUpdate).catch(() => {});
    }

    // 6. Enqueue into IndexedDB FIFO queue (Module 17) -> syncs to Firestore telemetry_logs
    await indexedDBQueue.enqueue(payload).catch((err) => {
      console.error('[FirebaseSyncService] Failed to enqueue telemetry payload to IndexedDB:', err);
    });

    return payload;
  }

  // --- PRD v4 Task 1 Implementation Functions ---
  public async syncSessionState(studentId: string, sessionState: SessionState): Promise<void> {
    if (!studentId) return;
    const normId = normalizeStudentId(studentId);
    const path = `users/students/${normId}/sessionState`;
    // The fields of sessionState, written through the learner record's one
    // throttled writer (PRD 18: at most once per 1000 ms).
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(sessionState)) fields[`sessionState/${k}`] = v;
    await throttledRtdbUpdate(`users/students/${normId}`, fields).catch((err) => {
      console.warn(`[FirebaseSyncService] Failed to sync sessionState for ${normId}, enqueuing to offline queue:`, err);
      // The same fields, merged into sessionState itself on replay — never a
      // child of it — under one key per learner and meeting, so a replay
      // repeats the same write instead of creating a new record each time.
      indexedDBQueue
        .enqueueRtdbMerge(path, { ...sessionState }, `session_state_${normId}_s${sessionState.session_number}`)
        .catch(console.error);
    });
  }

  public async syncHighestCompletedMeeting(studentId: string, meeting: number): Promise<void> {
    if (!studentId || typeof meeting !== 'number') return;
    const normId = normalizeStudentId(studentId);

    const updateNode = async (id: string) => {
      const meetingRef = ref(database, `users/students/${id}/highestCompletedMeeting`);
      await runTransaction(meetingRef, (currentVal) => {
        return calculateMonotonicMeetingUpdate(currentVal, meeting);
      }).catch((err) => {
        console.error(`[FirebaseSyncService] runTransaction failed for highestCompletedMeeting on ${id}:`, err);
      });
    };

    await updateNode(studentId);
    if (normId !== studentId) {
      await updateNode(normId);
    }
  }

  public async syncMeeting2Complete(studentId: string): Promise<void> {
    if (!studentId) return;
    const normId = normalizeStudentId(studentId);
    await this.syncHighestCompletedMeeting(studentId, 2);
    await update(ref(database, `users/students/${studentId}`), { completedMeeting2: true }).catch(console.error);
    if (normId !== studentId) {
      await update(ref(database, `users/students/${normId}`), { completedMeeting2: true }).catch(console.error);
    }
  }

  public handlePermissionOrAuthError(error: any) {
    const errMsg = String(error?.message || error?.code || error);
    if (
      errMsg.includes('PERMISSION_DENIED') ||
      errMsg.includes('auth/id-token-expired') ||
      errMsg.includes('auth/user-token-expired') ||
      error?.code === 'PERMISSION_DENIED'
    ) {
      console.error('[FirebaseSyncService] Auth token expired or PERMISSION_DENIED detected. Dispatching auth error event.');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('firebase:auth_expired', { detail: { error: errMsg } }));
      }
    }
  }

  public async logTelemetryEvent(studentId: string, event: TelemetryEvent): Promise<void> {
    if (!studentId) return;
    const refPath = `telemetry_events/${studentId}`;
    
    if (!this.isOnline) {
      this.enqueueOfflineTransaction(refPath, event);
      return;
    }

    try {
      await push(ref(database, refPath), event);
    } catch {
      this.enqueueOfflineTransaction(refPath, event);
    }
  }

  /**
   * The learner's side of the meeting-2 completion. It carries no score and
   * no recommended path: PRD Module 20 computes both "בטריגר עצמאי על סיום
   * המפגש" (sessionTrigger.ts), and the rules refuse a learner write that sets
   * or changes them (owner, 29.9.2026). The teacher's screens show "טרם
   * נקבעה" until the trigger has written them.
   */
  public async syncSession2Completion(
    rawStudentId: string,
    classId: string = 'class_1'
  ) {
    const studentId = normalizeStudentId(rawStudentId);
    const studentNum = studentId.replace(/\D/g, '') || '1';
    const now = Date.now();
    const docId = `session_02_student_${studentNum}`;

    // No session_start_time / session_deadline_time: Module 14 §ב makes the
    // server "the only source of truth" for both, and "the Zustand store …
    // is not authorised to set times". They used to be the device clock
    // ±30 minutes — neither the server's times nor meeting 2's 25 minutes.
    const sessionDoc: Omit<SessionDocument, 'session_score_percent' | 'matrix_recommended_path' | 'session_start_time' | 'session_deadline_time'> = {
      session_id: docId,
      class_id: classId,
      session_number: 2,
      active_exercise_id: 'task8_missing_addend',
      is_completed: true,
      teacher_gate_approved: false,
      gate_approved_at: null,
      gate_approved_by: null,
      teacher_selected_path: null,
    };

    // Both writes go through the IndexedDB queue (Module 17 §ב: "IndexedDB
    // משמש כמאגר אגירה עמיד"), behind the meeting's telemetry already queued
    // (Module 29 §ג: "סדר FIFO קשוח"). They used to be written directly: the
    // RTDB and Firestore SDKs neither reject nor persist a write made offline
    // (Firestore runs on the memory cache), so a reload lost both — and the
    // session document could reach the server before the meeting's own
    // telemetry, and the server trigger (sessionTrigger.ts) then scored the
    // meeting once, on part of it.
    //
    // 1. RTDB users/students/${studentId} — what the teacher's gate list and
    // the learner's own waiting screen read. Merged into the record. A late
    // replay over the teacher's approval must not lock the child out again,
    // so the two gate fields are left out when the record is already approved
    // (GATE_PENDING_FIELDS). The approval itself cannot overtake this item:
    // the teacher approves on the session document, queued right behind it.
    // The score and path are the server's: sessionTrigger.ts mirrors them
    // here itself.
    const rtdbPath = `users/students/${studentId}`;
    const rtdbPayload = {
      session_02_completed: true,
      teacher_gate_approved: false,
      routeStatus: 'PENDING_TEACHER_APPROVAL',
      updatedAt: now
    };
    await indexedDBQueue
      .enqueueRtdbMerge(rtdbPath, rtdbPayload, `s2_done_rtdb_${studentId}`, {
        skipFieldsIfGateApproved: GATE_PENDING_FIELDS,
      })
      .catch((e) => console.error('[FirebaseSyncService] Session 2 completion (RTDB) could not be queued:', e));

    // 2. Firestore `sessions/${docId}` — the SessionDocument the server scores
    // (Module 23 §ב) and the gate approves on (Module 20). Not held back until
    // the RTDB item is acknowledged: it is simply the next item in the queue.
    // The document is read before the write: one already completed is this
    // write, delivered (deliveredWhen), and nothing is written. The trigger
    // scores a document once, when it first becomes completed; a late
    // re-send with merge:true used to overwrite the server's score and path
    // with the client's (seen on the emulator: 29% remediation_path → 71%
    // green_path), and the trigger did not run again.
    if (firestore && (typeof (firestore as any).type === 'string' || (firestore as any)._delegate || (firestore as any).app)) {
      await indexedDBQueue
        .enqueueFirestoreDoc('sessions', docId, sessionDoc as unknown as Record<string, unknown>, `s2_done_doc_${docId}`, {
          deliveredWhen: { is_completed: true },
        })
        .catch((e) => console.error('[FirebaseSyncService] Session 2 completion (Firestore) could not be queued:', e));
    }
  }

  public async fetchTeacherClassrooms(teacherId: string): Promise<Classroom[]> {
    const classesSnapshot = await get(ref(database, 'classes'));
    if (!classesSnapshot.exists()) return [];
    const classesVal = classesSnapshot.val() || {};
    const classrooms: Classroom[] = [];
    Object.values(classesVal).forEach((c: any) => {
      if (c.teacherId === teacherId || c.teacher_id === teacherId) {
        classrooms.push({
          id: c.id,
          teacher_id: c.teacher_id || c.teacherId || teacherId,
          name: c.name || `כיתה ${c.id}`,
          anonymous_students: c.anonymous_students || c.students || Array.from({ length: 12 }, (_, i) => `student_${i + 1}`)
        });
      }
    });
    return classrooms;
  }

  public async fetchClassroomSessions(classId: string): Promise<SessionState[]> {
    const sessionsSnapshot = await get(ref(database, 'sessions'));
    if (!sessionsSnapshot.exists()) return [];
    const sessionsVal = sessionsSnapshot.val() || {};
    const sessionList: SessionState[] = [];
    Object.values(sessionsVal).forEach((s: any) => {
      if (!classId || s.class_id === classId || s.classId === classId) {
        sessionList.push({
          student_id: s.student_id || s.studentId || '',
          session_number: s.session_number || s.sessionNumber || 1,
          status: s.status || 'active',
          current_path: s.current_path || s.currentPath || 'green_path',
          hesitation_seconds: s.hesitation_seconds || 0,
          error_count: s.error_count || 0,
          physical_override: s.physical_override || false,
          last_alert: s.last_alert || undefined
        });
      }
    });
    return sessionList;
  }

  // --- NEW: Public and Admin Listeners ---
  private syncSharedListeners(isAuthenticated: boolean) {
    if (isAuthenticated) {
      if (!this.unsubscribeSchools) {
        const schoolsRef = ref(database, 'schools');
        this.unsubscribeSchools = onValue(schoolsRef, (snapshot) => {
          if (typeof useAdminStore?.setState === 'function') {
            if (snapshot.exists()) {
              const schoolsVal = snapshot.val();
              const schools = schoolsVal ? Object.values(schoolsVal) as School[] : [];
              useAdminStore.setState({ schools });
            } else {
              useAdminStore.setState({ schools: [] });
            }
          }
        }, (error) => {
          console.warn("Schools listener notice:", error?.message || error);
        });
      }

      if (this.unsubscribePublicClasses) {
        this.unsubscribePublicClasses();
        this.unsubscribePublicClasses = null;
      }
      if (!this.unsubscribeClasses) {
        const classesRef = ref(database, 'classes');
        this.unsubscribeClasses = onValue(classesRef, (snapshot) => {
          if (typeof useAdminStore?.setState === 'function') {
            const classesVal = snapshot.val();
            const classes = classesVal ? Object.values(classesVal) as ClassRoom[] : [];
            useAdminStore.setState({ classes });
          }
        }, (error) => {
          console.warn("Classes listener notice:", error?.message || error);
        });
      }
    } else {
      if (this.unsubscribeSchools) {
        this.unsubscribeSchools();
        this.unsubscribeSchools = null;
      }
      if (this.unsubscribeClasses) {
        this.unsubscribeClasses();
        this.unsubscribeClasses = null;
      }
      if (!this.unsubscribePublicClasses) {
        const publicClassesRef = ref(database, 'public_classes');
        this.unsubscribePublicClasses = onValue(publicClassesRef, (snapshot) => {
          if (typeof useAdminStore?.setState === 'function') {
            const classesVal = snapshot.val();
            const classes = classesVal ? Object.values(classesVal) as ClassRoom[] : [];
            useAdminStore.setState({ classes });
          }
        }, (error) => {
          console.warn("Public classes listener notice:", error?.message || error);
        });
      }
    }
  }

  private async startAdminSync() {
    this.stopAdminSync();

    // No seeding. A fresh system used to get a made-up school 'ביקורת', class
    // 'כיתה 1' and teacher teacher.demo@… on the admin's first load, so the
    // setup wizard (Module 25) never appeared. An empty system now shows it.

    const teachersRef = ref(database, 'users/teachers');
    this.unsubscribeTeachers = onValue(teachersRef, (snapshot) => {
      const teachersVal = snapshot.val();
      const teachers = teachersVal ? Object.values(teachersVal) as Teacher[] : [];
      useAdminStore.setState({ teachers });
    });

    const limitRef = ref(database, 'system_control/globalStudentLimit');
    this.unsubscribeGlobalStudentLimit = onValue(limitRef, (snapshot) => {
      const limitVal = snapshot.val();
      const globalStudentLimit = limitVal !== null ? Number(limitVal) : 12;
      useAdminStore.setState({ globalStudentLimit });
    });
  }

  private stopAdminSync() {
    if (this.unsubscribeTeachers) {
      this.unsubscribeTeachers();
      this.unsubscribeTeachers = null;
    }
    if (this.unsubscribeGlobalStudentLimit) {
      this.unsubscribeGlobalStudentLimit();
      this.unsubscribeGlobalStudentLimit = null;
    }
    useAdminStore.setState({ teachers: [], globalStudentLimit: 12 });
  }

  // --- Admin actions syncing to Firebase ---
  // Module 25 §ב.1: one school with a fixed id and name — never a generated key.
  public async addSchool(_name: string, _preferredId?: string): Promise<School> {
    const id = PILOT_SCHOOL_ID;
    const school: School = { id, name: PILOT_SCHOOL_NAME, createdAt: Date.now() };
    await set(ref(database, `schools/${id}`), school);
    return school;
  }

  public async deleteSchool(schoolId: string) {
    // Fetch the latest teachers/classes list from Firebase via get()
    const teachersSnapshot = await get(ref(database, 'users/teachers'));
    const classesSnapshot = await get(ref(database, 'classes'));

    const teachersVal = teachersSnapshot.val() || {};
    const classesVal = classesSnapshot.val() || {};

    const teachers = Object.values(teachersVal) as Teacher[];
    const classes = Object.values(classesVal) as ClassRoom[];

    const updates: Record<string, null> = {};
    updates[`schools/${schoolId}`] = null;

    // Cascade delete teachers in this school
    const schoolTeachers = teachers.filter(t => t.schoolId === schoolId);
    schoolTeachers.forEach(t => {
      updates[`users/teachers/${t.id}`] = null;
    });

    // Cascade delete classes in this school (from both classes and public_classes)
    const schoolClasses = classes.filter(c => c.schoolId === schoolId);
    schoolClasses.forEach(c => {
      updates[`classes/${c.id}`] = null;
      updates[`public_classes/${c.id}`] = null;
    });

    await update(ref(database), updates);

    // The whitelist is what admits a teacher at login; a deleted school's
    // teachers must not keep a working key.
    const { removeAuthorizedTeacherFirestore } = await import('./AuthService');
    for (const t of schoolTeachers) {
      const email = t.ssoEmail || (t as { email?: string }).email;
      if (email && email.includes('@')) {
        await removeAuthorizedTeacherFirestore(email).catch(console.error);
      }
    }
  }

  public async addTeacher(schoolId: string, ssoEmail: string): Promise<Teacher> {
    // A raw email contains '.', which Firebase RTDB rejects as a key segment
    // (ref() throws, so the write never happened and the caller's .catch
    // swallowed it — the teacher looked created in local state but had no
    // users/teachers record at all). teacherRecordKey is the one key shape
    // every teacher-lookup path uses.
    const email = ssoEmail.trim().toLowerCase();
    const id = teacherRecordKey(email);
    const newTeacher: Teacher = {
      id,
      schoolId,
      ssoEmail: email,
      licenseActive: false,
      createdAt: Date.now()
    };
    await set(ref(database, `users/teachers/${id}`), newTeacher);
    // Module 25: the Firestore whitelist IS the teacher's key
    // to the door (isWhitelistedTeacherEmailAsync + syncUserRoles read it).
    // A failure here must reach the admin, not a console nobody watches.
    if (email.includes('@')) {
      const { addAuthorizedTeacherFirestore } = await import('./AuthService');
      await addAuthorizedTeacherFirestore(email, 'teacher', schoolId);
    }
    return newTeacher;
  }

  /**
   * Removes a teacher everywhere a login could still succeed from: the RTDB
   * record AND the Firestore whitelist (deleting only the record used to leave
   * the door open — syncUserRoles kept stamping teacher claims from the
   * whitelist doc). Classes are NOT deleted with the teacher: the pilot's one
   * class is where twelve learners log in, and losing it because a staff
   * member left is the wrong trade. A class the teacher owned is handed to
   * another teacher of the same school when there is one.
   */
  public async deleteTeacher(teacherId: string) {
    const [teacherSnap, teachersSnap, classesSnapshot] = await Promise.all([
      get(ref(database, `users/teachers/${teacherId}`)),
      get(ref(database, 'users/teachers')),
      get(ref(database, 'classes')),
    ]);
    const record = (teacherSnap.val() || null) as Teacher | null;
    const allTeachers = Object.values(teachersSnap.val() || {}) as Teacher[];
    const classes = Object.values(classesSnapshot.val() || {}) as ClassRoom[];

    const updates: Record<string, unknown> = {};
    updates[`users/teachers/${teacherId}`] = null;

    const successor = allTeachers.find(t => t && t.id !== teacherId && record && t.schoolId === record.schoolId && typeof t.ssoEmail === 'string');
    classes.filter(c => c.teacherId === teacherId).forEach(c => {
      if (successor) updates[`classes/${c.id}/teacherId`] = successor.id;
    });

    await update(ref(database), updates);

    const email = record?.ssoEmail || (record as { email?: string } | null)?.email;
    if (email && email.includes('@')) {
      const { removeAuthorizedTeacherFirestore } = await import('./AuthService');
      await removeAuthorizedTeacherFirestore(email);
    }
  }

  // Module 25 §ב.1: one class with a fixed id and name — never a generated key.
  public async addClassRoom(schoolId: string, teacherId: string, _name: string, _preferredId?: string, classType?: string): Promise<ClassRoom> {
    const id = PILOT_CLASS_ID;
    const name = PILOT_CLASS_NAME;
    const newClass: ClassRoom = {
      id,
      schoolId,
      teacherId,
      name,
      studentLimit: PILOT_CLASS_CAPACITY,
      createdAt: Date.now(),
      ...(classType ? { classType } : {}),
    };
    const updates: Record<string, any> = {};
    updates[`classes/${id}`] = newClass;
    updates[`public_classes/${id}`] = { id, name, schoolId };
    await update(ref(database), updates);
    await this.writeClassDocument(classType);
    return newClass;
  }

  /**
   * Module 25 §ד: "הקמת מסמכי הכיתה והמורים ב-Firestore" — the setup creates
   * the class document (Module 4 schema, register deviation 14), with the
   * class type the admin chose. It used to appear only at the teacher's first
   * meeting activation, and the wizard's class type reached no document.
   * Awaited, like the teacher whitelist: a refused write fails the wizard
   * instead of reporting a class that is not there.
   */
  public async writeClassDocument(classType?: string): Promise<void> {
    if (!firestore || !(typeof (firestore as any).type === 'string' || (firestore as any)._delegate || (firestore as any).app)) return;
    await setDoc(doc(firestore, 'classes', PILOT_CLASS_ID), {
      class_id: PILOT_CLASS_ID,
      school_id: PILOT_SCHOOL_ID,
      class_name: PILOT_CLASS_NAME,
      class_type: classType || DEFAULT_CLASS_TYPE,
      student_count: PILOT_CLASS_CAPACITY,
      created_at: Date.now(),
    }, { merge: true });
  }

  public async deleteClassRoom(id: string) {
    const updates: Record<string, null> = {};
    updates[`classes/${id}`] = null;
    updates[`public_classes/${id}`] = null;
    await update(ref(database), updates);
  }

  public async registerStudentAtomic(studentId: string): Promise<boolean> {
    if (!studentId) throw new Error("Student ID is required for atomic registration");
    const limitRef = ref(database, 'system_control/globalStudentLimit');
    const limitSnap = await get(limitRef);
    const limit = limitSnap.exists() ? Number(limitSnap.val()) : 12;

    const countRef = ref(database, 'system_control/activeStudentCount');
    let transactionPassed = false;

    await runTransaction(countRef, (currentCount) => {
      const count = currentCount || 0;
      if (count >= limit) {
        transactionPassed = false;
        return; // Abort transaction if limit reached
      }
      transactionPassed = true;
      return count + 1;
    });

    if (!transactionPassed) {
      throw new Error(`Student registration blocked: Global limit (${limit}) reached.`);
    }

    return true;
  }

  public async setGlobalStudentLimit(limit: number) {
    if (typeof limit !== 'number' || limit < 1) {
      throw new Error("Invalid global student limit");
    }
    const limitRef = ref(database, 'system_control/globalStudentLimit');
    await runTransaction(limitRef, () => limit);
  }
}

export const firebaseSyncService = FirebaseSyncService.getInstance();

/**
 * Module 23א: a learner's screen takes up the teacher's reset (forceReload on
 * the record) — the workspace and the hub both. What of the reset meeting is
 * still waiting is dropped, the flag is cleared with a write that carries the
 * reset again (TEACHER_RESET_FIELDS; a device another device took over only
 * clears the flag), and the workspace and this device's copies are reset.
 *
 * Catch-up (2.10.2026): only the reset meeting's device copy is dropped, read
 * from the record the screen saw (resetRecord; else the record this service
 * saw last). A full reset, or one the record does not name, drops them all.
 */
export function acknowledgeTeacherReset(
  normUid: string,
  otherUid: string | null | undefined,
  canWrite: boolean,
  resetRecord?: Record<string, unknown> | null
): void {
  const resetMeeting = firebaseSyncService.resetMeetingSeen(resetRecord);
  firebaseSyncService.discardUnsentWorkspace(resetMeeting);
  const path = `users/students/${normUid}`;
  if (canWrite) {
    rtdbUpdateNow(path, { ...teacherResetFields(resetMeeting), ...resetAcknowledgement(), isOnline: false, lastPing: 0 }).catch(() => {});
  } else {
    update(ref(database, path), { forceReload: null, ...resetAcknowledgement() }).catch(() => {});
  }
  useWorkspaceStore.getState().resetWorkspace?.();
  const onlyMeeting = isMeetingNumber(resetMeeting) ? resetMeeting : undefined;
  firebaseSyncService.clearLocalSessionProgress(normUid, onlyMeeting);
  if (otherUid) firebaseSyncService.clearLocalSessionProgress(otherUid, onlyMeeting);
}

export const syncSessionState = (studentId: string, sessionState: SessionState) =>
  firebaseSyncService.syncSessionState(studentId, sessionState);

export const logTelemetryEvent = (studentId: string, event: TelemetryEvent) =>
  firebaseSyncService.logTelemetryEvent(studentId, event);

export const fetchTeacherClassrooms = (teacherId: string) =>
  firebaseSyncService.fetchTeacherClassrooms(teacherId);

export const fetchClassroomSessions = (classId: string) =>
  firebaseSyncService.fetchClassroomSessions(classId);

export const syncPhysicalOverride = (studentId: string, overrideData: any) =>
  firebaseSyncService.syncPhysicalOverride(studentId, overrideData);

export const syncQMatrix = (studentId: string, qMatrixUpdates: any) =>
  firebaseSyncService.syncQMatrix(studentId, qMatrixUpdates);

export const syncConceptMastery = (studentId: string, masteryUpdates: any) =>
  firebaseSyncService.syncConceptMastery(studentId, masteryUpdates);

export const emitTelemetry = (
  event: Parameters<FirebaseSyncService['emitTelemetry']>[0]
) => firebaseSyncService.emitTelemetry(event as any);


