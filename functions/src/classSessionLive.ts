/**
 * Is the class meeting open right now? The server's copy of the rule every
 * client applies (react-ts-version core/classSession.ts isClassSessionLive),
 * with the same two owner limits:
 *
 *   - SESSION_HARD_CAP_MS (register item 8, 6.9.2026): a meeting closes by
 *     itself 45 minutes after the teacher opened it.
 *   - TEACHER_DISCONNECT_GRACE_MS (owner, 20.9.2026): 15 minutes after the
 *     teacher's dashboard dropped, the meeting is closed for the learners.
 *
 * Past either limit the record may still say `active: true` — nobody was there
 * to write the close — and every client already reads it as closed. A server
 * decision that reads the record has to read it the same way: meeting 2's
 * close (meeting2Close.ts) and the reset's choice of meeting
 * (resetMeetingTarget.ts) both come here.
 */
export const SESSION_HARD_CAP_MS = 45 * 60 * 1000;
export const TEACHER_DISCONNECT_GRACE_MS = 15 * 60 * 1000;

type Rec = Record<string, unknown> | null | undefined;

/** The meeting ended by time at `atMs`: the 45-minute cap, or the teacher away past the window. */
export function endedByTime(rec: Record<string, unknown>, atMs: number): boolean {
  const startedAt = typeof rec.startedAt === "number" && rec.startedAt > 0 ? rec.startedAt : null;
  if (startedAt !== null && atMs >= startedAt + SESSION_HARD_CAP_MS) return true;
  const away = typeof rec.teacherDisconnectedAt === "number" && rec.teacherDisconnectedAt > 0 ? rec.teacherDisconnectedAt : null;
  return away !== null && atMs - away > TEACHER_DISCONNECT_GRACE_MS;
}

/** Open (or paused) and not ended by time. A paused meeting is still the class's open meeting. */
export function isClassSessionOpenAt(rec: Rec, atMs: number): boolean {
  if (!rec || rec.active !== true || rec.status === "closed") return false;
  return !endedByTime(rec, atMs);
}

/** The meeting number 1–8 of the class's open meeting at `atMs`, or null when none is open. */
export function liveClassMeeting(rec: Rec, atMs: number): number | null {
  if (!isClassSessionOpenAt(rec, atMs)) return null;
  const n = Number(rec?.sessionNumber);
  return Number.isInteger(n) && n >= 1 && n <= 8 ? n : null;
}
