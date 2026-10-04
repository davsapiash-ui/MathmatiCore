import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isWhitelistedTeacherEmail, STAFF_SIGNIN_REFUSED_HE, verifiedStaffRole } from '@/infrastructure/services/AuthService';

/**
 * PRD Module 1 §ג — teacher authorisation is fail-closed and whitelist-based.
 *
 * Two whitelist checks existed and disagreed. Login verified the email against
 * the authoritative Firestore `authorizedTeachers` collection (the list the
 * admin console manages), so an admin-added teacher passed. The App.tsx route
 * guards then re-verified against the SYNCHRONOUS fallback, which knows only
 * the two pilot emails plus dev accounts — and logged that same teacher
 * straight back out, with no message. Adding a teacher looked like it worked
 * and did not.
 *
 * Login now stamps `whitelistVerified` on the session and the guards trust it.
 * The server stays the security boundary: Firestore rules and every callable
 * check the custom claims that syncUserRoles derives from the same collection.
 *
 * Product decision (owner, 2026-09-03): access is whitelist-only, with no
 * email-domain rule, so external course reviewers can be admitted.
 */
const app = readFileSync(resolve(__dirname, '../../App.tsx'), 'utf-8');
const auth = readFileSync(resolve(__dirname, '../../infrastructure/services/AuthService.ts'), 'utf-8');

describe('Module 1: teacher whitelist guard', () => {
  it('the one real login path stamps the session as verified against the authoritative list', () => {
    // Google SSO only: the direct whitelisted-email path, which nothing called, is gone.
    expect((auth.match(/whitelistVerified: true/g) || []).length).toBe(1);
    expect(auth).not.toContain('authenticateWhitelistedEmail');
    // …and it does so only after the authoritative async check.
    expect(auth).toContain('? await whitelistedStaffRoleAsync(email).catch(');
    expect(auth).toContain('const isAuthorized = listedRole !== null;');
  });

  it('both route guards trust the login-time verification before the hardcoded fallback', () => {
    const guardChecks = app.match(/user\.whitelistVerified !== true && !isWhitelistedTeacherEmail\(email\)/g) || [];
    expect(guardChecks.length).toBe(2);
    // The old form — fallback list alone deciding — must not come back.
    expect(app).not.toMatch(/if \(!isWhitelistedTeacherEmail\(email\)\) \{/);
  });

  it('no production address is hardcoded any more — the whitelist alone decides', () => {
    // The owner confirmed both pilot addresses are in authorizedTeachers.
    // Keeping them hardcoded meant deleting a teacher could not revoke her
    // login, and it was exactly what the security screen told
    // the admin did not exist.
    expect(isWhitelistedTeacherEmail('davidsep@edu-haifa.org.il')).toBe(false);
    expect(isWhitelistedTeacherEmail('1002220159@edu-haifa.org.il')).toBe(false);
  });

  it('the hardcoded fallback alone does not admit an arbitrary external email', () => {
    // This is exactly why the guard must trust the login-time verification:
    // an external reviewer the admin whitelisted in Firestore is unknown here.
    expect(isWhitelistedTeacherEmail('reviewer@gmail.com')).toBe(false);
  });

  it('the login check reads authorizedTeachers only — never the RTDB teacher list (28.9.2026)', () => {
    // The RTDB users/teachers node was a second whitelist: any signed-in
    // identity could read every teacher's email there, and write its own
    // record and pass this check. It is staff-only now (database.rules.json).
    const check = auth.slice(
      auth.indexOf('export async function isWhitelistedTeacherEmailAsync'),
      auth.indexOf('export function isWhitelistedTeacherEmail('),
    );
    expect(check).toContain('"authorizedTeachers"');
    expect(check).not.toMatch(/ref\(database,\s*['"`]users\/teachers/);
  });

  it('the session role is the verified one, not the door that was clicked (X38)', () => {
    const teacherClaims = { role: 'teacher', teacher: true, admin: false };
    const adminClaims = { role: 'admin', admin: true, teacher: false };
    // A teacher-only address that came in through the admin door is the teacher.
    expect(verifiedStaffRole(teacherClaims, 'teacher', 'admin')).toBe('teacher');
    // The token decides whichever door was clicked.
    expect(verifiedStaffRole(adminClaims, 'admin', 'teacher')).toBe('admin');
    // No single staff role on the token (stamping failed, or legacy dual claims):
    // the whitelist decides. Only an admin address may take the role it asked for.
    expect(verifiedStaffRole(null, 'teacher', 'admin')).toBe('teacher');
    expect(verifiedStaffRole({ role: 'admin', admin: true, teacher: true }, 'teacher', 'admin')).toBe('teacher');
    expect(verifiedStaffRole(null, 'admin', 'teacher')).toBe('teacher');
    expect(verifiedStaffRole(null, 'admin', 'admin')).toBe('admin');
    // Login routes and stores the verified role.
    const login = readFileSync(resolve(__dirname, '../../presentation/pages/Login.tsx'), 'utf-8');
    const sso = login.slice(login.indexOf('const handleGoogleSSO'), login.indexOf('} catch (err: any) {', login.indexOf('const handleGoogleSSO')));
    expect(sso).toContain('const role = authenticatedUser.role;');
    expect(sso).toContain('login(role, authenticatedUser.uid);');
    expect(sso).toContain('navigate(role === "teacher" ? "/dashboard" : "/admin"');
    expect(sso).not.toMatch(/login\(targetRole|navigate\(targetRole/);
  });

  it('a refused Google user sees a generic refusal: no reason, no address (X46)', () => {
    expect(STAFF_SIGNIN_REFUSED_HE).toBe('הכניסה נדחתה. לבירור יש לפנות למנהל המערכת.');
    expect(auth).not.toContain('כתובת הדוא"ל (');
    expect(auth).not.toMatch(/throw new Error\(`[^`]*\$\{(email|normalized)/);
  });

  it('a session without the stamp and outside the fallback is still logged out (fail-closed)', () => {
    // The guard is `whitelistVerified !== true && !fallback` → logout. A forged
    // or stale session with neither is rejected, as before.
    expect(app).toContain('logout();');
    expect(app).toContain('return <Navigate to="/login" replace />;');
  });
});
