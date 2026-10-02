/**
 * PRD v7.1 Module 14 + pilot policy: an opened class session survives momentary
 * teacher disconnects (refresh, network blip, laptop sleep). Only when the
 * teacher stays disconnected beyond the grace window below is the session
 * considered closed for students.
 *
 * The teacher client arms an RTDB onDisconnect hook that stamps
 * `active_class_session/teacherDisconnectedAt` with the server time, and clears
 * the stamp on every (re)connect.
 *
 * Every timestamp in this record — `startedAt`, `teacherDisconnectedAt` — was
 * written by a different device than the one reading it. Module 14 §ד makes the
 * server the sole time authority ("Synchronize state upon refresh to prevent
 * clock manipulation"), so the comparisons below default to `serverNow()` and
 * not to the reader’s own clock: a tablet whose clock is half an hour fast
 * used to shut its own learner out of a meeting that was still running, and a
 * slow one kept a closed meeting open.
 */
import { serverNow } from '@/infrastructure/firebase';

/**
 * Owner decision (20.9.2026): 15 minutes, not 5.
 *
 * Nothing changes on the learners' screens while the window runs — the meeting
 * stays 'active' and the children keep working, exactly as if the teacher's
 * laptop had never dropped. Only when the window expires do they get the
 * "המורה סגרה את המפגש" screen. So the window is the time the class is
 * protected from the teacher's own connection, and 5 minutes was shorter than
 * a single working block: a Wi-Fi drop in the middle of meeting 4 cut twelve
 * children off before they finished.
 *
 * 15 minutes covers a full working block of meetings 3–7 (Module 14 §ב), so an
 * outage no longer ends a lesson on its own. It cannot extend a lesson either:
 * SESSION_HARD_CAP_MS below still closes every meeting 45 minutes after the
 * teacher opened it (register item 8), and the teacher can always close the
 * meeting herself from the dashboard.
 */
export const TEACHER_DISCONNECT_GRACE_MS = 15 * 60 * 1000;

/**
 * Owner decision (6.9.2026, register item 8): a meeting the teacher never
 * closed closes by itself 45 minutes after activation. Until then nothing
 * closes on its own and the learner sees no timer and no message (PRD Module
 * 14 §ב1); the per-meeting working time (20 / 25 / 15 minutes) only raises the
 * teacher's "עברו X דקות" popup.
 */
export const SESSION_HARD_CAP_MS = 45 * 60 * 1000;

/**
 * The meeting's start on the server clock, or null while there is none.
 *
 * PRD Module 14 §ב: "השרת הוא מקור האמת היחיד והמוחלט עבור זמן המפגש". The
 * teacher's client writes `startedAt: serverTimestamp()`, so the stamp is the
 * server's, never the teacher laptop's own clock (a laptop 46 minutes slow made
 * the meeting closed at the moment it was opened; a fast one stretched the 45
 * minutes). Until the server value arrives a reader may hold the write's
 * placeholder (`{ '.sv': 'timestamp' }`) — that is "no start stamp yet": the
 * meeting is open and nothing closes it early.
 */
export function readSessionStartedAt(val: ActiveClassSessionRecord | null | undefined): number | null {
  const startedAt = val?.startedAt;
  return typeof startedAt === 'number' && Number.isFinite(startedAt) && startedAt > 0 ? startedAt : null;
}

/** When the meeting closes by itself, or null when it has no start stamp. */
export function getSessionAutoCloseAt(val: ActiveClassSessionRecord | null | undefined): number | null {
  const startedAt = readSessionStartedAt(val);
  return startedAt !== null ? startedAt + SESSION_HARD_CAP_MS : null;
}

/**
 * Owner decision (6.9.2026, register item 7): a meeting has three teacher
 * controls — start, pause, close — and every one of them reaches the learner's
 * screen live, in place. `active` stays the on/off flag older readers and the
 * database rules know; `status` carries the pause.
 */
export type ClassSessionStatus = 'active' | 'paused' | 'closed';

export interface ActiveClassSessionRecord {
  active?: boolean;
  status?: ClassSessionStatus;
  sessionNumber?: number | null;
  /** Server time; the write's placeholder object until the server value arrives (readSessionStartedAt). */
  startedAt?: number | null | Record<string, unknown>;
  pausedAt?: number | null;
  teacherId?: string;
  teacherDisconnectedAt?: number | null;
  /**
   * Set only by the teacher's "close meeting" button. The server completes the
   * unfinished learners of meeting 2 on it (PRD 14 §ב1; functions/src/meeting2Close.ts);
   * a reset writes the closed record without it.
   */
  closedBy?: 'teacher';
  /** Written with every close (the closing client's clock). */
  endedAt?: number;
  /** How a close came about when it was not the teacher's button: the 45-minute cap or the disconnect window. */
  endedBy?: 'auto_45min' | 'teacher_disconnect_grace';
  /**
   * Catch-up time (owner decision 2.10.2026): every close — the teacher's
   * button, the 45-minute cap, the disconnect window — also records which
   * meeting just ended and when that run started (server time), so after a
   * close by time the dashboard still knows whose reasons are missing. A
   * reset's close carries neither.
   */
  lastSessionNumber?: number | null;
  lastStartedAt?: number | null;
}

/** The closes that happen by time, with no teacher at the button: no reasons dialog at that moment. */
export const TIME_CLOSE_KINDS = ['auto_45min', 'teacher_disconnect_grace'] as const;

/** The meeting run a close ended, as the close recorded it. */
export interface LastClosedRun {
  meeting: number;
  /** Server start of that run, or null when the close did not know it. */
  startedAt: number | null;
  /** The close came by time (TIME_CLOSE_KINDS), not by the teacher's button. */
  byTime: boolean;
}

/** The two fields every close write carries (see lastSessionNumber). */
export function lastRunFields(meeting: unknown, startedAt: unknown): { lastSessionNumber: number | null; lastStartedAt: number | null } {
  const n = Number(meeting);
  return {
    lastSessionNumber: meeting !== null && meeting !== undefined && Number.isInteger(n) && n >= 1 && n <= 8 ? n : null,
    lastStartedAt: typeof startedAt === 'number' && Number.isFinite(startedAt) && startedAt > 0 ? startedAt : null,
  };
}

/** The run the last close ended, or null while a meeting is open or the close recorded none (a reset). */
export function readLastClosedRun(val: ActiveClassSessionRecord | null | undefined): LastClosedRun | null {
  if (!val || val.active === true) return null;
  const { lastSessionNumber, lastStartedAt } = lastRunFields(val.lastSessionNumber, val.lastStartedAt);
  if (lastSessionNumber === null) return null;
  return {
    meeting: lastSessionNumber,
    startedAt: lastStartedAt,
    byTime: (TIME_CLOSE_KINDS as readonly string[]).includes(String(val.endedBy ?? '')),
  };
}

/**
 * PRD v7.1 Module 14 §ב — net working minutes per session.
 * Session 1 sandbox: 20 · Sessions 2 and 8: 25 · Sessions 3-7: 15.
 * Module 14 §ב1 derives the teacher deadline popup's X from this, never a constant.
 */
export function getSessionDurationMinutes(sessionNumber: number): number {
  if (sessionNumber === 1) return 20;
  if (sessionNumber >= 3 && sessionNumber <= 7) return 15;
  return 25; // sessions 2 and 8
}

/**
 * The learner-facing state of the class session: 'active' (work), 'paused'
 * (the teacher stopped the meeting for a moment; learners wait in place) or
 * 'closed' (no meeting, or the teacher-disconnect grace expired).
 */
export function getClassSessionStatus(
  val: ActiveClassSessionRecord | null | undefined,
  now: number = serverNow()
): ClassSessionStatus {
  if (!isClassSessionLive(val, now)) return 'closed';
  return val?.status === 'paused' ? 'paused' : 'active';
}

/** True when the session is open AND the teacher-disconnect grace has not expired. */
export function isClassSessionLive(
  val: ActiveClassSessionRecord | null | undefined,
  now: number = serverNow()
): boolean {
  if (!val || val.active !== true) return false;
  const disconnectedAt = typeof val.teacherDisconnectedAt === 'number' ? val.teacherDisconnectedAt : null;
  if (disconnectedAt && disconnectedAt > 0 && now - disconnectedAt > TEACHER_DISCONNECT_GRACE_MS) {
    return false;
  }
  const autoCloseAt = getSessionAutoCloseAt(val);
  if (autoCloseAt !== null && now >= autoCloseAt) return false;
  return true;
}
