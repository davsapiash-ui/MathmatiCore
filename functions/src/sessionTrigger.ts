import { onDocumentWritten, onDocumentCreated } from "firebase-functions/v2/firestore";
import { onValueWritten } from "firebase-functions/v2/database";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { readCallerRoles } from "./callerIdentity";
import {
  computeFirstAttemptScore,
  isChoiceExercise,
  isExerciseEvent,
  isScoredMeeting,
  readMeetingTelemetry,
  readLastResetOfMeeting,
  resolveCompulsoryTotal,
  hasAnswerEvent,
  resolveMeetingPath,
  sessionDocumentIdCandidates,
  sessionNumberFromId,
  studentNumberFromSessionId,
  COMPULSORY_EXERCISES_PER_MEETING,
} from "./meetingMetrics";
import { CATCHUP_COLLECTION, catchUpDocId } from "./catchUp";

export type MeetingScore =
  | { outcome: "scored"; scorePercent: number; recommendedPath: "green_path" | "remediation_path" }
  | { outcome: "no_telemetry" }
  | { outcome: "no_denominator" };

/**
 * One learner's score in one meeting, from the meeting's telemetry (PRD 23 §ב:
 * first-attempt correct ÷ compulsory), and the path it recommends (≥ 50% →
 * green_path). Shared by the completion trigger below and the re-scoring of
 * every later completion (rescoreCompletedMeeting).
 *
 * Meetings 3–8 are scored on the path the learner worked on in THAT meeting
 * (PRD 23 §ב: the bank most of the learner's exercises were opened from), and
 * `path` is only the fallback when no exercise was opened.
 */
export async function computeMeetingScore(
  db: admin.firestore.Firestore,
  studentNum: number,
  sessionNum: number,
  path: "green_path" | "remediation_path"
): Promise<MeetingScore> {
  // By learner and meeting, not by the document's session_id: the document is
  // `session_02_student_4` while its events carry `session_2_student_student_user4`,
  // so reading by that id matched nothing and would have scored every learner 0%.
  // Only the run since the last reset of this meeting (meetingMetrics.lastResetOfMeeting).
  const writtenAfterMs = await readLastResetOfMeeting(db, studentNum, sessionNum);
  const telemetry = await readMeetingTelemetry(db, studentNum, sessionNum, { writtenAfterMs });
  if (telemetry.length === 0) return { outcome: "no_telemetry" };

  const compulsoryIds = new Map<string, ReadonlySet<string>>();
  const cache = new Map<string, number | null>();
  const scoringPath = sessionNum >= 3
    ? await resolveMeetingPath(db, sessionNum, telemetry, path, cache, compulsoryIds)
    : path;
  const compulsoryTotal = await resolveCompulsoryTotal(db, sessionNum, scoringPath, cache, compulsoryIds);
  const computed = computeFirstAttemptScore(
    telemetry,
    compulsoryTotal,
    compulsoryIds.get(`${sessionNum}:${scoringPath}`) ?? null
  );
  if (computed.scorePercent === null) return { outcome: "no_denominator" };
  return {
    outcome: "scored",
    scorePercent: computed.scorePercent,
    recommendedPath: computed.scorePercent >= 50 ? "green_path" : "remediation_path",
  };
}

/**
 * PRD 14 §ב0 / 20 §ב: "ציון המפגש מחושב מחדש בכל פעם שהלומד משלים אותו; הציון
 * הקודם נשמר גם הוא ואינו נדרס". Pure. The fields to write for a new score over
 * what the document already holds:
 *   - a stored score that differs: the score, the recommendation, and
 *     previous_score_percent = the stored score, so the score before this
 *     completion is kept next to the new one;
 *   - no stored score yet: the score and the recommendation, and
 *     previous_score_percent = `scoreBeforeCatchUp` when the learner had one
 *     before a catch-up round (the score of a meeting the learner had not
 *     finished, taken when the round opened — catchUpScoreBefore);
 *   - the same score and recommendation: nothing (changed = false), and a
 *     previous_score_percent kept from an earlier completion stays as it is.
 * previous_score_percent is never cleared. The teacher's approval and chosen
 * path are never among the fields.
 */
export function rescoreFields(
  stored: { session_score_percent?: unknown; matrix_recommended_path?: unknown } | null | undefined,
  scorePercent: number,
  recommendedPath: "green_path" | "remediation_path",
  scoreBeforeCatchUp: number | null = null
): { changed: boolean; previousScore: number | null; fields: Record<string, unknown> } {
  const storedScore = stored?.session_score_percent;
  const before = isScore(storedScore) ? storedScore : null;
  if (before === scorePercent && stored?.matrix_recommended_path === recommendedPath) {
    return { changed: false, previousScore: null, fields: {} };
  }
  const fields: Record<string, unknown> = {
    session_score_percent: scorePercent,
    matrix_recommended_path: recommendedPath,
  };
  const previousScore = before !== null
    ? (before !== scorePercent ? before : null)
    : (isScore(scoreBeforeCatchUp) ? scoreBeforeCatchUp : null);
  if (previousScore !== null) fields.previous_score_percent = previousScore;
  return { changed: true, previousScore, fields };
}

function isScore(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;
}

/**
 * The learner's score in this meeting as it stood when the teacher opened a
 * catch-up round for them (stamped on the catch-up record by
 * stampScoreBeforeCatchUp), or null: no record, no stamp, or a stamp from
 * before the meeting's last reset (a reset run starts with no previous score;
 * the record itself survives the reset, PRD 14 §ב0 "איפוס").
 */
export async function catchUpScoreBefore(
  db: admin.firestore.Firestore,
  studentNum: number,
  sessionNum: number
): Promise<number | null> {
  try {
    const snap = await db.collection(CATCHUP_COLLECTION).doc(catchUpDocId(sessionNum, studentNum)).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    const score = data.score_before_catchup_percent;
    const at = data.score_before_catchup_at;
    if (!isScore(score) || typeof at !== "number") return null;
    const lastReset = await readLastResetOfMeeting(db, studentNum, sessionNum);
    return lastReset !== null && at <= lastReset ? null : score;
  } catch (err) {
    logger.warn(`Catch-up record of learner ${studentNum} meeting ${sessionNum}: the score before catch-up could not be read:`, err);
    return null;
  }
}

/**
 * Pure. Whether the catch-up record already holds the score before catch-up
 * of the current run — stamped after the meeting's last reset (or with no
 * reset at all) — so a later round keeps it.
 */
export function keepsScoreBeforeCatchUp(record: Record<string, unknown> | null | undefined, lastResetMs: number | null): boolean {
  const score = record?.score_before_catchup_percent;
  const at = record?.score_before_catchup_at;
  if (!isScore(score) || typeof at !== "number") return false;
  return lastResetMs === null || at > lastResetMs;
}

/**
 * A catch-up round opened for this learner (catchUpRounds.ts openCatchUpRounds):
 * the meeting's score as it stands now — the run since the last reset, scored
 * as the completion trigger scores it — is kept on the catch-up record as the
 * score before catch-up. It becomes previous_score_percent when the learner
 * then completes the meeting (PRD 23 §ב "הציון הקודם, שחושב לפני ההשלמה").
 * Nothing is stamped when the learner has answered nothing in the run, or the
 * meeting is not scored, or a round opened earlier in this run stamped it
 * already (the score before the first round stands).
 */
export async function stampScoreBeforeCatchUp(
  db: admin.firestore.Firestore,
  studentNum: number,
  sessionNum: number,
  atMs: number
): Promise<number | null> {
  if (!isScoredMeeting(sessionNum)) return null;
  try {
    const writtenAfterMs = await readLastResetOfMeeting(db, studentNum, sessionNum);
    // The score before the FIRST catch-up round of this run: a later round
    // does not replace it (PRD 23 §ב "הציון הקודם, שחושב לפני ההשלמה"). A
    // stamp from before the meeting's last reset belongs to the erased run.
    const ref = db.collection(CATCHUP_COLLECTION).doc(catchUpDocId(sessionNum, studentNum));
    const recordSnap = await ref.get();
    const record = recordSnap.exists ? recordSnap.data() || {} : {};
    if (keepsScoreBeforeCatchUp(record, writtenAfterMs)) return record.score_before_catchup_percent as number;
    const events = await readMeetingTelemetry(db, studentNum, sessionNum, { writtenAfterMs });
    if (!hasAnswerEvent(events)) return null;
    const computed = await computeMeetingScore(db, studentNum, sessionNum, "green_path");
    if (computed.outcome !== "scored") return null;
    await ref.update({
      score_before_catchup_percent: computed.scorePercent,
      score_before_catchup_at: atMs,
    });
    return computed.scorePercent;
  } catch (err) {
    logger.warn(`Catch-up record of learner ${studentNum} meeting ${sessionNum}: the score before catch-up could not be stamped:`, err);
    return null;
  }
}

/**
 * PRD 14 §ב0: "רישום ההשלמה ... נושא את הציון החדש שחושב בהשלמה, ולצדו את הציון
 * הקודם, כשהיה כזה." When the learner has a catch-up record for this meeting,
 * the new score (and the previous one, or null) is written on it. Top-level
 * server fields: the rules let the teacher change only `rounds`.
 */
async function stampCatchUpScore(
  db: admin.firestore.Firestore,
  studentNum: number,
  sessionNum: number,
  scorePercent: number,
  previousScore: number | null
): Promise<void> {
  try {
    const ref = db.collection(CATCHUP_COLLECTION).doc(catchUpDocId(sessionNum, studentNum));
    const snap = await ref.get();
    if (!snap.exists) return;
    // The previous score of THIS completion, as it is: null clears one left
    // on the record by a run a reset erased (the record survives the reset,
    // PRD 14 §ב0 "איפוס"; a reset run starts with no previous score).
    await ref.update({
      score_percent: scorePercent,
      previous_score_percent: previousScore,
      scored_at: Date.now(),
    });
  } catch (err) {
    logger.warn(`Catch-up record of learner ${studentNum} meeting ${sessionNum}: the score could not be stamped:`, err);
  }
}

/**
 * The learner's RTDB record mirrors the meeting-2 gate (Module 20): the radar,
 * the class-management card and the approval drawer read the recommendation
 * from there. Only meeting 2 — a later meeting's score is not the gate's.
 */
async function mirrorGateScore(studentNum: number, sessionNum: number, scorePercent: number, recommendedPath: string): Promise<void> {
  if (sessionNum !== 2) return;
  await admin.database().ref(`users/students/student_user${studentNum}`).update({
    session_score_percent: scorePercent,
    matrix_recommended_path: recommendedPath,
  }).catch((err) => logger.warn(`Learner ${studentNum}: RTDB mirror of the meeting-2 score failed:`, err));
}

export type MeetingRescore = "not_completed" | "not_scored_yet" | "unchanged" | "rescored" | "no_score" | "contended";

/**
 * PRD 14 §ב0, in every scored meeting (all but meeting 1), not only meeting 2:
 * a completed meeting the learner completes again (catch-up time, or a reopened
 * meeting 2 after the teacher's close) is re-scored from the run since its last
 * reset, the score before it is kept as previous_score_percent, the
 * recommendation follows the new score, and a gate approval already given and
 * the path the teacher chose are not touched.
 *
 * Only once the document has been scored: before that, the completion trigger
 * is about to score it from the same run.
 */
export async function rescoreCompletedMeeting(
  db: admin.firestore.Firestore,
  studentNum: number,
  sessionNum: number
): Promise<MeetingRescore> {
  if (!isScoredMeeting(sessionNum)) return "no_score";
  const candidates = sessionDocumentIdCandidates(studentNum, sessionNum);
  const snaps = await Promise.all(candidates.map((id) => db.collection("sessions").doc(id).get()));
  const done = snaps.find((s) => s.exists && (s.data() || {}).is_completed === true);
  if (!done) return "not_completed";
  const docRef = db.collection("sessions").doc(done.id);
  let data: Record<string, any> = done.data() || {};

  // Read, compute, write — and the write only when the document still holds
  // what the score was computed over. Two completions can be re-scored at
  // once (the meeting-2 close and the learner's record stamp; the mark and
  // the completion trigger), each from the telemetry it read. Without the
  // check the slower one, with less of the run, could land last and replace
  // the right score with a lower one (and name the wrong previous score).
  // When the document moved on, the score is computed again over the newer
  // telemetry.
  for (let attempt = 0; attempt < RESCORE_ATTEMPTS; attempt++) {
    if (data.is_completed !== true) return "not_completed";
    if (!data.evaluated_at) return "not_scored_yet";
    const path = data.teacher_selected_path === "remediation_path" ? "remediation_path" : "green_path";
    const computed = await computeMeetingScore(db, studentNum, sessionNum, path);
    if (computed.outcome !== "scored") return "no_score";
    const { scorePercent, recommendedPath } = computed;
    const scoreBefore = await catchUpScoreBefore(db, studentNum, sessionNum);
    const readOver = data;
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      const now: Record<string, any> | null = snap.exists ? snap.data() || {} : null;
      if (!now || !sameEvaluation(now, readOver)) return { moved: true as const, now };
      const next = rescoreFields(now, scorePercent, recommendedPath, scoreBefore);
      if (next.changed) {
        tx.update(docRef, {
          ...next.fields,
          evaluated_at: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      return { moved: false as const, next, now };
    });
    if (result.moved) {
      if (!result.now) return "not_completed";
      data = result.now;
      continue;
    }
    if (!result.next.changed) return "unchanged";
    await mirrorGateScore(studentNum, sessionNum, scorePercent, recommendedPath);
    // The same score with only the recommendation corrected keeps the
    // document's previous score (rescoreFields leaves it there); the catch-up
    // record carries the same one, not a cleared field.
    const kept = result.now.previous_score_percent;
    const previousOnRecord = result.next.previousScore ?? (isScore(kept) ? kept : null);
    await stampCatchUpScore(db, studentNum, sessionNum, scorePercent, previousOnRecord);
    logger.info(
      `Meeting ${sessionNum} of learner ${studentNum} re-scored after a later completion: ` +
      `${readOver.session_score_percent ?? "none"}% -> ${scorePercent}% (${recommendedPath}).`
    );
    return "rescored";
  }
  logger.warn(`Meeting ${sessionNum} of learner ${studentNum}: the document kept changing during the re-score; the latest write stands.`);
  return "contended";
}

/** How many times a re-score computes again when the document moved on under it. */
export const RESCORE_ATTEMPTS = 3;

/** Pure. Whether two reads of a session document carry the same evaluation (score, recommendation, stamp). */
export function sameEvaluation(a: Record<string, any>, b: Record<string, any>): boolean {
  return (a.session_score_percent ?? null) === (b.session_score_percent ?? null) &&
    (a.matrix_recommended_path ?? null) === (b.matrix_recommended_path ?? null) &&
    sameStamp(a.evaluated_at, b.evaluated_at);
}

function sameStamp(a: unknown, b: unknown): boolean {
  const x = a ?? null;
  const y = b ?? null;
  if (x === y) return true;
  if (x === null || y === null) return false;
  if (typeof x === "number" || typeof y === "number") return x === y;
  const tx = x as { toMillis?: () => number };
  const ty = y as { toMillis?: () => number };
  return typeof tx.toMillis === "function" && typeof ty.toMillis === "function" && tx.toMillis() === ty.toMillis();
}

/**
 * Module 14 / Module 20: onSessionCompleteTrigger
 * Background trigger on session completion calculating closed-form cognitive mastery score
 * Formula: (correct_first_attempt_mandatory_tasks / 7) * 100
 * Threshold: Score >= 50% -> 'green_path', Score < 50% -> 'remediation_path'
 */
export const onSessionCompleteTrigger = onDocumentWritten({
  document: "sessions/{sessionId}",
  region: "us-central1",
}, async (event) => {
  const afterData = event.data?.after?.data();
  const beforeData = event.data?.before?.data();

  if (!afterData) return; // Deleted

  // The meeting has just been completed. This used to also require
  // `!afterData.matrix_recommended_path` — and the learner's client writes that
  // field in the very same write that sets is_completed, so the condition was
  // never true and the server NEVER recomputed anything. The score the gate
  // acted on was whatever the child's browser had posted, and the Firestore
  // rules put no bound on it. PRD Module 23 §ב defines the score as a function
  // of the meeting's telemetry; it is computed here, every time.
  const justCompleted = afterData.is_completed === true && (!beforeData || beforeData.is_completed !== true);
  if (!justCompleted) return;

  // Guard against reacting to this function's own write below.
  if (afterData.evaluated_at && beforeData?.is_completed === true) return;

  const sessionNum = Number(afterData.session_number) || 1;
  // Module 14 §ב: meeting 1 "אינו מקבל ציון, ואינו מפעיל את נוסחת
  // session_score_percent" — nor, therefore, a path recommendation.
  if (!isScoredMeeting(sessionNum)) {
    logger.info(`Session ${event.params.sessionId}: meeting ${sessionNum} is not scored (Module 14 §ב).`);
    return;
  }
  const studentNum = studentNumberFromSessionId(event.params.sessionId)
    ?? studentNumberFromSessionId(String(afterData.session_id || ""));
  if (studentNum === null) {
    logger.warn(`Session ${event.params.sessionId}: no learner in the document id, score not recomputed.`);
    return;
  }

  const db = admin.firestore();
  const path = afterData.teacher_selected_path === "remediation_path" ? "remediation_path" : "green_path";
  const computed = await computeMeetingScore(db, studentNum, sessionNum, path);
  if (computed.outcome === "no_telemetry") {
    // Nothing to measure. Module 24 §ב forbids inventing one, and a 0%
    // computed from no events would be exactly that — so the document is left
    // without a score, and the teacher sees it is missing. (The learner's
    // client no longer posts a number of its own: the rules make the score and
    // the path the server's, owner 29.9.2026.)
    logger.warn(`Session ${event.params.sessionId}: no telemetry for learner ${studentNum} meeting ${sessionNum}; no score recorded.`);
    return;
  }

  if (computed.outcome === "no_denominator") {
    // No denominator means no score. Recommending a path from a number we
    // could not compute is exactly the invented measurement Module 24 §ב
    // forbids; leave the field unset so the teacher sees it is missing.
    logger.warn(`Session ${event.params.sessionId}: compulsory count unknown, no path recommended.`);
    return;
  }

  const { scorePercent, recommendedPath } = computed;
  // null when nothing was submitted — a meeting 2 completed by the teacher's close (meeting2Close.ts).
  const submitted = typeof afterData.session_score_percent === "number" ? afterData.session_score_percent : NaN;
  if (Number.isFinite(submitted) && submitted !== scorePercent && !beforeData?.evaluated_at) {
    logger.warn(`Session ${event.params.sessionId}: client reported ${submitted}%, server computed ${scorePercent}%. Server value stands.`);
  }
  logger.info(`Evaluating Session ${event.params.sessionId} (Session ${sessionNum}): Score ${scorePercent}% -> Recommended ${recommendedPath}`);

  // A score the server already computed before this completion (the meeting
  // was completed before, then reopened) is kept as previous_score_percent
  // (PRD 14 §ב0: "הציון הקודם נשמר גם הוא ואינו נדרס"). A number the client
  // wrote without a server evaluation is not a score.
  // With no score of its own yet (a meeting 3–8 the learner first finishes in
  // catch-up time), the score before the catch-up round is the previous one.
  const stored = beforeData?.evaluated_at ? beforeData : null;
  const next = rescoreFields(stored, scorePercent, recommendedPath, await catchUpScoreBefore(db, studentNum, sessionNum));
  await event.data?.after?.ref.update({
    session_score_percent: scorePercent,
    matrix_recommended_path: recommendedPath,
    ...(next.previousScore !== null ? { previous_score_percent: next.previousScore } : {}),
    evaluated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  // The learner's RTDB record mirrors the gate state (register 15 and 16), and
  // the radar, the class-management card and the approval drawer all read the
  // recommendation from there. Left unmirrored, the teacher would see the
  // client's number on four screens and the server's in the gate tab.
  // Meeting 2 only (mirrorGateScore writes users/students/student_user${studentNum}).
  await mirrorGateScore(studentNum, sessionNum, scorePercent, recommendedPath);
  await stampCatchUpScore(db, studentNum, sessionNum, scorePercent, next.previousScore);
});

/**
 * PRD 14 §ב0, meetings 3–8 (8 after its reflection board): the learner's
 * client marks the meeting finished on the learner record
 * (users/students/{key}/completedMeetings/m{N}, FirebaseSyncService
 * markMeetingCompleted). Those meetings had no session document, so nothing
 * scored them at completion and nothing kept a score to compare a later one
 * with. Here the mark completes the meeting's SessionDocument — creating it
 * when there is none — which fires onSessionCompleteTrigger; a document
 * completed already is re-scored (rescoreCompletedMeeting). Meeting 2 is
 * completed by its own document; its mark only re-scores.
 *
 * The client queues the mark behind the meeting's telemetry (Module 17 FIFO),
 * but the two travel to different databases, so the run is still read until
 * it shows the completion (completionVisible), for a short while. When it
 * still does not, nothing is completed or scored ("skipped"): a score from
 * part of the run would become the authoritative one in every report. The
 * reports read the telemetry meanwhile, and when the missing events arrive
 * onMeetingTelemetryArrived completes the meeting from the mark.
 */
export const COMPLETION_WAIT_ATTEMPTS = 6;
export const COMPLETION_WAIT_MS = 10_000;

/**
 * Pure. Whether the meeting's run on the server already shows the learner's
 * completion: the seven compulsory exercises completed — and in meeting 8 its
 * reflection as well. The reflection alone is not enough: it can reach the
 * server before the exercises' telemetry (a second tablet, a parked item), and
 * the meeting would then be scored on part of the run.
 */
export function completionVisible(events: Record<string, any>[], sessionNum: number): boolean {
  const done = new Set<string>();
  for (const e of events) {
    const id = String(e?.exercise_id || "");
    if (e?.event_type === "PROBLEM_COMPLETE" && id && isExerciseEvent(e) && !isChoiceExercise(id)) done.add(id);
  }
  if (done.size < COMPULSORY_EXERCISES_PER_MEETING) return false;
  return sessionNum !== 8 || events.some((e) => e?.event_type === "REFLECTION_SUBMITTED");
}

/** "m3" → 3. */
export function meetingFromCompletionKey(key: string): number | null {
  const m = /^m([1-8])$/.exec(String(key));
  return m ? Number(m[1]) : null;
}

export async function completeMeetingFromMark(
  db: admin.firestore.Firestore,
  studentNum: number,
  sessionNum: number,
  options: { attempts?: number; waitMs?: number; classId?: string } = {}
): Promise<"created" | "completed" | MeetingRescore | "skipped"> {
  if (!isScoredMeeting(sessionNum)) return "skipped";
  if (sessionNum === 2) return rescoreCompletedMeeting(db, studentNum, 2);

  const attempts = Math.max(1, options.attempts ?? COMPLETION_WAIT_ATTEMPTS);
  const waitMs = options.waitMs ?? COMPLETION_WAIT_MS;
  let events: Record<string, any>[] = [];
  for (let i = 0; i < attempts; i++) {
    const writtenAfterMs = await readLastResetOfMeeting(db, studentNum, sessionNum);
    events = await readMeetingTelemetry(db, studentNum, sessionNum, { writtenAfterMs });
    if (completionVisible(events, sessionNum)) break;
    if (i < attempts - 1 && waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
  }
  if (!completionVisible(events, sessionNum)) {
    logger.warn(`Learner ${studentNum} meeting ${sessionNum}: completion mark arrived, the run does not show it yet; not completed or scored until it does.`);
    return "skipped";
  }

  const candidates = sessionDocumentIdCandidates(studentNum, sessionNum);
  const snaps = await Promise.all(candidates.map((id) => db.collection("sessions").doc(id).get()));
  if (snaps.some((s) => s.exists && (s.data() || {}).is_completed === true)) {
    return rescoreCompletedMeeting(db, studentNum, sessionNum);
  }
  const existing = snaps.find((s) => s.exists);
  const docRef = db.collection("sessions").doc(existing ? existing.id : candidates[0]);
  const firstEventAt = events.find((e) => typeof e?.client_timestamp === "number")?.client_timestamp ?? null;
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const data = snap.exists ? snap.data() || {} : null;
    if (data && data.is_completed === true) return "completed" as const;
    if (data) {
      tx.update(docRef, { is_completed: true });
      return "completed" as const;
    }
    // Only the fields the Firestore rules allow on a session document
    // (isValidSessionDoc). The score and the path are the trigger's.
    tx.set(docRef, {
      session_id: docRef.id,
      class_id: options.classId ?? "class_1",
      session_number: sessionNum,
      session_start_time: firstEventAt,
      session_deadline_time: null,
      active_exercise_id: null,
      is_completed: true,
      session_score_percent: null,
      teacher_gate_approved: false,
      gate_approved_at: null,
      gate_approved_by: null,
      teacher_selected_path: null,
      matrix_recommended_path: null,
    });
    return "created" as const;
  });
}

export const onMeetingCompletionMarked = onValueWritten({
  ref: "/users/students/{studentKey}/completedMeetings/{meetingKey}",
  region: "us-central1",
  timeoutSeconds: 120,
}, async (event) => {
  const after = event.data.after.val();
  if (after === null || after === undefined) return;
  // A mark already there and written again is not a new completion.
  const before = event.data.before.val();
  if (before !== null && before !== undefined) return;
  const match = /^student_user(\d+)$/.exec(String(event.params.studentKey));
  const n = match ? Number(match[1]) : NaN;
  const m = meetingFromCompletionKey(String(event.params.meetingKey));
  if (!Number.isInteger(n) || n < 1 || n > 12 || m === null) return;
  try {
    const outcome = await completeMeetingFromMark(admin.firestore(), n, m);
    logger.info(`Learner ${n} meeting ${m}: completion mark -> ${outcome}.`);
  } catch (err) {
    logger.error(`Learner ${n} meeting ${m}: completing the session document from the mark failed:`, err);
  }
});

/**
 * Pure. The learner and meeting whose completion a newly arrived telemetry
 * event may finish showing (completionVisible): a compulsory exercise
 * completed in meetings 3–8, or the reflection of meeting 8. Anything else →
 * null.
 *
 * onMeetingTelemetryArrived runs on every telemetry write on purpose: this
 * pure filter is all most events cost, and a candidate costs one RTDB read
 * while the meeting has no completion mark (the usual case: the mark is
 * queued behind them).
 */
export function lateCompletionCandidate(event: Record<string, any> | null | undefined): { studentNum: number; sessionNum: number } | null {
  if (!event) return null;
  const sessionNum = sessionNumberFromId(String(event.session_id || ""));
  if (sessionNum === null || sessionNum < 3) return null;
  const studentNum = Number(event.student_id);
  if (!Number.isInteger(studentNum) || studentNum < 1 || studentNum > 12) return null;
  if (sessionNum === 8 && event.event_type === "REFLECTION_SUBMITTED") return { studentNum, sessionNum };
  const id = String(event.exercise_id || "");
  if (event.event_type !== "PROBLEM_COMPLETE" || !id || !isExerciseEvent(event) || isChoiceExercise(id)) return null;
  return { studentNum, sessionNum };
}

/** The part of the Realtime Database the late completion reads (admin.database()). */
export interface CompletionMarkReader {
  ref: (path: string) => { get: () => Promise<{ val: () => unknown }> };
}

/**
 * A meeting 3–8 whose completion mark arrived before the end of its run
 * ("skipped" above) is completed when the event that shows the completion
 * arrives. Only while the learner's record carries the mark and the meeting
 * has no completed session document — a completed one was the mark's.
 */
export async function completeMeetingOnLateTelemetry(
  db: admin.firestore.Firestore,
  rtdb: CompletionMarkReader,
  event: Record<string, any> | null | undefined
): Promise<"created" | "completed" | MeetingRescore | "skipped" | "ignored"> {
  const candidate = lateCompletionCandidate(event);
  if (!candidate) return "ignored";
  const { studentNum, sessionNum } = candidate;
  const mark = (await rtdb.ref(`users/students/student_user${studentNum}/completedMeetings/m${sessionNum}`).get()).val();
  if (mark === null || mark === undefined) return "ignored";
  const snaps = await Promise.all(
    sessionDocumentIdCandidates(studentNum, sessionNum).map((id) => db.collection("sessions").doc(id).get())
  );
  if (snaps.some((s) => s.exists && (s.data() || {}).is_completed === true)) return "ignored";
  return completeMeetingFromMark(db, studentNum, sessionNum, { attempts: 1, waitMs: 0 });
}

export const onMeetingTelemetryArrived = onDocumentCreated({
  document: "telemetry_logs/{logId}",
  region: "us-central1",
}, async (event) => {
  const data = event.data?.data();
  if (!lateCompletionCandidate(data)) return;
  try {
    const outcome = await completeMeetingOnLateTelemetry(admin.firestore(), admin.database(), data);
    if (outcome !== "ignored") logger.info(`Telemetry ${event.params.logId}: late completion -> ${outcome}.`);
  } catch (err) {
    logger.error(`Telemetry ${event.params.logId}: completing the meeting from a late event failed:`, err);
  }
});

/**
 * createSessionWithServerDeadline
 * Stamping authoritative session_deadline_time on the server side (Module 14).
 */
export const createSessionWithServerDeadline = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const { student_id, class_id, session_number } = request.data || {};
  if (!student_id || !class_id || !session_number) {
    throw new HttpsError("invalid-argument", "Missing required session parameters.");
  }
  const sessionNumber = Number(session_number);
  if (!Number.isInteger(sessionNumber) || sessionNumber < 1 || sessionNumber > 8) {
    throw new HttpsError("invalid-argument", "session_number must be an integer between 1 and 8.");
  }
  if (typeof class_id !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(class_id)) {
    throw new HttpsError("invalid-argument", "class_id is not a valid class identifier.");
  }

  // A session document may be stamped only by the teacher, or by the learner
  // it belongs to (auth.token.student_id 1-12). Without this, any signed-in
  // identity could create/overwrite any learner's session deadline. A session
  // document is a learner's personal document, so an admin sign-in is not
  // staff here (PRD Module 24 §ב).
  const token = request.auth.token as Record<string, unknown>;
  const isTeacher = readCallerRoles(token).isTeacher;
  const ownStudent = String(token.student_id ?? "") === String(student_id);
  if (!isTeacher && !ownStudent) {
    throw new HttpsError("permission-denied", "Not authorized for this learner's session.");
  }

  // PRD v7.0 Module 14 §B: Session 1 = 20 min sandbox, Sessions 2 & 8 = 25 min, Sessions 3-7 = 15 min
  const durationMinutes = sessionNumber === 1 ? 20 : (sessionNumber === 2 || sessionNumber === 8) ? 25 : 15;
  const deadlineTimeMs = Date.now() + durationMinutes * 60 * 1000;
  const sessionId = `session_${String(sessionNumber).padStart(2, "0")}_student_${student_id}`;

  const db = admin.firestore();
  const sessionDocRef = db.collection("sessions").doc(sessionId);

  // This function creates a session. It used to write its whole payload with
  // merge:true over whatever was already there — including
  // teacher_gate_approved:false, gate_approved_at:null, gate_approved_by:null
  // and teacher_selected_path:null. A learner is allowed to call it for their
  // own id, so calling it again erased the teacher's Module 20 gate decision
  // and reset the meeting deadline, through an Admin-SDK path the security
  // rules cannot see. A session that already exists is not re-created.
  const existing = await sessionDocRef.get();
  if (existing.exists) {
    const data = existing.data() || {};
    return {
      status: "ALREADY_EXISTS",
      sessionId,
      deadlineTimeMs: Number(data.session_deadline_time) || null,
      durationMinutes,
    };
  }

  const sessionData = {
    session_id: sessionId,
    class_id,
    session_number: sessionNumber,
    session_start_time: Date.now(),
    session_deadline_time: deadlineTimeMs,
    active_exercise_id: `ex_${session_number}_01`,
    is_completed: false,
    // Not 0: a meeting that has not been worked on has no score yet, and every
    // report reads a number here as a measurement (Module 24 §ב). Meeting 1
    // never gets one (Module 14 §ב); the others get theirs from the trigger.
    session_score_percent: null,
    teacher_gate_approved: false,
    gate_approved_at: null,
    gate_approved_by: null,
    teacher_selected_path: null,
    matrix_recommended_path: null,
  };

  await sessionDocRef.create(sessionData).catch((err: unknown) => {
    // Another caller won the race between the read above and this write.
    // Creating is the only thing this function may do, so yield to them.
    logger.warn(`Session ${sessionId} already created concurrently:`, err);
  });

  logger.info(`Created authoritative session ${sessionId} with deadline ${deadlineTimeMs}`);

  return { status: "SUCCESS", sessionId, deadlineTimeMs, durationMinutes };
});
