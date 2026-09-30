import { onValueWritten } from "firebase-functions/v2/database";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { exerciseAttempts, readMeetingTelemetry, sessionDocumentIdCandidates } from "./meetingMetrics";

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
 * reset writes the same closed record without the marker, and the 45-minute
 * cap and the teacher-disconnect window are read by the clients and write
 * nothing — none of them completes a learner (PRD 14 §ב1: never by time).
 */
export function isTeacherCloseOfMeeting2(before: Rec, after: Rec): boolean {
  if (!before || !after) return false;
  if (Number(before.sessionNumber) !== 2) return false;
  const wasOpen = before.active === true && before.status !== "closed";
  const isClosed = after.active !== true && after.status === "closed";
  return wasOpen && isClosed && after.closedBy === TEACHER_CLOSE_MARKER;
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
  /** Already completed (all seven answered): left exactly as they were. */
  alreadyCompleted: number[];
  /** No meeting-2 event: never started, not completed. */
  notStarted: number[];
  failed: number[];
}

/**
 * Completes every learner 1–12 who started meeting 2 and has not completed it.
 * Everything a learner already has is kept: a completed session document is
 * not touched, a Q-matrix value already written is not replaced, and an
 * approved gate is not put back to pending.
 */
export async function completeUnfinishedMeeting2(
  db: admin.firestore.Firestore,
  rtdb: admin.database.Database,
  classId: string = PILOT_CLASS_ID
): Promise<Meeting2CloseResult> {
  const result: Meeting2CloseResult = { completed: [], alreadyCompleted: [], notStarted: [], failed: [] };

  for (let n = 1; n <= 12; n++) {
    try {
      // Every spelling of the learner's meeting-2 document: one already
      // completed means the learner finished, and nothing is written.
      const candidates = sessionDocumentIdCandidates(n, 2);
      const snaps = await Promise.all(candidates.map((id) => db.collection("sessions").doc(id).get()));
      if (snaps.some((s) => s.exists && (s.data() || {}).is_completed === true)) {
        result.alreadyCompleted.push(n);
        continue;
      }

      const events = await readMeetingTelemetry(db, n, 2);
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
      for (const id of DIAGNOSTIC_TASK_IDS) {
        if (isEmptyQValue(existingQ[id])) updates[`qMatrixResults/${id}`] = q[id];
      }
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
  if (!isTeacherCloseOfMeeting2(before, after)) return;

  const result = await completeUnfinishedMeeting2(admin.firestore(), admin.database());
  logger.info(
    `Meeting 2 closed by the teacher: completed [${result.completed.join(", ")}], ` +
    `already completed [${result.alreadyCompleted.join(", ")}], not started [${result.notStarted.join(", ")}]` +
    (result.failed.length ? `, FAILED [${result.failed.join(", ")}]` : "")
  );
});
