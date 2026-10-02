import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Owner, 2.10.2026: "תתקן ותפטור כבר עכשיו את הבאג של 4".
 *
 * A single learner's "המפגש הנוכחי" reset (PRD 23א §ב.2, register deviation 10)
 * took the class's meeting from `active_class_session/sessionNumber` without
 * asking whether that meeting was still open. A meeting that ended by time
 * keeps its number in the record, so the reset could restart a meeting the
 * learner had already finished — wiping its completion, and in meeting 2 the
 * path in "שלב החלוקה למסלולים" — instead of the meeting the learner is in.
 * The request's own number came first, too, so the server reset whatever the
 * client sent.
 *
 * Now: the class's meeting only while it is open (classSessionLive.ts, the rule
 * every client applies), else the meeting the learner is in; a request that
 * names another meeting than the server's is refused, so what is reset is what
 * the dialog named; and the whole-class restart uses the same liveness rule.
 */

const h = vi.hoisted(() => ({
  rtdbData: {} as Record<string, unknown>,
  rtdbReads: [] as string[],
  rtdbWrites: [] as string[],
  firestoreTouched: [] as string[],
}));

vi.mock('firebase-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase-admin')>();
  const database = () => ({
    ref: (path: string) => ({
      get: async () => {
        h.rtdbReads.push(path);
        const v = h.rtdbData[path];
        return { val: () => (v === undefined ? null : v), exists: () => v !== undefined };
      },
      set: async () => { h.rtdbWrites.push(`set ${path}`); },
      update: async () => { h.rtdbWrites.push(`update ${path}`); },
      remove: async () => { h.rtdbWrites.push(`remove ${path}`); },
    }),
  });
  const firestore = Object.assign(
    () => ({
      collection: (name: string) => {
        h.firestoreTouched.push(name);
        throw new Error(`Firestore touched: ${name}`);
      },
    }),
    actual.firestore
  );
  return { ...actual, default: { ...actual, database, firestore }, database, firestore };
});

import { backupAndResetSessionData, VALID_RESET_REASONS } from '../exportDriveReport';
import { learnerMeeting, resetMeetingTarget, resolveActiveSessionNumber, resolveClassSessionNumber } from '../resetMeetingTarget';
import { isClassSessionOpenAt, SESSION_HARD_CAP_MS, TEACHER_DISCONNECT_GRACE_MS } from '../classSessionLive';
import { SESSION_HARD_CAP_MS as M2_CAP, TEACHER_DISCONNECT_GRACE_MS as M2_GRACE } from '../meeting2Close';

const NOW = 1_800_000_000_000;
const MIN = 60 * 1000;

function fakeRtdb(data: Record<string, unknown>) {
  return {
    ref: (path: string) => ({
      get: async () => {
        const v = data[path];
        return { val: () => (v === undefined ? null : v), exists: () => v !== undefined && v !== null };
      },
    }),
  } as any;
}

const open = (n: number, extra: Record<string, unknown> = {}) => ({ active: true, status: 'active', sessionNumber: n, startedAt: NOW - 10 * MIN, ...extra });

describe('the class meeting counts only while it is open now', () => {
  it('one liveness rule, shared with meeting 2\'s close', () => {
    expect(M2_CAP).toBe(SESSION_HARD_CAP_MS);
    expect(M2_GRACE).toBe(TEACHER_DISCONNECT_GRACE_MS);
    expect(SESSION_HARD_CAP_MS).toBe(45 * MIN);
    expect(TEACHER_DISCONNECT_GRACE_MS).toBe(15 * MIN);
  });

  it('open, and paused, are open', () => {
    expect(isClassSessionOpenAt(open(3), NOW)).toBe(true);
    expect(isClassSessionOpenAt(open(3, { status: 'paused' }), NOW)).toBe(true);
  });

  it('closed, past the 45 minutes, or the teacher away past 15 minutes: not open', () => {
    expect(isClassSessionOpenAt({ active: false, status: 'closed', sessionNumber: 3 }, NOW)).toBe(false);
    expect(isClassSessionOpenAt(open(3, { startedAt: NOW - 45 * MIN }), NOW)).toBe(false);
    expect(isClassSessionOpenAt(open(3, { teacherDisconnectedAt: NOW - 15 * MIN - 1 }), NOW)).toBe(false);
    // Inside the window it is still open, as on every client.
    expect(isClassSessionOpenAt(open(3, { teacherDisconnectedAt: NOW - 15 * MIN }), NOW)).toBe(true);
  });
});

describe('which meeting a single learner\'s "current meeting" reset restarts', () => {
  it('an open meeting: that meeting', async () => {
    const rtdb = fakeRtdb({
      active_class_session: open(5),
      'users/students/student_user4/activeSessionNumber': 4,
    });
    expect(await resolveActiveSessionNumber(rtdb, '4', NOW)).toEqual({ sessionNumber: 5, source: 'class' });
  });

  it('a meeting that ended by time still says active with its number: the learner\'s own meeting', async () => {
    for (const stale of [
      open(3, { startedAt: NOW - 50 * MIN }),
      open(3, { teacherDisconnectedAt: NOW - 20 * MIN }),
      { active: false, status: 'closed', sessionNumber: 3 },
    ]) {
      const rtdb = fakeRtdb({
        active_class_session: stale,
        'users/students/student_user4/activeSessionNumber': 4,
        'users/students/student_user4/highestCompletedMeeting': 3,
      });
      expect(await resolveActiveSessionNumber(rtdb, '4', NOW)).toEqual({ sessionNumber: 4, source: 'learner' });
    }
  });

  it('the learner is in a meeting not yet finished: that meeting', () => {
    expect(learnerMeeting([{ activeSessionNumber: 4, highestCompletedMeeting: 3 }])).toBe(4);
  });

  it('no meeting open and the learner finished the last meeting entered: refused, not reset (between meetings)', () => {
    // (A) finished meeting 4, the teacher closed it: the field still names 4.
    expect(resetMeetingTarget(null, [{ activeSessionNumber: 4, completedMeeting4: true, highestCompletedMeeting: 4 }], NOW))
      .toEqual({ sessionNumber: 4, source: 'learner', finished: true });
    // (B) finished meeting 2: waiting in "שלב החלוקה למסלולים", or already approved.
    expect(resetMeetingTarget(null, [{ activeSessionNumber: 2, session_02_completed: true }], NOW)?.finished).toBe(true);
    expect(resetMeetingTarget(null, [{ activeSessionNumber: 2, completedMeeting2: true, teacher_gate_approved: true, highestCompletedMeeting: 2 }], NOW)?.finished).toBe(true);
    // A meeting reopened earlier than the learner's furthest, and closed again: finished too.
    expect(resetMeetingTarget(null, [{ activeSessionNumber: 2, highestCompletedMeeting: 5 }], NOW)?.finished).toBe(true);
    // In the middle of meeting 4: reset.
    expect(resetMeetingTarget(null, [{ activeSessionNumber: 4, highestCompletedMeeting: 3 }], NOW)).toEqual({ sessionNumber: 4, source: 'learner' });
  });

  it('a meeting the class has open is reset even when this learner finished it (the teacher restarts it on purpose)', () => {
    expect(resetMeetingTarget(open(4), [{ activeSessionNumber: 4, completedMeeting4: true, highestCompletedMeeting: 4 }], NOW))
      .toEqual({ sessionNumber: 4, source: 'class' });
  });

  it('the old activeSessionId behind a meeting the learner completed later is stale, not where the learner is', () => {
    expect(learnerMeeting([{ activeSessionId: 2, highestCompletedMeeting: 5 }])).toBeNull();
    expect(learnerMeeting([{}, { activeSessionId: 2 }, {}, { highestCompletedMeeting: 5 }])).toBeNull();
    expect(learnerMeeting([{ activeSessionId: 5, highestCompletedMeeting: 5 }])).toBe(5);
    expect(learnerMeeting([{ activeSessionId: 6, highestCompletedMeeting: 5 }])).toBe(6);
  });

  it('nothing open and nothing on the record: null', () => {
    expect(resetMeetingTarget({ active: false, sessionNumber: 3 }, [{}, {}], NOW)).toBeNull();
  });
});

describe('the whole class: the same liveness rule', () => {
  it('open: the meeting; ended by time or closed: null', async () => {
    expect(await resolveClassSessionNumber(fakeRtdb({ active_class_session: open(6) }), NOW)).toBe(6);
    expect(await resolveClassSessionNumber(fakeRtdb({ active_class_session: open(6, { startedAt: NOW - 46 * MIN }) }), NOW)).toBeNull();
    expect(await resolveClassSessionNumber(fakeRtdb({ active_class_session: { active: false, sessionNumber: 6 } }), NOW)).toBeNull();
  });
});

const VALID_REASON = VALID_RESET_REASONS[0];
const teacherRequest = (data: Record<string, unknown>) => ({
  auth: { uid: 'teacher_1', token: { teacher: true, role: 'teacher' } },
  data: { reset_level: 'single_student', reason: VALID_REASON, class_id: 'class_1', ...data },
}) as any;
const run = (data: Record<string, unknown>) => (backupAndResetSessionData as any).run(teacherRequest(data));

describe('the callable refuses before any backup or deletion', () => {
  beforeEach(() => {
    h.rtdbData = {};
    h.rtdbReads = [];
    h.rtdbWrites = [];
    h.firestoreTouched = [];
  });

  const nothingDeleted = () => {
    expect(h.rtdbWrites).toEqual([]);
    expect(h.firestoreTouched).toEqual([]);
  };

  it('no meeting can be determined: refused, nothing deleted', async () => {
    h.rtdbData = { active_class_session: { active: false, status: 'closed', sessionNumber: 3 } };
    await expect(run({ student_id: '4', reset_scope: 'active_session' }))
      .rejects.toMatchObject({ code: 'failed-precondition', message: 'אין מפגש פתוח לכיתה, ולא ידוע באיזה מפגש התלמיד נמצא, ולכן אין מפגש לאפס. לא נמחקו נתונים.' });
    nothingDeleted();
  });

  it('the dialog named one meeting and the server finds another: refused, nothing deleted', async () => {
    h.rtdbData = {
      active_class_session: { active: false, status: 'closed', sessionNumber: null },
      'users/students/student_user4/activeSessionNumber': 4,
    };
    await expect(run({ student_id: '4', reset_scope: 'active_session', session_number: 3 }))
      .rejects.toMatchObject({
        code: 'failed-precondition',
        message: 'חלון האישור הציג את מפגש 3, אבל המפגש שיאופס עכשיו הוא מפגש 4: בינתיים מפגש נפתח או נסגר לכיתה, או שהמפגש נסגר מעצמו כשנגמר הזמן שלו. סגרו את החלון ופתחו אותו שוב. לא נמחקו נתונים.',
      });
    nothingDeleted();
  });

  it('the stale class number is not used: the learner\'s meeting goes on to the backup', async () => {
    h.rtdbData = {
      active_class_session: { active: true, status: 'active', sessionNumber: 3, startedAt: Date.now() - 50 * MIN },
      'users/students/student_user4/activeSessionNumber': 4,
    };
    // Past the meeting check, the backup reads Firestore — the fake throws there.
    await expect(run({ student_id: '4', reset_scope: 'active_session', session_number: 4 }))
      .rejects.not.toMatchObject({ code: 'failed-precondition' });
    expect(h.firestoreTouched.length).toBeGreaterThan(0);
  });

  it('(A) the learner finished meeting 4 and the teacher closed it: refused, nothing deleted', async () => {
    h.rtdbData = {
      active_class_session: { active: false, status: 'closed', sessionNumber: null },
      'users/students/student_user4/activeSessionNumber': 4,
      'users/students/student_user4/highestCompletedMeeting': 4,
      'users/students/student_user4/completedMeeting4': true,
    };
    await expect(run({ student_id: '4', reset_scope: 'active_session', session_number: 4 }))
      .rejects.toMatchObject({
        code: 'failed-precondition',
        message: 'תלמיד 4 סיים את מפגש 4, ועכשיו הוא לא באמצע מפגש. כדי לאפס מפגש שהסתיים, פתחו אותו לכיתה ואפסו אותו בזמן שהוא פתוח, או בחרו איפוס מוחלט של התלמיד. לא נמחקו נתונים.',
      });
    nothingDeleted();
  });

  it('(B) the learner finished meeting 2 and waits in "שלב החלוקה למסלולים" (or is approved): refused, nothing deleted', async () => {
    for (const extra of [{}, { 'users/students/student_user4/teacher_gate_approved': true }]) {
      h.rtdbData = {
        'users/students/student_user4/activeSessionNumber': 2,
        'users/students/student_user4/session_02_completed': true,
        ...extra,
      };
      await expect(run({ student_id: '4', reset_scope: 'active_session' }))
        .rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringContaining('תלמיד 4 סיים את מפגש 2, ועכשיו הוא לא באמצע מפגש.') });
      nothingDeleted();
    }
  });

  it('the full reset of that learner is still allowed', async () => {
    h.rtdbData = {
      'users/students/student_user4/activeSessionNumber': 4,
      'users/students/student_user4/completedMeeting4': true,
    };
    await expect(run({ student_id: '4', reset_scope: 'full_student' }))
      .rejects.not.toMatchObject({ code: 'failed-precondition' });
    expect(h.firestoreTouched.length).toBeGreaterThan(0);
  });

  it('the whole class, meeting closed — even when the request names it: refused, nothing deleted', async () => {
    for (const rec of [
      { active: false, status: 'closed', sessionNumber: null },
      { active: true, status: 'active', sessionNumber: 3, startedAt: Date.now() - 50 * MIN },
    ]) {
      h.rtdbData = { active_class_session: rec };
      await expect(run({ reset_target: 'class', reset_scope: 'active_session', session_number: 3 }))
        .rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringContaining('אין מפגש פתוח לכיתה') });
      nothingDeleted();
    }
  });
});
