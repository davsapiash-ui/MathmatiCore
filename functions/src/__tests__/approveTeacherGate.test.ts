import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * PRD Module 20 §ב: "עם אישור המורה, השרת כותב את האישור למסמך המפגש ומשקף
 * אותו באותה פעולה לרשומת הלומד ב-Realtime Database … ההשתקפות ניתנת לכתיבה
 * על ידי צוות בלבד" and "בלחיצה, השרת מעדכן teacher_gate_approved = true".
 */
const h = vi.hoisted(() => ({
  docs: {} as Record<string, Record<string, any>>,
  rtdb: {} as Record<string, any>,
  rtdbUpdates: [] as Array<Record<string, unknown>>,
  failRtdb: false,
}));

vi.mock('firebase-functions/logger', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, log: () => {} }));

vi.mock('firebase-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase-admin')>();
  const docRef = (collection: string, id: string) => {
    const path = `${collection}/${id}`;
    return {
      path,
      get: async () => ({ exists: path in h.docs, data: () => (h.docs[path] ? { ...h.docs[path] } : undefined) }),
      update: async (data: Record<string, any>) => { h.docs[path] = { ...(h.docs[path] || {}), ...data }; },
    };
  };
  const db = {
    collection: (name: string) => ({ doc: (id: string) => docRef(name, id) }),
    runTransaction: async (fn: (tx: any) => Promise<unknown>) => fn({
      get: (ref: any) => ref.get(),
      update: (ref: any, data: any) => { void ref.update(data); },
    }),
  };
  const firestore = Object.assign(() => db, actual.firestore);
  const database = () => ({
    ref: (path = '') => ({
      get: async () => ({ exists: () => path in h.rtdb, val: () => h.rtdb[path] ?? null }),
      update: async (values: Record<string, unknown>) => {
        if (h.failRtdb) throw new Error('network');
        h.rtdbUpdates.push(values);
        for (const [k, v] of Object.entries(values)) {
          const base = k.split('/').slice(0, 3).join('/');
          const field = k.split('/').slice(3).join('/');
          h.rtdb[base] = { ...(h.rtdb[base] || {}), [field]: v };
        }
      },
    }),
  });
  return { ...actual, default: { ...actual, firestore, database }, firestore, database };
});

import { approveTeacherGate, gateLearnerNumber } from '../teacherGate';

const TEACHER = { role: 'teacher', teacher: true, class_id: 'class_1' };
const call = (data: unknown, token: Record<string, unknown> | null, uid = 'teacher_uid') =>
  (approveTeacherGate as any).run({ data, auth: token ? { uid, token } : undefined, rawRequest: {} });

const completedDoc = (n: number, extra: Record<string, any> = {}) => {
  h.docs[`sessions/session_02_student_${n}`] = {
    session_id: `session_02_student_${n}`, class_id: 'class_1', session_number: 2, is_completed: true,
    teacher_gate_approved: false, teacher_selected_path: null, gate_approved_at: null, gate_approved_by: null,
    matrix_recommended_path: 'remediation_path', ...extra,
  };
};

beforeEach(() => {
  h.docs = {};
  h.rtdb = {};
  h.rtdbUpdates = [];
  h.failRtdb = false;
});

describe('approveTeacherGate — who may call it', () => {
  it('refuses an unauthenticated call, a learner and an admin sign-in', async () => {
    completedDoc(5);
    await expect(call({ studentId: 'student_user5', path: 'green_path' }, null)).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(call({ studentId: 'student_user5', path: 'green_path' }, { student_id: 5 })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(call({ studentId: 'student_user5', path: 'green_path' }, { role: 'admin', admin: true })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(h.docs['sessions/session_02_student_5'].teacher_gate_approved).toBe(false);
    expect(h.rtdbUpdates).toEqual([]);
  });

  it('refuses a teacher of another class', async () => {
    completedDoc(5);
    await expect(call({ studentId: 5, path: 'green_path' }, { ...TEACHER, class_id: 'class_2' })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(h.docs['sessions/session_02_student_5'].teacher_gate_approved).toBe(false);
    expect(h.rtdbUpdates).toEqual([]);
  });

  it('refuses a learner outside 1–12 and a path that is not one of the two', async () => {
    await expect(call({ studentId: 'student_user13', path: 'green_path' }, TEACHER)).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(call({ studentId: 'x', path: 'green_path' }, TEACHER)).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(call({ studentId: 5, path: 'yellow' }, TEACHER)).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(gateLearnerNumber('student_user12')).toBe(12);
    expect(gateLearnerNumber('student_3')).toBe(3);
    expect(gateLearnerNumber(0)).toBeNull();
  });
});

describe('approveTeacherGate — what it refuses to approve', () => {
  it('no session document: nothing is synthesised', async () => {
    await expect(call({ studentId: 'student_user5', path: 'green_path' }, TEACHER))
      .rejects.toMatchObject({ code: 'failed-precondition', details: { reason: 'missing_session_doc' } });
    expect(h.docs).toEqual({});
    expect(h.rtdbUpdates).toEqual([]);
  });

  it('meeting 2 not completed', async () => {
    completedDoc(5, { is_completed: false });
    await expect(call({ studentId: 'student_user5', path: 'green_path' }, TEACHER))
      .rejects.toMatchObject({ code: 'failed-precondition', details: { reason: 'not_completed' } });
    expect(h.docs['sessions/session_02_student_5'].teacher_gate_approved).toBe(false);
    expect(h.rtdbUpdates).toEqual([]);
  });
});

describe('approveTeacherGate — one press writes both sides', () => {
  it('the session document: exactly the four approval fields', async () => {
    completedDoc(5);
    const res = await call({ studentId: 'student_user5', path: 'remediation_path' }, TEACHER);
    expect(res).toEqual({ ok: true, studentId: 5, path: 'remediation_path' });
    const doc = h.docs['sessions/session_02_student_5'];
    expect(doc).toMatchObject({ teacher_gate_approved: true, teacher_selected_path: 'remediation_path', gate_approved_by: 'teacher_uid' });
    expect(typeof doc.gate_approved_at).toBe('number');
    // The recommendation and the score are not the approval's.
    expect(doc.matrix_recommended_path).toBe('remediation_path');
  });

  it('the mirror on the learner record the route guard reads, in one update', async () => {
    completedDoc(5);
    await call({ studentId: 'student_user5', path: 'remediation_path' }, TEACHER);
    expect(h.rtdbUpdates).toHaveLength(1);
    expect(h.rtdb['users/students/student_user5']).toMatchObject({
      teacher_gate_approved: true,
      routeStatus: 'APPROVED',
      teacher_selected_path: 'remediation_path',
      // The task engine's own key (Module 26).
      pedagogicalPath: 'remediation_path',
      gate_approved_by: 'teacher_uid',
    });
    expect(h.rtdb['users/students/student_user5'].gate_approved_at).toBe(h.docs['sessions/session_02_student_5'].gate_approved_at);
  });

  it('an older alias of the record is mirrored only when it exists — none is created', async () => {
    completedDoc(5);
    h.rtdb['users/students/student_5'] = { isOnline: false };
    await call({ studentId: 'student_user5', path: 'green_path' }, TEACHER);
    expect(h.rtdb['users/students/student_5']).toMatchObject({ teacher_gate_approved: true, routeStatus: 'APPROVED' });
    expect(h.rtdb['users/students/5']).toBeUndefined();
  });

  it('a failed mirror is an error the dashboard shows; pressing again releases the learner', async () => {
    completedDoc(5);
    h.failRtdb = true;
    await expect(call({ studentId: 'student_user5', path: 'green_path' }, TEACHER))
      .rejects.toMatchObject({ code: 'unavailable', details: { reason: 'mirror_failed' } });
    expect(h.docs['sessions/session_02_student_5'].teacher_gate_approved).toBe(true);

    h.failRtdb = false;
    await call({ studentId: 'student_user5', path: 'green_path' }, TEACHER);
    expect(h.rtdb['users/students/student_user5']).toMatchObject({ teacher_gate_approved: true, routeStatus: 'APPROVED' });
  });

  it('the path of an approved learner can be changed', async () => {
    completedDoc(5, { teacher_gate_approved: true, teacher_selected_path: 'green_path' });
    await call({ studentId: 'student_user5', path: 'remediation_path' }, TEACHER);
    expect(h.docs['sessions/session_02_student_5'].teacher_selected_path).toBe('remediation_path');
    expect(h.rtdb['users/students/student_user5'].pedagogicalPath).toBe('remediation_path');
  });
});
