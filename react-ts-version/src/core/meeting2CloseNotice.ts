/**
 * Which close screen a learner sees when the teacher closes meeting 2
 * (owner, 4.10.2026, audit A3-106).
 *
 * A learner who had not finished meeting 2 read "כשהמורה תפתח תחנה חדשה,
 * הפעילות תתחדש כאן מיד" — not true for them: when meeting 3 opens they wait
 * for the path split, and the teacher may open meeting 2 again so they can
 * finish (owner, 2.10.2026). They read instead that the teacher will set a time
 * with them to go on (teacherGender.ts, closedBodyMeeting2Unfinished). Every
 * other close keeps the generic text (register 7).
 *
 * "Finished" cannot be read from completedMeeting2 alone: the teacher's close
 * completes every learner who started (functions/src/meeting2Close.ts writes
 * completedMeeting2, session_02_completed and routeStatus
 * PENDING_TEACHER_APPROVAL), and it marks each task the learner never answered
 * "not_answered" in qMatrixResults. So:
 *  - while this device holds the learner's meeting-2 workspace, the workspace
 *    says it: unfinished means still in the primary round of the seven tasks
 *    (isDiagnosticPrimaryRound). The correction round comes after the seventh
 *    answer, so a learner in it has finished, as has one on the end screen;
 *  - otherwise (the learner is on a waiting screen, nothing restored), the
 *    record says it: completed with no task left "not_answered". Until the
 *    record has loaded nothing is known, and the generic text stays.
 * A learner the gate already approved does not go on with meeting 2 (#196):
 * the generic text is true for them.
 */
import { isDiagnosticPrimaryRound } from './workspaceSnapshot';

/** The server's tag for a task not answered when the teacher closed meeting 2 (functions/src/meeting2Close.ts). */
export const Q_NOT_ANSWERED_TAG = 'not_answered';

export interface Meeting2CloseInput {
  /** The meeting in the URL. */
  meeting: number;
  isTeacherOrAdmin: boolean;
  isGateApproved: boolean;
  /** This device's workspace holds the learner's meeting 2 (initialised, sessionNumber 2). */
  workspaceOnMeeting2: boolean;
  /** The workspace's flowStatus. */
  flowStatus: string | null | undefined;
  /** The workspace's qflow.phase ('primary' | 'correction'). */
  qflowPhase?: string | null;
  /** The learner's record has arrived from the database. */
  recordLoaded: boolean;
  /** The learner's record. */
  record: { completedMeeting2?: unknown; qMatrixResults?: unknown } | null | undefined;
}

export function isMeeting2CloseUnfinished(input: Meeting2CloseInput): boolean {
  if (input.meeting !== 2 || input.isTeacherOrAdmin || input.isGateApproved) return false;
  if (input.workspaceOnMeeting2) {
    return isDiagnosticPrimaryRound({
      sessionNumber: 2,
      flowStatus: input.flowStatus ?? undefined,
      qflow: { phase: input.qflowPhase ?? undefined },
    } as Parameters<typeof isDiagnosticPrimaryRound>[0]);
  }
  if (!input.recordLoaded) return false;
  const record = input.record;
  if (!record || record.completedMeeting2 !== true) return true;
  const q = record.qMatrixResults;
  return Boolean(q && typeof q === 'object' && Object.values(q as Record<string, unknown>).includes(Q_NOT_ANSWERED_TAG));
}
