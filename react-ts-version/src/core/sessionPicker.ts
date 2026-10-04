/**
 * PRD 7.3 Module 14 §ב0: "בדשבורד המורה מוצג בורר מפגש המציג את שמונת המפגשים
 * ואת מצב כל אחד מהם". The states the teacher's picker shows, from what the
 * learners finished (SessionActivationModal, TeacherDashboard).
 */

/**
 * 'partial': some learners finished the meeting, not all — so it was opened.
 * 'pending': no learner finished it. Nothing records a meeting the teacher
 * opened and closed, so that is all the picker can say of it: it used to say
 * "טרם נפתח" of every meeting not finished by all twelve, including one the
 * teacher had held the day before with one learner absent.
 */
export type SessionState = 'active' | 'completed' | 'partial' | 'pending';

export interface SessionRow {
  sessionNumber: number;
  state: SessionState;
  /** Learners who finished this meeting, and how many learners there are. */
  completedCount?: number;
  learnerCount?: number;
}

/**
 * What one learner finished: a per-meeting answer (completedMeetings/m{N},
 * core/meetingCompletion.ts isMeetingFinished), or only the highest meeting
 * finished. The highest alone counts a learner who missed meeting 3 and
 * finished meeting 4 as having finished meeting 3 too.
 */
export type LearnerCompletion = number | ((sessionNumber: number) => boolean);

/** Module 14 §ב0: the state of each of the eight meetings, from what the learners finished. */
export function buildSessionRows(
  completionByLearner: LearnerCompletion[],
  activeSessionNumber: number | null,
): SessionRow[] {
  return [1, 2, 3, 4, 5, 6, 7, 8].map((sessionNumber) => {
    const learnerCount = completionByLearner.length;
    const completedCount = completionByLearner.filter((c) =>
      typeof c === 'function' ? c(sessionNumber) : (Number(c) || 0) >= sessionNumber
    ).length;
    const state: SessionState =
      activeSessionNumber === sessionNumber ? 'active'
      : learnerCount > 0 && completedCount === learnerCount ? 'completed'
      : completedCount > 0 ? 'partial'
      : 'pending';
    return { sessionNumber, state, completedCount, learnerCount };
  });
}

/** The picker's words for a meeting's state. */
export function sessionStateLabelHe(row: SessionRow): string {
  switch (row.state) {
    case 'active': return 'פעיל כעת';
    case 'completed': return 'הושלם';
    case 'partial': return `סיימו ${row.completedCount} מתוך ${row.learnerCount}`;
    default: return 'טרם הושלם';
  }
}
