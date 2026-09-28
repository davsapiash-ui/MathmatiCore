/**
 * The test suite never reaches the live Firebase project.
 *
 * Measured on 28.9.2026, before this guard: every `npm test` run, on every CI push
 * and every merge, sent about 71 anonymous sign-ups to the production project and
 * about 125 calls to the production Gemini proxy. Anonymous sign-ups share a per-IP
 * quota, the same one that locked the class out on 15.9.2026. See
 * src/test/noProductionNetwork.ts.
 */
import { describe, it, expect } from 'vitest';
import { auth, database, functions, authReady } from '@/infrastructure/firebase';
import { isBlockedHost } from '@/test/noProductionNetwork';

describe('tests never reach the live Firebase project', () => {
  it('the Firebase app under test is a demo project, not mathimaticore', () => {
    expect(import.meta.env.VITE_FIREBASE_PROJECT_ID).toBe('demo-mathmaticore');
    expect(auth.app.options.projectId).toBe('demo-mathmaticore');
    expect(functions.app.options.projectId).toBe('demo-mathmaticore');
    expect(database.app.options.databaseURL).not.toContain('mathimaticore-default-rtdb');
  });

  it('a fetch to a Google or Firebase host is refused before it leaves the machine', async () => {
    await expect(
      fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=x', { method: 'POST' }),
    ).rejects.toThrow(/tests never call/);
    await expect(
      fetch('https://us-central1-mathimaticore.cloudfunctions.net/callGeminiSocraticProxy'),
    ).rejects.toThrow(/tests never call/);
  });

  it('the guard covers every production host and leaves the local emulators alone', () => {
    for (const host of [
      'identitytoolkit.googleapis.com',
      'securetoken.googleapis.com',
      'firestore.googleapis.com',
      'us-central1-mathimaticore.cloudfunctions.net',
      'mathimaticore-default-rtdb.firebaseio.com',
      'mathimaticore.firebaseapp.com',
      'mathimaticore.web.app',
    ]) {
      expect(isBlockedHost(host)).toBe(true);
    }
    for (const host of ['127.0.0.1', 'localhost']) {
      expect(isBlockedHost(host)).toBe(false);
    }
  });

  it('the anonymous sign-in at import fails quietly instead of creating an account', async () => {
    await expect(authReady).resolves.toBe(false);
  });
});
