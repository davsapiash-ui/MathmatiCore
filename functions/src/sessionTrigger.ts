import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

/**
 * Module 14 / Module 20: onSessionCompleteTrigger
 * Background trigger on session completion calculating closed-form cognitive mastery score
 * and computing matrix_recommended_path ('green_path' vs 'gap_reduction').
 */
export const onSessionCompleteTrigger = onDocumentWritten("sessions/{sessionId}", async (event) => {
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
    const score = Number(afterData.session_score_percent) || 0;
    const sessionNum = Number(afterData.session_number) || 1;

    // Closed-form deterministic mastery: score >= 80% maps to green_path, otherwise gap_reduction
    const recommendedPath = score >= 80 ? "green_path" : "gap_reduction";

    logger.info(`Evaluating Session ${event.params.sessionId} (Session ${sessionNum}): Score ${score}% -> Recommended ${recommendedPath}`);

    await event.data?.after?.ref.update({
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

  const durationMinutes = (session_number <= 2 || session_number === 8) ? 25 : 15;
  const deadlineTimeMs = Date.now() + durationMinutes * 60 * 1000;
  const sessionId = `session_${String(session_number).padStart(2, "0")}_student_${student_id}`;

  const db = admin.firestore();
  const sessionDocRef = db.collection("sessions").doc(sessionId);

  const sessionData = {
    session_id: sessionId,
    class_id,
    session_number: Number(session_number),
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

  await sessionDocRef.set(sessionData, { merge: true });

  logger.info(`Created authoritative session ${sessionId} with deadline ${deadlineTimeMs}`);

  return { status: "SUCCESS", sessionId, deadlineTimeMs, durationMinutes };
});
