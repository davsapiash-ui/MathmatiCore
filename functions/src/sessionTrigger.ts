import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import {
  computeFirstAttemptScore,
  readAllTelemetryForSession,
  resolveCompulsoryTotal,
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

  // Only trigger when session transitioned to is_completed: true and path not evaluated yet
  const justCompleted = afterData.is_completed === true && (!beforeData || beforeData.is_completed !== true);
  const needsPathEvaluation = !afterData.matrix_recommended_path;

  if (!justCompleted && !needsPathEvaluation) {
    return;
  }

  if (afterData.is_completed === true && needsPathEvaluation) {
    const sessionNum = Number(afterData.session_number) || 1;

    // The score used to be read straight off the document. The Firestore rules
    // let the owning learner write session_score_percent with no constraint on
    // its value, so a child could post 100 and be recommended onto the green
    // path. PRD Module 23 §ב defines the score as a function of the meeting's
    // telemetry; the server computes it here from that telemetry, and the
    // learner's own number is only a fallback for a meeting with no events.
    const db = admin.firestore();
    const telemetry = await readAllTelemetryForSession(db, String(afterData.session_id || event.params.sessionId));
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
    logger.info(`Evaluating Session ${event.params.sessionId} (Session ${sessionNum}): Score ${computed.scorePercent}% -> Recommended ${recommendedPath}`);

    await event.data?.after?.ref.update({
      session_score_percent: computed.scorePercent,
      matrix_recommended_path: recommendedPath,
      evaluated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
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
