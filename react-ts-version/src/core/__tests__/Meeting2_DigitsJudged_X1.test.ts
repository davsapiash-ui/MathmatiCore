/**
 * Audit finding X1 — every typed digit of meeting 2 is judged against the
 * diagnostic task on the screen (QMatrix), not against the meetings 3–7 task
 * list, which is empty in meeting 2. Until this fix each digit of the
 * diagnostic went out as is_correct: null, so a wrong digit the child later
 * corrected never counted against the score of PRD Module 23 §ב.
 *
 * Owner's rulings, 28.9.2026:
 *  1. Task 2 (the one answer box) is judged by the value in the box when
 *     "התקדם" is pressed; the keystrokes on the way are not errors.
 *  2. Every other task: the PRD 23 formula — a wrong digit counts even after
 *     it is corrected.
 *
 * The events the store emits are scored with the PRD 23 §ב rule exactly as
 * the server applies it (functions/src/meetingMetrics.ts →
 * computeFirstAttemptScore, used by the completion trigger and the class
 * report; the server side has its own test, meeting2DigitEvents.test.ts). The
 * server module is not imported here: it pulls firebase-admin into the
 * client's type check.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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
import { useWorkspaceStore, diagnosticDigitTask } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { initQFlow, type QMatrixFlowState } from '@/core/qmatrixFlow';
import { TASKS } from '@/core/QMatrix';

const ws = () => useWorkspaceStore.getState();
const taskIdx = (id: string) => TASKS.findIndex((t) => t.id === id);

function loadDiagnostic(taskId: string, qflow: Partial<QMatrixFlowState> = {}) {
  ws().resetWorkspace();
  useAuthStore.setState({ user: { uid: 'student_user1', student_id: 1 } } as any);
  useWorkspaceStore.setState({
    sessionNumber: 2,
    isASD: false,
    flowStatus: 'task',
    awaitingNext: false,
    qflow: { ...initQFlow(), taskIdx: taskIdx(taskId), ...qflow },
    answerDigits: {},
    carryDigits: {},
    probeAnswer: '',
    hasDigitErrorInTask: false,
    typedErrorCount: 0,
  } as any);
  sent.events.length = 0;
}

/** What the task-2 box does on every keystroke (PlaceValueInputBoxes, mode single_value). */
function typeInTask2Box(value: string) {
  ws().setProbeAnswer(value);
  if (value.length <= 4) {
    const padded = value.padStart(2, '0');
    ws().setAnswerDigit('tens', padded[padded.length - 2] ?? '');
    ws().setAnswerDigit('units', padded[padded.length - 1] ?? '');
  }
}

const digitEvents = () => sent.events.filter((e) => e.event_type === 'DIGIT_ENTERED');
const completes = () => sent.events.filter((e) => e.event_type === 'PROBLEM_COMPLETE');
/**
 * PRD 23 §ב as computeFirstAttemptScore applies it: an exercise is solved on
 * the first attempt when its PROBLEM_COMPLETE has no earlier DIGIT_ENTERED
 * with is_correct === false in the same exercise_id; null is ignored.
 */
const serverScore = () => {
  const wrong = new Set<string>();
  const firstTry = new Set<string>();
  for (const e of sent.events) {
    if (e.event_type === 'DIGIT_ENTERED' && e.details?.is_correct === false) wrong.add(e.exercise_id);
    else if (e.event_type === 'PROBLEM_COMPLETE' && !wrong.has(e.exercise_id)) firstTry.add(e.exercise_id);
  }
  return { correctFirstAttempt: firstTry.size };
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('Meeting 2 — a corrected wrong digit counts (owner, 28.9.2026, ruling 2; PRD 23 §ב)', () => {
  it('task 6 (124 + 85): a wrong tens digit, then the right one — the task is not solved on the first attempt', () => {
    loadDiagnostic('task6_vertical_addition');
    ws().setAnswerDigit('hundreds', '2');
    ws().setAnswerDigit('tens', '1'); // 209 has 0 tens
    ws().setAnswerDigit('tens', '0');
    ws().setAnswerDigit('units', '9');

    expect(digitEvents().map((e) => [e.column_index, e.details.is_correct])).toEqual([
      [2, true],
      [1, false],
      [1, true],
      [0, true],
    ]);
    expect(digitEvents().every((e) => e.exercise_id === 'task6_vertical_addition')).toBe(true);

    ws().proceed();
    // The final answer is right, so the task completes…
    expect(completes()).toHaveLength(1);
    expect(ws().qflow.results.task6_vertical_addition).toMatchObject({ correct: true, had_digit_error: true });
    // …but not on the first attempt, on the server and on the client alike.
    expect(serverScore().correctFirstAttempt).toBe(0);
  });

  it('task 1 (605): a wrong digit in one of the three boxes, then corrected, also counts', () => {
    loadDiagnostic('task1_read_write_zero');
    ws().setAnswerDigit('hundreds', '6');
    ws().setAnswerDigit('tens', '5');
    ws().setAnswerDigit('tens', '0');
    ws().setAnswerDigit('units', '5');
    expect(digitEvents().map((e) => e.details.is_correct)).toEqual([true, false, true, true]);
    ws().proceed();
    expect(completes()).toHaveLength(1);
    expect(serverScore().correctFirstAttempt).toBe(0);
  });

  it('the same task typed right the first time is solved on the first attempt', () => {
    loadDiagnostic('task6_vertical_addition');
    ws().setAnswerDigit('hundreds', '2');
    ws().setAnswerDigit('tens', '0');
    ws().setAnswerDigit('units', '9');
    ws().proceed();
    expect(digitEvents().every((e) => e.details.is_correct === true)).toBe(true);
    expect(ws().qflow.results.task6_vertical_addition).toMatchObject({ correct: true, had_digit_error: false });
    expect(serverScore().correctFirstAttempt).toBe(1);
  });

  it('memory circles of the addition task are judged too (124 + 85 carries into the hundreds only)', () => {
    loadDiagnostic('task6_vertical_addition');
    ws().setCarryDigit('hundreds', '1');
    ws().setCarryDigit('tens', '1');
    expect(digitEvents().map((e) => e.details.is_correct)).toEqual([true, false]);
  });

  it('memory circles of a subtraction task hold the child’s own note: not judged (Appendix A §3)', () => {
    loadDiagnostic('task3_subtraction_regrouping');
    ws().setCarryDigit('tens', '3');
    expect(digitEvents().map((e) => e.details.is_correct)).toEqual([null]);
  });
});

describe('Meeting 2, task 2 — judged by the value in the box at "התקדם" (owner, 28.9.2026, ruling 1)', () => {
  it('"4" on the way to "40" is not an error: the task is solved on the first attempt', () => {
    loadDiagnostic('task2_digit_value');
    typeInTask2Box('4');
    typeInTask2Box('40');
    expect(digitEvents().length).toBeGreaterThan(0);
    expect(digitEvents().every((e) => e.details.is_correct === null)).toBe(true);
    expect(ws().hasDigitErrorInTask).toBe(false);
    expect(ws().typedErrorCount).toBe(0);

    ws().proceed();
    expect(completes()).toHaveLength(1);
    expect(ws().qflow.results.task2_digit_value).toMatchObject({ correct: true, had_digit_error: false });
    expect(serverScore().correctFirstAttempt).toBe(1);
  });

  it('a wrong value in the box at "התקדם" is an error', () => {
    loadDiagnostic('task2_digit_value');
    typeInTask2Box('4');
    ws().proceed();
    expect(completes()).toHaveLength(0);
    expect(ws().qflow.results.task2_digit_value).toMatchObject({ correct: false });
    expect(serverScore().correctFirstAttempt).toBe(0);
  });

  it('the whole value in the box is judged, not its last two digits (140 is not 40)', () => {
    loadDiagnostic('task2_digit_value');
    typeInTask2Box('1');
    typeInTask2Box('14');
    typeInTask2Box('140');
    ws().proceed();
    expect(completes()).toHaveLength(0);
    expect(ws().qflow.results.task2_digit_value).toMatchObject({ correct: false });
    expect(serverScore().correctFirstAttempt).toBe(0);
  });
});

describe('diagnosticDigitTask', () => {
  it('in the correction round’s simpler exercise, digits follow the probe (40 − 10 = 30), as proceedQ does', () => {
    const qflow: QMatrixFlowState = {
      ...initQFlow(),
      phase: 'correction',
      subphase: 'subtask',
      failedTasks: ['task3_subtraction_regrouping'],
      taskIdx: taskIdx('task3_subtraction_regrouping'),
    };
    expect(diagnosticDigitTask(qflow, false)).toMatchObject({ numberA: 40, numberB: 10, correctAnswer: 30, isSubtraction: true });
  });

  it('in the retry, digits follow the task itself', () => {
    const qflow: QMatrixFlowState = {
      ...initQFlow(),
      phase: 'correction',
      subphase: 'retry',
      failedTasks: ['task3_subtraction_regrouping'],
      taskIdx: taskIdx('task3_subtraction_regrouping'),
    };
    expect(diagnosticDigitTask(qflow, false)).toMatchObject({ numberA: 42, numberB: 15, correctAnswer: 27 });
  });

  it('task 2 has no per-digit target', () => {
    expect(diagnosticDigitTask({ ...initQFlow(), taskIdx: taskIdx('task2_digit_value') }, false)).toBeNull();
  });
});
