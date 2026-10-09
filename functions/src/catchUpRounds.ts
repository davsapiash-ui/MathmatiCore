/**
 * Catch-up time: the server opens and closes catch-up rounds and measures the
 * learner's minutes (see catchUp.ts for the data shape).
 *
 * Owner decision, 2.10.2026: "המורה יקח את אותם ילדים שלא סיימו למפגש נוסף \ זמן
 * נוסף וזה יתועד מה הסיבה לכך ואז אחרי שהם יישרו קו נמשיך עם כל הקבוצה למפגש
 * הבא".
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
import { onValueWritten } from "firebase-functions/v2/database";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { CATCHUP_COLLECTION, type CatchUpClosedBy, type CatchUpRound } from "./catchUp";
import { SESSION_HARD_CAP_MS, TEACHER_DISCONNECT_GRACE_MS, TEACHER_CLOSE_MARKER } from "./meeting2Close";
import { countActiveMinutes, serverReceivedAtMs, sessionNumberFromId } from "./meetingMetrics";
import { stampScoreBeforeCatchUp } from "./sessionTrigger";

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

function meetingOf(rec: Rec): number | null {
  const n = Number(rec?.sessionNumber);
  return Number.isInteger(n) && n >= 1 && n <= 8 ? n : null;
}

function positiveNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

/** An open record of a meeting (active, paused included — a pause keeps it open). */
function isOpenRecord(rec: Rec): boolean {
  return Boolean(rec) && rec!.active === true && rec!.status !== "closed" && meetingOf(rec) !== null;
}

/**
 * When the run in `rec` ended by time at or before `atMs`: the earlier of the
 * 45-minute cap and the end of the teacher-disconnect window (the same limits
 * as meeting2Close.ts and react-ts-version core/classSession.ts), or null.
 */
function timeLimitReached(rec: Record<string, unknown>, atMs: number): { at: number; by: CatchUpClosedBy } | null {
  const reached: Array<{ at: number; by: CatchUpClosedBy }> = [];
  const startedAt = positiveNumber(rec.startedAt);
  if (startedAt !== null && atMs >= startedAt + SESSION_HARD_CAP_MS) {
    reached.push({ at: startedAt + SESSION_HARD_CAP_MS, by: "auto_45min" });
  }
  const away = positiveNumber(rec.teacherDisconnectedAt);
  if (away !== null && atMs - away > TEACHER_DISCONNECT_GRACE_MS) {
    reached.push({ at: away + TEACHER_DISCONNECT_GRACE_MS, by: "teacher_disconnect_grace" });
  }
  if (reached.length === 0) return null;
  return reached.reduce((a, b) => (b.at < a.at ? b : a));
}

/** The latest moment the run could have lasted: never past its cap or the disconnect window. */
function capAt(rec: Record<string, unknown>, atMs: number): number {
  let at = atMs;
  const startedAt = positiveNumber(rec.startedAt);
  if (startedAt !== null) at = Math.min(at, startedAt + SESSION_HARD_CAP_MS);
  const away = positiveNumber(rec.teacherDisconnectedAt);
  if (away !== null) at = Math.min(at, away + TEACHER_DISCONNECT_GRACE_MS);
  return at;
}

/**
 * Pure. `atMs` is the event's server time. Pause/resume is neither.
 *
 * Opened: the record after the write is an open meeting N whose startedAt is
 * new (a different meeting before, a closed record, or the same meeting with
 * another start). Closed: meeting N was open before the write and is not the
 * same run after it — closed, deleted, switched to another meeting, or started
 * again. A restart of the same meeting is both: the old run closes, the new
 * one opens.
 *
 * closedBy: the time limit when one was reached by the write (closedAt is then
 * that limit, not the write); otherwise the close's own marker ('teacher' from
 * the button, endedBy 'auto_45min' / 'teacher_disconnect_grace' from the
 * dashboard), 'switch' for another meeting opened over it, 'teacher' for the
 * same meeting started again (only the teacher's activation writes that), and
 * 'other' for anything else (a reset writes the closed record without a marker).
 */
export function classifyCatchUpTransition(before: Rec, after: Rec, atMs: number): CatchUpTransition {
  let opened: CatchUpTransition["opened"] = null;
  let closed: CatchUpTransition["closed"] = null;

  const afterOpen = isOpenRecord(after);
  const afterStart = afterOpen ? positiveNumber(after?.startedAt) : null;
  const beforeOpen = isOpenRecord(before);
  const beforeStart = beforeOpen ? positiveNumber(before?.startedAt) : null;
  const sameRun = beforeOpen && afterOpen && meetingOf(before) === meetingOf(after) && beforeStart === afterStart;

  if (afterOpen && afterStart !== null && !sameRun) {
    opened = { meeting: meetingOf(after)!, openedAt: afterStart };
  }

  if (beforeOpen && !sameRun) {
    const meeting = meetingOf(before)!;
    const byTime = timeLimitReached(before as Record<string, unknown>, atMs);
    if (byTime) {
      closed = { meeting, closedAt: byTime.at, closedBy: byTime.by };
    } else {
      let closedBy: CatchUpClosedBy = "other";
      if (afterOpen) {
        closedBy = meetingOf(after) === meeting ? "teacher" : "switch";
      } else if (after && after.closedBy === TEACHER_CLOSE_MARKER) {
        closedBy = "teacher";
      } else if (after && (after.endedBy === "auto_45min" || after.endedBy === "teacher_disconnect_grace")) {
        closedBy = after.endedBy;
      }
      closed = { meeting, closedAt: capAt(before as Record<string, unknown>, atMs), closedBy };
    }
  }

  return { opened, closed };
}

/**
 * Pure. Distinct whole minutes (floor(t / 60000)) among the server write
 * times in [openedAt, closedAt]. The measure: "minutes in which the server
 * received at least one event of this learner in this meeting" (telemetry_logs
 * server_received_at, else createTime) — the same definition as the reports and the research export
 * (meetingMetrics.countActiveMinutes, PRD 14 §ב0). Presence pings are not kept
 * as history, so they cannot be counted.
 */
export function computeActiveMinutes(writeTimesMs: number[], openedAt: number, closedAt: number): number {
  if (!Number.isFinite(openedAt) || !Number.isFinite(closedAt) || closedAt < openedAt) return 0;
  return countActiveMinutes(writeTimesMs, openedAt, closedAt);
}

function studentOfDoc(id: string, data: Record<string, unknown>): number | null {
  const n = Number(data.student_id) || Number(/_student_(\d+)$/.exec(id)?.[1]);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}

function roundsOf(data: Record<string, unknown>): Record<string, Partial<CatchUpRound>> {
  const rounds = data.rounds;
  return rounds && typeof rounds === "object" ? (rounds as Record<string, Partial<CatchUpRound>>) : {};
}

const isPendingReopen = (r: Partial<CatchUpRound> | null | undefined) =>
  Boolean(r) && r!.action === "reopen" && (r!.opened_at === null || r!.opened_at === undefined);

/** How long before a run's start a 'reopen' round may have been recorded and still belong to that run. */
export const PENDING_REOPEN_WINDOW_MS = 5 * 60_000;
/** The teacher's clock estimate (serverNow) may run a little ahead of the server's start stamp. */
export const PENDING_REOPEN_SLACK_MS = 30_000;

/**
 * Pure. A pending 'reopen' round belongs to the run that started at
 * `runStartedAt` only when the teacher recorded it just before that start: the
 * dashboard records the reasons and then opens the meeting at once. A round
 * whose reopen never happened (the reopen failed, or the teacher cancelled
 * while the reasons were still being saved) stays pending and is never opened
 * by an unrelated later start of the meeting; the reports then show its reason
 * without catch-up minutes, which is what happened.
 */
export function pendingReopenBelongsToRun(r: Partial<CatchUpRound> | null | undefined, runStartedAt: number): boolean {
  if (!isPendingReopen(r)) return false;
  const at = r!.recorded_at;
  if (typeof at !== "number" || !Number.isFinite(at)) return false;
  return at >= runStartedAt - PENDING_REOPEN_WINDOW_MS && at <= runStartedAt + PENDING_REOPEN_SLACK_MS;
}

const isOpenRound = (r: Partial<CatchUpRound> | null | undefined) =>
  Boolean(r) && typeof r!.opened_at === "number" && (r!.closed_at === null || r!.closed_at === undefined);

/**
 * Opens the pending 'reopen' rounds of the meeting recorded for this run
 * (pendingReopenBelongsToRun) at `openedAt`. Idempotent: a round already
 * opened is left as it is. Returns the learners whose rounds opened.
 */
export async function openCatchUpRounds(
  db: admin.firestore.Firestore,
  meeting: number,
  openedAt: number
): Promise<number[]> {
  const snap = await db.collection(CATCHUP_COLLECTION).where("session_number", "==", meeting).get();
  const opened: number[] = [];
  for (const d of snap.docs) {
    const ref = db.collection(CATCHUP_COLLECTION).doc(d.id);
    const n = studentOfDoc(d.id, d.data() || {});
    try {
      const did = await db.runTransaction(async (tx) => {
        const cur = await tx.get(ref);
        if (!cur.exists) return false;
        const updates: Record<string, unknown> = {};
        for (const [rid, round] of Object.entries(roundsOf(cur.data() || {}))) {
          if (pendingReopenBelongsToRun(round, openedAt)) updates[`rounds.${rid}.opened_at`] = openedAt;
        }
        if (Object.keys(updates).length === 0) return false;
        tx.update(ref, updates);
        return true;
      });
      if (did && n !== null) {
        opened.push(n);
        // PRD 14 §ב0 / 23 §ב: the score before the catch-up, kept to stand
        // beside the new one when the learner completes the meeting.
        await stampScoreBeforeCatchUp(db, n, meeting, openedAt);
      }
    } catch (err) {
      logger.error(`Catch-up: opening the rounds of ${d.id} failed:`, err);
    }
  }
  return opened;
}

/** Server write times of the learner's telemetry in this meeting. */
async function telemetryWriteTimes(db: admin.firestore.Firestore, studentNumber: number, meeting: number): Promise<number[]> {
  const snap = await db.collection("telemetry_logs").where("student_id", "==", studentNumber).get();
  const times: number[] = [];
  for (const d of snap.docs) {
    const data = d.data() || {};
    if (sessionNumberFromId(String(data.session_id || "")) !== meeting) continue;
    // server_received_at (PRD Module 5 §ב), else createTime for an event stored before the stamp existed.
    const t = serverReceivedAtMs(data) ?? d.createTime?.toMillis?.();
    if (typeof t === "number" && Number.isFinite(t)) times.push(t);
  }
  return times;
}

/**
 * Closes every open round of the meeting at `closedAt`, with the learner's
 * active minutes. Idempotent: a round already closed is left as it is.
 * Returns the learners whose rounds closed.
 *
 * `runStartedAt` (the start of the run that ended): a 'reopen' round recorded
 * for that run that reached the server only after the run had started (the
 * dashboard does not wait more than a few seconds for the reasons, so on a slow
 * network they can arrive late) is opened at the run's start and closed here.
 */
export async function closeCatchUpRounds(
  db: admin.firestore.Firestore,
  meeting: number,
  closedAt: number,
  closedBy: CatchUpClosedBy,
  runStartedAt: number | null = null
): Promise<number[]> {
  const snap = await db.collection(CATCHUP_COLLECTION).where("session_number", "==", meeting).get();
  const closed: number[] = [];
  const lateForRun = (r: Partial<CatchUpRound>) =>
    runStartedAt !== null && runStartedAt <= closedAt && pendingReopenBelongsToRun(r, runStartedAt);
  for (const d of snap.docs) {
    const data = d.data() || {};
    if (!Object.values(roundsOf(data)).some((r) => isOpenRound(r) || lateForRun(r))) continue;
    const n = studentOfDoc(d.id, data);
    const ref = db.collection(CATCHUP_COLLECTION).doc(d.id);
    try {
      const times = n !== null ? await telemetryWriteTimes(db, n, meeting) : [];
      const did = await db.runTransaction(async (tx) => {
        const cur = await tx.get(ref);
        if (!cur.exists) return false;
        const updates: Record<string, unknown> = {};
        for (const [rid, round] of Object.entries(roundsOf(cur.data() || {}))) {
          const late = lateForRun(round);
          if (!isOpenRound(round) && !late) continue;
          const openedAt = late ? (runStartedAt as number) : (round.opened_at as number);
          if (late) updates[`rounds.${rid}.opened_at`] = openedAt;
          // Opened after this end: a later run of the meeting. The reopen
          // writes close-then-open, but the two triggers may run in either
          // order; the old run's close must not close the new run's round.
          if (openedAt > closedAt) continue;
          updates[`rounds.${rid}.closed_at`] = closedAt;
          updates[`rounds.${rid}.closed_by`] = closedBy;
          updates[`rounds.${rid}.active_minutes`] = computeActiveMinutes(times, openedAt, closedAt);
        }
        if (Object.keys(updates).length === 0) return false;
        tx.update(ref, updates);
        return true;
      });
      if (did && n !== null) closed.push(n);
    } catch (err) {
      logger.error(`Catch-up: closing the rounds of ${d.id} failed:`, err);
    }
  }
  return closed;
}

/**
 * The class record changed: close the rounds of the run that ended, then open
 * the pending rounds of the run that began (a restart of the same meeting
 * does both, in this order, so the new rounds are not closed at once).
 */
export const onCatchUpSessionWrite = onValueWritten({
  ref: "/active_class_session",
  region: "us-central1",
}, async (event) => {
  const before = event.data.before.val() as Rec;
  const after = event.data.after.val() as Rec;
  // The write's own time on the server, not when this function happens to run.
  const at = Date.parse(String(event.time ?? ""));
  const t = classifyCatchUpTransition(before, after, Number.isFinite(at) ? at : Date.now());
  if (!t.opened && !t.closed) return;
  const db = admin.firestore();
  if (t.closed) {
    const runStart = typeof before?.startedAt === "number" && Number.isFinite(before.startedAt) ? before.startedAt : null;
    const closed = await closeCatchUpRounds(db, t.closed.meeting, t.closed.closedAt, t.closed.closedBy, runStart);
    if (closed.length) {
      logger.info(`Catch-up: meeting ${t.closed.meeting} ended (${t.closed.closedBy}); rounds closed for [${closed.join(", ")}].`);
    }
  }
  if (t.opened) {
    const opened = await openCatchUpRounds(db, t.opened.meeting, t.opened.openedAt);
    if (opened.length) {
      logger.info(`Catch-up: meeting ${t.opened.meeting} opened; rounds opened for [${opened.join(", ")}].`);
    }
  }
});
