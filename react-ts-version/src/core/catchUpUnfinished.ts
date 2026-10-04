/**
 * Catch-up time: who started a meeting and did not finish it, and where they
 * stopped — what the meeting bar lists and the reasons dialog asks about.
 *
 * Owner decision, 2.10.2026: "המורה יקח את אותם ילדים שלא סיימו למפגש נוסף \ זמן
 * נוסף וזה יתועד מה הסיבה לכך ואז אחרי שהם יישרו קו נמשיך עם כל הקבוצה למפגש
 * הבא". Reading only: "started" and "finished" are core/meetingCompletion.ts.
 */
import type { CatchUpRecord, UnfinishedLearner } from '@/core/catchUp';
import { hasStartedMeeting, isMeetingFinished, savedSnapshotOfMeeting } from '@/core/meetingCompletion';
import { getSessionTasks } from '@/data/sessionTasks';

/** The learner records as the dashboard holds them, keyed by any alias of the learner. */
export type LearnerRecords = Record<string, Record<string, unknown> | null | undefined>;

/** Compulsory exercises of meetings 2–8 (PRD Module 14 §ב: seven). */
const COMPULSORY_COUNT = 7;

/** Learner n's record under any of the keys the dashboard uses, canonical first. */
function recordOf(students: LearnerRecords, n: number): Record<string, unknown> | null {
  return students[`student_user${n}`] || students[`student_${n}`] || students[`user${n}`] || students[String(n)] || null;
}

/**
 * The learners 1–12 who started `meeting` and did not finish it
 * (core/meetingCompletion.ts hasStartedMeeting / isMeetingFinished), ascending,
 * each with where they stopped. Meeting 2 is not built here: the dashboard
 * keeps gateEvidence.buildUnfinishedMeeting2Items for it.
 */
export function buildUnfinishedLearners(students: LearnerRecords, meeting: number): UnfinishedLearner[] {
  if (!Number.isInteger(meeting) || meeting < 1 || meeting > 8 || meeting === 2) return [];
  const out: UnfinishedLearner[] = [];
  for (let n = 1; n <= 12; n++) {
    const record = recordOf(students ?? {}, n);
    if (!record || !hasStartedMeeting(record, meeting) || isMeetingFinished(record, meeting)) continue;
    out.push({ studentNumber: n, stoppedAtHe: whereStoppedHe(savedSnapshotOfMeeting(record, meeting), meeting) });
  }
  return out;
}

const index = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/** "תרגיל 4 מתוך 7" — the place clamped into the list, so a stale index never reads "9 מתוך 7". */
function ofTotal(word: string, idx: number, total: number): string {
  const safeTotal = Math.max(1, total);
  return `${word} ${Math.min(idx, safeTotal - 1) + 1} מתוך ${safeTotal}`;
}

/** Meeting 1: the tool steps first (מסמך 03 §3.1), then its exercises. */
function meeting1Label(idx: number): string {
  let tasks: Array<{ type?: unknown }> = [];
  try {
    tasks = getSessionTasks(1);
  } catch {
    tasks = [];
  }
  const steps = tasks.filter((t) => t.type === 'session1_intro').length;
  if (steps > 0 && idx < steps) return `${ofTotal('צעד', idx, steps)} בהיכרות עם הכלים`;
  const exercises = Math.max(1, tasks.length - steps);
  return ofTotal('תרגיל', idx - steps, exercises);
}

/**
 * Where a learner stopped in a meeting, for the teacher: e.g. "תרגיל 4 מתוך 7"
 * (meetings 3–8), "משימה 4 מתוך 7" (meeting 2, as the gate tab says it), the
 * meeting-1 step, "בחירת מסלול", "לוח הרפלקציה".
 */
export function whereStoppedHe(snapshot: Record<string, unknown> | null | undefined, meeting: number): string {
  if (!snapshot) return 'תחילת המפגש';
  const flow = snapshot.flowStatus;
  if (flow === 'sessionDone') return 'סוף המפגש';
  if (flow === 'reflection') return 'לוח הרפלקציה';
  if (flow === 'choice_branch') return 'בחירת מסלול';
  if (meeting === 2) {
    const q = (snapshot.qflow ?? {}) as { phase?: unknown; taskIdx?: unknown };
    if (q.phase === 'correction') return 'סבב התיקונים';
    return ofTotal('משימה', index(q.taskIdx), COMPULSORY_COUNT);
  }
  const idx = index(snapshot.standardTaskIdx);
  if (meeting === 1) return meeting1Label(idx);
  return ofTotal('תרגיל', idx, COMPULSORY_COUNT);
}

/**
 * A learner still needs a reason for this run of the meeting: no round on
 * their record was recorded at or after `runStartedAtMs` (the server start
 * stamp of the meeting's latest opening — active_class_session.startedAt while
 * open, lastStartedAt after a close). Null record → needs one.
 */
export function needsReason(record: Partial<CatchUpRecord> | null | undefined, runStartedAtMs: number): boolean {
  const rounds = record?.rounds && typeof record.rounds === 'object' ? Object.values(record.rounds) : [];
  const from = Number.isFinite(runStartedAtMs) ? runStartedAtMs : 0;
  return !rounds.some((r) => r && typeof r.recorded_at === 'number' && r.recorded_at >= from);
}
