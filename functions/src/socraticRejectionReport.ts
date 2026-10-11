/**
 * Owner decision, 11.10.2026 (item 13-1): the coaching cards the CLIENT
 * refuses are recorded too, beside the ones this server's validator refuses
 * (geminiProxy.ts), in the same minimal anonymised record (aiMonitoring.ts,
 * ai_rejections) and so in the same weekly report (aiRejectionsReport.ts).
 *
 * Two kinds, and only these:
 *  - "client_reject": the engine's card passed this server, and the client's
 *    own check refused it (SocraticEngine.fetchGroundedGeminiSocraticQuery);
 *    the learner got the static card.
 *  - "static_reject": a static card the client's iron rule refused
 *    (SocraticEngine.enforceIronRule); the learner got the fallback card.
 *
 * A closed field list, read one by one: the exercise id, the meeting, the
 * reason, the kind, the try, the demonstration flag and the refused card's
 * text (scrubbed, capped). Never a learner id, a session id or a uid —
 * anything else the client sends is ignored. A signed-in learner or a staff
 * member only (the login screen's anonymous session is refused); nothing is
 * returned, and a failure never reaches the child (the client does not wait).
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { AI_REJECTION_REASON_MAX, AI_REJECTION_TEXT_MAX, writeAiRejection, type AiRejectionRecord } from "./aiMonitoring";
import { readCallerRoles } from "./callerIdentity";
import { meetingFromExerciseId, scrubPII } from "./geminiProxy";

export const CLIENT_REJECTION_OUTCOMES = ["client_reject", "static_reject"] as const;
export type ClientRejectionOutcome = (typeof CLIENT_REJECTION_OUTCOMES)[number];

/** The model field of a client record: the client's check, not a model. */
export const CLIENT_CHECK_MODEL_ID = "client_check";

/** May this sign-in file a record? A learner (student_id 1–12) or a teacher or an admin; never an anonymous session. */
export function mayReportRejection(token: Record<string, unknown> | undefined): boolean {
  if (!token) return false;
  const roles = readCallerRoles(token);
  return roles.studentId !== null || roles.isTeacher || roles.isAdmin;
}

/**
 * The record from what the client sent: the listed fields only, each checked;
 * null when the kind is not one of the two. Pure, for the tests.
 */
export function clientRejectionRecord(data: unknown): AiRejectionRecord | null {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const outcome = d.outcome;
  if (typeof outcome !== "string" || !(CLIENT_REJECTION_OUTCOMES as readonly string[]).includes(outcome)) return null;
  const exerciseId = typeof d.exercise_id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(d.exercise_id) ? d.exercise_id : null;
  const meeting = typeof d.meeting === "number" && Number.isInteger(d.meeting) && d.meeting >= 1 && d.meeting <= 8
    ? d.meeting
    : meetingFromExerciseId(exerciseId);
  const attempt = typeof d.attempt === "number" && Number.isInteger(d.attempt) && d.attempt >= 1 && d.attempt <= 3 ? d.attempt : 1;
  return {
    exercise_id: exerciseId,
    meeting,
    reason: scrubPII(String(typeof d.reason === "string" ? d.reason : "").trim()).slice(0, AI_REJECTION_REASON_MAX),
    outcome: outcome as ClientRejectionOutcome,
    model_id: CLIENT_CHECK_MODEL_ID,
    attempt,
    demo: d.demo === true,
    card_text: scrubPII(String(typeof d.card_text === "string" ? d.card_text.slice(0, AI_REJECTION_TEXT_MAX * 2) : "")).slice(0, AI_REJECTION_TEXT_MAX),
  };
}

export const reportSocraticRejection = onCall({ timeoutSeconds: 10 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  if (!mayReportRejection(request.auth.token as Record<string, unknown>)) {
    throw new HttpsError("permission-denied", "A learner or a staff sign-in only.");
  }
  const record = clientRejectionRecord(request.data);
  if (!record) throw new HttpsError("invalid-argument", "Unknown rejection kind.");
  writeAiRejection(record);
  return { ok: true };
});
