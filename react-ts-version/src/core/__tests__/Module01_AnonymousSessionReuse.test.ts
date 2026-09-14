import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Module 1 — the learner's anonymous Firebase user is reused across sign-ins.
 *
 * Found on the live site (14.9.2026): every student sign-out called
 * auth.signOut(), which discarded the anonymous user; the auth listener then
 * created a fresh anonymous account at once, and so did the next sign-in.
 * Twelve laptops behind one classroom IP ran into Firebase's
 * TOO_MANY_ATTEMPTS_TRY_LATER on accounts:signUp — after which
 * authenticateStudentSession answered 401 and no learner could sign in.
 *
 * Now the anonymous user stays on the device; sign-out only releases the
 * student claims on the server (releaseStudentSession), and the next sign-in
 * re-stamps them. Staff (Google) are still signed out for real.
 */
const authStore = readFileSync(resolve(__dirname, '../../application/useAuthStore.ts'), 'utf-8');
const server = readFileSync(resolve(__dirname, '../../../../functions/src/authenticateStudentSession.ts'), 'utf-8');
const index = readFileSync(resolve(__dirname, '../../../../functions/src/index.ts'), 'utf-8');

describe('Module 1 — anonymous session reuse', () => {
  it('a learner sign-out releases the claims instead of discarding the anonymous user', () => {
    const block = authStore.slice(authStore.indexOf('const firebaseUser = auth &&'), authStore.indexOf('// The auth store is cleared FIRST'));
    expect(block).toContain("if (firebaseUser?.isAnonymous) {");
    expect(block).toContain("httpsCallable(functions, 'releaseStudentSession')");
    expect(block).toMatch(/\} else if \(auth && typeof auth\.signOut === 'function'\) \{/);
  });

  it('the server clears the claims and keeps the user', () => {
    expect(server).toContain('export const releaseStudentSession = onCall(');
    expect(server).toContain('await admin.auth().setCustomUserClaims(uid, {});');
    expect(server).not.toMatch(/releaseStudentSession[\s\S]*deleteUser\(/);
    expect(index).toContain('releaseStudentSession');
  });
});
