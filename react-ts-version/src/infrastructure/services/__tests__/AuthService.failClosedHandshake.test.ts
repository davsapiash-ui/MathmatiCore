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
      displayName: null,
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

import { executeGoogleSSO, STAFF_SIGNIN_REFUSED_HE } from '../AuthService';

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
