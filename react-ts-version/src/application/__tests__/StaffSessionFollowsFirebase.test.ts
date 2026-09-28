/**
 * @vitest-environment jsdom
 *
 * The auth store follows Firebase Auth, and a sign-out is a whole sign-out.
 *
 * PRD Module 2 §ג: the route guards read "a Single Source of Truth via Zustand
 * backed by Firebase Auth state"; an inconsistent user state forces a redirect;
 * on expiry, "מחיקת אסמכתת ההזדהות".
 *
 * F1 — one Firebase user per browser, one store per tab. The projector window
 * idled out (or its sign-out icon was pressed), auth.signOut() signed every tab
 * out, firebase.ts signed each one in anonymously, and the dashboard tab went
 * on as "teacher": every listener refused, every write failed, and a reload
 * restored the same teacher from sessionStorage.
 * F2 — every teacher sign-out wrote users/students/teacher_… as a learner.
 * F3 — an 8-hour expiry noticed at page load cleared the storage only: the
 * Google session stayed, and the next learner was refused at the login.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

type FakeUser = { isAnonymous?: boolean; email?: string | null; getIdToken?: (force: boolean) => Promise<string> } | null;

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
  return {
    listeners,
    fakeAuth,
    /** Firebase reports a new user to every tab-level listener. */
    emit(u: FakeUser) {
      fakeAuth.currentUser = u;
      listeners.forEach((l) => l(u));
    },
    rtdbUpdateNow: vi.fn((..._args: unknown[]) => Promise.resolve()),
    release: vi.fn((..._args: unknown[]) => Promise.resolve({ data: {} })),
  };
});

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

import {
  useAuthStore,
  STORAGE_KEY_USER,
  STORAGE_KEY_ROLE,
  STORAGE_KEY_TIMESTAMP,
  JWT_EXPIRY_MS,
} from '../useAuthStore';

const GOOGLE_TEACHER = { isAnonymous: false, email: 't@school.edu' };
const ANONYMOUS = { isAnonymous: true, email: null, getIdToken: async () => 'token' };

function signInTeacher() {
  useAuthStore.getState().setUser(
    { uid: 'teacher_t', email: 't@school.edu', role: 'teacher', whitelistVerified: true } as never,
    'teacher'
  );
}

function signInLearner(n = 3) {
  useAuthStore.getState().setUser({ uid: `student_user${n}`, student_id: n, role: 'student' } as never, 'student');
}

function storeRecord(role: 'teacher' | 'student', at: number) {
  const user =
    role === 'teacher'
      ? { uid: 'teacher_t', email: 't@school.edu', role: 'teacher', whitelistVerified: true }
      : { uid: 'student_user4', student_id: 4, role: 'student' };
  for (const s of [localStorage, sessionStorage]) {
    s.setItem(STORAGE_KEY_USER, JSON.stringify(user));
    s.setItem(STORAGE_KEY_ROLE, role);
    s.setItem(STORAGE_KEY_TIMESTAMP, String(at));
  }
}

/** A page load: the auth store module runs its restore from storage again. */
async function reloadAuthStore() {
  vi.resetModules();
  return (await import('../useAuthStore')).useAuthStore;
}

const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  await useAuthStore.getState().logout();
  // Firebase between sessions: an anonymous user, no staff user seen.
  h.emit(ANONYMOUS);
  localStorage.clear();
  sessionStorage.clear();
  h.fakeAuth.signOut.mockClear();
  h.rtdbUpdateNow.mockClear();
  h.release.mockClear();
});

describe('F1 — a staff tab follows the Firebase user shared by every tab', () => {
  it('signed out in another tab: this tab ends its session, sends nothing, forgets it on reload', async () => {
    h.emit(GOOGLE_TEACHER);
    signInTeacher();
    expect(sessionStorage.getItem(STORAGE_KEY_ROLE)).toBe('teacher');

    h.emit(null); // the projector window signed out
    await settle();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().role).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY_ROLE)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY_ROLE)).toBeNull();
    // Firebase already ended it: no second sign-out, no presence write.
    expect(h.fakeAuth.signOut).not.toHaveBeenCalled();
    expect(h.rtdbUpdateNow).not.toHaveBeenCalled();
  });

  it('the anonymous user firebase.ts signs in next is not the teacher either', async () => {
    h.emit(GOOGLE_TEACHER);
    signInTeacher();
    h.emit(ANONYMOUS);
    await settle();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('another staff account signed in on this browser ends this tab’s session', async () => {
    h.emit(GOOGLE_TEACHER);
    signInTeacher();
    h.emit({ isAnonymous: false, email: 'someone.else@school.edu' });
    await settle();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('the same Google user refreshing its token changes nothing', async () => {
    h.emit(GOOGLE_TEACHER);
    signInTeacher();
    h.emit({ ...GOOGLE_TEACHER });
    await settle();
    expect(useAuthStore.getState().role).toBe('teacher');
  });

  it('a first null — Firebase still starting, or no network — decides nothing', async () => {
    signInTeacher();
    h.emit(null);
    await settle();
    expect(useAuthStore.getState().role).toBe('teacher');
  });

  it('a learner keeps the anonymous user it shares on purpose (Module 1)', async () => {
    signInLearner();
    h.emit(ANONYMOUS);
    h.emit(null);
    await settle();
    expect(useAuthStore.getState().isStudentAuthenticated).toBe(true);
  });

  it('page load: a stored teacher whose Firebase user is anonymous is not restored as staff', async () => {
    storeRecord('teacher', Date.now());
    h.fakeAuth.currentUser = null;
    const fresh = await reloadAuthStore();
    expect(fresh.getState().role).toBe('teacher'); // read from storage, before Firebase answers

    h.emit(ANONYMOUS);
    await settle();

    expect(fresh.getState().isAuthenticated).toBe(false);
    expect(sessionStorage.getItem(STORAGE_KEY_ROLE)).toBeNull();
  });
});

describe('F2 — the presence reset is a learner’s', () => {
  it('a teacher sign-out writes nothing under users/students', async () => {
    h.emit(GOOGLE_TEACHER);
    signInTeacher();
    await useAuthStore.getState().logout();
    const paths = h.rtdbUpdateNow.mock.calls.map((c) => String(c[0]));
    expect(paths.filter((p) => p.startsWith('users/students/'))).toEqual([]);
  });

  it('a learner sign-out still marks the learner offline', async () => {
    signInLearner(3);
    await useAuthStore.getState().logout();
    expect(h.rtdbUpdateNow).toHaveBeenCalledWith('users/students/student_user3', { isOnline: false, lastPing: 0 });
  });
});

describe('F3 — an expiry noticed at page load signs the identity out too', () => {
  it('an expired teacher record signs the Google session out', async () => {
    storeRecord('teacher', Date.now() - JWT_EXPIRY_MS - 60_000);
    h.fakeAuth.currentUser = GOOGLE_TEACHER;
    const fresh = await reloadAuthStore();
    await settle();

    expect(fresh.getState().isAuthenticated).toBe(false);
    expect(h.fakeAuth.signOut).toHaveBeenCalledTimes(1);
  });

  it('an expired learner record releases the anonymous user’s claims and keeps the user', async () => {
    storeRecord('student', Date.now() - JWT_EXPIRY_MS - 60_000);
    h.fakeAuth.currentUser = ANONYMOUS;
    await reloadAuthStore();
    await settle();

    expect(h.release).toHaveBeenCalledTimes(1);
    expect(h.fakeAuth.signOut).not.toHaveBeenCalled();
  });

  it('an expired learner record never signs out a teacher who is signed in on the browser', async () => {
    storeRecord('student', Date.now() - JWT_EXPIRY_MS - 60_000);
    h.fakeAuth.currentUser = GOOGLE_TEACHER;
    await reloadAuthStore();
    await settle();

    expect(h.fakeAuth.signOut).not.toHaveBeenCalled();
    expect(h.release).not.toHaveBeenCalled();
  });

  it('logout() settles only after the Firebase sign-out', async () => {
    h.emit(GOOGLE_TEACHER);
    signInTeacher();
    let signedOut = false;
    h.fakeAuth.signOut.mockImplementationOnce(async () => {
      await new Promise((r) => setTimeout(r, 20));
      signedOut = true;
    });
    await useAuthStore.getState().logout();
    expect(signedOut).toBe(true);
  });
});
