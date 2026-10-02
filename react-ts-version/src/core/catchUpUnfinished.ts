/**
 * Catch-up time: who started a meeting and did not finish it, and where they
 * stopped — what the meeting bar lists and the reasons dialog asks about.
 * Contract stubs (part B2 implements; see DESIGN.md of claude/catch-up-time).
 */
import type { CatchUpRecord, UnfinishedLearner } from '@/core/catchUp';

/** The learner records as the dashboard holds them, keyed by any alias of the learner. */
export type LearnerRecords = Record<string, Record<string, unknown> | null | undefined>;

/**
 * The learners 1–12 who started `meeting` and did not finish it
 * (core/meetingCompletion.ts hasStartedMeeting / isMeetingFinished), ascending,
 * each with where they stopped. Meeting 2 is not built here: the dashboard
 * keeps gateEvidence.buildUnfinishedMeeting2Items for it.
 */
export function buildUnfinishedLearners(_students: LearnerRecords, _meeting: number): UnfinishedLearner[] {
  throw new Error('not implemented: buildUnfinishedLearners (part B2)');
}

/**
 * Where a learner stopped in a meeting, for the teacher: e.g. "תרגיל 4 מתוך 7"
 * (meetings 2–8), the meeting-1 step, "בחירת מסלול", "לוח הרפלקציה". Hebrew
 * through the hebrew-content-writer skill; teacher screens say "תרגיל", "מפגש".
 */
export function whereStoppedHe(_snapshot: Record<string, unknown> | null | undefined, _meeting: number): string {
  throw new Error('not implemented: whereStoppedHe (part B2)');
}

/**
 * A learner still needs a reason for this run of the meeting: no round on
 * their record was recorded at or after `runStartedAtMs` (the server start
 * stamp of the meeting's latest opening — active_class_session.startedAt while
 * open, lastStartedAt after a close). Null record → needs one.
 */
export function needsReason(_record: Partial<CatchUpRecord> | null | undefined, _runStartedAtMs: number): boolean {
  throw new Error('not implemented: needsReason (part B2)');
}
