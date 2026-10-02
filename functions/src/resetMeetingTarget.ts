import * as admin from "firebase-admin";
import { liveClassMeeting } from "./classSessionLive";

/**
 * Which meeting a level-2 "המפגש הנוכחי" reset restarts (PRD 23א §ב.2: "מוחק
 * את מצב מרחב העבודה ואת התקדמות המפגש הפעיל, ומחזיר לתחילת המפגש"; register
 * deviation 10: "המפגש שמאופס הוא המפגש שהמורה פתחה (מודול 14); אם אין מפגש
 * פתוח, המפגש שהלומד נמצא בו").
 *
 * 1. The class's open meeting — only when it is open NOW (classSessionLive.ts,
 *    the rule every client applies). The record keeps its sessionNumber after
 *    a meeting ends by time, and a reset used to take that number: it restarted
 *    a meeting the learner had finished, wiping its completion (and in meeting 2
 *    the path in "שלב החלוקה למסלולים"), instead of the one the learner is in.
 *    A meeting the class has open is reset even when this learner finished it:
 *    that is how the teacher restarts a finished meeting on purpose.
 * 2. Otherwise the meeting the learner is in: `activeSessionNumber`, which the
 *    learner's workspace writes on entering a meeting (StudentWorkspacePage).
 * 3. Then `activeSessionId`, which only older records and earlier resets carry
 *    — unless the learner has completed a later meeting: then it is stale, not
 *    where the learner is.
 * 4. With no meeting open, a meeting the learner already FINISHED is not "the
 *    meeting the learner is in": the learner is between meetings — in the
 *    lobby, or waiting in "שלב החלוקה למסלולים" after meeting 2. The field is
 *    written when a workspace opens and never moves on at the finish, so it
 *    still names the finished meeting; resetting it erased its completion, and
 *    after meeting 2 the diagnostic, the recommendation and the approved path.
 *    The reset is refused instead (`finished`), nothing deleted (owner, 2.10.2026).
 * 5. None of them: null, and the caller refuses with nothing deleted.
 *
 * The teacher's dialog shows the meeting before the teacher confirms, worked
 * out by the same rule (react-ts-version core/resetMeetingTarget.ts), and sends
 * it; the callable refuses when the server's answer differs, so what is reset
 * is always what the dialog named.
 */

type Rec = Record<string, unknown> | null | undefined;

export type ResetMeetingSource = "class" | "learner";

export interface ResetMeetingTarget {
  sessionNumber: number;
  source: ResetMeetingSource;
  /** No meeting is open and the learner already finished this one: refuse (step 4). */
  finished?: boolean;
}

/** A meeting number 1–8, or null. */
export function validMeetingNumber(n: unknown): number | null {
  const v = Number(n);
  return n !== null && n !== undefined && n !== "" && Number.isInteger(v) && v >= 1 && v <= 8 ? v : null;
}

/** Every key a learner record has been stored under over the project's history (exportDriveReport.ts studentAliases). */
export function learnerAliases(rawNum: string): string[] {
  return [`student_user${rawNum}`, `student_${rawNum}`, `user${rawNum}`, rawNum];
}

/** The learner's fields this rule reads, under each alias, in alias order. */
export type LearnerMeetingFields = Record<string, unknown>;

/** Steps 2–3 above, on the learner's fields as read. */
export function learnerMeeting(records: LearnerMeetingFields[]): number | null {
  for (const rec of records) {
    const n = validMeetingNumber(rec?.activeSessionNumber);
    if (n !== null) return n;
  }
  const highest = Math.max(0, ...records.map((rec) => Number(rec?.highestCompletedMeeting) || 0));
  for (const rec of records) {
    const n = validMeetingNumber(rec?.activeSessionId);
    if (n !== null && n >= highest) return n;
  }
  return null;
}

/** The completion keys of meeting `n` on a learner record (meeting 2 also as the client's session_02_completed). */
export function completionFieldsOf(n: number): string[] {
  return [`completedMeeting${n}`, `session_${n}_completed`, ...(n === 2 ? ["session_02_completed"] : [])];
}

/** Did the learner finish meeting `n`, on any alias? */
export function learnerCompletedMeeting(records: LearnerMeetingFields[], n: number): boolean {
  return records.some((rec) =>
    completionFieldsOf(n).some((key) => rec?.[key] === true) ||
    (Number(rec?.highestCompletedMeeting) || 0) >= n
  );
}

/** The whole rule, on records already read. `classRecord` is `active_class_session`. */
export function resetMeetingTarget(classRecord: Rec, learnerRecords: LearnerMeetingFields[], atMs: number): ResetMeetingTarget | null {
  const fromClass = liveClassMeeting(classRecord, atMs);
  if (fromClass !== null) return { sessionNumber: fromClass, source: "class" };
  const fromLearner = learnerMeeting(learnerRecords);
  if (fromLearner === null) return null;
  return learnerCompletedMeeting(learnerRecords, fromLearner)
    ? { sessionNumber: fromLearner, source: "learner", finished: true }
    : { sessionNumber: fromLearner, source: "learner" };
}

async function readClassRecord(rtdb: admin.database.Database): Promise<Rec> {
  try {
    const snap = await rtdb.ref("active_class_session").get();
    const v = snap.val();
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function readLearnerFields(rtdb: admin.database.Database, rawNum: string, fields: string[], into: LearnerMeetingFields[]): Promise<void> {
  const aliases = learnerAliases(rawNum);
  for (let i = 0; i < aliases.length; i++) {
    into[i] = into[i] || {};
    for (const field of fields) {
      try {
        into[i][field] = (await rtdb.ref(`users/students/${aliases[i]}/${field}`).get()).val();
      } catch { /* the next field or alias */ }
    }
  }
}

/** The meeting one learner's "current meeting" reset restarts, or null when none can be determined. */
export async function resolveActiveSessionNumber(
  rtdb: admin.database.Database,
  rawNum: string,
  atMs: number = Date.now()
): Promise<ResetMeetingTarget | null> {
  const classRecord = await readClassRecord(rtdb);
  if (liveClassMeeting(classRecord, atMs) !== null) return resetMeetingTarget(classRecord, [], atMs);
  const records: LearnerMeetingFields[] = [];
  await readLearnerFields(rtdb, rawNum, ["activeSessionNumber", "activeSessionId", "highestCompletedMeeting"], records);
  const meeting = learnerMeeting(records);
  if (meeting !== null) await readLearnerFields(rtdb, rawNum, completionFieldsOf(meeting), records);
  return resetMeetingTarget(classRecord, records, atMs);
}

/**
 * The meeting a whole-class restart covers: the class's open meeting, by the
 * same liveness rule. A class has no learner fallback — twelve learners may
 * each be somewhere else — so with no open meeting this is null and the
 * caller refuses.
 */
export async function resolveClassSessionNumber(
  rtdb: admin.database.Database,
  atMs: number = Date.now()
): Promise<number | null> {
  return liveClassMeeting(await readClassRecord(rtdb), atMs);
}

/** The refusal of step 4, for the callable and (same words) the dialog. */
export function finishedMeetingRefusalHe(learnerNumber: string | number, sessionNumber: number): string {
  return `תלמיד ${learnerNumber} סיים את מפגש ${sessionNumber}, ועכשיו הוא לא באמצע מפגש. כדי לאפס מפגש שהסתיים, פתחו אותו לכיתה ואפסו אותו בזמן שהוא פתוח, או בחרו איפוס מוחלט של התלמיד.`;
}
