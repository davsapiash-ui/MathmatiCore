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

export interface ActiveClassSessionRecord {
  active?: boolean;
  sessionNumber?: number | null;
  startedAt?: number | null;
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
  return true;
}
