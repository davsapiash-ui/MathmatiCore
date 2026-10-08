import { onCall, HttpsError } from "firebase-functions/v2/https";
import { requireAdmin } from "./callerIdentity";
import { LEARNER_IDS, PILOT_CLASS_ID, loadAccessCodes } from "./learnerAccessCodes";

/**
 * Module 25 §ד: "הנפקת כרטיסי כניסה אנונימיים לתלמידים (1–12, לכל לומד קוד
 * הגישה האישי שלו)", and document 04's "מחולל כרטיסי כניסה להדפסה". Owner's
 * decision (26.9.2026): a printed card per learner, with a blank line on which
 * the teacher writes the child's name by hand — the name never enters the
 * system (Zero-PII, Module 3).
 *
 * The codes are kept out of the client bundle and out of every client-readable
 * collection (learnerAccessCodes.ts), so the print page asks for them here, and
 * only a system administrator gets an answer.
 */
export const getStudentLoginCards = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be signed in.");
  }
  requireAdmin(request.auth.token as Record<string, unknown>);
  const codes = await loadAccessCodes(PILOT_CLASS_ID, request.auth.uid);
  return {
    studentIds: [...LEARNER_IDS],
    codes,
  };
});
