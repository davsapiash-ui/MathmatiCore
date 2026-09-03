import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isWhitelistedTeacherEmail } from '@/infrastructure/services/AuthService';

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
  it('both real login paths stamp the session as verified against the authoritative list', () => {
    // Google SSO and the direct whitelisted-email path.
    expect((auth.match(/whitelistVerified: true/g) || []).length).toBe(2);
    // …and both do so only after the authoritative async check.
    expect(auth).toContain('const isAuthorized = await isWhitelistedTeacherEmailAsync(email);');
    expect(auth).toContain('(await isWhitelistedTeacherEmailAsync(normalized)) || isWhitelistedTeacherEmail(normalized)');
  });

  it('both route guards trust the login-time verification before the hardcoded fallback', () => {
    const guardChecks = app.match(/user\.whitelistVerified !== true && !isWhitelistedTeacherEmail\(email\)/g) || [];
    expect(guardChecks.length).toBe(2);
    // The old form — fallback list alone deciding — must not come back.
    expect(app).not.toMatch(/if \(!isWhitelistedTeacherEmail\(email\)\) \{/);
  });

  it('the hardcoded fallback still admits the two pilot accounts (nothing regressed)', () => {
    expect(isWhitelistedTeacherEmail('davidsep@edu-haifa.org.il')).toBe(true);
    expect(isWhitelistedTeacherEmail('1002220159@edu-haifa.org.il')).toBe(true);
  });

  it('the hardcoded fallback alone does not admit an arbitrary external email', () => {
    // This is exactly why the guard must trust the login-time verification:
    // an external reviewer the admin whitelisted in Firestore is unknown here.
    expect(isWhitelistedTeacherEmail('reviewer@gmail.com')).toBe(false);
  });

  it('a session without the stamp and outside the fallback is still logged out (fail-closed)', () => {
    // The guard is `whitelistVerified !== true && !fallback` → logout. A forged
    // or stale session with neither is rejected, as before.
    expect(app).toContain('logout();');
    expect(app).toContain('return <Navigate to="/login" replace />;');
  });
});
