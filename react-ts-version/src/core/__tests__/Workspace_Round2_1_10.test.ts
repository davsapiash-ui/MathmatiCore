/**
 * Fix round 2 (1.10.2026), the learner's workspace store. Each block is one
 * verified finding, driven through the real store; telemetry is captured at
 * emitTelemetry.
 *  - 14/26 undoing a board clear is reported as undoing a board clear
 *  - 17    the drag right and the click send the same REGROUPING_SUCCESS column
 *  - 24    a deleted digit is an action of its own: undo brings it back
 *  - 27    four wrong presses open no "four errors" card (register deviations 2, 17)
 *  - 28/78 meeting 8: three undos open the card after a lockout ended with the card closed
 *  - 73    the state machine passes through COMPLETE, and REGROUPING_ACTIVE ends
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

import { useWorkspaceStore, getActiveTasks, type SessionNumber, activeSuccessHold } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { REGROUP_ANIMATION_MS } from '@/application/useRegroupAnimationStore';
import { approvePath } from '@/test/approvedPath';
import { getSessionTasks, type SessionTask } from '@/data/sessionTasks';
import { EMPTY_COUNTS, type PlaceCounts } from '@/core/placeValue';
import { describeEvent } from '@/infrastructure/services/LearnerJourneyService';

const ws = () => useWorkspaceStore.getState();
const flush = () => new Promise((r) => setTimeout(r, 0));
const of = (type: string) => sent.events.filter((e) => e.event_type === type);
const lastOf = (type: string) => [...sent.events].reverse().find((e) => e.event_type === type);
const board = (c: Partial<PlaceCounts>) => useWorkspaceStore.setState({ counts: { ...EMPTY_COUNTS, ...c } });

function byId(id: string): SessionTask {
  for (const m of [4, 7] as const) {
    for (const p of ['green_path', 'remediation_path'] as const) {
      const t = (getSessionTasks(m as any, p) ?? []).find((x) => x.id === id);
      if (t) return t;
    }
  }
  throw new Error(`no task ${id}`);
}

/** One exercise on the screen, as the Owner_28_9 tests load it. */
function load(meeting: number, task: SessionTask) {
  ws().resetWorkspace();
  useAuthStore.setState({ user: { uid: 'student_user1', student_id: 1 } } as any);
  useWorkspaceStore.setState({
    sessionNumber: meeting, dynamicTasks: [task], standardTaskIdx: 0, flowStatus: 'task',
    helpState: 'closed', currentState: 'PROBLEM_ACTIVE', socraticTriggerReason: null, socraticCardPlace: null,
    operandDigits: { a: {}, b: {} },
  } as any);
  sent.events.length = 0;
}

/** A meeting started the real way, on the learner's approved path. */
function meeting(n: SessionNumber) {
  ws().resetWorkspace();
  useAuthStore.setState({ user: { uid: 'student_user4', student_id: 4 } } as any);
  approvePath();
  ws().initSession(n, false);
  const idx = getActiveTasks(ws()).findIndex((t) => typeof t.numberA === 'number' && typeof t.numberB === 'number');
  useWorkspaceStore.setState({ standardTaskIdx: Math.max(0, idx) });
  sent.events.length = 0;
}

describe('14/26 — undoing a board clear is reported as one', () => {
  beforeEach(() => meeting(4));

  it('UNDO_EXECUTED names BOARD_CLEARED, with no column, and the timeline says so', () => {
    board({ units: 3, tens: 2 });
    ws().clearBoard();
    expect(lastOf('BOARD_CLEARED')).toBeTruthy();
    ws().undo();
    const undo = lastOf('UNDO_EXECUTED');
    expect(undo.details.reverted_event_type).toBe('BOARD_CLEARED');
    expect('column_index' in undo).toBe(false);
    expect(ws().counts).toMatchObject({ units: 3, tens: 2 });
    expect(describeEvent({ eventType: 'UNDO_EXECUTED', details: undo.details } as any).detail).toBe('ביטל: ניקוי בית המספרים');
  });

  it('dragging one block to the trash is still undone as a block drag', () => {
    board({ units: 3 });
    ws().applyDrop({ source: 'column', sourcePlace: 'units', target: { kind: 'trash' } });
    ws().undo();
    expect(lastOf('UNDO_EXECUTED').details.reverted_event_type).toBe('BLOCK_DRAG_COMPLETE');
  });
});

describe('17 — both decomposition paths send the same REGROUPING_SUCCESS (Module 8 §א)', () => {
  beforeEach(() => meeting(4));

  const regroupingEvents = () =>
    sent.events
      .filter((e) => e.event_type === 'REGROUPING_TRIGGERED' || e.event_type === 'REGROUPING_SUCCESS')
      .map((e) => [e.event_type, e.column_index, e.details.regrouping_type]);

  it('a ten dragged onto the units is named by the tens column, as a click on it is', () => {
    board({ tens: 1 });
    ws().splitBlockClick('tens');
    const byClick = regroupingEvents();
    ws().undo();
    const undoAfterClick = lastOf('UNDO_EXECUTED').column_index;

    sent.events.length = 0;
    board({ tens: 1 });
    ws().applyDrop({ source: 'column', sourcePlace: 'tens', target: { kind: 'column', place: 'units' } });
    const byDrag = regroupingEvents();
    expect(byDrag).toEqual(byClick);
    expect(byDrag).toEqual([
      ['REGROUPING_TRIGGERED', 1, 'decomposition'],
      ['REGROUPING_SUCCESS', 1, 'decomposition'],
    ]);
    ws().undo();
    expect(lastOf('UNDO_EXECUTED').column_index).toBe(undoAfterClick);
    expect(undoAfterClick).toBe(1);
  });

  it('a hundred dragged onto the tens is named by the hundreds column', () => {
    board({ hundreds: 1 });
    ws().applyDrop({ source: 'column', sourcePlace: 'hundreds', target: { kind: 'column', place: 'tens' } });
    expect(lastOf('REGROUPING_SUCCESS').column_index).toBe(2);
    expect(ws().counts).toMatchObject({ hundreds: 0, tens: 10 });
  });

  it('the column the blocks landed in is still the one the conversion opens (Module 9 §א)', () => {
    board({ tens: 1 });
    ws().applyDrop({ source: 'column', sourcePlace: 'tens', target: { kind: 'column', place: 'units' } });
    expect(ws().conversionsByColumn.decomposed.units).toBeTruthy();
  });
});

describe('24 — deleting a digit can be undone, one action per press (Module 11 §א)', () => {
  beforeEach(() => meeting(8));
  // A wrong digit schedules its own card on the next tick; let it land here,
  // not in the next test.
  afterEach(async () => {
    await flush();
    ws().closeHelp();
  });

  it('the result row: undo brings the deleted digit back, the next undo takes the typing back', () => {
    ws().setAnswerDigit('units', '5');
    ws().setAnswerDigit('units', '');
    expect(ws().answerDigits.units).toBe('');
    ws().undo();
    expect(ws().answerDigits.units).toBe('5');
    expect(lastOf('UNDO_EXECUTED').details.reverted_event_type).toBe('DIGIT_DELETED');
    expect(lastOf('UNDO_EXECUTED').column_index).toBe(0);
    ws().undo();
    expect(ws().answerDigits.units).toBeFalsy();
    expect(lastOf('UNDO_EXECUTED').details.reverted_event_type).toBe('DIGIT_ENTERED');
  });

  it('a deletion after typing in another box is undone alone', () => {
    ws().setAnswerDigit('units', '5');
    ws().setAnswerDigit('tens', '4');
    ws().setAnswerDigit('units', '');
    ws().undo();
    expect(ws().answerDigits).toMatchObject({ units: '5', tens: '4' });
  });

  it('the memory circles and the hidden operand cells too', () => {
    ws().setCarryDigit('tens', '1');
    ws().setCarryDigit('tens', '');
    ws().undo();
    expect(ws().carryDigits.tens).toBe('1');

    useWorkspaceStore.setState({ operandDigits: { a: {}, b: {} } } as any);
    ws().setOperandDigit('a', 'units', '3');
    ws().setOperandDigit('a', 'units', '');
    ws().undo();
    expect(ws().operandDigits.a.units).toBe('3');
  });

  it('a deletion ends a run of undos: "consecutive" means consecutive', () => {
    ws().setAnswerDigit('units', '1');
    ws().setAnswerDigit('tens', '2');
    ws().undo();
    expect(ws().consecutiveUndoCount).toBe(1);
    ws().setAnswerDigit('units', '');
    expect(ws().consecutiveUndoCount).toBe(0);
  });

  it('erasing an empty box is no action', () => {
    const depth = ws().undoStack.length;
    ws().setAnswerDigit('units', '');
    expect(ws().undoStack.length).toBe(depth);
  });
});

describe('27 — wrong presses open the repeated-errors card, never a "four errors" one', () => {
  // s7_r_t6: build 340, add 2 hundreds, take away 3 tens — 510. The right
  // answer typed with the board left at 340 fails on the board alone, with no
  // wrong digit typed.
  const t = () => byId('s7_r_t6');
  beforeEach(() => load(7, t()));

  it('four wrong presses: every card is repeated_errors, the submission count still reaches PROBLEM_COMPLETE', async () => {
    board({ hundreds: 3, tens: 4 });
    ws().setAnswerDigit('hundreds', '5');
    ws().setAnswerDigit('tens', '1');
    ws().setAnswerDigit('units', '0');
    expect(of('DIGIT_ENTERED').every((e) => e.details.is_correct !== false)).toBe(true);
    const reasons: string[] = [];
    for (let i = 0; i < 4; i++) {
      ws().proceed();
      expect(ws().feedback?.correct).toBe(false);
      await flush();
      if (ws().helpState === 'friction') ws().helpFrictionDone();
      if (ws().helpState === 'socratic') {
        reasons.push(String(ws().socraticTriggerReason));
        ws().closeHelp();
      }
      useWorkspaceStore.setState({ feedback: null } as any);
    }
    expect(ws().consecutiveErrorCount).toBe(4);
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons).toEqual(reasons.map(() => 'repeated_errors'));

    board({ hundreds: 5, tens: 1 });
    ws().proceed();
    // Solved: held on the screen with "נכון!" (owner, 7.10.2026).
    expect(activeSuccessHold(ws())).not.toBeNull();
    // A representation exercise reports its failed board checks.
    expect(lastOf('PROBLEM_COMPLETE').details.error_count).toBe(4);
  });

  it('the counter alone opens nothing', async () => {
    for (let i = 0; i < 5; i++) ws().incrementConsecutiveErrors();
    await flush();
    expect(ws().helpState).not.toBe('socratic');
  });
});

describe('28/78 — meeting 8: three undos after a lockout that ended with the card closed', () => {
  const threeFrames = () => [1, 2, 3].map((u) => ({ counts: { ...EMPTY_COUNTS, units: u }, actionType: 'BLOCK_DRAG_COMPLETE' as const }));
  const lockedAt = (deadline: number) => {
    ws().resetWorkspace();
    useWorkspaceStore.setState({
      sessionNumber: 8, currentState: 'PROBLEM_ACTIVE', helpState: 'closed', undoStack: threeFrames(), consecutiveUndoCount: 0,
      isSocraticCardLocked: true, socraticLockDeadline: deadline, socraticPenaltyLockoutUntil: deadline,
    } as any);
  };

  it('a lockout that ended while the card was closed no longer blocks the card', async () => {
    lockedAt(Date.now() - 1);
    ws().undo(); ws().undo(); ws().undo();
    await flush();
    expect(ws().helpState).toBe('socratic');
    expect(ws().socraticTriggerReason).toBe('consecutive_undos_3');
    expect(ws().isSocraticCardLocked).toBe(false);
  });

  it('a lockout still running still blocks it', async () => {
    lockedAt(Date.now() + 30_000);
    ws().undo(); ws().undo(); ws().undo();
    await flush();
    expect(ws().helpState).not.toBe('socratic');
    expect(ws().isSocraticCardLocked).toBe(true);
  });
});

describe('73 — the state machine (Module 29 §ב)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a solved exercise passes through COMPLETE', () => {
    load(7, byId('s7_r_t2'));
    const seen: string[] = [];
    const unsubscribe = useWorkspaceStore.subscribe((s) => {
      if (seen[seen.length - 1] !== s.currentState) seen.push(s.currentState);
    });
    board({ hundreds: 5, tens: 6, units: 8 });
    ws().setOperandDigit('a', 'units', '4');
    ws().proceed();
    unsubscribe();
    // Solved: held on the screen with "נכון!" (owner, 7.10.2026).
    expect(activeSuccessHold(ws())).not.toBeNull();
    expect(seen).toContain('COMPLETE');
    // The only exercise of this list: the learner moves on to the path choice.
    expect(ws().currentState).toBe('COMPLETE');
  });

  it('the next exercise starts PROBLEM_ACTIVE again', () => {
    const t = byId('s7_r_t2');
    load(7, t);
    useWorkspaceStore.setState({ dynamicTasks: [t, { ...t, id: 's7_r_t2_next' }] } as any);
    const seen: string[] = [];
    const unsubscribe = useWorkspaceStore.subscribe((s) => {
      if (seen[seen.length - 1] !== s.currentState) seen.push(s.currentState);
    });
    board({ hundreds: 5, tens: 6, units: 8 });
    ws().setOperandDigit('a', 'units', '4');
    ws().proceed();
    // Solved: COMPLETE while held, then "ממשיכים" opens the next one (owner, 7.10.2026).
    expect(ws().currentState).toBe('COMPLETE');
    ws().proceed();
    unsubscribe();
    expect(ws().standardTaskIdx).toBe(1);
    expect(seen.slice(-2)).toEqual(['COMPLETE', 'PROBLEM_ACTIVE']);
    expect(ws().currentState).toBe('PROBLEM_ACTIVE');
  });

  it('REGROUPING_ACTIVE lasts while the conversion plays, then PROBLEM_ACTIVE', () => {
    vi.useFakeTimers();
    meeting(4);
    board({ tens: 1 });
    ws().splitBlockClick('tens');
    expect(ws().currentState).toBe('REGROUPING_ACTIVE');
    vi.advanceTimersByTime(REGROUP_ANIMATION_MS - 1);
    expect(ws().currentState).toBe('REGROUPING_ACTIVE');
    vi.advanceTimersByTime(1);
    expect(ws().currentState).toBe('PROBLEM_ACTIVE');

    // The drag right and the grouping button end the same way.
    ws().applyDrop({ source: 'column', sourcePlace: 'units', target: { kind: 'column', place: 'units' } });
    board({ tens: 1 });
    ws().applyDrop({ source: 'column', sourcePlace: 'tens', target: { kind: 'column', place: 'units' } });
    expect(ws().currentState).toBe('REGROUPING_ACTIVE');
    ws().groupColumnClick('units');
    vi.advanceTimersByTime(REGROUP_ANIMATION_MS);
    expect(ws().currentState).toBe('PROBLEM_ACTIVE');
  });

  it('a conversion under an open coaching card keeps the card the active state', () => {
    vi.useFakeTimers();
    meeting(4);
    useWorkspaceStore.setState({ helpState: 'socratic', currentState: 'SOCRATIC_ACTIVE' } as any);
    board({ tens: 1 });
    ws().splitBlockClick('tens');
    expect(ws().currentState).toBe('SOCRATIC_ACTIVE');
    vi.advanceTimersByTime(REGROUP_ANIMATION_MS);
    expect(ws().currentState).toBe('SOCRATIC_ACTIVE');
    ws().closeHelp();
    expect(ws().currentState).toBe('PROBLEM_ACTIVE');
  });
});

describe('no regression: the drop rules themselves are unchanged', () => {
  beforeEach(() => meeting(4));
  it('a palette block onto its own column is a plain drag with its column', () => {
    ws().applyDrop({ source: 'palette', sourcePlace: 'tens', target: { kind: 'column', place: 'tens' } });
    const e = lastOf('BLOCK_DRAG_COMPLETE');
    expect(e.column_index).toBe(1);
    expect(of('REGROUPING_SUCCESS')).toHaveLength(0);
  });
});
