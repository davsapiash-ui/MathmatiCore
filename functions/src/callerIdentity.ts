import { HttpsError } from "firebase-functions/v2/https";

/**
 * Who is calling, read from the verified custom claims.
 *
 * Every Cloud Function here uses the Admin SDK, which bypasses the Firestore
 * and Realtime Database rules entirely. So the checks the rules express have
 * to be repeated in the function's own code, and they have to agree with each
 * other. This module is that one agreed definition.
 */
export interface CallerRoles {
  isTeacher: boolean;
  isAdmin: boolean;
  studentId: number | null;
  classId: string | null;
}

export function readCallerRoles(token: Record<string, unknown>): CallerRoles {
  const rawRoles = token.roles;
  const roles = (Array.isArray(rawRoles) ? rawRoles : token.role ? [token.role] : [])
    .map((r) => String(r).toLowerCase());
  const role = String(token.role ?? "").toLowerCase();
  const studentId = Number(token.student_id);
  return {
    isTeacher: roles.includes("teacher") || role === "teacher" || token.teacher === true,
    isAdmin: roles.includes("admin") || role === "admin" || token.admin === true,
    studentId: Number.isInteger(studentId) && studentId >= 1 && studentId <= 12 ? studentId : null,
    classId: typeof token.class_id === "string" && token.class_id ? token.class_id : null,
  };
}

/**
 * Module 24 §ב: a system administrator is blocked from an individual
 * learner's telemetry and documents. The Firestore rules already say this
 * (`allow read: if (isTeacher() || ...) && !isAdmin()`), and an Admin-SDK
 * function has to say it too.
 *
 * The product owner's identity carries both the teacher and the admin claim,
 * so it passes. An admin-only identity does not.
 */
export function requireTeacherForIndividualData(token: Record<string, unknown>): CallerRoles {
  const caller = readCallerRoles(token);
  if (!caller.isTeacher) {
    throw new HttpsError(
      "permission-denied",
      "רק מורה רשאית להפיק או לקרוא נתונים של לומד יחיד."
    );
  }
  return caller;
}

/** An action reserved for a system administrator. */
export function requireAdmin(token: Record<string, unknown>): CallerRoles {
  const caller = readCallerRoles(token);
  if (!caller.isAdmin) {
    throw new HttpsError("permission-denied", "פעולה זו שמורה למנהל המערכת.");
  }
  return caller;
}
