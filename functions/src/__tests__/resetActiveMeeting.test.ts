import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * מודול 23א §ב.2 + סטייה 10 במרשם: "המפגש שמאופס הוא המפגש שהמורה פתחה (מודול
 * 14); אם אין מפגש פתוח, המפגש שהלומד נמצא בו" … "במפגש 8 גם הרפלקציה … ומוחק
 * רק את מסמכי המפגש הזה ב-Firestore".
 *
 * 1. בלי מפגש פתוח השרת קרא את `activeSessionId` — שדה שרק איפוסים קודמים
 *    כותבים — ולא את `activeSessionNumber`, שמרחב העבודה של הלומד כותב. התוצאה:
 *    מפגש 1, או מפגש ישן. עכשיו: activeSessionNumber, אחריו activeSessionId
 *    לרשומות ישנות, ואם אין אף אחד — סירוב לפני גיבוי או מחיקה.
 * 2. איפוס "המפגש הנוכחי" של לומד במפגש 8 השאיר את מסמך srl_reflections (שהחוקים
 *    מתירים רק ליצור) ואת שיקוף הרפלקציה ברשומה — והרפלקציה החדשה של הילד נדחתה.
 *    יעד "כל הכיתה" (סטייה 20) ממשיך לשמור רפלקציות.
 */

// ── A fake firebase-admin: only what the refusal path may touch ─────────────
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

import {
  backupAndResetSessionData,
  buildActiveSessionResetValues,
  buildResetScope,
  executeResetDeletion,
  VALID_RESET_REASONS,
} from '../exportDriveReport';
import { resolveActiveSessionNumber } from '../resetMeetingTarget';

/** A plain RTDB stand-in for the exported helpers. */
function fakeRtdb(data: Record<string, unknown>) {
  const updates: Array<{ path: string; values: Record<string, unknown> }> = [];
  const db = {
    updates,
    ref: (path: string) => ({
      get: async () => {
        const v = data[path];
        const isObj = v !== null && typeof v === 'object';
        return {
          val: () => (v === undefined ? null : v),
          exists: () => v !== undefined && v !== null,
          hasChildren: () => isObj && Object.keys(v as object).length > 0,
          numChildren: () => (isObj ? Object.keys(v as object).length : 0),
        };
      },
      update: async (values: Record<string, unknown>) => { updates.push({ path, values }); },
      remove: async () => { throw new Error(`unexpected remove of ${path}`); },
    }),
  };
  return db as any;
}

/** A plain Firestore stand-in: collections of { id, data }, recording deletions. */
function fakeFirestore(collections: Record<string, Array<{ id: string; data: Record<string, unknown> }>>) {
  const deleted: string[] = [];
  const makeQuery = (name: string, filter?: (d: Record<string, unknown>) => boolean): any => ({
    where: (field: string, op: string, values: unknown[]) => {
      expect(op).toBe('in');
      return makeQuery(name, (d) => values.includes(d[field] as never));
    },
    get: async () => {
      const docs = (collections[name] || [])
        .filter((d) => !filter || filter(d.data))
        .filter((d) => !deleted.includes(`${name}/${d.id}`))
        .map((d) => ({ id: d.id, data: () => d.data, ref: { path: `${name}/${d.id}` } }));
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
  });
  return {
    deleted,
    collection: (name: string) => makeQuery(name),
    batch: () => {
      const pending: string[] = [];
      return {
        delete: (ref: { path: string }) => { pending.push(ref.path); },
        commit: async () => { deleted.push(...pending); },
      };
    },
  } as any;
}

const teacherRequest = (data: Record<string, unknown>) => ({
  auth: { uid: 'teacher_1', token: { teacher: true, role: 'teacher' } },
  data: { reset_level: 'single_student', reason: VALID_REASON, student_id: '4', ...data },
}) as any;

// The reason list is the server's own; any valid one will do.
const VALID_REASON = VALID_RESET_REASONS[0];

describe('fix 1 — which meeting a single learner\'s "current meeting" reset restarts', () => {
  it('no open meeting: the meeting the learner is in (activeSessionNumber, written by the live workspace)', async () => {
    const rtdb = fakeRtdb({ 'users/students/student_user4/activeSessionNumber': 5 });
    expect(await resolveActiveSessionNumber(rtdb, '4')).toEqual({ sessionNumber: 5, source: 'learner' });
  });

  it('the live field outranks a stale activeSessionId from an earlier reset', async () => {
    const rtdb = fakeRtdb({
      'users/students/student_user4/activeSessionNumber': 5,
      'users/students/student_user4/activeSessionId': 1,
    });
    expect((await resolveActiveSessionNumber(rtdb, '4'))?.sessionNumber).toBe(5);
  });

  it('an older record that carries only activeSessionId still resolves', async () => {
    const rtdb = fakeRtdb({ 'users/students/student_4/activeSessionId': 3 });
    expect((await resolveActiveSessionNumber(rtdb, '4'))?.sessionNumber).toBe(3);
  });

  it('the open class meeting comes first', async () => {
    const rtdb = fakeRtdb({
      active_class_session: { active: true, status: 'active', sessionNumber: 6 },
      'users/students/student_user4/activeSessionNumber': 5,
    });
    expect(await resolveActiveSessionNumber(rtdb, '4')).toEqual({ sessionNumber: 6, source: 'class' });
  });

  it('nothing names a meeting 1–8: null, not meeting 1', async () => {
    expect(await resolveActiveSessionNumber(fakeRtdb({}), '4')).toBeNull();
    const junk = fakeRtdb({
      'users/students/student_user4/activeSessionNumber': 9,
      'users/students/student_user4/activeSessionId': 'x',
    });
    expect(await resolveActiveSessionNumber(junk, '4')).toBeNull();
  });

  it('a reset writes both spellings of the learner\'s meeting', () => {
    const values = buildActiveSessionResetValues(4, { highestCompletedMeeting: 4 });
    expect(values.activeSessionNumber).toBe(4);
    expect(values.activeSessionId).toBe(4);
  });
});

describe('fix 1 — the server refuses before any backup or deletion', () => {
  beforeEach(() => {
    h.rtdbData = {};
    h.rtdbReads = [];
    h.rtdbWrites = [];
    h.firestoreTouched = [];
  });

  it('no open meeting and no meeting on the learner\'s record: failed-precondition, nothing read beyond the lookup', async () => {
    await expect((backupAndResetSessionData as any).run(teacherRequest({ reset_scope: 'active_session' })))
      .rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringContaining('לא נמחקו נתונים') });
    // Only the meeting lookup: the class record and the learner's meeting fields.
    for (const path of h.rtdbReads) {
      expect(path).toMatch(/^(active_class_session|users\/students\/[^/]+\/(activeSessionNumber|activeSessionId|highestCompletedMeeting|completedMeeting\d|session_\d+_completed|session_02_completed))$/);
    }
    expect(h.rtdbWrites).toEqual([]);
    expect(h.firestoreTouched).toEqual([]);
  });

  it('the default scope (no reset_scope sent) is the current meeting, and refuses the same way', async () => {
    await expect((backupAndResetSessionData as any).run(teacherRequest({})))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(h.firestoreTouched).toEqual([]);
  });

  it('a full learner reset needs no meeting and is not refused by this check', async () => {
    // It goes on to the backup, which touches Firestore — the fake throws there.
    await expect((backupAndResetSessionData as any).run(teacherRequest({ reset_scope: 'full_student' })))
      .rejects.not.toMatchObject({ code: 'failed-precondition' });
    expect(h.firestoreTouched.length).toBeGreaterThan(0);
  });
});

describe('fix 2 — a single learner\'s meeting-8 reset clears the reflection', () => {
  const reflectionEntry = (scope: ReturnType<typeof buildResetScope>) => scope.firestore.find((e) => e.collection === 'srl_reflections')!;

  it('meeting 8, one learner: the reflection is deleted by meeting, after being backed up with the learner', () => {
    const entry = reflectionEntry(buildResetScope('single_student', '4', 'active_session', 8, 'student'));
    expect(entry.backupOnly).toBe(false);
    expect(entry.sessionNumber).toBe(8);
    expect(entry.studentValues).toContain(4);
  });

  it('other meetings, the full learner reset and the whole class keep reflections (deviation 20)', () => {
    expect(reflectionEntry(buildResetScope('single_student', '4', 'active_session', 3, 'student')).backupOnly).toBe(true);
    expect(reflectionEntry(buildResetScope('single_student', '4', 'full_student', null, 'student')).backupOnly).toBe(true);
    const classEntry = reflectionEntry(buildResetScope('single_student', '', 'active_session', 8, 'class'));
    expect(classEntry.backupOnly).toBe(true);
    expect(classEntry.sessionNumber).toBeUndefined();
  });

  it('the four mirror fields srlReflection.ts writes are nulled only when asked', () => {
    const cleared = buildActiveSessionResetValues(8, {}, { clearReflection: true });
    for (const key of ['reflection_step', 'reflection_completed', 'persistence_index', 'reflection_updated_at']) {
      expect(cleared[key], key).toBeNull();
      expect(key in buildActiveSessionResetValues(8, {}), key).toBe(false);
    }
    expect(buildActiveSessionResetValues(8, {}).reflections).toBeNull();
  });

  it('end to end: deletes session_08_student_4 only, and clears the mirror on the learner record', async () => {
    const rtdb = fakeRtdb({
      'users/students/student_user4': { reflection_completed: true, reflection_step: 3, persistence_index: 80, reflection_updated_at: 1 },
    });
    const db = fakeFirestore({
      srl_reflections: [
        { id: 'session_08_student_4', data: { student_id: 4, session_id: 'session_08_student_4', session_number: 8 } },
        { id: 'session_08_student_5', data: { student_id: 5, session_id: 'session_08_student_5', session_number: 8 } },
      ],
      sessions: [
        { id: 'session_08_student_4', data: {} },
        { id: 'session_07_student_4', data: {} },
      ],
      telemetry_logs: [{ id: 't1', data: { student_id: 4 } }],
    });
    const counts = await executeResetDeletion(rtdb, db, buildResetScope('single_student', '4', 'active_session', 8, 'student'));
    expect(counts.failures).toEqual([]);
    expect(db.deleted.sort()).toEqual(['sessions/session_08_student_4', 'srl_reflections/session_08_student_4']);
    const update = rtdb.updates.find((u: any) => u.path === 'users/students/student_user4');
    expect(update.values).toMatchObject({
      reflection_step: null, reflection_completed: null, persistence_index: null, reflection_updated_at: null,
      activeSessionNumber: 8, activeSessionId: 8,
    });
  });

  it('end to end, whole class at meeting 8: reflections and the mirror stay', async () => {
    const rtdb = fakeRtdb({ 'users/students/student_user4': { reflection_completed: true } });
    const db = fakeFirestore({
      srl_reflections: [{ id: 'session_08_student_4', data: { student_id: 4, session_number: 8 } }],
      sessions: [{ id: 'session_08_student_4', data: {} }],
    });
    const counts = await executeResetDeletion(rtdb, db, buildResetScope('single_student', '', 'active_session', 8, 'class'));
    expect(counts.failures).toEqual([]);
    expect(db.deleted).toEqual(['sessions/session_08_student_4']);
    const update = rtdb.updates.find((u: any) => u.path === 'users/students/student_user4');
    expect('reflection_completed' in update.values).toBe(false);
  });
});
