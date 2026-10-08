/**
 * PRD Module 2 §א (v7.9) — the route guard's decision, as one pure rule:
 *
 *   "אם המשתמש אינו מחובר, הניתוב נחסם והמערכת מובילה למסך בחירת התפקיד
 *   (‎/login); מורה או מנהל שכתובתם אינה ברשימת המורשים מנותקים ומובלים לאותו
 *   מסך; משתמש מחובר שמנסה להיכנס לנתיב של תפקיד אחר מוחזר לדף הבית של
 *   תפקידו: לומד ללובי, מורה לדשבורד ומנהל לקונסולה; כתובת שאינה קיימת מובילה
 *   לדף הנחיתה (‎/); אחרי איפוס הלומד חוזר ללובי."
 *
 * The unknown address (→ '/') is the router's catch-all route in App.tsx; the
 * return to the lobby after a reset is in StudentWorkspacePage.
 */
export type AppRole = 'student' | 'teacher' | 'admin';

/** Each role's home: learner → lobby, teacher → dashboard, admin → console. */
export const ROLE_HOME: Record<AppRole, string> = {
  student: '/hub',
  teacher: '/dashboard',
  admin: '/admin',
};

export const LOGIN_ROUTE = '/login';

export type RouteDecision =
  | { kind: 'allow' }
  | { kind: 'redirect'; to: string; logout: boolean };

export function isAppRole(role: unknown): role is AppRole {
  return role === 'student' || role === 'teacher' || role === 'admin';
}

export function decideRoute(input: {
  isAuthenticated: boolean;
  role: string | null | undefined;
  /** For staff: the address is on the authorized list (or was verified at sign-in). */
  staffAuthorized: boolean;
  allowedRoles: readonly AppRole[];
}): RouteDecision {
  if (!input.isAuthenticated) return { kind: 'redirect', to: LOGIN_ROUTE, logout: false };
  const role = input.role;
  // Three roles only (AGENTS.md, "Removed for good"): anything else is not a
  // signed-in role of this system, so it is signed out like an unlisted staff address.
  if (!isAppRole(role)) return { kind: 'redirect', to: LOGIN_ROUTE, logout: true };
  if ((role === 'teacher' || role === 'admin') && !input.staffAuthorized) {
    return { kind: 'redirect', to: LOGIN_ROUTE, logout: true };
  }
  if (input.allowedRoles.includes(role)) return { kind: 'allow' };
  return { kind: 'redirect', to: ROLE_HOME[role], logout: false };
}
