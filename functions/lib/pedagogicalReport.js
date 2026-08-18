"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePedagogicalReportPDF = void 0;
const https_1 = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
/**
 * generatePedagogicalReportPDF
 * Reader function for pedagogical reports (Module 27).
 * Reads evaluated session documents and telemetry from Firestore and formats them into
 * a standardized printable report JSON / HTML. Does NOT re-evaluate calculations.
 */
exports.generatePedagogicalReportPDF = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated.");
    }
    const { sessionId } = request.data || {};
    if (!sessionId) {
        throw new https_1.HttpsError("invalid-argument", "Missing sessionId.");
    }
    const db = admin.firestore();
    const sessionDoc = await db.collection("sessions").doc(sessionId).get();
    if (!sessionDoc.exists) {
        throw new https_1.HttpsError("not-found", `Session ${sessionId} not found.`);
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
        support_profile_id: (studentData === null || studentData === void 0 ? void 0 : studentData.support_profile_id) || "default",
        support_profile_version: (studentData === null || studentData === void 0 ? void 0 : studentData.support_profile_version) || 1,
        summary_text_he: `דוח פדגוגי מסכם למפגש ${sessionData.session_number}. ציון שליטה: ${sessionData.session_score_percent || 0}%. מסלול מומלץ: ${sessionData.matrix_recommended_path === 'green_path' ? 'העמקה (ירוק)' : 'צמצום פערים (צהוב)'}.`
    };
    logger.info(`Generated pedagogical report for ${sessionId}`);
    return { status: "SUCCESS", report };
});
//# sourceMappingURL=pedagogicalReport.js.map