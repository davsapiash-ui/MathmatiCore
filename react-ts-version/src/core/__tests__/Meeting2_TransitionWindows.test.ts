import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { useStore } from '@/application/useStore';
import { TASKS } from '@/core/QMatrix';
import { initQFlow, type QMatrixFlowState } from '@/core/qmatrixFlow';

/**
 * The moves between diagnostic steps wait behind a toast (1.5–2.2 s). The
 * answer is recorded when "התקדם" is pressed; the move is not saved until it
 * happens. A reload, a sign-out or the teacher opening another meeting inside
 * that window used to:
 *  - leave the child on an empty card with "התקדם" off, the diagnostic never
 *    recorded as finished (a reload during "סיימתם");
 *  - bring an answered task back, so a corrected second try was scored as a
 *    first attempt (PRD Module 23 §ב);
 *  - end the next meeting with the previous meeting's pending step.
 */

const store = () => useWorkspaceStore.getState();

function answer(value: number | undefined) {
  useWorkspaceStore.setState({ probeAnswer: String(value), openingScreenSeen: true });
  store().proceed();
}

function snapshot(qflow: QMatrixFlowState, extra: Record<string, unknown> = {}) {
  return {
    sessionNumber: 2,
    flowStatus: 'task',
    qflow,
    openingScreenSeen: true,
    probeAnswer: '4',
    answerDigits: { units: 4 },
    ...extra,
  } as any;
}

beforeEach(() => {
  vi.useFakeTimers();
  store().resetWorkspace();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('a reload inside a meeting-2 toast carries out the step it was waiting for', () => {
  it('an answered primary task never comes back: the next task opens, clean', () => {
    const qflow: QMatrixFlowState = {
      ...initQFlow(),
      taskIdx: 1,
      results: {
        [TASKS[0].id]: { correct: true, detail: '' },
        [TASKS[1].id]: { correct: false, detail: 'wrong_answer' },
      },
    };
    store().restoreSession(snapshot(qflow));
    const s = store();
    expect(s.qflow.taskIdx).toBe(2);
    expect(s.qflow.results[TASKS[1].id].correct).toBe(false);
    expect(s.probeAnswer).toBe('');
    expect(s.answerDigits).toEqual({});
    expect(s.flowStatus).toBe('task');
  });

  it('the last answer in with nothing failed: the meeting ends on its end screen', () => {
    const results = Object.fromEntries(TASKS.map((t) => [t.id, { correct: true, detail: '' }]));
    store().restoreSession(snapshot({ ...initQFlow(), taskIdx: TASKS.length - 1, results }));
    expect(store().flowStatus).toBe('sessionDone');
  });

  it('the "סיימתם" toast cut short (flow already past the last task): the end screen, not an empty card', () => {
    const results = Object.fromEntries(TASKS.map((t) => [t.id, { correct: true, detail: '' }]));
    store().restoreSession(snapshot({ ...initQFlow(), taskIdx: TASKS.length, results }));
    expect(store().flowStatus).toBe('sessionDone');
  });

  it('the last answer in with a failed task: the correction round opens on it, clean', () => {
    const results = Object.fromEntries(TASKS.map((t, i) => [t.id, { correct: i !== 2, detail: '' }]));
    store().restoreSession(snapshot({ ...initQFlow(), taskIdx: TASKS.length - 1, results }));
    const s = store();
    expect(s.flowStatus).toBe('task');
    expect(s.qflow.phase).toBe('correction');
    expect(s.qflow.taskIdx).toBe(2);
    expect(s.probeAnswer).toBe('');
  });

  it('an answered simpler exercise moves on to the retry, without its number in the box', () => {
    const failedId = TASKS[2].id;
    const qflow: QMatrixFlowState = {
      taskIdx: 2,
      phase: 'correction',
      subphase: 'subtask',
      failedTasks: [failedId],
      correctionIdx: 0,
      results: { [failedId]: { correct: false, detail: 'wrong_answer', subtaskCorrect: true, subtaskDetail: '' } },
    };
    store().restoreSession(snapshot(qflow, { probeAnswer: '30' }));
    const s = store();
    expect(s.qflow.subphase).toBe('retry');
    expect(s.probeAnswer).toBe('');
  });

  it('a snapshot with nothing pending is restored as it was', () => {
    const qflow: QMatrixFlowState = { ...initQFlow(), taskIdx: 3, results: {
      [TASKS[0].id]: { correct: true, detail: '' },
      [TASKS[1].id]: { correct: true, detail: '' },
      [TASKS[2].id]: { correct: true, detail: '' },
    } };
    store().restoreSession(snapshot(qflow));
    expect(store().qflow.taskIdx).toBe(3);
    expect(store().probeAnswer).toBe('4');
  });
});

describe('restoring from the learner record', () => {
  it('a copy saved before the first answer (RTDB drops the empty results and failedTasks) restores without a crash', () => {
    const fromRtdb = snapshot({ taskIdx: 0, phase: 'primary', subphase: 'subtask', correctionIdx: 0 } as any);
    expect(() => store().restoreSession(fromRtdb)).not.toThrow();
    expect(store().qflow.results).toEqual({});
    expect(store().qflow.failedTasks).toEqual([]);
    expect(store().flowStatus).toBe('task');
  });

  it('a finished diagnostic restored after the teacher approved the path is not recorded again', () => {
    useAuthStore.setState({ user: { uid: 'student_user4' } as any, role: 'student' } as any);
    useStore.setState({
      firebaseLoaded: true,
      students: { student_user4: { studentId: 'student_user4', completedMeeting2: true, routeStatus: 'APPROVED', teacher_gate_approved: true } as any },
    } as any);
    const markComplete = vi.spyOn(useStore.getState(), 'markMeeting2Complete');
    const results = Object.fromEntries(TASKS.map((t) => [t.id, { correct: true, detail: '' }]));
    store().restoreSession(snapshot({ ...initQFlow(), taskIdx: TASKS.length, results }));
    expect(store().flowStatus).toBe('sessionDone');
    expect(markComplete).not.toHaveBeenCalled();
    expect(useStore.getState().students.student_user4.routeStatus).toBe('APPROVED');
    markComplete.mockRestore();
    useAuthStore.setState({ user: null } as any);
  });
});

describe('a step waiting behind a toast stays in its own meeting', () => {
  it('the teacher opens meeting 3 during "סיימתם": meeting 3 is not ended by it', () => {
    store().initSession(2, false);
    for (const t of TASKS) {
      answer(t.correctAnswer);
      vi.advanceTimersByTime(1600);
    }
    // "סיימתם" is on the screen now; the teacher opens the next meeting.
    store().initSession(3, false);
    vi.advanceTimersByTime(5000);
    expect(store().sessionNumber).toBe(3);
    expect(store().flowStatus).toBe('task');
  });

  it('the correction round opens its step with the toast, clean, and "התקדם" waits for the toast', () => {
    store().initSession(2, false);
    TASKS.forEach((t, i) => {
      answer(i === 0 ? -1 : t.correctAnswer);
      vi.advanceTimersByTime(1600);
    });
    const s = store();
    expect(s.qflow.phase).toBe('correction');
    expect(s.qflow.taskIdx).toBe(0);
    expect(s.probeAnswer).toBe('');
    expect(s.awaitingNext).toBe(true);
    vi.advanceTimersByTime(1900);
    expect(store().awaitingNext).toBe(false);
  });
});
