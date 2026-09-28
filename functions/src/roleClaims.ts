/**
 * The custom claims one sign-in receives.
 *
 * PRD Module 24 §ב: "מנהלי מערכת חסומים מגישה לנתוני טלמטריה פרטניים או
 * למסמכי תלמידים אישיים"; Module 23א §ו: the admin is blocked from resetting
 * learning data. The register (gap יא, owner 23.9.2026) keeps the owner's
 * dual account and says how the two roles stay apart: the role is chosen at
 * every sign-in, and the claims of that sign-in decide what opens — as the
 * teacher, the whole dashboard; as the admin, the console and Module 24 §ב.
 *
 * Until 28.9.2026 every admin sign-in was stamped { admin, teacher } together,
 * so the teacher claim let the "admin" read and operate every learner's data
 * through the rules. Now an admin-authorised address gets the claims of the
 * role it signed in as, and never both at once. A teacher-only address can
 * never obtain the admin claim, whatever it asks for.
 */
export type StaffRole = "teacher" | "admin";

export type RoleClaims = Record<string, unknown>;

export const TEACHER_CLAIMS: Readonly<RoleClaims> = {
  teacher: true,
  admin: false,
  role: "teacher",
  class_id: "class_1",
  roles: ["TEACHER"],
};

export const ADMIN_CLAIMS: Readonly<RoleClaims> = {
  admin: true,
  teacher: false,
  role: "admin",
  roles: ["ADMIN"],
};

export const GUEST_CLAIMS: Readonly<RoleClaims> = {
  student: false,
  admin: false,
  teacher: false,
  role: "guest",
  roles: ["GUEST"],
};

/** Reads the role the client asked for; anything else is no request. */
export function parseRequestedRole(data: unknown): StaffRole | null {
  const raw = data && typeof data === "object" ? (data as Record<string, unknown>).role : undefined;
  return raw === "teacher" || raw === "admin" ? raw : null;
}

/**
 * An admin-authorised address signing in as the teacher gets the teacher's
 * claims; any other request (the admin role, or none at all) gets the admin's.
 * No request falls to the admin side because the admin side is the one that
 * cannot see learners: Module 24 §ב's fail-closed rule.
 */
export function claimsForSignIn(
  authorization: { isAuthorizedAdmin: boolean; isAuthorizedTeacher: boolean },
  requestedRole: StaffRole | null
): RoleClaims {
  if (authorization.isAuthorizedAdmin) {
    return { ...(requestedRole === "teacher" ? TEACHER_CLAIMS : ADMIN_CLAIMS) };
  }
  if (authorization.isAuthorizedTeacher) {
    return { ...TEACHER_CLAIMS };
  }
  return { ...GUEST_CLAIMS };
}
