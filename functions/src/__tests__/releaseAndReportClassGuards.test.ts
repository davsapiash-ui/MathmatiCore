import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Audit 11.10.2026.
 *  - releaseStudentSession removes every claim of the caller. From a browser
 *    that holds a staff (Google) session it stripped the teacher's own access;
 *    only an anonymous (learner) session is released.
 *  - generatePedagogicalReportPDF took class_id from the request into the
 *    Storage path without checking it against the caller's class, the check
 *    the class report and the download URL already make.
 */
const h = vi.hoisted(() => ({ cleared: [] as Array<{ uid: string; claims: unknown }> }));

vi.mock('firebase-admin', () => {
  const admin = {
    apps: [{}],
    initializeApp: () => ({}),
    auth: () => ({
      setCustomUserClaims: async (uid: string, claims: unknown) => { h.cleared.push({ uid, claims }); },
    }),
  };
  return { ...admin, default: admin };
});

import { releaseStudentSession } from '../authenticateStudentSession';
import { generatePedagogicalReportPDF } from '../pedagogicalReport';
import { syncUserRoles } from '../syncUserRoles';

const run = (fn: unknown, request: unknown) => (fn as { run: (r: unknown) => Promise<any> }).run(request);

describe('releaseStudentSession', () => {
  beforeEach(() => { h.cleared.length = 0; });

  it('releases an anonymous learner session', async () => {
    const res = await run(releaseStudentSession, {
      auth: { uid: 'anon-1', token: { firebase: { sign_in_provider: 'anonymous' } } },
      data: {},
    });
    expect(res).toEqual({ released: true });
    expect(h.cleared).toEqual([{ uid: 'anon-1', claims: {} }]);
  });

  it('leaves a staff (Google) session untouched', async () => {
    const res = await run(releaseStudentSession, {
      auth: { uid: 'teacher-1', token: { firebase: { sign_in_provider: 'google.com' }, role: 'teacher', teacher: true } },
      data: {},
    });
    expect(res).toEqual({ released: false });
    expect(h.cleared).toEqual([]);
  });

  it('still refuses a caller with no session', async () => {
    await expect(run(releaseStudentSession, { data: {} })).rejects.toMatchObject({ code: 'unauthenticated' });
  });
});

describe('generatePedagogicalReportPDF: class_id', () => {
  const teacher = (token: Record<string, unknown>, data: Record<string, unknown>) => ({
    auth: { uid: 't', token: { role: 'teacher', roles: ['TEACHER'], teacher: true, ...token } },
    data: { sessionId: 'session_3_student_student_user4', sessionNumber: 3, studentId: 4, ...data },
  });

  it('refuses a class id that is not a plain id (it goes into the Storage path)', async () => {
    await expect(run(generatePedagogicalReportPDF, teacher({ class_id: 'class_1' }, { classId: '../other/x' })))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(run(generatePedagogicalReportPDF, teacher({}, { classId: { $ne: 1 } })))
      .rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it("refuses another class than the caller's own", async () => {
    await expect(run(generatePedagogicalReportPDF, teacher({ class_id: 'class_1' }, { classId: 'class_2' })))
      .rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('syncUserRoles: the e-mail must be verified', () => {
  it('refuses a token whose address the provider has not verified', async () => {
    await expect(run(syncUserRoles, { auth: { uid: 'u', token: { email: 'someone@example.com', email_verified: false } }, data: {} }))
      .rejects.toMatchObject({ code: 'permission-denied' });
    await expect(run(syncUserRoles, { auth: { uid: 'u', token: { email: 'someone@example.com' } }, data: {} }))
      .rejects.toMatchObject({ code: 'permission-denied' });
  });
});
