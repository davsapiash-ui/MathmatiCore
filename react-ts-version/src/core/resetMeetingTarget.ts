/**
 * Which meeting a level-2 "המפגש הנוכחי" reset restarts — the client's copy of
 * the server's rule (functions/src/resetMeetingTarget.ts), so the dialog names
 * the meeting before the teacher confirms (PRD 23א §ה: "מפרט במפורש מה עומד
 * להימחק"). The server works it out again and refuses when its answer differs,
 * so the meeting the dialog names is the meeting that is reset.
 *
 * PRD 23א §ב.2 + register deviation 10: the meeting the teacher has open, else
 * the meeting the learner is in.
 *   1. The class's meeting — only while it is open now (isClassSessionLive).
 *   2. `activeSessionNumber`, which the learner's workspace writes on entering
 *      a meeting. A finished meeting counts: it is the last one the learner
 *      entered, so that is where the learner is.
 *   3. The older `activeSessionId` — unless the learner completed a later
 *      meeting, which makes it stale.
 *   4. Otherwise none: the reset is refused, nothing is deleted.
 */
import { isClassSessionLive, type ActiveClassSessionRecord } from '@/core/classSession';

export type ResetMeetingSource = 'class' | 'learner';

export interface ResetMeetingTarget {
  sessionNumber: number;
  source: ResetMeetingSource;
  /** The learner already finished this meeting; the reset erases that too. */
  completed: boolean;
}

export type LearnerRecordForReset = Record<string, unknown> | null | undefined;

/** A meeting number 1–8, or null. */
export function validMeetingNumber(n: unknown): number | null {
  if (n === null || n === undefined || n === '') return null;
  const v = Number(n);
  return Number.isInteger(v) && v >= 1 && v <= 8 ? v : null;
}

/** Every key a learner record has been stored under, in the server's order. */
export function learnerAliasesForReset(studentNumber: number | string): string[] {
  const n = String(studentNumber).replace(/\D/g, '');
  return [`student_user${n}`, `student_${n}`, `user${n}`, n];
}

/** The class's open meeting, or null (closed, ended by time, or no record). */
export function liveClassMeeting(record: ActiveClassSessionRecord | null | undefined, now?: number): number | null {
  if (!isClassSessionLive(record, now)) return null;
  return validMeetingNumber(record?.sessionNumber);
}

/** Steps 2–3, on the learner's records in alias order. */
export function learnerMeeting(records: LearnerRecordForReset[]): number | null {
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

/** Did the learner already finish meeting `n`, on any alias? */
export function learnerCompletedMeeting(records: LearnerRecordForReset[], n: number): boolean {
  return records.some((rec) =>
    rec?.[`completedMeeting${n}`] === true ||
    rec?.[`session_${n}_completed`] === true ||
    (n === 2 && rec?.session_02_completed === true) ||
    (Number(rec?.highestCompletedMeeting) || 0) >= n
  );
}

/**
 * The whole rule. `liveClassSession` is the class's open meeting as the
 * dashboard already works it out (liveClassMeeting), or null.
 */
export function resolveResetMeeting(liveClassSession: number | null, learnerRecords: LearnerRecordForReset[]): ResetMeetingTarget | null {
  const fromClass = validMeetingNumber(liveClassSession);
  const sessionNumber = fromClass ?? learnerMeeting(learnerRecords);
  if (sessionNumber === null) return null;
  return {
    sessionNumber,
    source: fromClass !== null ? 'class' : 'learner',
    completed: learnerCompletedMeeting(learnerRecords, sessionNumber),
  };
}
