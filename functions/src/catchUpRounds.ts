/**
 * Catch-up time: the server opens and closes catch-up rounds and measures the
 * learner's minutes. Contract stubs (part C1 implements; see DESIGN.md of
 * claude/catch-up-time and catchUp.ts for the data shape).
 *
 * A trigger on active_class_session (onValueWritten, beside meeting2Close.ts):
 *   - meeting N opened (a new startedAt): every catchup_records doc of meeting N
 *     with a 'reopen' round whose opened_at is null gets opened_at = startedAt.
 *   - meeting N stopped being live (teacher's close, switch to another meeting,
 *     the 45-minute cap, the teacher-disconnect window, or anything else that
 *     replaces the record): every open round of meeting N gets closed_at,
 *     closed_by and active_minutes.
 * The admin SDK writes these server-only fields; the rules refuse them to
 * every client.
 */
import type { CatchUpClosedBy } from "./catchUp";

type Rec = Record<string, unknown> | null | undefined;

export interface CatchUpTransition {
  /** Meeting N opened: open its pending 'reopen' rounds at this server time. */
  opened: { meeting: number; openedAt: number } | null;
  /**
   * Meeting N is no longer live: close its open rounds. closedAt is the
   * moment it ended — the write's time, or for a meeting past its cap / the
   * disconnect window, the moment that limit was reached.
   */
  closed: { meeting: number; closedAt: number; closedBy: CatchUpClosedBy } | null;
}

/** Pure. `atMs` is the event's server time. Pause/resume is neither. */
export function classifyCatchUpTransition(_before: Rec, _after: Rec, _atMs: number): CatchUpTransition {
  throw new Error("not implemented: classifyCatchUpTransition (part C1)");
}

/**
 * Pure. Distinct whole minutes (floor(t / 60000)) among the server write
 * times in [openedAt, closedAt]. The measure: "minutes in which the server
 * received at least one event of this learner in this meeting" (telemetry_logs
 * createTime). Presence pings are not kept as history, so they cannot be counted.
 */
export function computeActiveMinutes(_writeTimesMs: number[], _openedAt: number, _closedAt: number): number {
  throw new Error("not implemented: computeActiveMinutes (part C1)");
}
