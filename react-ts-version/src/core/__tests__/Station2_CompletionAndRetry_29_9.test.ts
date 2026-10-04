/**
 * Station 2 (the diagnostic meeting) — owner's decisions of 29.9.2026, all per
 * the specification. Driven through the real workspace store; only the
 * writes out of it (telemetry, the app store's record actions, the session
 * document) are replaced, so each test can see what reached the teacher.
 *
 * 1. Register, decision ז: "כל משימה שנכשלה בניסיון הראשון מקבלת תיוג אבחוני,
 *    גם אם תוקנה בסבב, והוא מוצג למורה כ'דרוש חיזוק'". A task with a wrong
 *    digit on the way to a right answer was written to the Q-matrix as
 *    'success' while the score (PRD 23 §ב) already left it out.
 * 2. A reload between the recorded answer and the next task asked the child
 *    the same task again, and the second answer replaced the first attempt.
 * 3. PRD 14: "שדה is_completed נקבע אך ורק לפי השלמת שבע משימות החובה או לפי
 *    סגירה יזומה של המורה". Completion waited for the end of the correction round.
 * 4. The correction round's toasts: neutral, naming what is on the screen;
 *    one praise at the end — the waiting screen's.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sent = vi.hoisted(() => ({ events: [] as any[] }));
vi.mock('@/infrastructure/services/FirebaseSyncService', async () => {
  const actual = await vi.importActual<any>('@/infrastructure/services/FirebaseSyncService');
  return {
    ...actual,
    emitTelemetry: (e: any) => {
      sent.events.push(e);
      return Promise.resolve();
    },
  };
});
vi.mock('@/core/ExerciseValidationEngine', async () => {
  const actual = await vi.importActual<any>('@/core/ExerciseValidationEngine');
  return { ...actual, syncQMatrixEvaluation: () => Promise.resolve() };
});

import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { useStore } from '@/application/useStore';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';
import { initQFlow, qMatrixValue, recordResult, advance } from '@/core/qmatrixFlow';
import { TASKS, getQTaskStatus } from '@/core/QMatrix';

const STUDENT = 'student_user1';
const ws = () => useWorkspaceStore.getState();
const svc = firebaseSyncService as any;
const src = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');

const record = {
  updateQMatrix: vi.fn(),
  updateConceptMastery: vi.fn(),
  updateTraceData: vi.fn(),
  markMeeting2Complete: vi.fn(),
};
const spyOnCompletion = () => vi.spyOn(firebaseSyncService, 'syncSession2Completion');
let completion: ReturnType<typeof spyOnCompletion>;
let toasts: Array<{ title: string; sub?: string }> = [];
let unsubscribeToasts: () => void = () => {};

function startDiagnostic() {
  ws().resetWorkspace();
  useAuthStore.setState({ user: { uid: STUDENT, student_id: 1 } } as any);
  useStore.setState({ students: { [STUDENT]: { qMatrixResults: {}, traceData: {} } } as any, ...record } as any);
  useWorkspaceStore.setState({
    sessionNumber: 2,
    isASD: false,
    flowStatus: 'task',
    awaitingNext: false,
    qflow: initQFlow(),
    answerDigits: {},
    carryDigits: {},
    probeAnswer: '',
    hasDigitErrorInTask: false,
  } as any);
}

/** The value the child submits (proceedQ reads the answer box when there are no column digits). */
function answer(value: number, opts: { digitErrorFirst?: boolean } = {}) {
  useWorkspaceStore.setState({ probeAnswer: String(value), answerDigits: {}, hasDigitErrorInTask: opts.digitErrorFirst === true } as any);
  ws().proceed();
}
// Long enough for a toast and the one that may follow it (1.5 s + 1.8 s).
const settle = () => vi.advanceTimersByTime(4000);
const current = () => TASKS[ws().qflow.taskIdx];
const probeAnswerOf = (id: string) => TASKS.find((t) => t.id === id)!.backwardDiagnosis?.probeAnswer;

beforeEach(() => {
  vi.useFakeTimers();
  Object.values(record).forEach((f) => f.mockClear());
  sent.events.length = 0;
  completion = spyOnCompletion().mockResolvedValue(undefined);
  toasts = [];
  unsubscribeToasts = useWorkspaceStore.subscribe((s, prev) => {
    if (s.feedback && s.feedback !== prev.feedback) toasts.push({ title: s.feedback.title, sub: s.feedback.sub });
  });
  startDiagnostic();
});
afterEach(() => {
  unsubscribeToasts();
  completion.mockRestore();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('1. a wrong digit put right is tagged for the teacher, not "success"', () => {
  it('qMatrixValue: correct with had_digit_error → an error node the teacher reads as "דרוש חיזוק"', () => {
    for (const t of TASKS) {
      const value = qMatrixValue(t.id, { correct: true, detail: '', had_digit_error: true });
      expect(value, t.id).not.toBe('success');
      expect(getQTaskStatus(value), t.id).toBe('needs_support');
    }
    expect(qMatrixValue('task1_read_write_zero', { correct: true, detail: '' })).toBe('success');
    expect(qMatrixValue('task1_read_write_zero', undefined)).toBeNull();
  });

  it('it does not enter the correction round', () => {
    let state = initQFlow();
    let event: any = null;
    for (let i = 0; i < TASKS.length; i++) {
      state = recordResult(state, { correct: true, detail: '', had_digit_error: i === 5 }).state;
      ({ state, event } = advance(state));
    }
    expect(event.type).toBe('all_complete');
    expect(state.failedTasks).toEqual([]);
  });

  it('through the store: the teacher gets the node; the completion carries no score of its own', () => {
    for (const t of TASKS) {
      answer(t.correctAnswer!, { digitErrorFirst: t.id === 'task6_vertical_addition' });
      settle();
    }
    const written = record.updateQMatrix.mock.calls[0][1];
    expect(getQTaskStatus(written.task6_vertical_addition)).toBe('needs_support');
    expect(written.task1_read_write_zero).toBe('success');
    expect(completion).toHaveBeenCalledTimes(1);
    expect(completion.mock.calls[0].slice(1)).toEqual(['class_1']); // no score: the server computes it (Module 20)
  });
});

describe('3. completion at the seventh answer; the correction round never changes it', () => {
  it('completed when the seven tasks are answered, before the correction round', () => {
    for (const t of TASKS) {
      answer(t.id === 'task1_read_write_zero' ? 999 : t.correctAnswer!);
      if (t.id !== TASKS[TASKS.length - 1].id) settle();
    }
    // The seventh answer's toast is still up: nothing is completed yet.
    expect(completion).not.toHaveBeenCalled();
    settle();
    expect(completion).toHaveBeenCalledTimes(1);
    expect(completion.mock.calls[0].slice(1)).toEqual(['class_1']); // no score: the server computes it (Module 20)
    expect(record.markMeeting2Complete).toHaveBeenCalledTimes(1);
    // …and the child is in the correction round, not on the waiting screen.
    expect(ws().qflow.phase).toBe('correction');
    expect(ws().flowStatus).toBe('task');
  });

  it('the correction round adds its diagnostic tag only; the waiting screen follows it', () => {
    for (const t of TASKS) {
      answer(t.id === 'task1_read_write_zero' ? 999 : t.correctAnswer!);
      settle();
    }
    expect(completion).toHaveBeenCalledTimes(1);
    record.updateQMatrix.mockClear();

    // Task 1 comes back: its second attempt, right this time.
    expect(current().id).toBe('task1_read_write_zero');
    answer(605);
    settle();

    expect(ws().flowStatus).toBe('sessionDone');
    expect(completion).toHaveBeenCalledTimes(1);
    expect(record.markMeeting2Complete).toHaveBeenCalledTimes(1);
    expect(record.updateQMatrix).toHaveBeenCalledTimes(1);
    const tags = record.updateQMatrix.mock.calls[0][1];
    expect(Object.keys(tags)).toEqual(['task1_read_write_zero']);
    expect(tags.task1_read_write_zero).toBe('zero_placeholder_hundreds_error');
    // No correction-round answer is sent as a solved task.
    expect(sent.events.filter((e) => e.event_type === 'PROBLEM_COMPLETE')).toHaveLength(6);
  });

  it('all seven right: completed, then straight to the waiting screen', () => {
    for (const t of TASKS) {
      answer(t.correctAnswer!);
      settle();
    }
    expect(completion).toHaveBeenCalledTimes(1);
    expect(completion.mock.calls[0].slice(1)).toEqual(['class_1']); // no score: the server computes it (Module 20)
    expect(ws().flowStatus).toBe('sessionDone');
  });

  it('a record that has not arrived yet (reload from the device copy): the writes wait for it', () => {
    useStore.setState({ students: {} as any });
    for (const t of TASKS) {
      answer(t.correctAnswer!);
      settle();
    }
    expect(completion).not.toHaveBeenCalled();
    useStore.setState({ students: { [STUDENT]: { qMatrixResults: {}, traceData: {} } } as any });
    expect(completion).toHaveBeenCalledTimes(1);
    expect(record.markMeeting2Complete).toHaveBeenCalledTimes(1);
  });
});

describe('2. a reload never asks for the first attempt again', () => {
  it('reload after the answer, before the toast moved on: the flow moves on and the answer stands', () => {
    answer(999); // task 1, wrong
    expect(ws().awaitingNext).toBe(true);
    const snapshot = JSON.parse(JSON.stringify(svc.getSyncableWorkspaceState()));
    expect(snapshot.qflow.taskIdx).toBe(0);

    // The reload: the page's timers are gone, and a fresh store is restored from the saved copy.
    vi.clearAllTimers();
    ws().resetWorkspace();
    ws().restoreSession(snapshot);
    expect(current().id).toBe('task2_digit_value');
    expect(ws().awaitingNext).toBe(false);
    expect(ws().qflow.results.task1_read_write_zero).toMatchObject({ correct: false });
  });

  it('a restore over a running meeting (the record arrives later) cancels the step still pending', () => {
    answer(999); // task 1, wrong; its toast is still up
    const snapshot = JSON.parse(JSON.stringify(svc.getSyncableWorkspaceState()));
    ws().restoreSession(snapshot);
    expect(current().id).toBe('task2_digit_value');
    // The toast left over from before the restore does not move the flow a second time.
    settle();
    expect(current().id).toBe('task2_digit_value');
  });

  it('proceed on a primary task that already has its result moves on and does not judge it again', () => {
    useWorkspaceStore.setState({
      qflow: { ...initQFlow(), results: { task1_read_write_zero: { correct: false, detail: 'wrong_answer' } } },
    } as any);
    answer(605);
    expect(ws().qflow.results.task1_read_write_zero).toMatchObject({ correct: false });
    expect(current().id).toBe('task2_digit_value');
    expect(sent.events.filter((e) => e.event_type === 'PROBLEM_COMPLETE')).toHaveLength(0);
  });

  it('reload after the seventh answer: the meeting is completed once, and the correction round starts', () => {
    for (const t of TASKS) {
      answer(t.id === 'task2_digit_value' ? 1 : t.correctAnswer!);
      if (t.id !== TASKS[TASKS.length - 1].id) settle();
    }
    const snapshot = JSON.parse(JSON.stringify(svc.getSyncableWorkspaceState()));
    vi.clearAllTimers();
    ws().resetWorkspace();
    ws().restoreSession(snapshot);
    settle();
    expect(completion).toHaveBeenCalledTimes(1);
    expect(ws().qflow.phase).toBe('correction');
    expect(current().id).toBe('task2_digit_value');
    expect(ws().flowStatus).toBe('task');
  });

  it('a wrong digit already typed survives the reload (PRD 23 §ב)', () => {
    useWorkspaceStore.setState({ hasDigitErrorInTask: true } as any);
    const snapshot = JSON.parse(JSON.stringify(svc.getSyncableWorkspaceState()));
    expect(snapshot.hasDigitErrorInTask).toBe(true);
    vi.clearAllTimers();
    ws().resetWorkspace();
    ws().restoreSession(snapshot);
    expect(ws().hasDigitErrorInTask).toBe(true);

    useWorkspaceStore.setState({ probeAnswer: '605', answerDigits: {} } as any);
    ws().proceed();
    expect(ws().qflow.results.task1_read_write_zero).toMatchObject({ correct: true, had_digit_error: true });
  });
});

describe('4. the correction round tells the child what is on the screen, and praises once', () => {
  it('the task itself coming back is "מְשִׂימָה חוֹזֶרֶת"; a simpler exercise before it is "מְשִׂימָה נוֹסֶפֶת"', () => {
    for (const t of TASKS) {
      const wrong = t.id === 'task1_read_write_zero' || t.id === 'task3_subtraction_regrouping';
      answer(wrong ? 999 : t.correctAnswer!);
      settle();
    }
    expect(toasts.at(-1)).toEqual({ title: 'מְשִׂימָה חוֹזֶרֶת 📝', sub: undefined });
    answer(605); // task 1, second attempt
    settle();
    settle();
    // Task 3: the simpler exercise, then the task itself.
    expect(toasts.map((t) => t.title)).toContain('מְשִׂימָה נוֹסֶפֶת 📝');
    answer(probeAnswerOf('task3_subtraction_regrouping')!);
    settle();
    settle();
    expect(toasts.at(-1)).toEqual({ title: 'מְשִׂימָה חוֹזֶרֶת 📝', sub: undefined });
    answer(27);
    settle();
    expect(ws().flowStatus).toBe('sessionDone');

    const all = JSON.stringify(toasts);
    expect(all).not.toContain('מְנַסִּים שׁוּב');
    expect(all).not.toContain('הַמְּשִׂימָה הַמְּקוֹרִית');
    expect(all).not.toContain('כָּל הַכָּבוֹד');
    expect(all).not.toContain('סִיַּמְתֶּם');
  });

  it('the store no longer carries the old texts', () => {
    const store = src('application/useWorkspaceStore.ts');
    expect(store).not.toContain('מְנַסִּים שׁוּב');
    expect(store).not.toContain('הִנֵּה הַמְּשִׂימָה הַמְּקוֹרִית');
    expect(store).not.toContain('כָּל הַכָּבוֹד עַל הָעֲבוֹדָה הַטּוֹבָה');
  });
});
