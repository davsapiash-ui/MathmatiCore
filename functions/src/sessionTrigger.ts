import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import {
  computeFirstAttemptScore,
  readMeetingTelemetry,
  resolveCompulsoryTotal,
  studentNumberFromSessionId,
} from "./meetingMetrics";

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
  const studentNum = studentNumberFromSessionId(event.params.sessionId)
    ?? studentNumberFromSessionId(String(afterData.session_id || ""));
  if (studentNum === null) {
    logger.warn(`Session ${event.params.sessionId}: no learner in the document id, score not recomputed.`);
    return;
  }

  const db = admin.firestore();
  // By learner and meeting, not by the document's session_id: the document is
  // `session_02_student_4` while its events carry `session_2_student_student_user4`,
  // so reading by that id matched nothing and would have scored every learner 0%.
  const telemetry = await readMeetingTelemetry(db, studentNum, sessionNum);
  if (telemetry.length === 0) {
    // Nothing to measure. Module 24 §ב forbids inventing one, and overwriting
    // the learner's own number with a 0% computed from no events would be
    // exactly that — so the document is left as it is.
    logger.warn(`Session ${event.params.sessionId}: no telemetry for learner ${studentNum} meeting ${sessionNum}; score left as submitted.`);
    return;
  }

  const path = afterData.teacher_selected_path === "remediation_path" ? "remediation_path" : "green_path";
  const compulsoryIds = new Map<string, ReadonlySet<string>>();
  const compulsoryTotal = await resolveCompulsoryTotal(db, sessionNum, path, new Map(), compulsoryIds);
  const computed = computeFirstAttemptScore(
    telemetry,
    compulsoryTotal,
    compulsoryIds.get(`${sessionNum}:${path}`) ?? null
  );

  if (computed.scorePercent === null) {
    // No denominator means no score. Recommending a path from a number we
    // could not compute is exactly the invented measurement Module 24 §ב
    // forbids; leave the field unset so the teacher sees it is missing.
    logger.warn(`Session ${event.params.sessionId}: compulsory count unknown, no path recommended.`);
    return;
  }

  const recommendedPath = computed.scorePercent >= 50 ? "green_path" : "remediation_path";
  const submitted = Number(afterData.session_score_percent);
  if (Number.isFinite(submitted) && submitted !== computed.scorePercent) {
    logger.warn(`Session ${event.params.sessionId}: client reported ${submitted}%, server computed ${computed.scorePercent}%. Server value stands.`);
  }
  logger.info(`Evaluating Session ${event.params.sessionId} (Session ${sessionNum}): Score ${computed.scorePercent}% -> Recommended ${recommendedPath}`);

  await event.data?.after?.ref.update({
    session_score_percent: computed.scorePercent,
    matrix_recommended_path: recommendedPath,
    evaluated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  // The learner's RTDB record mirrors the gate state (register 15 and 16), and
  // the radar, the class-management card and the approval drawer all read the
  // recommendation from there. Left unmirrored, the teacher would see the
  // client's number on four screens and the server's in the gate tab.
  await admin.database().ref(`users/students/student_user${studentNum}`).update({
    session_score_percent: computed.scorePercent,
    matrix_recommended_path: recommendedPath,
  }).catch((err) => logger.warn(`Session ${event.params.sessionId}: RTDB mirror of the score failed:`, err));
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

  // A session document may be stamped only by staff, or by the learner it
  // belongs to (auth.token.student_id 1-12). Without this, any signed-in
  // identity could create/overwrite any learner's session deadline.
  const token = request.auth.token as Record<string, unknown>;
  const roles: string[] = Array.isArray(token.roles) ? (token.roles as string[]) : token.role ? [String(token.role)] : [];
  const lowered = roles.map((r) => r.toLowerCase());
  const isStaff = lowered.includes("teacher") || lowered.includes("admin") || token.teacher === true || token.admin === true;
  const ownStudent = String(token.student_id ?? "") === String(student_id);
  if (!isStaff && !ownStudent) {
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
    session_score_percent: 0,
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
