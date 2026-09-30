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
          expect(op).toBe('==');
          const docs = Object.entries(h.docs)
            .filter(([p, d]) => p.startsWith(`${name}/`) && d[field] === value)
            .map(([p, d]) => ({ id: p.slice(name.length + 1), data: () => ({ ...d }) }));
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
  Q_FAIL_TAG,
  Q_NOT_ANSWERED_TAG,
} from '../meeting2Close';
import { onSessionCompleteTrigger } from '../sessionTrigger';
import * as admin from 'firebase-admin';

// ── Meeting-2 telemetry, as the learner's client sends it ───────────────────
let seq = 0;
function addEvent(student: number, exercise_id: string, event_type: string, details: Record<string, unknown> = {}) {
  seq++;
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
  seq = 0;
});

describe('which write is the teacher closing meeting 2', () => {
  const open2 = { active: true, status: 'active', sessionNumber: 2 };
  const teacherClose = { active: false, status: 'closed', sessionNumber: null, endedAt: 1, teacherId: 't', closedBy: 'teacher' };

  it('the dashboard close of an open or paused meeting 2', () => {
    expect(isTeacherCloseOfMeeting2(open2, teacherClose)).toBe(true);
    expect(isTeacherCloseOfMeeting2({ ...open2, status: 'paused' }, teacherClose)).toBe(true);
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
});
