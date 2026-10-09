import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * PRD Module 20 §ב: "עם אישור המורה, השרת כותב את האישור למסמך המפגש ומשקף
 * אותו באותה פעולה לרשומת הלומד". The dashboard's approval is one call to the
 * approveTeacherGate Cloud Function; the client writes neither Firestore nor
 * RTDB itself, and every refusal keeps the dashboard's existing error message.
 */
const h = vi.hoisted(() => ({
  calls: [] as Array<{ name: string; data: unknown }>,
  result: null as null | { reject?: unknown },
}));

vi.mock('@/infrastructure/firebase', () => ({ functions: { name: 'functions' }, firestore: {}, database: {} }));
vi.mock('firebase/functions', () => ({
  httpsCallable: (_fns: unknown, name: string) => async (data: unknown) => {
    h.calls.push({ name, data });
    if (h.result?.reject) throw h.result.reject;
    return { data: { ok: true } };
  },
}));
const firestoreWrites = vi.fn();
const rtdbWrites = vi.fn();
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), updateDoc: firestoreWrites, setDoc: firestoreWrites }));
vi.mock('firebase/database', () => ({ ref: vi.fn(), update: rtdbWrites, set: rtdbWrites }));

import { approveTeacherGate } from '../teacherGate';

beforeEach(() => {
  h.calls = [];
  h.result = null;
  firestoreWrites.mockClear();
  rtdbWrites.mockClear();
});

const httpsError = (code: string, message: string, details?: unknown) => Object.assign(new Error(message), { code: `functions/${code}`, details });

describe('Module 20 — the approval is the server\'s write', () => {
  it('one call to approveTeacherGate with the learner and the path; no client write', async () => {
    const res = await approveTeacherGate('student_user5', 'remediation_path', 'teacher_uid');
    expect(res).toEqual({ ok: true });
    expect(h.calls).toEqual([{ name: 'approveTeacherGate', data: { studentId: 'student_user5', path: 'remediation_path' } }]);
    expect(firestoreWrites).not.toHaveBeenCalled();
    expect(rtdbWrites).not.toHaveBeenCalled();
  });

  it('no session document → the existing "missing" message', async () => {
    h.result = { reject: httpsError('failed-precondition', 'missing_session_doc', { reason: 'missing_session_doc' }) };
    const res = await approveTeacherGate('student_user5', 'green_path', null);
    expect(res).toMatchObject({ ok: false, reason: 'missing_session_doc' });
    expect((res as { message: string }).message).toContain('לא נמצא מסמך אבחון');
    expect((res as { message: string }).message).toContain('תלמיד 5');
  });

  it('meeting 2 not completed → the existing "not completed" message', async () => {
    h.result = { reject: httpsError('failed-precondition', 'not_completed', { reason: 'not_completed' }) };
    const res = await approveTeacherGate('student_user5', 'green_path', null);
    expect(res).toMatchObject({ ok: false, reason: 'not_completed' });
    expect((res as { message: string }).message).toContain('טרם השלים את כל משימות החובה');
  });

  it('the mirror failed → the server says the approval is saved and to press again', async () => {
    const msg = 'האישור נשמר, אבל שחרור מסך התלמיד לא הצליח כרגע. לחצו שוב על האישור כדי לשחרר אותו.';
    h.result = { reject: httpsError('unavailable', msg, { reason: 'mirror_failed' }) };
    expect(await approveTeacherGate('student_user5', 'green_path', null)).toEqual({ ok: false, reason: 'write_failed', message: msg });
  });

  it('a network failure or anything unexpected → the existing write error', async () => {
    h.result = { reject: httpsError('internal', 'internal') };
    expect(await approveTeacherGate('student_user5', 'green_path', null)).toEqual({
      ok: false, reason: 'write_failed', message: 'שגיאה בכתיבת האישור לשרת.',
    });
  });
});
