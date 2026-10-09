import { isMeetingFinished, hasStartedMeeting, resumeSnapshotFor } from '@/core/meetingCompletion';
export { lastMeetingOf } from '@/core/classSession';
import { teacherSentenceHe, type TeacherGender, type TeacherSentenceKey } from '@/core/teacherGender';

/**
 * What the learner's lobby shows (PRD Module 6; Module 14 §ב0). Exactly two
 * things: the quiet waiting screen, with the one sentence of its state, or —
 * once the teacher activates the session — the station's opening screen (the
 * page swaps in place, without a reload, to the workspace, whose first screen
 * it is until the learner presses "מתחילים").
 *
 * A learner who finished the active station sees the finished sentence too
 * (Module 6: "or the learner has completed it").
 *
 * The sentence follows the state of the session and the learner's own
 * finished mark at that station, not the reason the session closed:
 *   not opened yet                 → "היום עוד לא התחלנו. המורה תפתח את הפעילות בקרוב."
 *   paused                         → "המורה עצרה את הפעילות לרגע."
 *   the learner finished it        → "סיימתם את התחנה. כשהמורה תפתח את התחנה הבאה, נמשיך יחד." (also when paused or closed later)
 *   … and it was station 8         → "סיימתם את תחנה 8, התחנה האחרונה. העבודה שלכם נשמרה בבטחה." (no next station)
 *   closed, the learner unfinished → "העבודה שלכם נשמרה בבטחה. המורה תקבע איתכם מתי תמשיכו."
 * A closed station the learner never started is, for them, not opened yet.
 */
export type LobbyWaitingSentence =
  | Extract<TeacherSentenceKey, 'lobbyNotStarted' | 'lobbyPaused' | 'lobbyFinished' | 'lobbyClosedUnfinished'>
  | 'lobbyFinishedLastStation';

/** PRD 14 §ב0 / Module 6: after station 8, which has no next station. No gendered verb, so one form. */
export const LOBBY_FINISHED_LAST_STATION_HE = 'סיימתם את תחנה 8, התחנה האחרונה. העבודה שלכם נשמרה בבטחה.';

/** The lobby sentence in the teacher's gender. */
export function lobbySentenceHe(sentence: LobbyWaitingSentence, gender: TeacherGender): string {
  return sentence === 'lobbyFinishedLastStation' ? LOBBY_FINISHED_LAST_STATION_HE : teacherSentenceHe(sentence, gender);
}

const finishedSentence = (meeting: number): LobbyWaitingSentence =>
  meeting === 8 ? 'lobbyFinishedLastStation' : 'lobbyFinished';

export type LobbyState = { kind: 'opening'; meeting: number } | { kind: 'waiting'; sentence: LobbyWaitingSentence };

type LearnerRecord = Record<string, unknown> | null | undefined;

export interface LobbyInput {
  /** The session is live (core/classSession.ts isClassSessionLive). */
  live: boolean;
  status: 'active' | 'paused' | 'closed';
  /** The live session's meeting, when live. */
  sessionNumber: number | null;
  /** The meeting a session that is no longer live last ran (lastMeetingOf), or null. */
  lastMeeting: number | null;
  /** The learner's own record (users/students/{id}). */
  record: LearnerRecord;
  /**
   * This device's saved copy of a meeting, when there is one: the newer of it
   * and the record's copy decides, as on entering the workspace
   * (meetingEntry.planMeetingEntry; review RN1).
   */
  deviceCopyOf?: (meeting: number) => Record<string, unknown> | null | undefined;
}

export function lobbyState({ live, status, sessionNumber, lastMeeting, record, deviceCopyOf }: LobbyInput): LobbyState {
  const atOptional = (meeting: number) => atOptionalExercises(record, meeting, deviceCopyOf?.(meeting));
  if (live && sessionNumber !== null) {
    if (status === 'paused') {
      // A learner still at the optional exercises is not done with the station:
      // the pause, as the workspace shows it to them.
      const done = isMeetingFinished(record, sessionNumber) && !atOptional(sessionNumber);
      return { kind: 'waiting', sentence: done ? finishedSentence(sessionNumber) : 'lobbyPaused' };
    }
    // Module 6: a learner who has completed the active station has no open
    // session — the finished sentence, not the workspace. Except: meeting 2,
    // whose end is its own wait for the teacher's check (Module 20) and which
    // the teacher's close completes part-way (catch-up goes back in); and a
    // meeting 3–7 learner still at the optional exercises (choice screen or a
    // chosen branch), who goes on with them (features/workspace/meetingEntry.ts).
    if (sessionNumber !== 2 && isMeetingFinished(record, sessionNumber) && !atOptional(sessionNumber)) {
      return { kind: 'waiting', sentence: finishedSentence(sessionNumber) };
    }
    return { kind: 'opening', meeting: sessionNumber };
  }
  const last = lastMeeting;
  if (last !== null) {
    if (isMeetingFinished(record, last)) return { kind: 'waiting', sentence: finishedSentence(last) };
    if (hasStartedMeeting(record, last)) return { kind: 'waiting', sentence: 'lobbyClosedUnfinished' };
  }
  return { kind: 'waiting', sentence: 'lobbyNotStarted' };
}

/** Meeting 3–7: the saved copy is past the compulsory seven and not ended (meetingEntry.isPastCompulsoryInProgress). */
function atOptionalExercises(record: LearnerRecord, meeting: number, deviceCopy: Record<string, unknown> | null | undefined): boolean {
  if (meeting < 3 || meeting > 7) return false;
  const snap = resumeSnapshotFor(record, deviceCopy as Parameters<typeof resumeSnapshotFor>[1], meeting);
  if (!snap) return false;
  if (snap.flowStatus === 'choice_branch') return true;
  return snap.flowStatus === 'task' && typeof snap.selectedBranch === 'string' && snap.selectedBranch.length > 0;
}
