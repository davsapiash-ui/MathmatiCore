import { onValueWritten } from "firebase-functions/v2/database";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { exerciseAttempts, readLastResetOfMeeting, readMeetingTelemetry, sessionDocumentIdCandidates } from "./meetingMetrics";
import { computeCognitiveMastery } from "./diagnosticMastery";
import { rescoreCompletedMeeting, type MeetingRescore } from "./sessionTrigger";
import { isClassSessionOpenAt } from "./classSessionLive";

/**
 * PRD Module 14 §ב1: "שדה is_completed נקבע אך ורק לפי השלמת שבע משימות החובה
 * או לפי סגירה יזומה של המורה, ולעולם לא לפי חלוף הזמן."
 *
 * The first half has been in place since the learner's client completes meeting
 * 2 at the seventh answer. The second half was not: closing the meeting wrote
 * only `active_class_session`, so a learner who had not finished got no score,
 * no row in "שלב החלוקה למסלולים", and could never reach meeting 3.
 *
 * Owner decision, 29.9.2026: when the teacher closes meeting 2, every learner
 * of the class who started meeting 2 and is not yet completed is completed. The
 * score counts only the tasks answered — an unanswered task counts as not
 * correct (first-attempt correct ÷ 7) — and the recommendation follows the
 * existing 50% rule. A learner who never started meeting 2 is not completed.
 *
 * Done here, on the server, so that a learner who is offline or not on the
 * page is completed too. The score itself is not computed here: setting
 * is_completed fires onSessionCompleteTrigger (sessionTrigger.ts), which scores
 * every completed meeting from its telemetry with the same formula, recommends
 * the path and mirrors both to the learner's record.
 *
 * Owner decision, 2.10.2026, on a meeting 2 closed by time (the 45-minute cap
 * or the teacher-disconnect window): "שהכל ישמר וכך גם אמור להיות ומקסימום
 * המורה תוכל לתת להם זמן לסיים מהמקום שהם נמצאים כי המערכת אמורה לשמור את
 * התרגיל במפגש שהתלמיד סיים ומקסימום התרגיל בתחנה שהתלמיד לא סיים אותו הוא
 * יצטרך להתחיל מחדש." Such a close completes nothing and deletes nothing.
 * The teacher sees the learners who started and did not finish in "שלב
 * החלוקה למסלולים" (react-ts-version gateEvidence.ts buildUnfinishedMeeting2Items)
 * and can open meeting 2 again for them; they go on from where they were.
 */

/** The seven diagnostic tasks, in the order the learner meets them (react-ts-version core/QMatrix.ts TASKS). */
export const DIAGNOSTIC_TASK_IDS: readonly string[] = [
  "task1_read_write_zero",
  "task2_digit_value",
  "task3_subtraction_regrouping",
  "task4_decompose_number",
  "task5_units_to_tens",
  "task6_vertical_addition",
  "task7_subtraction_zero_tens",
];

/** Answered and not solved on the first attempt, with no diagnostic node (client Q_FAIL_TAG). */
export const Q_FAIL_TAG = "fail";
/**
 * Not answered when the teacher closed the meeting. Any value other than
 * 'success' reads as "דרוש חיזוק" on every teacher screen (client
 * getQTaskStatus), and this one keeps "never answered" apart from "answered wrong".
 */
export const Q_NOT_ANSWERED_TAG = "not_answered";

/** Written only by the teacher's "close meeting" button — never by a reset or by time. */
export const TEACHER_CLOSE_MARKER = "teacher";

/** The pilot's one class (Module 25 §ב.1), as the learner's client writes it. */
const PILOT_CLASS_ID = "class_1";

type Rec = Record<string, unknown> | null | undefined;

/**
 * The teacher closed meeting 2: the class record went from meeting 2 open (or
 * paused) to closed, and the close carries the teacher's marker. A system
 * reset writes the same closed record without the marker, and so do the
 * 45-minute cap and the teacher-disconnect window (TeacherDashboard.tsx,
 * endedBy 'auto_45min' / 'teacher_disconnect_grace') — none of them completes
 * a learner (PRD 14 §ב1: never by time; owner decision 2.10.2026, above).
 *
 * Opening another meeting while meeting 2 is open closes meeting 2 too — the
 * activation window tells the teacher so ("המפגש הפעיל כעת, מפגש 2, ייסגר").
 * Only a teacher token may write the class record (database.rules.json), so
 * the switch is the teacher's act. It used to complete no one, and the
 * learners who had not finished never reached the gate.
 *
 * A meeting 2 already past its 45-minute cap, or past the teacher-disconnect
 * window, at the moment of the write is not open, even when no dashboard was
 * there to write its close (the record then still says active). Every client
 * already reads it as closed (react-ts-version core/classSession.ts
 * isClassSessionLive), and closing or leaving it is not the teacher closing a
 * running meeting: it ended by time, and completes no one.
 */
// The rule itself lives in classSessionLive.ts, shared with the reset's choice of meeting.
export { SESSION_HARD_CAP_MS, TEACHER_DISCONNECT_GRACE_MS } from "./classSessionLive";

export function isTeacherCloseOfMeeting2(before: Rec, after: Rec, atMs: number = Date.now()): boolean {
  if (!before || !after) return false;
  if (Number(before.sessionNumber) !== 2) return false;
  const wasOpen = isClassSessionOpenAt(before, atMs);
  const isClosed = after.active !== true && after.status === "closed";
  const switchedAway = after.active === true && Number(after.sessionNumber) !== 2;
  return wasOpen && ((isClosed && after.closedBy === TEACHER_CLOSE_MARKER) || switchedAway);
}

/**
 * The Q-matrix value of each diagnostic task, from the meeting's events:
 *   - 'success'       — finished on the first attempt (PRD 23 §ב, the score's rule)
 *   - 'fail'          — answered, not on the first attempt: finished after a wrong
 *                       digit, or left with a wrong answer and the learner moved on
 *                       (a wrong answer in meeting 2 sends no PROBLEM_COMPLETE)
 *   - 'not_answered'  — the task open when the meeting closed, and every task after it
 */
export function diagnosticQMatrixAtClose(events: Record<string, any>[]): Record<string, string> {
  const attempts = exerciseAttempts(events);
  const touched = new Set(
    events.map((e) => String(e?.exercise_id ?? "")).filter((id) => DIAGNOSTIC_TASK_IDS.includes(id))
  );
  const out: Record<string, string> = {};
  DIAGNOSTIC_TASK_IDS.forEach((id, i) => {
    const a = attempts[id];
    if (a?.completed) {
      out[id] = a.first_try ? "success" : Q_FAIL_TAG;
      return;
    }
    const movedOn = DIAGNOSTIC_TASK_IDS.slice(i + 1).some((later) => touched.has(later));
    out[id] = movedOn ? Q_FAIL_TAG : Q_NOT_ANSWERED_TAG;
  });
  return out;
}

function isEmptyQValue(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

export interface Meeting2CloseResult {
  /** Completed by this close. */
  completed: number[];
  /**
   * Already completed: by the seventh answer, or by an earlier close. Their
   * completion stands; a learner an earlier close completed who went on after
   * the meeting was opened again is brought up to date (catchUpCompletedMeeting2).
   */
  alreadyCompleted: number[];
  /** Of alreadyCompleted: tasks answered since an earlier close, or a new score. */
  updated: number[];
  /** Of alreadyCompleted: bringing them up to date failed (their completion stands). */
  catchUpFailed: number[];
  /** No meeting-2 event since the meeting's last reset: not started, not completed. */
  notStarted: number[];
  failed: number[];
}

/**
 * Completes every learner 1–12 who started meeting 2 and has not completed it.
 * Everything a learner already has is kept: a completed session document is
 * not completed again, a Q-matrix value already written is not replaced
 * (except 'not_answered' for a task answered since an earlier close), and an
 * approved gate is not put back to pending.
 */
export async function completeUnfinishedMeeting2(
  db: admin.firestore.Firestore,
  rtdb: admin.database.Database,
  classId: string = PILOT_CLASS_ID
): Promise<Meeting2CloseResult> {
  const result: Meeting2CloseResult = { completed: [], alreadyCompleted: [], updated: [], catchUpFailed: [], notStarted: [], failed: [] };

  // Its own failure, logged as such: the learner is completed either way, and
  // "FAILED" means a learner the close could not complete.
  const catchUp = async (n: number) => {
    try {
      if (await catchUpCompletedMeeting2(db, rtdb, n)) result.updated.push(n);
    } catch (err) {
      logger.error(`Meeting 2 close: learner ${n} is completed, but bringing them up to date failed:`, err);
      result.catchUpFailed.push(n);
    }
  };

  for (let n = 1; n <= 12; n++) {
    try {
      // Every spelling of the learner's meeting-2 document: one already
      // completed means the learner finished (or an earlier close completed
      // them); the completion stands.
      const candidates = sessionDocumentIdCandidates(n, 2);
      const snaps = await Promise.all(candidates.map((id) => db.collection("sessions").doc(id).get()));
      if (snaps.some((s) => s.exists && (s.data() || {}).is_completed === true)) {
        result.alreadyCompleted.push(n);
        await catchUp(n);
        continue;
      }

      // Only the run since the meeting's last reset, as the score trigger reads
      // it (sessionTrigger.ts computeMeetingScore). A reset keeps the
      // telemetry (register deviation 20), and reading all of it counted a
      // learner reset and not yet started again as "started": completed with
      // 0%, with focus areas from the erased run.
      const writtenAfterMs = await readLastResetOfMeeting(db, n, 2);
      const events = await readMeetingTelemetry(db, n, 2, { writtenAfterMs });
      if (events.length === 0) {
        result.notStarted.push(n);
        continue;
      }

      // The client writes `session_02_student_{n}` (FirebaseSyncService
      // syncSession2Completion). In a transaction, so that a seventh answer
      // arriving at the same moment is not overwritten: whichever completes
      // the document first stands, and the other finds it completed.
      const docRef = db.collection("sessions").doc(candidates[0]);
      const firstEventAt = events.find((e) => typeof e?.client_timestamp === "number")?.client_timestamp ?? null;
      const completedNow = await db.runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        const data = snap.exists ? snap.data() || {} : null;
        if (data && data.is_completed === true) return false;
        if (data) {
          tx.update(docRef, { is_completed: true });
        } else {
          // Only the fields the Firestore rules allow on a session document
          // (isValidSessionDoc), so the teacher's gate approval can still be
          // written on it. The score and the path are the trigger's.
          tx.set(docRef, {
            session_id: candidates[0],
            class_id: classId,
            session_number: 2,
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
        }
        return true;
      });
      if (!completedNow) {
        result.alreadyCompleted.push(n);
        await catchUp(n);
        continue;
      }

      // The learner's live record: what the approvals table, the learner
      // journey and the learner's own waiting screen read.
      const recordPath = `users/students/student_user${n}`;
      const recordSnap = await rtdb.ref(recordPath).get();
      const record = (recordSnap.val() || {}) as Record<string, any>;
      const approved = record.teacher_gate_approved === true || record.routeStatus === "APPROVED";
      const existingQ = (record.qMatrixResults || {}) as Record<string, unknown>;

      const updates: Record<string, unknown> = {
        completedMeeting2: true,
        session_02_completed: true,
        updatedAt: Date.now(),
      };
      if (!approved) updates.routeStatus = "PENDING_TEACHER_APPROVAL";
      const q = diagnosticQMatrixAtClose(events);
      const finalQ: Record<string, string | null> = {};
      for (const id of DIAGNOSTIC_TASK_IDS) {
        if (isEmptyQValue(existingQ[id])) {
          updates[`qMatrixResults/${id}`] = q[id];
          finalQ[id] = q[id];
        } else {
          finalQ[id] = existingQ[id] as string;
        }
      }
      // The mastery profile the learner's client builds at the seventh answer
      // (diagnosticMastery.ts), from the same seven values the teacher now
      // sees. Without it the learner was missing from every group, the chart
      // and the counter of "מיפוי מיומנויות כיתתי".
      updates.conceptMastery = computeCognitiveMastery(finalQ);
      await rtdb.ref(recordPath).update(updates);
      await rtdb.ref(`${recordPath}/highestCompletedMeeting`).transaction((cur) => {
        const current = typeof cur === "number" && Number.isFinite(cur) ? cur : 0;
        return Math.max(current, 2);
      });

      result.completed.push(n);
    } catch (err) {
      logger.error(`Meeting 2 close: learner ${n} could not be completed:`, err);
      result.failed.push(n);
    }
  }
  return result;
}

/**
 * The teacher closed meeting 2 from the dashboard (TeacherDashboard
 * handleEndClassSession writes `closedBy: 'teacher'`).
 */
export const onMeeting2ClosedByTeacher = onValueWritten({
  ref: "/active_class_session",
  region: "us-central1",
}, async (event) => {
  const before = event.data.before.val() as Rec;
  const after = event.data.after.val() as Rec;
  // The write's own time on the server, not when this function happens to run.
  const at = Date.parse(String(event.time ?? ""));
  if (!isTeacherCloseOfMeeting2(before, after, Number.isFinite(at) ? at : Date.now())) return;

  const result = await completeUnfinishedMeeting2(admin.firestore(), admin.database());
  logger.info(
    `Meeting 2 closed by the teacher: completed [${result.completed.join(", ")}], ` +
    `already completed [${result.alreadyCompleted.join(", ")}] (brought up to date [${result.updated.join(", ")}]), not started [${result.notStarted.join(", ")}]` +
    (result.catchUpFailed.length ? `, up-to-date FAILED [${result.catchUpFailed.join(", ")}]` : "") +
    (result.failed.length ? `, FAILED [${result.failed.join(", ")}]` : "")
  );
});

/**
 * A learner an earlier close completed part-way, who went on when the
 * teacher opened meeting 2 again and was closed again before the seventh
 * answer. The learner's own completion never came (it comes only with the
 * seventh answer), so nothing else updates what the gate shows: the tasks
 * answered since were still 'not_answered' and the score was the first
 * close's.
 *
 * From the run since the last reset: a task the record has as 'not_answered'
 * that is answered now gets its value, the mastery profile follows the
 * updated values, and the score is re-scored (rescoreCompletedMeeting2).
 * Every other value is kept, so a learner who finished by the seventh answer
 * is left exactly as they were. Returns whether anything changed.
 */
export async function catchUpCompletedMeeting2(
  db: admin.firestore.Firestore,
  rtdb: admin.database.Database,
  n: number
): Promise<boolean> {
  const writtenAfterMs = await readLastResetOfMeeting(db, n, 2);
  const events = await readMeetingTelemetry(db, n, 2, { writtenAfterMs });
  if (events.length === 0) return false;

  const recordPath = `users/students/student_user${n}`;
  const record = ((await rtdb.ref(recordPath).get()).val() || {}) as Record<string, any>;
  const existingQ = (record.qMatrixResults || {}) as Record<string, unknown>;
  const q = diagnosticQMatrixAtClose(events);
  const updates: Record<string, unknown> = {};
  const finalQ: Record<string, string | null> = {};
  for (const id of DIAGNOSTIC_TASK_IDS) {
    const answeredSince = existingQ[id] === Q_NOT_ANSWERED_TAG && q[id] !== Q_NOT_ANSWERED_TAG;
    if (answeredSince) updates[`qMatrixResults/${id}`] = q[id];
    finalQ[id] = (answeredSince ? q[id] : existingQ[id]) as string | null;
  }
  const qChanged = Object.keys(updates).length > 0;
  if (qChanged) {
    updates.conceptMastery = computeCognitiveMastery(finalQ);
    await rtdb.ref(recordPath).update(updates);
  }
  const rescore = await rescoreCompletedMeeting2(db, rtdb, n);
  return qChanged || rescore === "rescored";
}

export type Meeting2Rescore = MeetingRescore;

/**
 * A learner whom the teacher's close completed can still go on: when the
 * teacher opens meeting 2 again, the learner's saved work is restored and the
 * diagnostic continues from where it stopped (owner decision 2.10.2026). When
 * the learner then finishes, the learner's completion of the session
 * document finds it completed already and is not written again
 * (FirebaseSyncService syncSession2Completion, deliveredWhen), so the score
 * trigger, which scores a document once, never saw the new run.
 *
 * Meeting 2's case of the rule every scored meeting follows (PRD 14 §ב0,
 * sessionTrigger.ts rescoreCompletedMeeting): re-scored from the run since its
 * last reset, the previous score kept as previous_score_percent, the
 * recommendation from the new score, the teacher's approval and chosen path
 * untouched. `rtdb` is kept for the callers; the mirror writes the default app.
 */
export async function rescoreCompletedMeeting2(
  db: admin.firestore.Firestore,
  _rtdb: admin.database.Database,
  n: number
): Promise<Meeting2Rescore> {
  return rescoreCompletedMeeting(db, n, 2);
}

/**
 * The learner's record stamps `updatedAt` only when meeting 2's completion is
 * recorded on it: by the learner's client at the seventh answer (the queued
 * item of syncSession2Completion, delivered after the meeting's telemetry —
 * FIFO, Module 29 §ג) and by the close above. That stamp is the moment the
 * whole run is on the server, so it is when a later finish is re-scored.
 */
export const onMeeting2CompletionRecorded = onValueWritten({
  ref: "/users/students/{studentKey}/updatedAt",
  region: "us-central1",
}, async (event) => {
  if (typeof event.data.after.val() !== "number") return;
  const match = /^student_user(\d+)$/.exec(String(event.params.studentKey));
  const n = match ? Number(match[1]) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > 12) return;
  try {
    await rescoreCompletedMeeting2(admin.firestore(), admin.database(), n);
  } catch (err) {
    logger.error(`Meeting 2 of learner ${n}: re-scoring after a later finish failed:`, err);
  }
});
