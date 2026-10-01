/**
 * @vitest-environment jsdom
 *
 * PRD Module 2: "If a route check fails or user state is inconsistent, force a
 * redirect … immediately"; §ג: on expiry, a silent logout and "ניתוב הביתה".
 *
 * The anonymous Firebase user is shared by every tab on a device, and only its
 * claims move: a sign-out in another tab releases them, a sign-in there stamps
 * another learner's. A tab still holding learner N then has every write refused,
 * and the refusal's event — 'firebase:auth_expired' — had no listener: the tab
 * stayed on the exercise and nothing the child did was saved. Now the event
 * reads the claims fresh, and a tab whose learner they no longer name ends its
 * own session (this tab only), so the route guard takes it to the sign-in.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type Claims = Record<string, unknown>;
const h = vi.hoisted(() => ({
  fakeAuth: {
    currentUser: null as null | {
      isAnonymous: boolean;
      email: string | null;
      getIdToken: (force: boolean) => Promise<string>;
      getIdTokenResult: (force: boolean) => Promise<{ claims: Claims }>;
    },
    onAuthStateChanged: () => () => {},
    signOut: async () => {},
  },
  claims: {} as Claims,
  claimsFail: false,
  refreshes: 0,
  release: vi.fn((..._args: unknown[]) => Promise.resolve({ data: {} })),
  rtdbUpdateNow: vi.fn((..._args: unknown[]) => Promise.resolve()),
}));

vi.mock('@/infrastructure/firebase', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  auth: h.fakeAuth,
  authReady: Promise.resolve(true),
}));
vi.mock('@/infrastructure/services/ThrottledRtdbWriter', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  rtdbUpdateNow: h.rtdbUpdateNow,
}));
vi.mock('firebase/functions', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  httpsCallable: () => h.release,
}));

import { useAuthStore, reconcileLearnerClaims, LEARNER_CLAIMS_RECHECK_MS } from '../useAuthStore';

function signInLearner(n: number) {
  useAuthStore.getState().setUser({ uid: `student_user${n}`, student_id: n, role: 'student' } as never, 'student');
}
const signedIn = () => useAuthStore.getState().isAuthenticated;
const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

let clock = Date.now();

beforeEach(() => {
  // Each case starts past the previous case's confirmed check.
  clock += LEARNER_CLAIMS_RECHECK_MS * 2;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(clock);
  h.claims = {};
  h.claimsFail = false;
  h.refreshes = 0;
  h.release.mockClear();
  h.rtdbUpdateNow.mockClear();
  h.fakeAuth.currentUser = {
    isAnonymous: true,
    email: null,
    getIdToken: async () => 'token',
    getIdTokenResult: async (force: boolean) => {
      if (force) h.refreshes += 1;
      if (h.claimsFail) throw new Error('network');
      return { claims: h.claims };
    },
  };
  useAuthStore.setState({ user: null, role: null, isAuthenticated: false, isStudentAuthenticated: false });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("a learner tab whose claims moved is signed out — this tab only", () => {
  it('another tab signed out (claims released): a refused write ends this tab’s session', async () => {
    signInLearner(4);
    h.claims = {};
    window.dispatchEvent(new CustomEvent('firebase:auth_expired', { detail: { error: 'PERMISSION_DENIED' } }));
    await settle();
    expect(h.refreshes, 'the claims are read fresh from the server').toBe(1);
    expect(signedIn()).toBe(false);
    expect(h.release, 'nothing sent: the Firebase user is not this tab’s to release').not.toHaveBeenCalled();
    // The sign-out's own presence reset ({ isOnline: false, lastPing: 0 }) is
    // what 'this tab only' must skip. The sync service may still mark its own
    // learner offline as it stops ({ isOnline: false }) when its start won the
    // race on a slow machine (deploy CI, 1.10.2026); the rules refuse that write.
    const logoutPresence = h.rtdbUpdateNow.mock.calls.filter((c) => (c[1] as Record<string, unknown> | undefined)?.lastPing === 0);
    expect(logoutPresence, 'no presence written as a learner it no longer is').toEqual([]);
  });

  it('another learner signed in on this device: this tab’s session ends', async () => {
    signInLearner(4);
    h.claims = { role: 'student', student_id: 7 };
    await reconcileLearnerClaims();
    expect(signedIn()).toBe(false);
  });

  it('the claims still name this learner (a write refused for another reason): nothing ends, and the server is not asked again at once', async () => {
    signInLearner(4);
    h.claims = { role: 'student', student_id: 4 };
    await reconcileLearnerClaims();
    expect(signedIn()).toBe(true);
    await reconcileLearnerClaims();
    expect(h.refreshes).toBe(1);
  });

  it('no answer from the server: nothing ends', async () => {
    signInLearner(4);
    h.claimsFail = true;
    await reconcileLearnerClaims();
    expect(signedIn()).toBe(true);
  });

  it('a staff tab is not judged by learner claims', async () => {
    useAuthStore.getState().setUser(
      { uid: 'teacher_t', email: 't@school.edu', role: 'teacher', whitelistVerified: true } as never,
      'teacher'
    );
    h.fakeAuth.currentUser = { ...h.fakeAuth.currentUser!, isAnonymous: false, email: 't@school.edu' };
    await reconcileLearnerClaims();
    expect(h.refreshes).toBe(0);
    expect(signedIn()).toBe(true);
  });
});
