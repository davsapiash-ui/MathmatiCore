"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateStudentSession = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const FIXED_CLASS_PASSCODE = "10203040";
/**
 * Authenticates an anonymous student session (PRD Module 1 & Module 25).
 * Validates the physical class passcode and attaches verified Custom Claims to the anonymous Auth token.
 * Custom Claims stamped: { role: 'student', student_id: 1..12, class_id: 'class_1', roles: ['STUDENT'] }
 */
exports.authenticateStudentSession = (0, https_1.onCall)({
    invoker: "public",
    cors: true,
}, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be signed in anonymously first");
    }
    const { studentId, passcode, classId = "class_1" } = request.data;
    // 1. Validate studentId is integer 1 to 12
    if (typeof studentId !== "number" || studentId < 1 || studentId > 12 || !Number.isInteger(studentId)) {
        throw new https_1.HttpsError("invalid-argument", "Student ID must be an integer between 1 and 12");
    }
    // 2. Validate class passcode
    if (typeof passcode !== "string" || passcode.trim() !== FIXED_CLASS_PASSCODE) {
        throw new https_1.HttpsError("permission-denied", "Invalid class access code");
    }
    const uid = request.auth.uid;
    logger.info(`Stamping Custom Claims for Anonymous Student ${studentId} (UID: ${uid})`);
    // 3. Stamp Custom Claims directly on the Firebase Auth user
    const claims = {
        role: "student",
        student_id: studentId,
        class_id: classId,
        roles: ["STUDENT"],
        authenticated_at: Date.now()
    };
    try {
        await admin.auth().setCustomUserClaims(uid, claims);
        logger.info(`Successfully stamped claims on UID ${uid}:`, claims);
        return {
            success: true,
            student_id: studentId,
            class_id: classId,
            uid
        };
    }
    catch (err) {
        logger.error("Failed to setCustomUserClaims for student:", err);
        throw new https_1.HttpsError("internal", "Failed to assign student claims");
    }
});
//# sourceMappingURL=authenticateStudentSession.js.map