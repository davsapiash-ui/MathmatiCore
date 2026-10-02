import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * PRD 14 §ב1: "שדה is_completed נקבע אך ורק לפי השלמת שבע משימות החובה או לפי
 * סגירה יזומה של המורה, ולעולם לא לפי חלוף הזמן."
 *
 * Owner decision 29.9.2026: when the teacher closes meeting 2, every learner who
 * started it and is not yet completed is completed; the score counts only the
 * tasks answered (an unanswered task is not correct: first-attempt correct ÷ 7);
 * the recommendation follows the 50% rule. A learner who never started meeting 2
 * is not completed, and one who finished all seven is left exactly as they were.
 */

// ── An in-memory firebase-admin: Firestore documents and an RTDB tree ────────
const h = vi.hoisted(() => ({
  docs: {} as Record<string, Record<string, any>>, // "collection/id" → data
  rtdb: {} as Record<string, any>,                   // "users/students/student_user4" → record
  firestoreWrites: [] as string[],
  createTimes: {} as Record<string, number>,         // "collection/id" → the server's write time
  failRecordRead: '',                                // a record whose read throws
}));

vi.mock('firebase-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase-admin')>();

  const docRef = (collection: string, id: string): any => {
    const path = `${collection}/${id}`;
    return {
      id,
      path,
      get: async () => ({ exists: path in h.docs, id, data: () => (h.docs[path] ? { ...h.docs[path] } : undefined) }),
      set: async (data: Record<string, any>) => { h.firestoreWrites.push(`set ${path}`); h.docs[path] = { ...data }; },
      update: async (data: Record<string, any>) => {
        h.firestoreWrites.push(`update ${path}`);
        h.docs[path] = { ...(h.docs[path] || {}), ...data };
      },
    };
  };

  const firestoreDb = {
    collection: (name: string) => ({
      doc: (id: string) => docRef(name, id),
      where: (field: string, op: string, value: unknown) => ({
        get: async () => {
          // '==' for the learner's documents; 'array-contains' for the reset log,
          // read to score only the run since the meeting's last reset.
          expect(['==', 'array-contains']).toContain(op);
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
    runTransaction: async (fn: (tx: any) => Promise<unknown>) => fn({
      get: (ref: any) => ref.get(),
      set: (ref: any, data: any) => { void ref.set(data); },
      update: (ref: any, data: any) => { void ref.update(data); },
    }),
  };
  const firestore = Object.assign(() => firestoreDb, actual.firestore);

  const rtdbRef = (path: string) => {
    // "users/students/student_userN" is the record; anything deeper is a field in it.
    const parts = path.split('/');
    const base = parts.slice(0, 3).join('/');
    const field = parts.slice(3).join('/');
    return {
      get: async () => {
        if (h.failRecordRead && base === h.failRecordRead) throw new Error('record read refused');
        const rec = h.rtdb[base];
        const v = field ? rec?.[field] : rec;
        return { val: () => (v === undefined ? null : v), exists: () => v !== undefined };
      },
      update: async (values: Record<string, unknown>) => {
        const rec = { ...(h.rtdb[base] || {}) };
        for (const [k, v] of Object.entries(values)) {
          if (k.includes('/')) {
            const [parent, child] = k.split('/');
            rec[parent] = { ...(rec[parent] || {}), [child]: v };
          } else {
            rec[k] = v;
          }
        }
        h.rtdb[base] = rec;
      },
      transaction: async (fn: (cur: unknown) => unknown) => {
        const rec = { ...(h.rtdb[base] || {}) };
        rec[field] = fn(rec[field] ?? null);
        h.rtdb[base] = rec;
        return { committed: true };
      },
    };
  };
  const database = () => ({ ref: rtdbRef });

  return { ...actual, default: { ...actual, firestore, database }, firestore, database };
});

import {
  completeUnfinishedMeeting2,
  diagnosticQMatrixAtClose,
  isTeacherCloseOfMeeting2,
  onMeeting2ClosedByTeacher,
  onMeeting2CompletionRecorded,
  Q_FAIL_TAG,
  Q_NOT_ANSWERED_TAG,
  rescoreCompletedMeeting2,
} from '../meeting2Close';
import { computeCognitiveMastery } from '../diagnosticMastery';
import { onSessionCompleteTrigger } from '../sessionTrigger';
import * as admin from 'firebase-admin';

// ── Meeting-2 telemetry, as the learner's client sends it ───────────────────
let seq = 0;
/** When set, each new event is stamped with this server write time (then +1). */
let writeClock: number | null = null;
function addEvent(student: number, exercise_id: string, event_type: string, details: Record<string, unknown> = {}) {
  seq++;
  if (writeClock !== null) h.createTimes[`telemetry_logs/ev_${seq}`] = writeClock++;
  h.docs[`telemetry_logs/ev_${seq}`] = {
    student_id: student,
    session_id: `session_2_student_student_user${student}`,
    exercise_id,
    event_type,
    client_timestamp: 1_000 + seq,
    details,
  };
}
const solved = (s: number, id: string) => {
  addEvent(s, id, 'PROBLEM_LOAD');
  addEvent(s, id, 'DIGIT_ENTERED', { is_correct: true });
  addEvent(s, id, 'PROBLEM_COMPLETE');
};
const answeredWrong = (s: number, id: string) => {
  addEvent(s, id, 'PROBLEM_LOAD');
  addEvent(s, id, 'DIGIT_ENTERED', { is_correct: false });
};
const opened = (s: number, id: string) => addEvent(s, id, 'PROBLEM_LOAD');

const TASKS = [
  'task1_read_write_zero',
  'task2_digit_value',
  'task3_subtraction_regrouping',
  'task4_decompose_number',
  'task5_units_to_tens',
  'task6_vertical_addition',
  'task7_subtraction_zero_tens',
];

/** Runs the score trigger for the document the close just completed, as Firestore would. */
async function fireScoreTrigger(docId: string, before: Record<string, any> | null) {
  const after = h.docs[`sessions/${docId}`];
  await (onSessionCompleteTrigger as any).run({
    params: { sessionId: docId },
    data: {
      before: { data: () => before ?? undefined },
      after: {
        data: () => after,
        ref: { update: async (v: Record<string, any>) => { h.docs[`sessions/${docId}`] = { ...h.docs[`sessions/${docId}`], ...v }; } },
      },
    },
  });
}

beforeEach(() => {
  h.docs = {};
  h.rtdb = {};
  h.firestoreWrites = [];
  h.createTimes = {};
  h.failRecordRead = '';
  seq = 0;
  writeClock = null;
});

describe('which write is the teacher closing meeting 2', () => {
  const open2 = { active: true, status: 'active', sessionNumber: 2 };
  const teacherClose = { active: false, status: 'closed', sessionNumber: null, endedAt: 1, teacherId: 't', closedBy: 'teacher' };

  it('the dashboard close of an open or paused meeting 2', () => {
    expect(isTeacherCloseOfMeeting2(open2, teacherClose)).toBe(true);
    expect(isTeacherCloseOfMeeting2({ ...open2, status: 'paused' }, teacherClose)).toBe(true);
  });

  it('the teacher opening another meeting while meeting 2 is open or paused', () => {
    const open3 = { active: true, status: 'active', sessionNumber: 3, teacherId: 't' };
    expect(isTeacherCloseOfMeeting2(open2, open3)).toBe(true);
    expect(isTeacherCloseOfMeeting2({ ...open2, status: 'paused' }, { ...open3, sessionNumber: 1 })).toBe(true);
    // Resuming or re-opening meeting 2 itself is not a close.
    expect(isTeacherCloseOfMeeting2({ ...open2, status: 'paused' }, open2)).toBe(false);
  });

  it('not a reset (no teacher marker), not another meeting, not a write that leaves it open', () => {
    const resetClose = { active: false, status: 'closed', sessionNumber: null, endedAt: 1 };
    expect(isTeacherCloseOfMeeting2(open2, resetClose)).toBe(false);
    expect(isTeacherCloseOfMeeting2({ ...open2, sessionNumber: 3 }, teacherClose)).toBe(false);
    expect(isTeacherCloseOfMeeting2(open2, { ...open2, status: 'paused' })).toBe(false);
    expect(isTeacherCloseOfMeeting2(null, teacherClose)).toBe(false);
    expect(isTeacherCloseOfMeeting2({ ...teacherClose, sessionNumber: 2 }, teacherClose)).toBe(false);
  });
});

describe('the Q-matrix of an unfinished diagnostic', () => {
  it('solved first try → success; wrong and moved on → fail; the open task and the rest → not answered', () => {
    solved(4, TASKS[0]);
    answeredWrong(4, TASKS[1]);
    solved(4, TASKS[2]);
    opened(4, TASKS[3]);
    const events = Object.values(h.docs);
    expect(diagnosticQMatrixAtClose(events)).toEqual({
      [TASKS[0]]: 'success',
      [TASKS[1]]: Q_FAIL_TAG,
      [TASKS[2]]: 'success',
      [TASKS[3]]: Q_NOT_ANSWERED_TAG,
      [TASKS[4]]: Q_NOT_ANSWERED_TAG,
      [TASKS[5]]: Q_NOT_ANSWERED_TAG,
      [TASKS[6]]: Q_NOT_ANSWERED_TAG,
    });
  });

  it('a task finished after a corrected wrong digit is not a first-attempt success', () => {
    addEvent(4, TASKS[0], 'DIGIT_ENTERED', { is_correct: false });
    addEvent(4, TASKS[0], 'DIGIT_ENTERED', { is_correct: true });
    addEvent(4, TASKS[0], 'PROBLEM_COMPLETE');
    expect(diagnosticQMatrixAtClose(Object.values(h.docs))[TASKS[0]]).toBe(Q_FAIL_TAG);
  });
});

describe('closing meeting 2 completes the unfinished learners', () => {
  it('unfinished → completed, scored on the answered tasks out of 7, with its row at the gate', async () => {
    // Learner 4 solved tasks 1–3 first try, then the meeting closed on task 4.
    solved(4, TASKS[0]);
    solved(4, TASKS[1]);
    solved(4, TASKS[2]);
    opened(4, TASKS[3]);

    const result = await completeUnfinishedMeeting2(admin.firestore(), admin.database());
    expect(result.completed).toEqual([4]);

    const doc = h.docs['sessions/session_02_student_4'];
    expect(doc).toMatchObject({ session_number: 2, is_completed: true, class_id: 'class_1', teacher_gate_approved: false });

    // The score is the completion trigger's, from the same telemetry: 3 of 7.
    await fireScoreTrigger('session_02_student_4', null);
    expect(h.docs['sessions/session_02_student_4']).toMatchObject({
      session_score_percent: 43,
      matrix_recommended_path: 'remediation_path',
    });

    const rec = h.rtdb['users/students/student_user4'];
    expect(rec).toMatchObject({
      completedMeeting2: true,
      session_02_completed: true,
      routeStatus: 'PENDING_TEACHER_APPROVAL',
      highestCompletedMeeting: 2,
      session_score_percent: 43,
      matrix_recommended_path: 'remediation_path',
    });
    // Every task not answered is on record, and reads as "דרוש חיזוק".
    expect(rec.qMatrixResults).toMatchObject({
      [TASKS[0]]: 'success',
      [TASKS[3]]: Q_NOT_ANSWERED_TAG,
      [TASKS[6]]: Q_NOT_ANSWERED_TAG,
    });
  });

  it('four first-try answers of seven is 57%: green, by the existing 50% rule', async () => {
    for (const id of TASKS.slice(0, 4)) solved(7, id);
    await completeUnfinishedMeeting2(admin.firestore(), admin.database());
    await fireScoreTrigger('session_02_student_7', null);
    expect(h.docs['sessions/session_02_student_7']).toMatchObject({ session_score_percent: 57, matrix_recommended_path: 'green_path' });
  });

  it('a learner who never started meeting 2 is not completed', async () => {
    // Learner 5 has meeting-1 events only.
    h.docs['telemetry_logs/m1'] = { student_id: 5, session_id: 'session_1_student_student_user5', exercise_id: 's1_x', event_type: 'PROBLEM_COMPLETE', client_timestamp: 1 };
    const result = await completeUnfinishedMeeting2(admin.firestore(), admin.database());
    expect(result.notStarted).toContain(5);
    expect(result.completed).not.toContain(5);
    expect(h.docs['sessions/session_02_student_5']).toBeUndefined();
    expect(h.rtdb['users/students/student_user5']).toBeUndefined();
  });

  it('a learner who finished all seven is left exactly as they were', async () => {
    for (const id of TASKS) solved(2, id);
    const finished = {
      session_id: 'session_02_student_2', class_id: 'class_1', session_number: 2, is_completed: true,
      session_score_percent: 100, matrix_recommended_path: 'green_path', teacher_gate_approved: false, evaluated_at: 1,
    };
    h.docs['sessions/session_02_student_2'] = { ...finished };
    h.rtdb['users/students/student_user2'] = { completedMeeting2: true, qMatrixResults: { [TASKS[0]]: 'success' } };

    const result = await completeUnfinishedMeeting2(admin.firestore(), admin.database());
    expect(result.alreadyCompleted).toEqual([2]);
    expect(h.docs['sessions/session_02_student_2']).toEqual(finished);
    expect(h.firestoreWrites.filter((w) => w.includes('student_2'))).toEqual([]);
    expect(h.rtdb['users/students/student_user2']).toEqual({ completedMeeting2: true, qMatrixResults: { [TASKS[0]]: 'success' } });
  });

  it('keeps what the learner already has: an approved gate stays approved, a written Q-matrix value stays', async () => {
    solved(9, TASKS[0]);
    opened(9, TASKS[1]);
    h.rtdb['users/students/student_user9'] = {
      teacher_gate_approved: true, routeStatus: 'APPROVED', qMatrixResults: { [TASKS[1]]: 'digit_value_procedural_error' },
    };
    await completeUnfinishedMeeting2(admin.firestore(), admin.database());
    const rec = h.rtdb['users/students/student_user9'];
    expect(rec.routeStatus).toBe('APPROVED');
    expect(rec.qMatrixResults[TASKS[1]]).toBe('digit_value_procedural_error');
    expect(rec.qMatrixResults[TASKS[2]]).toBe(Q_NOT_ANSWERED_TAG);
  });

  it('an existing, not completed document is completed without new fields (Firestore isValidSessionDoc)', async () => {
    opened(3, TASKS[0]);
    h.docs['sessions/session_02_student_3'] = { session_id: 'session_02_student_3', class_id: 'class_1', session_number: 2, is_completed: false, teacher_gate_approved: false };
    await completeUnfinishedMeeting2(admin.firestore(), admin.database());
    expect(h.docs['sessions/session_02_student_3']).toEqual({
      session_id: 'session_02_student_3', class_id: 'class_1', session_number: 2, is_completed: true, teacher_gate_approved: false,
    });
  });
});

describe('the RTDB trigger', () => {
  it('runs on the teacher closing meeting 2, and not on a reset', async () => {
    opened(6, TASKS[0]);
    const open2 = { active: true, status: 'active', sessionNumber: 2 };
    const snap = (v: unknown) => ({ val: () => v });

    await (onMeeting2ClosedByTeacher as any).run({
      data: { before: snap(open2), after: snap({ active: false, status: 'closed', sessionNumber: null, endedAt: 1 }) },
    });
    expect(h.docs['sessions/session_02_student_6']).toBeUndefined();

    await (onMeeting2ClosedByTeacher as any).run({
      data: { before: snap(open2), after: snap({ active: false, status: 'closed', sessionNumber: null, endedAt: 2, closedBy: 'teacher' }) },
    });
    expect(h.docs['sessions/session_02_student_6']).toMatchObject({ is_completed: true });
  });

  it('a close by time (the 45-minute cap, the teacher-disconnect window) completes no one and writes nothing', async () => {
    // Owner decision 2.10.2026: everything is kept; the teacher may open meeting 2 again.
    solved(6, TASKS[0]);
    opened(6, TASKS[1]);
    const open2 = { active: true, status: 'active', sessionNumber: 2 };
    const snap = (v: unknown) => ({ val: () => v });
    for (const endedBy of ['auto_45min', 'teacher_disconnect_grace']) {
      await (onMeeting2ClosedByTeacher as any).run({
        data: { before: snap(open2), after: snap({ active: false, status: 'closed', sessionNumber: null, endedAt: 1, endedBy, teacherId: 't' }) },
      });
    }
    expect(h.docs['sessions/session_02_student_6']).toBeUndefined();
    expect(h.rtdb['users/students/student_user6']).toBeUndefined();
    expect(h.firestoreWrites).toEqual([]);
  });
});

describe('the mastery profile of a learner the close completed (מיפוי מיומנויות כיתתי)', () => {
  it('is written from the same seven values the teacher sees, by the client rule', async () => {
    // Learner 4: tasks 1 and 3 first try, task 2 wrong and moved on, the meeting closed on task 4.
    solved(4, TASKS[0]);
    answeredWrong(4, TASKS[1]);
    solved(4, TASKS[2]);
    opened(4, TASKS[3]);
    await completeUnfinishedMeeting2(admin.firestore(), admin.database());

    const rec = h.rtdb['users/students/student_user4'];
    expect(rec.conceptMastery).toEqual(computeCognitiveMastery(rec.qMatrixResults));
    // decimal_structure: tasks 1, 2, 4, 7 → 1 of 4. regrouping: tasks 3, 5, 6, 7 → 1 of 4.
    // procedural: tasks 3, 6, 7 → 1 of 3. Concepts no task measures stay 1.
    expect(rec.conceptMastery).toEqual({
      decimal_structure: 0.25,
      number_magnitude: 1,
      regrouping_fluency: 0.25,
      procedural_fluency: 1 / 3,
      relational_thinking: 1,
      algebraic_reasoning: 1,
    });
  });

  it('counts a value the learner already had, as the teacher sees it', async () => {
    opened(9, TASKS[0]);
    h.rtdb['users/students/student_user9'] = { qMatrixResults: { [TASKS[0]]: 'success' } };
    await completeUnfinishedMeeting2(admin.firestore(), admin.database());
    const rec = h.rtdb['users/students/student_user9'];
    expect(rec.qMatrixResults[TASKS[0]]).toBe('success');
    expect(rec.conceptMastery.decimal_structure).toBe(0.25);
  });
});

describe('closing meeting 2 after a reset of the learner reads only the run since the reset', () => {
  const T_RESET = 1_700_000_100_000;
  const resetOf = (n: number) => {
    h.docs[`reset_audit_log/r${n}`] = {
      reset_level: 'single_student', reset_scope: 'active_session', session_number: 2,
      affected_student_ids: [n], backup_status: 'success', performed_at: T_RESET,
    };
  };

  it('reset and not started again: not completed, nothing written (no 0%, no erased focus areas)', async () => {
    writeClock = T_RESET - 60_000;
    solved(8, TASKS[0]);
    answeredWrong(8, TASKS[1]);
    opened(8, TASKS[2]);
    resetOf(8);

    const result = await completeUnfinishedMeeting2(admin.firestore(), admin.database());
    expect(result.notStarted).toContain(8);
    expect(result.completed).not.toContain(8);
    expect(h.docs['sessions/session_02_student_8']).toBeUndefined();
    expect(h.rtdb['users/students/student_user8']).toBeUndefined();
  });

  it('reset, then started again: the focus areas and the score come from the new run only', async () => {
    writeClock = T_RESET - 60_000;
    answeredWrong(8, TASKS[0]); // the erased run: task 1 wrong
    resetOf(8);
    writeClock = T_RESET + 60_000;
    solved(8, TASKS[0]);        // the new run: tasks 1–4 first try, closed on task 5
    solved(8, TASKS[1]);
    solved(8, TASKS[2]);
    solved(8, TASKS[3]);
    opened(8, TASKS[4]);

    const result = await completeUnfinishedMeeting2(admin.firestore(), admin.database());
    expect(result.completed).toEqual([8]);
    const rec = h.rtdb['users/students/student_user8'];
    expect(rec.qMatrixResults[TASKS[0]]).toBe('success');
    expect(rec.qMatrixResults[TASKS[4]]).toBe(Q_NOT_ANSWERED_TAG);

    await fireScoreTrigger('session_02_student_8', null);
    // 4 of 7 → 57%, green: the score agrees with the focus areas.
    expect(h.docs['sessions/session_02_student_8']).toMatchObject({ session_score_percent: 57, matrix_recommended_path: 'green_path' });
  });

  it('reset, closed while not started, then finished: scored from the new run', async () => {
    writeClock = T_RESET - 60_000;
    for (const id of TASKS) answeredWrong(8, id);
    resetOf(8);
    await completeUnfinishedMeeting2(admin.firestore(), admin.database());
    expect(h.docs['sessions/session_02_student_8']).toBeUndefined();

    // The learner does the diagnostic again, all seven first try, and the client completes it.
    writeClock = T_RESET + 60_000;
    for (const id of TASKS) solved(8, id);
    h.docs['sessions/session_02_student_8'] = { session_id: 'session_02_student_8', session_number: 2, is_completed: true, teacher_gate_approved: false };
    await fireScoreTrigger('session_02_student_8', null);
    expect(h.docs['sessions/session_02_student_8']).toMatchObject({ session_score_percent: 100, matrix_recommended_path: 'green_path' });
  });
});

describe('a learner the close completed, who finishes meeting 2 later, is re-scored', () => {
  async function closeOnTask4(n: number) {
    solved(n, TASKS[0]);
    solved(n, TASKS[1]);
    solved(n, TASKS[2]);
    opened(n, TASKS[3]);
    await completeUnfinishedMeeting2(admin.firestore(), admin.database());
    await fireScoreTrigger(`session_02_student_${n}`, null);
    h.docs[`sessions/session_02_student_${n}`].evaluated_at = 1; // the trigger's server stamp
    expect(h.docs[`sessions/session_02_student_${n}`].session_score_percent).toBe(43);
  }

  it('the rest of the run arrives: the score and the recommendation follow it, in Firestore and on the record', async () => {
    await closeOnTask4(4);
    for (const id of TASKS.slice(3)) solved(4, id);

    expect(await rescoreCompletedMeeting2(admin.firestore(), admin.database(), 4)).toBe('rescored');
    expect(h.docs['sessions/session_02_student_4']).toMatchObject({ session_score_percent: 100, matrix_recommended_path: 'green_path', is_completed: true });
    expect(h.rtdb['users/students/student_user4']).toMatchObject({ session_score_percent: 100, matrix_recommended_path: 'green_path' });
  });

  it('nothing new: nothing written', async () => {
    await closeOnTask4(4);
    h.firestoreWrites = [];
    expect(await rescoreCompletedMeeting2(admin.firestore(), admin.database(), 4)).toBe('unchanged');
    expect(h.firestoreWrites).toEqual([]);
  });

  it('not completed, or completed and not scored yet: left to the score trigger', async () => {
    expect(await rescoreCompletedMeeting2(admin.firestore(), admin.database(), 5)).toBe('not_completed');
    opened(5, TASKS[0]);
    await completeUnfinishedMeeting2(admin.firestore(), admin.database());
    expect(await rescoreCompletedMeeting2(admin.firestore(), admin.database(), 5)).toBe('not_scored_yet');
  });

  it('a teacher approval and her chosen path are kept', async () => {
    await closeOnTask4(4);
    Object.assign(h.docs['sessions/session_02_student_4'], { teacher_gate_approved: true, teacher_selected_path: 'remediation_path' });
    for (const id of TASKS.slice(3)) solved(4, id);
    await rescoreCompletedMeeting2(admin.firestore(), admin.database(), 4);
    expect(h.docs['sessions/session_02_student_4']).toMatchObject({
      teacher_gate_approved: true, teacher_selected_path: 'remediation_path', matrix_recommended_path: 'green_path',
    });
  });

  it('the trigger: the learner record\'s completion stamp, canonical key only', async () => {
    await closeOnTask4(4);
    for (const id of TASKS.slice(3)) solved(4, id);
    const run = (studentKey: string, v: unknown) => (onMeeting2CompletionRecorded as any).run({
      params: { studentKey },
      data: { before: { val: () => null }, after: { val: () => v } },
    });
    await run('student_4', 5);
    await run('student_user4', null);
    expect(h.docs['sessions/session_02_student_4'].session_score_percent).toBe(43);
    await run('student_user4', 5);
    expect(h.docs['sessions/session_02_student_4'].session_score_percent).toBe(100);
  });
});

describe('a learner an earlier close completed, who went on and is closed again before the seventh answer', () => {
  async function closeOnTask4(n: number) {
    solved(n, TASKS[0]);
    solved(n, TASKS[1]);
    solved(n, TASKS[2]);
    opened(n, TASKS[3]);
    await completeUnfinishedMeeting2(admin.firestore(), admin.database());
    await fireScoreTrigger(`session_02_student_${n}`, null);
    h.docs[`sessions/session_02_student_${n}`].evaluated_at = 1;
  }

  it('the tasks answered since get their values, the profile follows, and the score is re-scored', async () => {
    await closeOnTask4(4);
    // Meeting 2 opened again: tasks 4 and 5 solved, the meeting closed on task 6.
    solved(4, TASKS[3]);
    solved(4, TASKS[4]);
    opened(4, TASKS[5]);

    const result = await completeUnfinishedMeeting2(admin.firestore(), admin.database());
    expect(result.alreadyCompleted).toEqual([4]);
    expect(result.updated).toEqual([4]);
    const rec = h.rtdb['users/students/student_user4'];
    expect(rec.qMatrixResults).toMatchObject({
      [TASKS[3]]: 'success', [TASKS[4]]: 'success', [TASKS[5]]: Q_NOT_ANSWERED_TAG, [TASKS[6]]: Q_NOT_ANSWERED_TAG,
    });
    expect(rec.conceptMastery).toEqual(computeCognitiveMastery(rec.qMatrixResults));
    // 5 of 7 first try → 71%.
    expect(h.docs['sessions/session_02_student_4']).toMatchObject({ is_completed: true, session_score_percent: 71, matrix_recommended_path: 'green_path' });
    expect(rec).toMatchObject({ session_score_percent: 71 });
  });

  it('nothing answered since: nothing written', async () => {
    await closeOnTask4(4);
    h.firestoreWrites = [];
    const before = JSON.stringify(h.rtdb['users/students/student_user4']);
    const result = await completeUnfinishedMeeting2(admin.firestore(), admin.database());
    expect(result.updated).toEqual([]);
    expect(h.firestoreWrites).toEqual([]);
    expect(JSON.stringify(h.rtdb['users/students/student_user4'])).toBe(before);
  });

  it('a failure to bring the learner up to date is its own entry, not "could not be completed"', async () => {
    await closeOnTask4(4);
    solved(4, TASKS[3]);
    h.failRecordRead = 'users/students/student_user4';
    const result = await completeUnfinishedMeeting2(admin.firestore(), admin.database());
    expect(result.alreadyCompleted).toEqual([4]);
    expect(result.catchUpFailed).toEqual([4]);
    expect(result.failed).toEqual([]);
  });

  it('an approved gate stays approved', async () => {
    await closeOnTask4(4);
    Object.assign(h.rtdb['users/students/student_user4'], { routeStatus: 'APPROVED', teacher_gate_approved: true });
    solved(4, TASKS[3]);
    await completeUnfinishedMeeting2(admin.firestore(), admin.database());
    expect(h.rtdb['users/students/student_user4']).toMatchObject({ routeStatus: 'APPROVED', teacher_gate_approved: true });
  });
});

describe('a meeting 2 that already ended by time is not closed by the teacher', () => {
  const AT = 1_800_000_000_000;
  const MIN = 60_000;
  const open2 = (over: Record<string, unknown> = {}) => ({ active: true, status: 'active', sessionNumber: 2, startedAt: AT - 10 * MIN, ...over });
  const teacherClose = { active: false, status: 'closed', sessionNumber: null, closedBy: 'teacher' };
  const open3 = { active: true, status: 'active', sessionNumber: 3 };

  it('within the 45 minutes: the close and the switch count', () => {
    expect(isTeacherCloseOfMeeting2(open2(), teacherClose, AT)).toBe(true);
    expect(isTeacherCloseOfMeeting2(open2(), open3, AT)).toBe(true);
  });

  it('past the 45-minute cap, though no dashboard wrote the close: neither counts', () => {
    const expired = open2({ startedAt: AT - 46 * MIN });
    expect(isTeacherCloseOfMeeting2(expired, open3, AT)).toBe(false);
    expect(isTeacherCloseOfMeeting2(expired, teacherClose, AT)).toBe(false);
  });

  it('past the teacher-disconnect window: neither counts', () => {
    const gone = open2({ teacherDisconnectedAt: AT - 16 * MIN });
    expect(isTeacherCloseOfMeeting2(gone, open3, AT)).toBe(false);
    expect(isTeacherCloseOfMeeting2(open2({ teacherDisconnectedAt: AT - 5 * MIN }), open3, AT)).toBe(true);
  });

  it('the trigger judges by the write\'s own time', async () => {
    opened(6, TASKS[0]);
    const snap = (v: unknown) => ({ val: () => v });
    const time = new Date(AT).toISOString();
    await (onMeeting2ClosedByTeacher as any).run({ time, data: { before: snap(open2({ startedAt: AT - 50 * MIN })), after: snap(open3) } });
    expect(h.docs['sessions/session_02_student_6']).toBeUndefined();
    await (onMeeting2ClosedByTeacher as any).run({ time, data: { before: snap(open2()), after: snap(open3) } });
    expect(h.docs['sessions/session_02_student_6']).toMatchObject({ is_completed: true });
  });
});
