import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { requireTeacherForIndividualData } from "./callerIdentity";
import { assertCallerClass, validateClassId } from "./exportDriveReport";

/**
 * PRD Module 20 §ב — "שלב החלוקה למסלולים":
 *
 *   "עם אישור המורה, השרת כותב את האישור למסמך המפגש ומשקף אותו באותה פעולה
 *    לרשומת הלומד ב-Realtime Database (users/students/{studentId}: routeStatus,
 *    teacher_gate_approved). ההשתקפות ניתנת לכתיבה על ידי צוות בלבד"
 *   "בלחיצה, השרת מעדכן teacher_gate_approved = true."
 *
 * The teacher's dashboard used to write the session document and then, as a
 * second client call, the learner's RTDB record. Here the server does both,
 * with the Admin SDK, after checking that the caller is the teacher of the
 * learner's class:
 *   1. the session-2 SessionDocument (the sole source of truth), in a
 *      transaction: teacher_gate_approved, teacher_selected_path,
 *      gate_approved_at, gate_approved_by — and only on a completed meeting 2;
 *   2. the mirror on the learner record the learner's route guard listens to:
 *      routeStatus, teacher_gate_approved, teacher_selected_path,
 *      pedagogicalPath (the key the task engine reads, Module 26), and the
 *      approval's time and author.
 */

export type GatePath = "green_path" | "remediation_path";

export const GATE_PATHS: readonly GatePath[] = ["green_path", "remediation_path"];

/** The learner 1–12 named by a request: 5, "5", "student_user5", "student_5". */
export function gateLearnerNumber(raw: unknown): number | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}

/** Canonical session-2 SessionDocument id (react-ts-version core/teacherGate.ts session2DocId). */
export function gateSessionDocId(n: number): string {
  return `session_02_student_${n}`;
}

/** The fields the mirror writes on the learner record. */
export function gateMirrorFields(path: GatePath, approvedAt: number, approvedBy: string): Record<string, unknown> {
  return {
    teacher_gate_approved: true,
    teacher_selected_path: path,
    pedagogicalPath: path,
    gate_approved_at: approvedAt,
    gate_approved_by: approvedBy,
    routeStatus: "APPROVED",
  };
}

/** Why an approval was refused before anything was written (read by the dashboard). */
export type GateRefusal = "missing_session_doc" | "not_completed";

export const approveTeacherGate = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be authenticated.");
  const token = request.auth.token as Record<string, unknown>;
  // The gate is the teacher's decision (Module 20, Module 24 §ב): a teacher
  // sign-in only — an admin sign-in is refused, as the RTDB rules refuse it.
  requireTeacherForIndividualData(token);

  const n = gateLearnerNumber(request.data?.studentId);
  if (n === null) throw new HttpsError("invalid-argument", "מזהה הלומד אינו תקין. האישור לא נשמר.");
  const path = request.data?.path as GatePath;
  if (!GATE_PATHS.includes(path)) throw new HttpsError("invalid-argument", "המסלול אינו תקין. האישור לא נשמר.");

  const db = admin.firestore();
  const docRef = db.collection("sessions").doc(gateSessionDocId(n));
  const approvedAt = Date.now();
  const approvedBy = request.auth.uid;

  // 1. The session document. The class is the learner's own (the document's
  // class_id), so a teacher token that names another class is refused.
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    if (!snap.exists) {
      throw new HttpsError("failed-precondition", "missing_session_doc", { reason: "missing_session_doc" satisfies GateRefusal });
    }
    const data = snap.data() || {};
    const classId = validateClassId(data.class_id, "מזהה הכיתה במסמך המפגש אינו תקין. האישור לא נשמר.");
    assertCallerClass(token, classId, "אפשר לאשר רק לומדים של הכיתה המשויכת לחשבון המחובר. האישור לא נשמר.");
    if (data.is_completed !== true) {
      throw new HttpsError("failed-precondition", "not_completed", { reason: "not_completed" satisfies GateRefusal });
    }
    tx.update(docRef, {
      teacher_gate_approved: true,
      teacher_selected_path: path,
      gate_approved_at: approvedAt,
      gate_approved_by: approvedBy,
    });
  });

  // 2. The mirror, in one multi-path update: the canonical record the learner's
  // listener reads, and every older alias of it that already exists (never
  // creating one).
  const rtdb = admin.database();
  const mirror = gateMirrorFields(path, approvedAt, approvedBy);
  const records = [`student_user${n}`];
  for (const alias of [`student_${n}`, String(n)]) {
    try {
      if ((await rtdb.ref(`users/students/${alias}`).get()).exists()) records.push(alias);
    } catch (err) {
      logger.warn(`approveTeacherGate: alias ${alias} could not be read; left as it is.`, err);
    }
  }
  const updates: Record<string, unknown> = {};
  for (const record of records) {
    for (const [field, value] of Object.entries(mirror)) updates[`users/students/${record}/${field}`] = value;
  }
  try {
    await rtdb.ref().update(updates);
  } catch (err) {
    // The approval is saved (the session document). Pressing again re-runs
    // both steps, and the second one is what releases the learner's screen.
    logger.error(`approveTeacherGate: learner ${n} approved, but the RTDB mirror failed:`, err);
    throw new HttpsError(
      "unavailable",
      "האישור נשמר, אבל שחרור מסך התלמיד לא הצליח כרגע. לחצו שוב על האישור כדי לשחרר אותו.",
      { reason: "mirror_failed" }
    );
  }

  logger.info(`approveTeacherGate: learner ${n} approved for ${path}.`);
  return { ok: true, studentId: n, path };
});
