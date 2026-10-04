import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * PRD Module 1 §ג, strict instructions: "If the server request times out or
 * fails during authentication, trigger an immediate rollback to the idle state
 * ... the global authentication state is only updated upon successful
 * handshake ... Enforce a fail-closed policy for teacher authorization."
 *
 * A failed syncUserRoles used to be logged and the sign-in carried on from the
 * client's own whitelist read, so a teacher whose claims were never stamped
 * landed in a dashboard the security rules refuse to fill.
 */

const { signOut, callable } = vi.hoisted(() => ({
  signOut: vi.fn(async () => {}),
  callable: vi.fn(),
}));
vi.mock('@/infrastructure/firebase', () => ({ auth: { signOut }, database: {}, firestore: { type: 'firestore' }, functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => callable }));
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class { setCustomParameters() {} },
  signInWithPopup: vi.fn(async () => ({
    user: {
      uid: 'uid-1',
      email: 'teacher@school.example',
      displayName: 'Dana Levi',
      getIdToken: vi.fn(async () => 'token'),
      getIdTokenResult: vi.fn(async () => ({ claims: { role: 'teacher' } })),
    },
  })),
}));
vi.mock('firebase/database', () => ({ ref: vi.fn(), get: vi.fn(async () => ({ exists: () => true })), set: vi.fn(async () => {}) }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(async () => ({ exists: () => true, data: () => ({ role: 'teacher' }) })),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));
vi.mock('@/infrastructure/services/FirebaseSyncService', () => ({
  extractTeacherId: () => 'teacher',
  teacherRecordKey: () => 'teacher_school_example',
}));

import { getDoc } from 'firebase/firestore';
import { executeGoogleSSO, STAFF_SIGNIN_REFUSED_HE, STAFF_HANDSHAKE_FAILED_CODE } from '../AuthService';

beforeEach(() => {
  signOut.mockClear();
  callable.mockReset();
});

describe('Staff sign-in — the server handshake decides (fail-closed)', () => {
  it('a failed syncUserRoles signs the account out and refuses the sign-in', async () => {
    callable.mockRejectedValue(Object.assign(new Error('unavailable'), { code: 'functions/unavailable' }));
    await expect(executeGoogleSSO('teacher')).rejects.toThrow(STAFF_SIGNIN_REFUSED_HE);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('a successful handshake signs the teacher in', async () => {
    callable.mockResolvedValue({ data: { status: 'SUCCESS' } });
    const user = await executeGoogleSSO('teacher');
    expect(user.role).toBe('teacher');
    expect(user.whitelistVerified).toBe(true);
    expect(signOut).not.toHaveBeenCalled();
  });
});

/**
 * Audit access-4: a network failure while reading authorizedTeachers used to
 * be swallowed and read as "not on the list", so a listed teacher went back to
 * the home page with no message. Still nobody is signed in (fail-closed), but
 * the error carries the retry code the sign-in screen shows a retry for.
 */
describe('Staff sign-in — a whitelist that could not be read is not a refusal', () => {
  it('a network failure reading the list signs the account out and is marked for a retry', async () => {
    vi.mocked(getDoc).mockRejectedValueOnce(Object.assign(new Error('client is offline'), { code: 'unavailable' }));
    await expect(executeGoogleSSO('teacher')).rejects.toMatchObject({ code: STAFF_HANDSHAKE_FAILED_CODE });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(callable).not.toHaveBeenCalled();
  });

  it('a read the rules refuse stays a plain refusal, with no retry code', async () => {
    vi.mocked(getDoc).mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    const refusal = await executeGoogleSSO('teacher').catch((e) => e);
    expect(refusal.message).toBe(STAFF_SIGNIN_REFUSED_HE);
    expect(refusal.code).toBeUndefined();
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

/** Audit cross-17; register, "הסרת שמות מורים מהמערכת": the address is the teacher's only identity. */
describe('Staff sign-in — the Google account name is not kept', () => {
  it('the signed-in payload carries no display name', async () => {
    callable.mockResolvedValue({ data: { status: 'SUCCESS' } });
    const user = await executeGoogleSSO('teacher');
    expect(JSON.stringify(user)).not.toContain('Dana Levi');
    expect(user).not.toHaveProperty('displayName');
  });
});
