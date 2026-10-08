import { isMeetingFinished, hasStartedMeeting } from '@/core/meetingCompletion';
import { readLastClosedRun, type ActiveClassSessionRecord } from '@/core/classSession';
import type { TeacherSentenceKey } from '@/core/teacherGender';

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
 *   the learner finished it        → "כשהמורה תפתח את התחנה הבאה, נמשיך יחד." (also when paused or closed later)
 *   closed, the learner unfinished → "העבודה שלכם נשמרה בבטחה. המורה תקבע איתכם מתי תמשיכו."
 * A closed station the learner never started is, for them, not opened yet.
 */
export type LobbyWaitingSentence = Extract<TeacherSentenceKey, 'lobbyNotStarted' | 'lobbyPaused' | 'nextStation' | 'lobbyClosedUnfinished'>;

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

/** The meeting a closed broadcast last ran: its close stamp, else the number it still carries. */
export function lastMeetingOf(raw: ActiveClassSessionRecord | null | undefined): number | null {
  const run = readLastClosedRun(raw);
  if (run) return run.meeting;
  const n = Number(raw?.sessionNumber);
  return raw?.sessionNumber != null && Number.isInteger(n) && n >= 1 && n <= 8 ? n : null;
}

export function lobbyState({ live, status, sessionNumber, lastMeeting, record }: LobbyInput): LobbyState {
  if (live && sessionNumber !== null) {
    if (status === 'paused') {
      return { kind: 'waiting', sentence: isMeetingFinished(record, sessionNumber) ? 'nextStation' : 'lobbyPaused' };
    }
    return { kind: 'opening', meeting: sessionNumber };
  }
  const last = lastMeeting;
  if (last !== null) {
    if (isMeetingFinished(record, last)) return { kind: 'waiting', sentence: 'nextStation' };
    if (hasStartedMeeting(record, last)) return { kind: 'waiting', sentence: 'lobbyClosedUnfinished' };
  }
  return { kind: 'waiting', sentence: 'lobbyNotStarted' };
}
