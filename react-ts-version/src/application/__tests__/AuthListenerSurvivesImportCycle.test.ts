/**
 * @vitest-environment jsdom
 *
 * The auth store's Firebase listener is attached even when the app loads
 * firebase.ts first.
 *
 * firebase.ts re-exports FirebaseSyncService, which imports useAuthStore, which
 * imports `auth` from firebase.ts. App.tsx enters through firebase.ts, so in
 * the browser the store's body ran before `auth` existed: the read threw
 * "Cannot access 'auth' before initialization", a try/catch logged
 * "[useAuthStore] Firebase auth listener unavailable", and
 * reconcileWithFirebaseUser never ran. A teacher who signed out in the
 * projector window kept an open, dead dashboard in the other window (audit
 * 2.10.2026, M-logout-sync / access-8).
 *
 * Vitest loads modules one by one and does not reproduce the browser's order,
 * so the state is set up directly: a firebase module whose `auth` and
 * `authReady` throw, as a binding still being initialised does, until
 * firebase.ts "finishes loading".
 */
import { describe, it, expect, vi } from 'vitest';

type FakeUser = { isAnonymous?: boolean; email?: string | null } | null;

const h = vi.hoisted(() => {
  const listeners: Array<(u: FakeUser) => void> = [];
  const fakeAuth = {
    currentUser: null as FakeUser,
    onAuthStateChanged(cb: (u: FakeUser) => void) {
      listeners.push(cb);
      return () => {};
    },
    signOut: vi.fn(async () => {}),
  };
  return { listeners, fakeAuth, firebaseLoaded: false };
});

vi.mock('@/infrastructure/firebase', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  const notYet = (name: string) => new ReferenceError(`Cannot access '${name}' before initialization`);
  return {
    ...real,
    get auth() {
      if (!h.firebaseLoaded) throw notYet('auth');
      return h.fakeAuth;
    },
    get authReady() {
      if (!h.firebaseLoaded) throw notYet('authReady');
      return Promise.resolve(true);
    },
  };
});

import { STORAGE_KEY_USER, STORAGE_KEY_ROLE, STORAGE_KEY_TIMESTAMP, JWT_EXPIRY_MS } from '../useAuthStore';

describe('the auth store follows Firebase when firebase.ts is loaded first', () => {
  it('registers its listener once firebase.ts has loaded, and a sign-out elsewhere ends this tab’s staff session', async () => {
    const { useAuthStore } = await import('../useAuthStore');
    expect(h.listeners.length).toBe(0);

    h.firebaseLoaded = true;
    await vi.waitFor(() => expect(h.listeners.length).toBe(1), { timeout: 3000 });

    const emit = (u: FakeUser) => {
      h.fakeAuth.currentUser = u;
      h.listeners.forEach((l) => l(u));
    };
    emit({ isAnonymous: false, email: 't@school.edu' });
    useAuthStore.getState().setUser(
      { uid: 'teacher_t', email: 't@school.edu', role: 'teacher', whitelistVerified: true } as never,
      'teacher'
    );
    expect(useAuthStore.getState().isAuthenticated).toBe(true);

    emit(null); // the projector window signed out

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(h.fakeAuth.signOut).not.toHaveBeenCalled();
  }, 30_000);

  it('a stored sign-in that expired before the page loaded does not break the load', async () => {
    // The expiry clean-up reads authReady, firebase.ts's as well: read too
    // early, it threw out of the store module itself and the page stayed blank.
    h.firebaseLoaded = false;
    const user = JSON.stringify({ uid: 'teacher_t', email: 't@school.edu', role: 'teacher', whitelistVerified: true });
    for (const s of [localStorage, sessionStorage]) {
      s.setItem(STORAGE_KEY_USER, user);
      s.setItem(STORAGE_KEY_ROLE, 'teacher');
      s.setItem(STORAGE_KEY_TIMESTAMP, String(Date.now() - JWT_EXPIRY_MS - 1000));
    }
    vi.resetModules();
    const { useAuthStore } = await import('../useAuthStore');
    expect(useAuthStore.getState().isAuthenticated).toBe(false);

    // Once firebase.ts has loaded, the Google session left on the device is signed out.
    h.fakeAuth.currentUser = { isAnonymous: false, email: 't@school.edu' };
    h.firebaseLoaded = true;
    await vi.waitFor(() => expect(h.fakeAuth.signOut).toHaveBeenCalledTimes(1), { timeout: 3000 });
  }, 30_000);
});
