/**
 * PRD v7.1 Module 14 + pilot policy: an opened class session survives momentary
 * teacher disconnects (refresh, network blip, laptop sleep). Only when the
 * teacher stays disconnected beyond a 5-minute grace window is the session
 * considered closed for students.
 *
 * The teacher client arms an RTDB onDisconnect hook that stamps
 * `active_class_session/teacherDisconnectedAt` with the server time, and clears
 * the stamp on every (re)connect. Clients evaluate the stamp locally.
 */

export const TEACHER_DISCONNECT_GRACE_MS = 5 * 60 * 1000;

/**
 * Owner decision (6.9.2026, register item 11): a meeting the teacher never
 * closed closes by itself 45 minutes after activation. Until then nothing
 * closes on its own and the learner sees no timer and no message (PRD Module
 * 14 §ב1); the per-meeting working time (20 / 25 / 15 minutes) only raises the
 * teacher's "עברו X דקות" popup.
 */
export const SESSION_HARD_CAP_MS = 45 * 60 * 1000;

/** When the meeting closes by itself, or null when it has no start stamp. */
export function getSessionAutoCloseAt(val: ActiveClassSessionRecord | null | undefined): number | null {
  const startedAt = typeof val?.startedAt === 'number' ? val.startedAt : null;
  return startedAt && startedAt > 0 ? startedAt + SESSION_HARD_CAP_MS : null;
}

/**
 * Owner decision (6.9.2026, register item 10): a meeting has three teacher
 * controls — start, pause, close — and every one of them reaches the learner's
 * screen live, in place. `active` stays the on/off flag older readers and the
 * database rules know; `status` carries the pause.
 */
export type ClassSessionStatus = 'active' | 'paused' | 'closed';

export interface ActiveClassSessionRecord {
  active?: boolean;
  status?: ClassSessionStatus;
  sessionNumber?: number | null;
  startedAt?: number | null;
  pausedAt?: number | null;
  teacherId?: string;
  teacherDisconnectedAt?: number | null;
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
  now: number = Date.now()
): ClassSessionStatus {
  if (!isClassSessionLive(val, now)) return 'closed';
  return val?.status === 'paused' ? 'paused' : 'active';
}

/** True when the session is open AND the teacher-disconnect grace has not expired. */
export function isClassSessionLive(
  val: ActiveClassSessionRecord | null | undefined,
  now: number = Date.now()
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
