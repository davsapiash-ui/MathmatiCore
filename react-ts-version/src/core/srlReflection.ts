/**
 * מודול 16 — לוח הרפלקציה של מפגש 8.
 *
 * המסך אסף את שלושת השלבים כהלכה, אבל שום דבר מהם לא נשמר: בסיום נשלחה
 * רק רמת המאמץ, ובשדה הלא נכון (`routeRecommendation`, שהוא צבע מסלול
 * שהדשבורד משווה ל-'YELLOW'). התוצאה הייתה שדוח הכיתה סופר אפס רפלקציות
 * לכל לומד בכל מפגש, וייצוא המחקר הוציא אוסף ריק — שניהם קוראים
 * `srl_reflections`.
 *
 * האפיון (מודול 16, "הנחיות פיתוח נוקשות") דורש סנכרון אטומי מול Firestore
 * עם מפתח אידמפוטנטיות. מזהה המסמך הוא המפתח: כתיבה שנייה של אותו לומד
 * לאותו מפגש נדחית בחוקים (`allow update: if false`), כך שהראשונה קובעת.
 *
 * המסמך נשלח בדרך אחת בלבד: תור הסנכרון של מודול 17 (queueSRLReflection).
 */

import { doc, getDocFromServer } from 'firebase/firestore';
import { firestore } from '@/infrastructure/firebase';
import { emitTelemetry } from '@/infrastructure/services/FirebaseSyncService';
import { indexedDBQueue, queueSRLReflection } from '@/infrastructure/services/IndexedDBQueue';
import { throttledRtdbUpdate } from '@/infrastructure/services/ThrottledRtdbWriter';
import type { SRLReflectionState } from '@/types';

export type SRLEffortLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type SRLStrategy = 'UNDO_BUTTON' | 'MEMORY_CIRCLES' | 'SOCRATIC_CARD';

/** מה שמסך הרפלקציה מחזיר בסיום שלושת השלבים. */
export interface SRLReflectionResult {
  effortLevel: 'EASY' | 'MEDIUM' | 'HARD' | null;
  strategies: string[];
  persistenceIndex: number;
  undoCount: number;
  errorCount: number;
  guessCount: number;
}

const EFFORT_BY_SCREEN_ID: Record<string, SRLEffortLevel> = {
  EASY: 'LOW',
  MEDIUM: 'MEDIUM',
  HARD: 'HIGH',
};

const STRATEGY_BY_SCREEN_ID: Record<string, SRLStrategy> = {
  undo: 'UNDO_BUTTON',
  memory: 'MEMORY_CIRCLES',
  hints: 'SOCRATIC_CARD',
};

/**
 * מזהה מסמך הרפלקציה של מפגש 8 עבור לומד, וגם ה-session_id שלה.
 * PRD Module 4 gives one spelling for a learner's meeting: session_0N_student_K
 * (the sessions document id). The reflection document and its
 * REFLECTION_SUBMITTED event both carry it.
 */
export function srlReflectionDocId(studentNumber: number): string {
  return `session_08_student_${studentNumber}`;
}

/**
 * Appendix A §4 idempotency_key: the key the offline queue sends the document
 * under (queueSRLReflection), stored in the document as well. firestore.rules
 * requires it to be this function of the document id.
 */
export function srlReflectionIdempotencyKey(studentNumber: number): string {
  return `srl_reflection_${srlReflectionDocId(studentNumber)}`;
}

/**
 * The srl_reflections document: Appendix A §4 SRLReflectionState, field for
 * field ("חל איסור על שימוש בשמות שדות שונים בקוד"), plus the meeting number
 * and the three counters behind persistence_index (Module 16 §ב) that the
 * research export reports.
 */
export type SRLReflectionDocument = SRLReflectionState & {
  session_number: 8;
  undo_count: number;
  error_count: number;
  guess_count: number;
};

export function toSRLEffortLevel(value: string | null): SRLEffortLevel {
  return EFFORT_BY_SCREEN_ID[value || ''] ?? 'MEDIUM';
}

export function toSRLStrategies(values: string[]): SRLStrategy[] {
  const mapped = (values || []).map((v) => STRATEGY_BY_SCREEN_ID[v]).filter(Boolean) as SRLStrategy[];
  return Array.from(new Set(mapped));
}

/** מספר לומד תקף לפיילוט: שלם בין 1 ל-12. אחרת אין למי לשייך את המסמך. */
function asPilotNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(/\D/g, ''));
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}

export interface SRLPersistResult {
  ok: boolean;
  reason?: 'unknown_student' | 'write_failed';
}

/** How long the "is it already on the server?" read may take before it counts as "no". */
export const SRL_SERVER_CHECK_BUDGET_MS = 3000;

/**
 * Whether this learner's meeting-8 reflection is already saved on the server.
 * The read goes to the server, never to the cache: the cache also holds a
 * write that has not been sent. The rules let the owner read the document; one
 * that does not exist is refused, and every failure reads as "not saved".
 *
 * A teacher's reset of meeting 8 for one learner (the active meeting, the
 * default scope) backs this document up and then deletes it, together with
 * the live mirror's reflection fields, so the learner answers the board again
 * (functions/src/exportDriveReport.ts, buildResetScope). A reset of the whole
 * class, or of the learner's whole record, backs it up and keeps it; only the
 * system-wide reset deletes every reflection.
 */
async function isOnServer(studentNumber: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const read = getDocFromServer(doc(firestore, 'srl_reflections', srlReflectionDocId(studentNumber)))
      .then((snap) => snap.exists());
    read.catch(() => {});
    // Offline the read can take a while to give up; the learner is not kept waiting for it.
    return await Promise.race([
      read,
      new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), SRL_SERVER_CHECK_BUDGET_MS); }),
    ]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Whether this learner's reflection waits in the offline queue on this device. */
async function isQueued(studentNumber: number): Promise<boolean> {
  const docId = srlReflectionDocId(studentNumber);
  try {
    const items = await indexedDBQueue.getAll();
    return items.some((i) => i.firestoreDoc?.collection === 'srl_reflections' && i.firestoreDoc.docId === docId);
  } catch {
    return false;
  }
}

/** Whether this learner's meeting-8 reflection is saved: on the server, or waiting in the offline queue. */
export async function hasSavedSRLReflection(rawStudentId: string | number): Promise<boolean> {
  const studentNumber = asPilotNumber(rawStudentId);
  if (studentNumber === null) return false;
  return (await isOnServer(studentNumber)) || (await isQueued(studentNumber));
}

/**
 * Module 16 §ב: "השרת מנהל: reflection_step (1, 2 או 3)". The stage the
 * learner is on reaches the learner record at every stage change, not only
 * at the end. A mirror for the live view, like the one submitSRLReflection
 * writes: reflection_completed is not touched here — only "סיום התחנה" sets
 * it — so stage 3 on screen is not a finished reflection. Not awaited, for
 * the same reason as there.
 */
export function mirrorReflectionStep(rawStudentId: string | number, step: 1 | 2 | 3): void {
  const studentNumber = asPilotNumber(rawStudentId);
  if (studentNumber === null) return;
  // PRD Module 18 §ב: client writes to users/students are throttled to one per
  // 1000ms — through the shared writer of the learner record, which merges
  // this into the window's one update() and never drops the last write.
  try {
    throttledRtdbUpdate(`users/students/student_user${studentNumber}`, {
      reflection_step: step,
      reflection_updated_at: Date.now(),
    }).catch((err) => {
      console.warn('[srlReflection] live mirror notice:', err);
    });
  } catch (err) {
    console.warn('[srlReflection] live mirror notice:', err);
  }
}

/**
 * שומרת את הרפלקציה: מסמך `srl_reflections` ב-Firestore (מקור האמת שדוח
 * הכיתה וייצוא המחקר קוראים), ובמקביל את שלושת השדות שמודול 16 §ב מגדיר
 * כמנוהלים בשרת על צומת הלומד, כדי שהדשבורד יראה מיד שהרפלקציה הושלמה.
 *
 * One path (Module 17 §ב): the document goes into the offline queue first —
 * IndexedDB, the durable buffer — and the queue's background flush sends it.
 * Once the queue holds it, it is safe: a lost connection, a reload or a
 * sign-out does not lose it, so the learner can finish. A write made straight
 * to the SDK while offline would live only in the SDK's memory. The queue
 * item is removed only on the server's Ack, and srl_reflections is
 * create-only: a re-send of a document that is already on the server is
 * refused, the queue counts that refusal as the Ack, and the first reflection
 * stands.
 */
export async function submitSRLReflection(
  rawStudentId: string | number,
  result: SRLReflectionResult
): Promise<SRLPersistResult> {
  const studentNumber = asPilotNumber(rawStudentId);
  if (studentNumber === null) {
    console.error('[srlReflection] cannot resolve a pilot student number from', rawStudentId);
    return { ok: false, reason: 'unknown_student' };
  }

  const docId = srlReflectionDocId(studentNumber);
  const submittedAt = Date.now();
  const persistenceIndex = Math.min(100, Math.max(0, Math.round(result.persistenceIndex)));

  // The stored document is Appendix A §4's SRLReflectionState (Module 16 §ב),
  // with exactly the fields isValidSRLReflectionDoc (firestore.rules) allows.
  // It is written once, when the learner presses "סיום" on step 3: the
  // reflection is complete, and reflection_updated_at is that moment, not the
  // delivery. idempotency_key is the key the queue sends it under.
  const record: SRLReflectionDocument = {
    session_id: docId,
    student_id: studentNumber,
    reflection_step: 3,
    effort_score: toSRLEffortLevel(result.effortLevel),
    selected_strategies: toSRLStrategies(result.strategies),
    persistence_index: persistenceIndex,
    reflection_completed: true,
    reflection_updated_at: submittedAt,
    idempotency_key: srlReflectionIdempotencyKey(studentNumber),
    session_number: 8,
    undo_count: Math.max(0, Math.round(result.undoCount || 0)),
    error_count: Math.max(0, Math.round(result.errorCount || 0)),
    guess_count: Math.max(0, Math.round(result.guessCount || 0)),
  };

  try {
    await queueSRLReflection(docId, { ...record });
  } catch (err) {
    // Not even stored on this device: the board stays, and the learner is told what to do.
    console.error('[srlReflection] the reflection could not be stored on this device:', err);
    return { ok: false, reason: 'write_failed' };
  }

  // נספח א׳ §3: REFLECTION_SUBMITTED. האירוע נפלט עד כה רק ממסך הרפלקציה
  // של מפגש 2 — המסך שאינו באפיון. הוא נפלט כאן, מהכותב המשותף, כך שכל
  // רפלקציה שנשמרת מייצרת אותו בדיוק פעם אחת. Its session_id is the
  // document's own (Module 4's session_0N_student_K), so the event and the
  // document it reports name the same meeting the same way.
  emitTelemetry({
    session_id: docId,
    student_id: `student_user${studentNumber}`,
    exercise_id: `reflection_meeting_8`,
    event_type: 'REFLECTION_SUBMITTED',
    details: {
      reflection_step: 3,
      effort_score: toSRLEffortLevel(result.effortLevel),
      selected_strategies: toSRLStrategies(result.strategies),
      persistence_index: persistenceIndex,
    },
  }).catch((err) => console.warn("[srlReflection] telemetry notice:", err));

  // מודול 16 §ב: reflection_step, reflection_completed ו-persistence_index
  // מנוהלים בשרת. זהו שיקוף לתצוגה החיה בלבד, לא מקור אמת שני.
  // Not awaited: offline, an RTDB write resolves only when the server takes
  // it, and the learner must not wait for the mirror to finish. Throttled with
  // every other write to the learner record (Module 18 §ב).
  throttledRtdbUpdate(`users/students/student_user${studentNumber}`, {
    reflection_step: 3,
    reflection_completed: true,
    persistence_index: persistenceIndex,
    reflection_updated_at: submittedAt,
  }).catch((err) => {
    console.warn('[srlReflection] live mirror notice:', err);
  });

  return { ok: true };
}
