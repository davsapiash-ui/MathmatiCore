import { httpsCallable } from "firebase/functions";
import { auth, functions } from "@/infrastructure/firebase";

/**
 * The claims of one sign-in follow the role chosen for it (register, gap יא;
 * PRD Module 24 §ב). syncUserRoles stamps a teacher sign-in with the teacher's
 * claims only and an admin sign-in with the admin's only.
 *
 * Only the sign-in chooses the role. The claims live on the account, not on
 * the tab: if opening a page re-stamped them, the owner opening the admin
 * console in a second tab would cut the dashboard of a lesson in progress off
 * from the learners. So a page re-stamps only a token that carries NO single
 * staff role — the dual claims every admin sign-in received before 28.9.2026,
 * or none at all — and leaves the other role's claims alone.
 */
export type StaffRole = "teacher" | "admin";

export function claimsMatchRole(claims: Record<string, unknown>, role: StaffRole): boolean {
  if (role === "teacher") return claims.role === "teacher" && claims.admin !== true;
  return claims.role === "admin" && claims.teacher !== true;
}

export async function stampStaffRole(role: StaffRole): Promise<void> {
  const sync = httpsCallable<{ role: StaffRole }, unknown>(functions, "syncUserRoles");
  await sync({ role });
  await auth.currentUser?.getIdToken(true);
}

/** A token that carries exactly one staff role (teacher or admin). */
export function hasSingleStaffRole(claims: Record<string, unknown>): boolean {
  return claimsMatchRole(claims, "teacher") || claimsMatchRole(claims, "admin");
}

/**
 * Re-stamps only a token with no single staff role (legacy dual claims, or
 * none). A token that already carries one role — this one or the other — is
 * left as it is: switching roles is a new sign-in.
 */
export async function ensureStaffRoleClaims(role: StaffRole): Promise<void> {
  const current = auth.currentUser;
  // An anonymous user is no staff member: the staff session behind this page
  // ended (signed out in another tab), and the server would refuse the stamp.
  // useAuthStore's reconcileWithFirebaseUser sends the page to /login.
  if (!current || current.isAnonymous) return;
  const token = await current.getIdTokenResult();
  if (hasSingleStaffRole(token.claims as Record<string, unknown>)) return;
  await stampStaffRole(role);
}
