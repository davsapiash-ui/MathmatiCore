import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Owner decision 11.10.2026: a staff account marked `readOnly: true` in its
 * authorizedTeachers document sees everything and changes nothing. Not a
 * fourth role — it signs in as teacher or admin — but every staff sign-in
 * carries the claim readOnly: true, and every state-changing function refuses
 * it with "חשבון לצפייה בלבד: אין הרשאה לשנות נתונים.".
 */
const h = vi.hoisted(() => ({
  docs: {} as Record<string, Record<string, unknown>>,
  stamped: [] as Array<{ uid: string; claims: Record<string, unknown> }>,
  dbTouched: 0,
}));

vi.mock('firebase-functions/logger', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, log: () => {} }));

vi.mock('firebase-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase-admin')>();
  const docRef = (collection: string, id: string) => {
    const path = `${collection}/${id}`;
    return {
      path,
      get: async () => { h.dbTouched++; return { exists: path in h.docs, data: () => (h.docs[path] ? { ...h.docs[path] } : undefined) }; },
      set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
        h.docs[path] = opts?.merge ? { ...(h.docs[path] || {}), ...data } : { ...data };
      },
      update: async (data: Record<string, unknown>) => { h.dbTouched++; h.docs[path] = { ...(h.docs[path] || {}), ...data }; },
    };
  };
  const db = {
    collection: (name: string) => ({ doc: (id: string) => docRef(name, id) }),
    runTransaction: async () => { h.dbTouched++; throw new Error('transaction reached'); },
  };
  const firestore = Object.assign(() => db, actual.firestore);
  const database = () => ({ ref: () => ({ get: async () => { h.dbTouched++; return { exists: () => false, val: () => null }; } }) });
  const auth = () => ({
    setCustomUserClaims: async (uid: string, claims: Record<string, unknown>) => { h.stamped.push({ uid, claims }); },
  });
  const admin = { ...actual, apps: [{}], initializeApp: () => ({}), firestore, database, auth };
  return { ...admin, default: admin };
});

import { withReadOnlyFlag, TEACHER_CLAIMS, ADMIN_CLAIMS, GUEST_CLAIMS } from '../roleClaims';
import { assertCanWrite, isReadOnlyToken, READ_ONLY_MESSAGE } from '../callerIdentity';
import { syncUserRoles } from '../syncUserRoles';
import { approveTeacherGate } from '../teacherGate';
import { backupAndResetSessionData } from '../exportDriveReport';
import { createSessionWithServerDeadline } from '../sessionTrigger';
import { sendTeacherAdminMessage } from '../teacherAdminChat';
import { regenerateLearnerAccessCode } from '../learnerAccessCodes';
import { moveLegacyRecordings } from '../moveLegacyRecordings';

const run = (fn: unknown, request: unknown) => (fn as { run: (r: unknown) => Promise<any> }).run(request);

const LECTURER = 'lecturer@example.org';
const OWNER = 'owner@example.org';
const staffAuth = (uid: string, email: string) => ({ uid, token: { email, email_verified: true } });

const RO_TEACHER = { role: 'teacher', teacher: true, admin: false, class_id: 'class_1', roles: ['TEACHER'], readOnly: true };
const RO_ADMIN = { role: 'admin', admin: true, teacher: false, roles: ['ADMIN'], readOnly: true };
const TEACHER = { role: 'teacher', teacher: true, admin: false, class_id: 'class_1', roles: ['TEACHER'] };

beforeEach(() => {
  h.docs = {};
  h.stamped = [];
  h.dbTouched = 0;
});

describe('withReadOnlyFlag', () => {
  it('adds readOnly to a teacher or admin sign-in only', () => {
    expect(withReadOnlyFlag({ ...TEACHER_CLAIMS }, true)).toMatchObject({ role: 'teacher', readOnly: true });
    expect(withReadOnlyFlag({ ...ADMIN_CLAIMS }, true)).toMatchObject({ role: 'admin', readOnly: true });
    expect(withReadOnlyFlag({ ...GUEST_CLAIMS }, true)).not.toHaveProperty('readOnly');
  });

  it('leaves no readOnly claim behind when the flag is off', () => {
    expect(withReadOnlyFlag({ ...TEACHER_CLAIMS, readOnly: true }, false)).not.toHaveProperty('readOnly');
    expect(withReadOnlyFlag({ ...ADMIN_CLAIMS }, false)).not.toHaveProperty('readOnly');
  });
});

describe('syncUserRoles: the readOnly claim', () => {
  it('stamps readOnly on a teacher sign-in of a read-only admin address, on her own uid', async () => {
    h.docs[`authorizedTeachers/${LECTURER}`] = { email: LECTURER, role: 'admin', enabled: true, readOnly: true };
    const res = await run(syncUserRoles, { auth: staffAuth('lecturer-uid', LECTURER), data: { role: 'teacher' } });
    expect(h.stamped).toHaveLength(1);
    expect(h.stamped[0].uid).toBe('lecturer-uid');
    expect(h.stamped[0].claims).toMatchObject({ role: 'teacher', teacher: true, admin: false, readOnly: true });
    expect(res.resolvedUid).toBe('lecturer-uid');
  });

  it('accepts the mark typed as the text "true" (owner, 11.10.2026), and nothing else as text', async () => {
    h.docs[`authorizedTeachers/${LECTURER}`] = { email: LECTURER, role: 'admin', readOnly: 'true' };
    await run(syncUserRoles, { auth: staffAuth('lecturer-uid', LECTURER), data: { role: 'admin' } });
    expect(h.stamped[0].claims).toMatchObject({ role: 'admin', readOnly: true });
    h.stamped.length = 0;
    h.docs[`authorizedTeachers/${LECTURER}`] = { email: LECTURER, role: 'admin', readOnly: 'false' };
    await run(syncUserRoles, { auth: staffAuth('lecturer-uid', LECTURER), data: { role: 'admin' } });
    expect(h.stamped[0].claims).not.toHaveProperty('readOnly');
  });

  it('stamps readOnly on an admin sign-in and never presents it as the shared admin identity', async () => {
    h.docs[`authorizedTeachers/${LECTURER}`] = { email: LECTURER, role: 'admin', enabled: true, readOnly: true };
    const res = await run(syncUserRoles, { auth: staffAuth('lecturer-uid', LECTURER), data: { role: 'admin' } });
    expect(h.stamped[0].uid).toBe('lecturer-uid');
    expect(h.stamped[0].claims).toMatchObject({ role: 'admin', admin: true, teacher: false, readOnly: true });
    expect(res.resolvedUid).toBe('lecturer-uid');
  });

  it("does not touch the owner: his admin sign-in carries no readOnly claim, on his own uid", async () => {
    h.docs[`authorizedTeachers/${LECTURER}`] = { email: LECTURER, role: 'admin', readOnly: true };
    h.docs[`authorizedTeachers/${OWNER}`] = { email: OWNER, role: 'admin' };
    await run(syncUserRoles, { auth: staffAuth('lecturer-uid', LECTURER), data: { role: 'admin' } });
    const res = await run(syncUserRoles, { auth: staffAuth('owner-uid', OWNER), data: { role: 'admin' } });
    const owner = h.stamped.find((s) => s.uid === 'owner-uid');
    expect(owner?.claims).toMatchObject({ role: 'admin', admin: true });
    expect(owner?.claims).not.toHaveProperty('readOnly');
    expect(res.resolvedUid).toBe('admin_unified_identity');
    // Only two stamps, each on its caller's own uid — nothing on a shared identity.
    expect(h.stamped.map((s) => s.uid)).toEqual(['lecturer-uid', 'owner-uid']);
  });

  it('removes the claim on the next sign-in once the flag is taken off', async () => {
    h.docs[`authorizedTeachers/${LECTURER}`] = { email: LECTURER, role: 'admin', readOnly: true };
    await run(syncUserRoles, { auth: staffAuth('lecturer-uid', LECTURER), data: { role: 'teacher' } });
    h.docs[`authorizedTeachers/${LECTURER}`].readOnly = false;
    await run(syncUserRoles, { auth: staffAuth('lecturer-uid', LECTURER), data: { role: 'teacher' } });
    expect(h.stamped[1].claims).not.toHaveProperty('readOnly');
  });

  it('keeps the readOnly flag in the whitelist document (the auto-provision merges)', async () => {
    h.docs[`authorizedTeachers/${LECTURER}`] = { email: LECTURER, role: 'admin', readOnly: true };
    await run(syncUserRoles, { auth: staffAuth('lecturer-uid', LECTURER), data: { role: 'admin' } });
    expect(h.docs[`authorizedTeachers/${LECTURER}`].readOnly).toBe(true);
  });

  it('a plain teacher address gets no readOnly claim', async () => {
    h.docs['authorizedTeachers/t@example.org'] = { email: 't@example.org', role: 'teacher' };
    await run(syncUserRoles, { auth: staffAuth('t-uid', 't@example.org'), data: { role: 'teacher' } });
    expect(h.stamped[0].claims).not.toHaveProperty('readOnly');
  });
});

describe('assertCanWrite', () => {
  it('refuses a readOnly token with the Hebrew message, and passes any other', () => {
    expect(isReadOnlyToken(RO_TEACHER)).toBe(true);
    expect(() => assertCanWrite(RO_TEACHER)).toThrow(READ_ONLY_MESSAGE);
    expect(() => assertCanWrite(RO_ADMIN)).toThrow(READ_ONLY_MESSAGE);
    expect(() => assertCanWrite(TEACHER)).not.toThrow();
    expect(() => assertCanWrite({ student_id: 3 })).not.toThrow();
    expect(() => assertCanWrite({ ...TEACHER, readOnly: 'true' })).not.toThrow();
  });
});

const refused = { code: 'permission-denied', message: READ_ONLY_MESSAGE };

describe('state-changing functions refuse a read-only staff caller', () => {
  it('approveTeacherGate', async () => {
    h.docs['sessions/session_02_student_5'] = { class_id: 'class_1', is_completed: true };
    await expect(run(approveTeacherGate, { auth: { uid: 'ro', token: RO_TEACHER }, data: { studentId: 5, path: 'green_path' } }))
      .rejects.toMatchObject(refused);
    expect(h.docs['sessions/session_02_student_5']).not.toHaveProperty('teacher_gate_approved');
    expect(h.dbTouched).toBe(0);
  });

  it('backupAndResetSessionData, at every level', async () => {
    for (const reset_level of ['alerts', 'single_student', 'system']) {
      await expect(run(backupAndResetSessionData, {
        auth: { uid: 'ro', token: RO_TEACHER },
        data: { reset_level, reason: 'TECHNICAL_ISSUE', class_id: 'class_1', student_id: 3 },
      })).rejects.toMatchObject(refused);
    }
    expect(h.dbTouched).toBe(0);
  });

  it('createSessionWithServerDeadline', async () => {
    await expect(run(createSessionWithServerDeadline, {
      auth: { uid: 'ro', token: RO_TEACHER },
      data: { student_id: 3, class_id: 'class_1', session_number: 3 },
    })).rejects.toMatchObject(refused);
    expect(h.dbTouched).toBe(0);
  });

  it('sendTeacherAdminMessage (teacher and admin side)', async () => {
    for (const token of [RO_TEACHER, RO_ADMIN]) {
      await expect(run(sendTeacherAdminMessage, { auth: { uid: 'ro', token }, data: { receiver_id: 'admin', message_body: 'שלום' } }))
        .rejects.toMatchObject(refused);
    }
  });

  it('regenerateLearnerAccessCode', async () => {
    await expect(run(regenerateLearnerAccessCode, { auth: { uid: 'ro', token: RO_TEACHER }, data: { studentId: 3 } }))
      .rejects.toMatchObject(refused);
    expect(h.dbTouched).toBe(0);
  });

  it('moveLegacyRecordings', async () => {
    await expect(run(moveLegacyRecordings, { auth: { uid: 'ro', token: RO_TEACHER }, data: { class_id: 'class_1' } }))
      .rejects.toMatchObject(refused);
    expect(h.dbTouched).toBe(0);
  });
});

describe('a normal teacher still passes the guard', () => {
  it('approveTeacherGate reaches the session document', async () => {
    await expect(run(approveTeacherGate, { auth: { uid: 't', token: TEACHER }, data: { studentId: 5, path: 'green_path' } }))
      .rejects.not.toMatchObject({ message: READ_ONLY_MESSAGE });
    expect(h.dbTouched).toBeGreaterThan(0);
  });

  it('backupAndResetSessionData goes on to validate the request', async () => {
    await expect(run(backupAndResetSessionData, { auth: { uid: 't', token: TEACHER }, data: { reset_level: 'nonsense', class_id: 'class_1' } }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
