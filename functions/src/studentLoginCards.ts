import { onCall, HttpsError } from "firebase-functions/v2/https";
import { requireAdmin } from "./callerIdentity";
import { FIXED_CLASS_PASSCODE } from "./authenticateStudentSession";

/**
 * Module 25 §ד: "הנפקת כרטיסי כניסה אנונימיים לתלמידים (1–12, סיסמה 10203040)",
 * and document 04's "מחולל כרטיסי כניסה להדפסה". Owner's decision (26.9.2026):
 * a printed card per learner, with a blank line on which the teacher writes the
 * child's name by hand — the name never enters the system (Zero-PII, Module 3).
 *
 * The class passcode is kept out of the client bundle on purpose (the login
 * page no longer carries it), so the print page asks for it here, and only a
 * system administrator gets an answer.
 */
export const getStudentLoginCards = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be signed in.");
  }
  requireAdmin(request.auth.token as Record<string, unknown>);
  return {
    passcode: FIXED_CLASS_PASSCODE,
    studentIds: Array.from({ length: 12 }, (_, i) => i + 1),
  };
});
