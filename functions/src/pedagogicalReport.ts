import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

/**
 * generatePedagogicalReportPDF
 * Reader function for pedagogical reports (Module 27).
 * Reads evaluated session documents and telemetry from Firestore and formats them into
 * a standardized printable report JSON / HTML. Does NOT re-evaluate calculations.
 */
export const generatePedagogicalReportPDF = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const { sessionId } = request.data || {};
  if (!sessionId) {
    throw new HttpsError("invalid-argument", "Missing sessionId.");
  }

  const db = admin.firestore();
  const sessionDoc = await db.collection("sessions").doc(sessionId).get();

  if (!sessionDoc.exists) {
    throw new HttpsError("not-found", `Session ${sessionId} not found.`);
  }

  const sessionData = sessionDoc.data() || {};
  const studentId = sessionId.split("_").pop() || "unknown";

  // Read student record if available
  const studentDoc = await db.collection("students").doc(studentId).get();
  const studentData = studentDoc.exists ? studentDoc.data() : null;

  // Assemble pedagogical report (pure reader: zero calculation)
  const report = {
    report_id: `rep_${sessionId}`,
    generated_at: Date.now(),
    anonymous_student_label: `תלמיד ${studentId}`,
    session_number: sessionData.session_number || 1,
    is_completed: Boolean(sessionData.is_completed),
    score_percent: sessionData.session_score_percent || 0,
    matrix_recommended_path: sessionData.matrix_recommended_path || "green_path",
    teacher_selected_path: sessionData.teacher_selected_path || null,
    teacher_gate_approved: Boolean(sessionData.teacher_gate_approved),
    support_profile_id: studentData?.support_profile_id || "default",
    support_profile_version: studentData?.support_profile_version || 1,
    summary_text_he: `דוח פדגוגי מסכם למפגש ${sessionData.session_number}. ציון שליטה: ${sessionData.session_score_percent || 0}%. מסלול מומלץ: ${sessionData.matrix_recommended_path === 'green_path' ? 'העמקה (ירוק)' : 'צמצום פערים (צהוב)'}.`
  };

  logger.info(`Generated pedagogical report for ${sessionId}`);
  return { status: "SUCCESS", report };
});
