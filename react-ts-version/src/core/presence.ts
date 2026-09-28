/**
 * Module 18 §ג: "זיהוי ניתוק מבוצע בצד השרת דרך מנגנון Presence Heartbeat
 * (חלון זיהוי מרבי: 15 שניות)".
 *
 * The learner's heartbeat stamps `lastPing: serverTimestamp()` — the server's
 * time, not the learner's device clock — and the teacher compares it with
 * serverNow(). Before, the learner wrote its own Date.now() and the teacher
 * compared it with the teacher's own clock: a tablet 20 seconds off showed
 * GREY ("לא מחובר") while the child was working.
 */
import { serverNow } from '@/infrastructure/firebase';

/** A heartbeat older than this reads as disconnected (learners ping every 4 s). */
export const PRESENCE_FRESH_WINDOW_MS = 12_000;

/** An RTDB server-value placeholder (`{ '.sv': 'timestamp' }`) not yet replaced by the server. */
function isServerValuePlaceholder(value: unknown): boolean {
  return typeof value === 'object' && value !== null && '.sv' in value;
}

/**
 * The heartbeat's time on the server clock, or 0 when there is none (0 is what
 * sign-out and onDisconnect write). A write's placeholder that has not resolved
 * yet is a ping made this instant, so it reads as `now`.
 */
export function readLastPing(value: unknown, now: number = serverNow()): number {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : 0;
  return isServerValuePlaceholder(value) ? now : 0;
}

/** True when the learner's last heartbeat is within the window, on the server clock. */
export function isHeartbeatFresh(value: unknown, now: number = serverNow()): boolean {
  const lastPing = readLastPing(value, now);
  return lastPing > 0 && Math.abs(now - lastPing) <= PRESENCE_FRESH_WINDOW_MS;
}
