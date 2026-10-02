/**
 * Which meetings a learner finished, and the saved state of each meeting —
 * per meeting, not only the one the learner is in now.
 *
 * Owner decision, 2.10.2026: "תלמיד שלא סיים … לא מאבד כלום וממשיך מאיפה
 * שעצר — אני רוצה שזה יהיה בכל מפגש". The learner record used to keep one saved
 * workspace (workspaceState): once the class moved on, the copy of an
 * unfinished meeting was overwritten, and opening that meeting again for
 * catch-up restarted it at exercise 1. Two learner-written maps on the record
 * (users/students/{id}) fix that:
 *
 *   workspaceByMeeting/m{N} — the latest saved copy of meeting N (the same
 *     stamped snapshot workspaceState carries, written with it).
 *   completedMeetings/m{N}  — server time (ms) when meeting N was finished.
 *
 * Keys are "m3", never "3": RTDB turns an object of small integer keys into an
 * array.
 *
 * "Finished" per meeting:
 *   1     — the sandbox's steps and refresh exercises done (the quiet end screen).
 *   2     — the seven diagnostic tasks answered, or completed by the teacher's
 *           close (completedMeeting2 / session_02_completed / the gate's
 *           PENDING_TEACHER_APPROVAL), as before.
 *   3–7   — the seven compulsory exercises done (the branch choice is reached;
 *           the optional exercises are not part of finishing).
 *   8     — the reflection board submitted (not only the seven exercises).
 *
 * Reading only; the writes belong to the workspace store and its sync.
 */
import { meetingProgress, newerWorkspaceSnapshot } from '@/core/workspaceSnapshot';

export const COMPLETED_MEETINGS_KEY = 'completedMeetings';
export const WORKSPACE_BY_MEETING_KEY = 'workspaceByMeeting';

export function meetingKey(meeting: number): string {
  return `m${meeting}`;
}

type Snapshot = { sessionNumber?: unknown; flowStatus?: unknown; savedAt?: unknown; [key: string]: unknown };
type LearnerRecord = Record<string, unknown> | null | undefined;

const stamp = (s: Snapshot | null): number => (typeof s?.savedAt === 'number' && Number.isFinite(s.savedAt) ? s.savedAt : 0);

/**
 * The saved copy of this meeting on the record: workspaceState when it is this
 * meeting, else workspaceByMeeting/m{N}; of the two, the later by its stamp.
 */
export function savedSnapshotOfMeeting(record: LearnerRecord, meeting: number): Snapshot | null {
  if (!record) return null;
  const current = record.workspaceState as Snapshot | undefined;
  const byMeeting = (record[WORKSPACE_BY_MEETING_KEY] as Record<string, Snapshot> | undefined)?.[meetingKey(meeting)];
  const candidates = [current, byMeeting].filter(
    (s): s is Snapshot => Boolean(s) && typeof s === 'object' && s!.sessionNumber === meeting && Boolean(s!.flowStatus)
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (stamp(b) > stamp(a) ? b : a));
}

/** The compulsory part of meeting 3–7 is over in this copy (branch choice or an optional exercise). */
function pastCompulsory(s: Snapshot): boolean {
  return s.flowStatus === 'choice_branch' || (typeof s.selectedBranch === 'string' && s.selectedBranch.length > 0);
}

export function isMeetingFinished(record: LearnerRecord, meeting: number): boolean {
  if (!record) return false;
  const marks = record[COMPLETED_MEETINGS_KEY] as Record<string, unknown> | undefined;
  if (marks && marks[meetingKey(meeting)]) return true;

  if (meeting === 2) {
    const highest = record.highestCompletedMeeting;
    return Boolean(
      record.completedMeeting2 === true ||
      record.session_02_completed === true ||
      record.session_completed === 2 ||
      (typeof highest === 'number' && highest >= 2) ||
      record.routeStatus === 'PENDING_TEACHER_APPROVAL'
    );
  }

  const snap = savedSnapshotOfMeeting(record, meeting);
  if (snap) {
    if (snap.flowStatus === 'sessionDone') return true;
    if (meeting >= 3 && meeting <= 7) return pastCompulsory(snap);
    return false;
  }
  // No copy of the meeting on the record (saved before workspaceByMeeting
  // existed): the monotonic highestCompletedMeeting is all there is.
  const highest = record.highestCompletedMeeting;
  return typeof highest === 'number' && highest >= meeting;
}

/** The learner did something in this meeting (and its copy is on the record). */
export function hasStartedMeeting(record: LearnerRecord, meeting: number): boolean {
  const snap = savedSnapshotOfMeeting(record, meeting);
  if (!snap) return false;
  return snap.hasInteracted === true || meetingProgress(snap) > 0 || snap.flowStatus !== 'task';
}

/**
 * The copy a (re)opened meeting resumes from: the record's copy of THIS
 * meeting (savedSnapshotOfMeeting — also after the class moved on) against
 * this device's copy, by the X55 rule (newerWorkspaceSnapshot). Null: start
 * the meeting afresh. StudentWorkspacePage calls this where it used to pass
 * myData.workspaceState; the device copy is the per-meeting one (part A1).
 */
export function resumeSnapshotFor(record: LearnerRecord, local: Snapshot | null | undefined, meeting: number): Snapshot | null {
  return newerWorkspaceSnapshot<Snapshot | null | undefined>(savedSnapshotOfMeeting(record, meeting), local ?? null, meeting) ?? null;
}
