import { isMeetingFinished, hasStartedMeeting } from '@/core/meetingCompletion';
export { lastMeetingOf } from '@/core/classSession';
import { teacherSentenceHe, type TeacherGender, type TeacherSentenceKey } from '@/core/teacherGender';

/**
 * What the learner's lobby shows (PRD Module 6; Module 14 §ב0). Exactly two
 * things: the quiet waiting screen, with the one sentence of its state, or —
 * once the teacher activates the session — the station's opening screen (the
 * page swaps in place, without a reload, to the workspace, whose first screen
 * it is until the learner presses "מתחילים").
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
}

export function lobbyState({ live, status, sessionNumber, lastMeeting, record }: LobbyInput): LobbyState {
  if (live && sessionNumber !== null) {
    if (status === 'paused') {
      return { kind: 'waiting', sentence: isMeetingFinished(record, sessionNumber) ? finishedSentence(sessionNumber) : 'lobbyPaused' };
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
