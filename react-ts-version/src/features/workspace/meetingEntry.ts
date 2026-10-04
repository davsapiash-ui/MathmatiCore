/**
 * How a learner enters a meeting the teacher opened — also when it is opened
 * again for catch-up.
 *
 * Owner decision, 2.10.2026: "המורה יקח את אותם ילדים שלא סיימו למפגש נוסף \
 * זמן נוסף וזה יתועד מה הסיבה לכך ואז אחרי שהם יישרו קו נמשיך עם כל הקבוצה
 * למפגש הבא", and "תלמיד שלא סיים … לא מאבד כלום וממשיך מאיפה שעצר".
 * The whole class gets the reopened meeting (PRD 14 §ב0: activation is for
 * all learners at once), so:
 *
 *   - a learner who finished it waits on the quiet end screen (PRD 14 §ג:
 *     "ממתין במסך סיום שקט") instead of doing it again — except one whose copy
 *     is already past the compulsory part of meeting 3–7 (the reinforcement-
 *     or-challenge choice, or an optional exercise): that copy is restored
 *     where it is, since restoring it is not a redo;
 *   - a learner who did not finish goes on from the saved copy of THIS meeting
 *     (resumeSnapshotFor): the finished exercises are kept, and meeting 8
 *     unfinished at the reflection board goes back to the board;
 *   - nothing saved: the meeting starts.
 *
 * Meeting 2 is not planned here: its waiting screens and the teacher's close
 * that completes part-way (#196/#207) stay with StudentWorkspacePage.
 *
 * Decided once, when the meeting is initialised: a learner working in the
 * meeting is never taken off it when the finished mark arrives.
 */
import { isMeetingFinished, resumeSnapshotFor } from '@/core/meetingCompletion';

type Snapshot = { sessionNumber?: unknown; flowStatus?: unknown; selectedBranch?: unknown; [key: string]: unknown };
type LearnerRecord = Record<string, unknown> | null | undefined;

export type MeetingEntry =
  | { kind: 'resume'; snapshot: Snapshot }
  | { kind: 'finished'; snapshot: Snapshot }
  | { kind: 'start' };

/** A copy of meeting 3–7 already past the compulsory part, and not on its end screen. */
export function isPastCompulsoryInProgress(snapshot: Snapshot | null | undefined, meeting: number): boolean {
  if (!snapshot || meeting < 3 || meeting > 7) return false;
  if (snapshot.flowStatus === 'choice_branch') return true;
  return snapshot.flowStatus === 'task' && typeof snapshot.selectedBranch === 'string' && snapshot.selectedBranch.length > 0;
}

/**
 * The entry into `meeting` for this learner: `record` is the learner record
 * (users/students/{id}), `deviceCopy` this device's saved copy of the meeting.
 */
export function planMeetingEntry(record: LearnerRecord, deviceCopy: Snapshot | null | undefined, meeting: number): MeetingEntry {
  const saved = resumeSnapshotFor(record, deviceCopy, meeting) as Snapshot | null;

  if (meeting !== 2 && isMeetingFinished(record, meeting)) {
    if (isPastCompulsoryInProgress(saved, meeting)) return { kind: 'resume', snapshot: saved! };
    // The quiet end screen of this meeting. From its own copy when there is
    // one (its counts choose the closing sentence of meetings 3–7); a learner
    // finished before per-meeting copies were saved has only the mark.
    return {
      kind: 'finished',
      snapshot: saved ? { ...saved, flowStatus: 'sessionDone' } : { sessionNumber: meeting, flowStatus: 'sessionDone' },
    };
  }

  return saved ? { kind: 'resume', snapshot: saved } : { kind: 'start' };
}
