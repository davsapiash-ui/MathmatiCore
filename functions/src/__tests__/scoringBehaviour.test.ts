import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Behaviour tests for the scoring writes (review of claude/code-scoring-reports,
 * B1, S1, S4, S5, S10), driven against an in-memory firebase-admin:
 *
 *  - B1: a completion mark of meeting 3–8 whose run does not show the
 *    completion yet writes no session document; the late event that shows it
 *    completes the meeting from the mark.
 *  - S1: the re-score writes only over the document it computed against.
 *  - S4: a second catch-up round keeps the score before the first one.
 *  - S5: after a reset, no previous score of the erased run lands on the
 *    catch-up record.
 *  - the class-report link callable: teacher of the class only.
 */

const h = vi.hoisted(() => ({
  docs: {} as Record<string, Record<string, any>>,      // "collection/id" → data
  createTimes: {} as Record<string, number>,            // "collection/id" → the server's write time
  writes: [] as Array<{ op: 'set' | 'update'; path: string; data: Record<string, any> }>,
  rtdb: {} as Record<string, any>,                       // nested tree
  beforeTx: null as null | (() => void),                 // runs once, before the next transaction
}));

vi.mock('firebase-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase-admin')>();

  const docRef = (collection: string, id: string): any => {
    const path = `${collection}/${id}`;
    return {
      id,
      path,
      get: async () => ({ exists: path in h.docs, id, data: () => (h.docs[path] ? { ...h.docs[path] } : undefined) }),
      set: async (data: Record<string, any>) => { h.writes.push({ op: 'set', path, data }); h.docs[path] = { ...data }; },
      update: async (data: Record<string, any>) => {
        if (!(path in h.docs)) throw new Error(`NOT_FOUND ${path}`);
        h.writes.push({ op: 'update', path, data });
        h.docs[path] = { ...h.docs[path], ...data };
      },
    };
  };

  const db = {
    collection: (name: string) => ({
      doc: (id: string) => docRef(name, id),
      where: (field: string, op: string, value: unknown) => ({
        get: async () => {
          const matches = (d: Record<string, any>) =>
            op === 'array-contains' ? Array.isArray(d[field]) && d[field].includes(value) : d[field] === value;
          const docs = Object.entries(h.docs)
            .filter(([p, d]) => p.startsWith(`${name}/`) && matches(d))
            .map(([p, d]) => ({
              id: p.slice(name.length + 1),
              data: () => ({ ...d }),
              createTime: p in h.createTimes ? { toMillis: () => h.createTimes[p] } : undefined,
            }));
          return { docs, empty: docs.length === 0, size: docs.length };
        },
      }),
    }),
    runTransaction: async (fn: (tx: any) => Promise<unknown>) => {
      const hook = h.beforeTx;
      h.beforeTx = null;
      hook?.();
      return fn({
        get: (ref: any) => ref.get(),
        set: (ref: any, data: any) => { void ref.set(data); },
        update: (ref: any, data: any) => { void ref.update(data); },
      });
    },
  };
  const firestore = Object.assign(() => db, actual.firestore);

  const rtdbRef = (path: string) => ({
    get: async () => {
      const v = path.split('/').reduce<any>((node, key) => (node == null ? undefined : node[key]), h.rtdb);
      return { val: () => (v === undefined ? null : v), exists: () => v !== undefined };
    },
    update: async (values: Record<string, unknown>) => {
      const parts = path.split('/');
      let node = h.rtdb;
      for (const p of parts) node = node[p] = node[p] ?? {};
      Object.assign(node, values);
    },
  });
  const database = () => ({ ref: rtdbRef });

  const storage = () => ({
    bucket: () => ({
      file: (p: string) => ({ getSignedUrl: async () => [`https://signed.example/${p}`] }),
    }),
  });

  return { ...actual, default: { ...actual, firestore, database, storage }, firestore, database, storage };
});

import * as admin from 'firebase-admin';
import {
  completeMeetingFromMark,
  completeMeetingOnLateTelemetry,
  lateCompletionCandidate,
  onMeetingTelemetryArrived,
  onSessionCompleteTrigger,
  rescoreCompletedMeeting,
  stampScoreBeforeCatchUp,
  keepsScoreBeforeCatchUp,
} from '../sessionTrigger';
import { getClassReportDownloadUrl } from '../classReport';
import { openCatchUpRounds } from '../catchUpRounds';

const L = 5;   // the learner
const M = 4;   // the meeting
const DOC = `sessions/session_0${M}_student_${L}`;
const RECORD = `catchup_records/session_0${M}_student_${L}`;
const TASKS = [1, 2, 3, 4, 5, 6, 7].map((i) => `s${M}_g_t${i}`);
const db = () => admin.firestore() as any;

let seq = 0;
let clock = 10_000;
function addEvent(exercise_id: string, event_type: string, details: Record<string, unknown> = {}) {
  seq++;
  const path = `telemetry_logs/ev_${seq}`;
  const event = {
    student_id: L,
    session_id: `session_${M}_student_student_user${L}`,
    exercise_id,
    event_type,
    client_timestamp: clock,
    details,
  };
  h.docs[path] = event;
  h.createTimes[path] = clock++;
  return event;
}
/** Right the first time. */
const solved = (id: string) => {
  addEvent(id, 'PROBLEM_LOAD');
  addEvent(id, 'DIGIT_ENTERED', { is_correct: true });
  return addEvent(id, 'PROBLEM_COMPLETE');
};
/** Wrong first, then right. */
const fixed = (id: string) => {
  addEvent(id, 'PROBLEM_LOAD');
  addEvent(id, 'DIGIT_ENTERED', { is_correct: false });
  addEvent(id, 'DIGIT_ENTERED', { is_correct: true });
  return addEvent(id, 'PROBLEM_COMPLETE');
};
const sessionWrites = () => h.writes.filter((w) => w.path.startsWith('sessions/'));
const markMeeting = () => { h.rtdb = { users: { students: { [`student_user${L}`]: { completedMeetings: { [`m${M}`]: 123 } } } } }; };
const stamp = (ms: number) => ({ toMillis: () => ms });
const reset = (at: number) => ({
  reset_level: 'single_student',
  reset_scope: 'active_session',
  session_number: M,
  affected_student_ids: [L],
  backup_status: 'success',
  performed_at: at,
});

beforeEach(() => {
  h.docs = {};
  h.createTimes = {};
  h.writes = [];
  h.rtdb = {};
  h.beforeTx = null;
  seq = 0;
  clock = 10_000;
});

describe('B1 — the completion mark of meetings 3–8 never scores part of the run', () => {
  it('the run does not show the completion: "skipped", and no session document is written', async () => {
    TASKS.slice(0, 6).forEach(solved);
    const outcome = await completeMeetingFromMark(db(), L, M, { attempts: 2, waitMs: 0 });
    expect(outcome).toBe('skipped');
    expect(sessionWrites()).toEqual([]);
    expect(Object.keys(h.docs).filter((p) => p.startsWith('sessions/'))).toEqual([]);
  });

  it('a completed document is not re-scored from part of a run either', async () => {
    h.docs[DOC] = { is_completed: true, session_number: M, session_score_percent: 100, matrix_recommended_path: 'green_path', evaluated_at: stamp(1) };
    TASKS.slice(0, 3).forEach(fixed);
    expect(await completeMeetingFromMark(db(), L, M, { attempts: 1, waitMs: 0 })).toBe('skipped');
    expect(sessionWrites()).toEqual([]);
  });

  it('the whole run there: the document is created completed, with no score of its own', async () => {
    TASKS.forEach(solved);
    expect(await completeMeetingFromMark(db(), L, M, { attempts: 1, waitMs: 0 })).toBe('created');
    expect(h.docs[DOC]).toMatchObject({ is_completed: true, session_number: M, session_score_percent: null, teacher_gate_approved: false });
  });

  it('the late event that shows the completion completes the meeting from the mark', async () => {
    TASKS.slice(0, 6).forEach(solved);
    markMeeting();
    expect(await completeMeetingFromMark(db(), L, M, { attempts: 1, waitMs: 0 })).toBe('skipped');

    const last = solved(TASKS[6]);
    await (onMeetingTelemetryArrived as any).run({ params: { logId: `ev_${seq}` }, data: { data: () => last } });
    expect(h.docs[DOC]).toMatchObject({ is_completed: true });
    expect(sessionWrites()).toHaveLength(1);

    // A completed document is the mark's: a later event does nothing more here.
    expect(await completeMeetingOnLateTelemetry(db(), admin.database() as any, last)).toBe('ignored');
    expect(sessionWrites()).toHaveLength(1);
  });

  it('no mark on the record: a finished exercise completes nothing', async () => {
    TASKS.forEach(solved);
    const last = h.docs[`telemetry_logs/ev_${seq}`];
    expect(await completeMeetingOnLateTelemetry(db(), admin.database() as any, last)).toBe('ignored');
    expect(sessionWrites()).toEqual([]);
  });

  it('only a compulsory exercise completed in 3–7, or the reflection of 8, can show a completion', () => {
    const ev = (over: Record<string, unknown>) => ({ student_id: L, session_id: `session_${M}_student_student_user${L}`, exercise_id: TASKS[0], event_type: 'PROBLEM_COMPLETE', ...over });
    expect(lateCompletionCandidate(ev({}))).toEqual({ studentNum: L, sessionNum: M });
    expect(lateCompletionCandidate(ev({ event_type: 'DIGIT_ENTERED' }))).toBeNull();
    expect(lateCompletionCandidate(ev({ exercise_id: 's4_g_reinforce_1' }))).toBeNull();
    expect(lateCompletionCandidate(ev({ session_id: 'session_2_student_student_user5' }))).toBeNull();
    expect(lateCompletionCandidate(ev({ student_id: 13 }))).toBeNull();
    expect(lateCompletionCandidate(ev({ session_id: 'session_8_student_student_user5', event_type: 'REFLECTION_SUBMITTED' }))).toEqual({ studentNum: L, sessionNum: 8 });
    expect(lateCompletionCandidate(ev({ session_id: 'session_8_student_student_user5' }))).toBeNull();
  });
});

describe('re-scoring a completed meeting (PRD 14 §ב0)', () => {
  const approved = {
    is_completed: true,
    session_number: M,
    teacher_gate_approved: true,
    teacher_selected_path: 'remediation_path',
    gate_approved_at: 9,
    gate_approved_by: 't',
  };

  it('writes the new score, keeps the old one as previous_score_percent, and touches no gate field', async () => {
    h.docs[DOC] = { ...approved, session_score_percent: 43, matrix_recommended_path: 'remediation_path', evaluated_at: stamp(1) };
    TASKS.slice(0, 5).forEach(solved);
    TASKS.slice(5).forEach(fixed);   // 5 of 7 right the first time: 71%

    expect(await rescoreCompletedMeeting(db(), L, M)).toBe('rescored');
    const [write] = sessionWrites();
    expect(write.op).toBe('update');
    expect(Object.keys(write.data).sort()).toEqual(['evaluated_at', 'matrix_recommended_path', 'previous_score_percent', 'session_score_percent']);
    expect(write.data).toMatchObject({ session_score_percent: 71, matrix_recommended_path: 'green_path', previous_score_percent: 43 });
    expect(h.docs[DOC]).toMatchObject({ teacher_gate_approved: true, teacher_selected_path: 'remediation_path', gate_approved_at: 9, gate_approved_by: 't' });
    // Only meeting 2 mirrors its score to the learner record (the gate reads it there).
    expect(h.rtdb).toEqual({});
  });

  it('meeting 2: the new score is mirrored to the learner record, the gate fields are not', async () => {
    const doc2 = `sessions/session_02_student_${L}`;
    h.docs[doc2] = { ...approved, session_number: 2, session_score_percent: 43, matrix_recommended_path: 'remediation_path', evaluated_at: stamp(1) };
    const ids = ['task1_read_write_zero', 'task2_digit_value', 'task3_subtraction_regrouping', 'task4_decompose_number', 'task5_units_to_tens', 'task6_vertical_addition', 'task7_subtraction_zero_tens'];
    for (const id of ids) {
      for (const [type, details] of [['PROBLEM_LOAD', {}], ['DIGIT_ENTERED', { is_correct: true }], ['PROBLEM_COMPLETE', {}]] as const) {
        const ev = addEvent(id, type, details);
        ev.session_id = `session_2_student_student_user${L}`;
      }
    }
    expect(await rescoreCompletedMeeting(db(), L, 2)).toBe('rescored');
    expect(h.rtdb.users.students[`student_user${L}`]).toEqual({ session_score_percent: 100, matrix_recommended_path: 'green_path' });
    expect(h.docs[doc2]).toMatchObject({ session_score_percent: 100, previous_score_percent: 43, teacher_gate_approved: true, teacher_selected_path: 'remediation_path' });
  });

  it('the same score writes nothing', async () => {
    h.docs[DOC] = { ...approved, session_score_percent: 71, matrix_recommended_path: 'green_path', previous_score_percent: 43, evaluated_at: stamp(1) };
    TASKS.slice(0, 5).forEach(solved);
    TASKS.slice(5).forEach(fixed);
    expect(await rescoreCompletedMeeting(db(), L, M)).toBe('unchanged');
    expect(sessionWrites()).toEqual([]);
  });

  it('S1: a slower re-score computed over less of the run does not land over a newer score', async () => {
    h.docs[DOC] = { ...approved, session_score_percent: 29, matrix_recommended_path: 'remediation_path', evaluated_at: stamp(1) };
    // What this re-score reads: three right, two fixed — 43%.
    TASKS.slice(0, 3).forEach(solved);
    TASKS.slice(3, 5).forEach(fixed);
    // Before it writes, the rest of the run arrives and another caller scores all of it: 71%.
    h.beforeTx = () => {
      TASKS.slice(5).forEach(solved);
      h.docs[DOC] = { ...h.docs[DOC], session_score_percent: 71, matrix_recommended_path: 'green_path', previous_score_percent: 29, evaluated_at: stamp(2) };
    };

    expect(await rescoreCompletedMeeting(db(), L, M)).toBe('unchanged');
    expect(sessionWrites()).toEqual([]);
    expect(h.docs[DOC]).toMatchObject({ session_score_percent: 71, previous_score_percent: 29, matrix_recommended_path: 'green_path' });
  });
});

describe('S4 — the score before catch-up is the one before the FIRST round', () => {
  const record = (over: Record<string, unknown> = {}) => ({ student_id: L, session_number: M, class_id: 'class_1', rounds: {}, ...over });

  it('a second round keeps the stamp of the first', async () => {
    h.docs[RECORD] = record({ score_before_catchup_percent: 29, score_before_catchup_at: 5_000 });
    TASKS.slice(0, 5).forEach(solved);
    expect(await stampScoreBeforeCatchUp(db(), L, M, 50_000)).toBe(29);
    expect(h.writes.filter((w) => w.path === RECORD)).toEqual([]);
    expect(h.docs[RECORD]).toMatchObject({ score_before_catchup_percent: 29, score_before_catchup_at: 5_000 });
  });

  it('the first round stamps it', async () => {
    h.docs[RECORD] = record();
    TASKS.slice(0, 2).forEach(solved);   // 2 of 7: 29%
    expect(await stampScoreBeforeCatchUp(db(), L, M, 50_000)).toBe(29);
    expect(h.docs[RECORD]).toMatchObject({ score_before_catchup_percent: 29, score_before_catchup_at: 50_000 });
  });

  it('a stamp from before the meeting’s reset belongs to the erased run and is replaced', async () => {
    h.docs[RECORD] = record({ score_before_catchup_percent: 86, score_before_catchup_at: 5_000 });
    h.docs['reset_audit_log/r1'] = reset(9_000);
    TASKS.slice(0, 2).forEach(solved);   // written after the reset (clock starts at 10 000)
    expect(await stampScoreBeforeCatchUp(db(), L, M, 50_000)).toBe(29);
    expect(h.docs[RECORD]).toMatchObject({ score_before_catchup_percent: 29, score_before_catchup_at: 50_000 });
  });

  it('opening a catch-up round stamps the score as it stands (openCatchUpRounds)', async () => {
    const openedAt = 100_000;
    h.docs[RECORD] = record({ rounds: { r_1: { action: 'reopen', reason: 'slow_pace', note: null, recorded_by: 'uidT', recorded_at: openedAt - 60_000, opened_at: null, closed_at: null, closed_by: null, active_minutes: null } } });
    TASKS.slice(0, 3).forEach(solved);   // 3 of 7: 43%
    expect(await openCatchUpRounds(db(), M, openedAt)).toEqual([L]);
    expect(h.docs[RECORD]).toMatchObject({ score_before_catchup_percent: 43, score_before_catchup_at: openedAt });
  });

  it('pure: which stamp is kept', () => {
    expect(keepsScoreBeforeCatchUp({ score_before_catchup_percent: 29, score_before_catchup_at: 5 }, null)).toBe(true);
    expect(keepsScoreBeforeCatchUp({ score_before_catchup_percent: 29, score_before_catchup_at: 5 }, 4)).toBe(true);
    expect(keepsScoreBeforeCatchUp({ score_before_catchup_percent: 29, score_before_catchup_at: 5 }, 5)).toBe(false);
    expect(keepsScoreBeforeCatchUp({ score_before_catchup_percent: null, score_before_catchup_at: 5 }, null)).toBe(false);
    expect(keepsScoreBeforeCatchUp(null, null)).toBe(false);
  });
});

describe('S5 — after a reset, no previous score of the erased run lands on the catch-up record', () => {
  it('the new completion is written with previous_score_percent null', async () => {
    h.docs[RECORD] = {
      student_id: L, session_number: M, class_id: 'class_1', rounds: {},
      score_percent: 43, previous_score_percent: 29, scored_at: 1_000,
      score_before_catchup_percent: 29, score_before_catchup_at: 900,
    };
    h.docs['reset_audit_log/r1'] = reset(9_000);
    TASKS.forEach(solved);                // the new run, after the reset: 100%
    h.docs[DOC] = { session_id: `session_0${M}_student_${L}`, class_id: 'class_1', session_number: M, is_completed: true, teacher_gate_approved: false, session_score_percent: null };

    await (onSessionCompleteTrigger as any).run({
      params: { sessionId: `session_0${M}_student_${L}` },
      data: {
        before: { data: () => undefined },
        after: {
          data: () => h.docs[DOC],
          ref: { update: async (v: Record<string, any>) => { h.docs[DOC] = { ...h.docs[DOC], ...v }; } },
        },
      },
    });

    expect(h.docs[DOC].session_score_percent).toBe(100);
    expect(h.docs[DOC]).not.toHaveProperty('previous_score_percent');
    expect(h.docs[RECORD]).toMatchObject({ score_percent: 100, previous_score_percent: null });
  });
});

describe('getClassReportDownloadUrl — the teacher of the class only', () => {
  const call = (token: Record<string, unknown> | null, data: Record<string, unknown>) =>
    (getClassReportDownloadUrl as any).run({ auth: token ? { uid: 'u', token } : undefined, data });
  const stored = () => {
    h.docs['class_reports/class_1_session_4'] = { storage_pdf_path: 'reports/class_1/s4.pdf', storage_csv_path: 'elsewhere/s4.csv' };
  };

  it('signed in as the teacher: a signed link to the stored file', async () => {
    stored();
    const res = await call({ role: 'teacher', class_id: 'class_1' }, { classId: 'class_1', sessionNumber: 4, kind: 'pdf' });
    expect(res).toEqual({ status: 'SUCCESS', downloadUrl: 'https://signed.example/reports/class_1/s4.pdf' });
  });

  it('no sign-in, the admin, a learner and a teacher of another class are refused', async () => {
    stored();
    const data = { classId: 'class_1', sessionNumber: 4, kind: 'pdf' };
    await expect(call(null, data)).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(call({ role: 'admin' }, data)).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(call({ student_id: 5 }, data)).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(call({ role: 'teacher', class_id: 'class_2' }, data)).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('no stored report, or a path outside reports/: not-found', async () => {
    await expect(call({ role: 'teacher' }, { classId: 'class_1', sessionNumber: 4, kind: 'pdf' })).rejects.toMatchObject({ code: 'not-found' });
    stored();
    await expect(call({ role: 'teacher' }, { classId: 'class_1', sessionNumber: 4, kind: 'csv' })).rejects.toMatchObject({ code: 'not-found' });
  });

  it('a bad meeting number or kind: invalid-argument', async () => {
    await expect(call({ role: 'teacher' }, { classId: 'class_1', sessionNumber: 9, kind: 'pdf' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(call({ role: 'teacher' }, { classId: 'class_1', sessionNumber: 4, kind: 'docx' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
