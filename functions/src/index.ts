import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import * as dotenv from "dotenv";

admin.initializeApp();

// Load local .env file explicitly to guarantee key loading in emulator
dotenv.config();

// Export the Role Synchronization module
export { syncUserRoles } from "./syncUserRoles";

// Export the Gemini Proxy from the new module
export { callGeminiSocraticProxy } from "./geminiProxy";

// Module 13 / 27: AI engine health & call counters for the admin console (staff only).
export { getAiServiceStatus } from "./aiMonitoring";

// Export the Transaction Guard module
// validateAndStoreTelemetry was removed. It validated the payload, stored
// nothing — the storage line was a commented-out sketch — logged "ingested"
// and returned { success: true }. An offline client that trusted that answer
// dequeued and dropped the event. No client called it; the live telemetry
// path is onStudentEvent, which stores and checks ownership.

// Export the Google Drive Admin PDF Report module
export { exportAdminReportToDrive, backupAndResetSessionData, exportResearchDataset } from "./exportDriveReport";

// Export WP6 Cloud Functions (Module 14, 20, 22, 24, 27)
export { onSessionCompleteTrigger, createSessionWithServerDeadline } from "./sessionTrigger";
export { generatePedagogicalReportPDF, getPedagogicalReportDownloadUrl } from "./pedagogicalReport";
// Module 23, owner decision 6.9.2026 (register item 9): a class report for every meeting.
export { generateClassMeetingReport } from "./classReport";
export { hourlyAdminAggregator } from "./adminAggregator";
export { sendTeacherAdminMessage } from "./teacherAdminChat";
// Module 25 §ד, owner's decision 26.9.2026: printable login cards for the 12 learners.
export { getStudentLoginCards } from "./studentLoginCards";

/**
 * verifyTeacherSSO Cloud Function (PRD Section 4.1)
 * Enforces domain constraints (@edu-haifa.org.il), secret environment specs,
 * and Firestore dynamic whitelist validation with Zero Self-Registration.
 */
export const verifyTeacherSSO = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be logged in.");
  }

  const email = request.auth.token.email || "";
  const domain = email.split("@")[1];

  // 1. Domain Constraint Verification
  if (domain !== "edu-haifa.org.il") {
    throw new HttpsError("permission-denied", "Access restricted to @edu-haifa.org.il domain.");
  }

  // 2. Secret Configuration Environment Specs
  const adminPrimary = process.env.ADMIN_SSO_PRIMARY_EMAIL || "davidsep@edu-haifa.org.il";
  const adminAlias = process.env.ADMIN_SSO_ALIAS_EMAIL || "1002220159@edu-haifa.org.il";

  const roles: string[] = ["TEACHER"];

  if (email === adminPrimary || email === adminAlias) {
    roles.push("ADMIN");
  }

  // 3. Dynamic Firestore Whitelist Validation
  const db = admin.firestore();
  const whitelistRef = db.collection("whitelists").doc(email);
  const whitelistDoc = await whitelistRef.get();

  if (!whitelistDoc.exists && !roles.includes("ADMIN")) {
    throw new HttpsError("permission-denied", "Zero Self-Registration: Email not whitelisted.");
  }

  // 4. Update / Sync User Roles
  await db.collection("users").doc(request.auth.uid).set({
    uid: request.auth.uid,
    roles: roles,
    email_domain: domain,
    updated_at: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  logger.info(`Verified SSO for ${email} with roles [${roles.join(", ")}]`);

  return { status: "SUCCESS", roles };
});

/**
 * onStudentEvent Cloud Function (PRD Section 4.1)
 * Ingests student telemetry and vector replay events with strict PII scrubbing.
 */
export const onStudentEvent = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const { session_id, student_id, interaction_data, somatic_indicators } = request.data || {};

  if (!session_id || student_id === undefined) {
    throw new HttpsError("invalid-argument", "Missing required payload parameters: session_id and student_id.");
  }

  // The comment here used to read "Strictly 1 - 12" while nothing enforced it:
  // Number("999") and Number("abc") were both written as-is.
  const numericStudentId = Number(student_id);
  if (!Number.isInteger(numericStudentId) || numericStudentId < 1 || numericStudentId > 12) {
    throw new HttpsError("invalid-argument", "student_id must be a pilot learner number between 1 and 12.");
  }

  // The security model in the PRD requires that a learner may only write
  // telemetry whose student_id equals their own authenticated id. That rule
  // lives in the Firestore rules — which this function bypasses entirely,
  // because the Admin SDK is not subject to them. Without the check here, any
  // authenticated caller could file events against any of the twelve learners.
  // Staff may write on a learner's behalf; a learner may only write their own.
  const callerRole = String(request.auth.token.role || "");
  const isStaff = callerRole === "teacher" || callerRole === "admin";
  const callerStudentId = Number(request.auth.token.student_id);
  if (!isStaff && callerStudentId !== numericStudentId) {
    throw new HttpsError("permission-denied", "A learner may only submit events for their own id.");
  }

  // Zero-PII: this function's own contract is "strict PII scrubbing", but
  // interaction_data.details was copied through wholesale, so any caller could
  // park a child's name inside it. Only the primitive, non-text fields the
  // replay actually needs are carried over.
  const rawDetails = (interaction_data?.details ?? {}) as Record<string, unknown>;
  const NUMERIC_DETAIL_KEYS = ["column_index", "block_value", "digit_value", "duration_ms", "undo_stack_depth"];
  const details: Record<string, number> = {};
  for (const key of NUMERIC_DETAIL_KEYS) {
    const value = Number(rawDetails[key]);
    if (Number.isFinite(value)) details[key] = value;
  }

  const cleanPayload = {
    event_type: "vector_replay",
    session_id: String(session_id),
    student_id: numericStudentId,
    timestamp: Date.now(),
    interaction_data: {
      action_type: String(interaction_data?.action_type || "vector_replay").slice(0, 64),
      details
    },
    somatic_indicators: {
      hesitation_detected: !!somatic_indicators?.hesitation_detected,
      undo_triggered: !!somatic_indicators?.undo_triggered
    }
  };

  // Write to Telemetry Collection
  const db = admin.firestore();
  await db.collection("telemetry_events").add(cleanPayload);

  logger.info(`Ingested clean student event for session ${session_id}`);

  return { status: "PROCESSED" };
});

export { authenticateStudentSession, releaseStudentSession } from "./authenticateStudentSession";



