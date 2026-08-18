import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

const FIXED_CLASS_PASSCODE = "10203040";

export interface AuthenticateStudentRequest {
  studentId: number;
  passcode: string;
  classId?: string;
}

/**
 * Authenticates an anonymous student session (PRD Module 1 & Module 25).
 * Validates the physical class passcode and attaches verified Custom Claims to the anonymous Auth token.
 * Custom Claims stamped: { role: 'student', student_id: 1..12, class_id: 'class_1', roles: ['STUDENT'] }
 */
export const authenticateStudentSession = onCall(
  {
    invoker: "public",
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be signed in anonymously first");
    }

  const { studentId, passcode, classId = "class_1" } = request.data as AuthenticateStudentRequest;

  // 1. Validate studentId is integer 1 to 12
  if (typeof studentId !== "number" || studentId < 1 || studentId > 12 || !Number.isInteger(studentId)) {
    throw new HttpsError("invalid-argument", "Student ID must be an integer between 1 and 12");
  }

  // 2. Validate class passcode
  if (typeof passcode !== "string" || passcode.trim() !== FIXED_CLASS_PASSCODE) {
    throw new HttpsError("permission-denied", "Invalid class access code");
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
  } catch (err: any) {
    logger.error("Failed to setCustomUserClaims for student:", err);
    throw new HttpsError("internal", "Failed to assign student claims");
  }
});
