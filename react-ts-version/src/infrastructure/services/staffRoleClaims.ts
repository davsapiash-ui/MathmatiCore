import { httpsCallable } from "firebase/functions";
import { auth, functions } from "@/infrastructure/firebase";

/**
 * The claims of one sign-in follow the role chosen for it (register, gap יא;
 * PRD Module 24 §ב). syncUserRoles stamps a teacher sign-in with the teacher's
 * claims only and an admin sign-in with the admin's only.
 *
 * The claims live on the account, not on the tab, so the owner's account may
 * still carry the other role's claims from an earlier sign-in (or the dual
 * claims every admin sign-in received before 28.9.2026). Each side re-asserts
 * its own role when it opens.
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

/** Re-stamps only when the current token does not already carry exactly this role. */
export async function ensureStaffRoleClaims(role: StaffRole): Promise<void> {
  const current = auth.currentUser;
  if (!current) return;
  const token = await current.getIdTokenResult();
  if (claimsMatchRole(token.claims as Record<string, unknown>, role)) return;
  await stampStaffRole(role);
}
