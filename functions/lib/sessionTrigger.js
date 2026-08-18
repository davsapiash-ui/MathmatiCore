"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSessionWithServerDeadline = exports.onSessionCompleteTrigger = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
/**
 * Module 14 / Module 20: onSessionCompleteTrigger
 * Background trigger on session completion calculating closed-form cognitive mastery score
 * Formula: (correct_first_attempt_mandatory_tasks / 7) * 100
 * Threshold: Score >= 50% -> 'green_path', Score < 50% -> 'remediation_path'
 */
exports.onSessionCompleteTrigger = (0, firestore_1.onDocumentWritten)("sessions/{sessionId}", async (event) => {
    var _a, _b, _c, _d, _e, _f;
    const afterData = (_b = (_a = event.data) === null || _a === void 0 ? void 0 : _a.after) === null || _b === void 0 ? void 0 : _b.data();
    const beforeData = (_d = (_c = event.data) === null || _c === void 0 ? void 0 : _c.before) === null || _d === void 0 ? void 0 : _d.data();
    if (!afterData)
        return; // Deleted
    // Only trigger when session transitioned to is_completed: true and path not evaluated yet
    const justCompleted = afterData.is_completed === true && (!beforeData || beforeData.is_completed !== true);
    const needsPathEvaluation = !afterData.matrix_recommended_path;
    if (!justCompleted && !needsPathEvaluation) {
        return;
    }
    if (afterData.is_completed === true && needsPathEvaluation) {
        const score = Number(afterData.session_score_percent) || 0;
        const sessionNum = Number(afterData.session_number) || 1;
        // Closed-form deterministic mastery: score >= 50% maps to green_path, otherwise remediation_path
        const recommendedPath = score >= 50 ? "green_path" : "remediation_path";
        logger.info(`Evaluating Session ${event.params.sessionId} (Session ${sessionNum}): Score ${score}% -> Recommended ${recommendedPath}`);
        await ((_f = (_e = event.data) === null || _e === void 0 ? void 0 : _e.after) === null || _f === void 0 ? void 0 : _f.ref.update({
            matrix_recommended_path: recommendedPath,
            evaluated_at: admin.firestore.FieldValue.serverTimestamp(),
        }));
    }
});
/**
 * createSessionWithServerDeadline
 * Stamping authoritative session_deadline_time on the server side (Module 14).
 */
exports.createSessionWithServerDeadline = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated.");
    }
    const { student_id, class_id, session_number } = request.data || {};
    if (!student_id || !class_id || !session_number) {
        throw new https_1.HttpsError("invalid-argument", "Missing required session parameters.");
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
//# sourceMappingURL=sessionTrigger.js.map