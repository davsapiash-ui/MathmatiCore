/**
 * @vitest-environment jsdom
 */
/**
 * After a correct answer (owner, 7.10.2026): the solved exercise stays on the
 * screen until "ממשיכים" — the board as solved, the column digits shown, the
 * columns not dimmed, and why the answer is right, read from the board. The
 * board takes no change meanwhile, no grid or card opens, a reload keeps it,
 * and ten seconds on a quiet reminder rings the button in its fixed place
 * (מסמך 04, עקביות). Not meeting 1's tool steps, not meetings 2 and 8.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
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

import { useWorkspaceStore, activeSuccessHold, holdsAfterSuccess, selectCanProceed } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { boardDimmedColumns } from '@/application/boardDimming';
import { getSessionTasks, type SessionTask } from '@/data/sessionTasks';
import { EMPTY_COUNTS } from '@/core/placeValue';
import { successExplanationHe, tradesFromUndoStack } from '@/core/successExplanation';
import { PlaceValueBoard } from '@/features/workspace/board/PlaceValueBoard';
import { TaskCard } from '@/features/workspace/tasks/TaskCard';
import { SUCCESS_REMINDER_MS } from '@/features/workspace/useSuccessHoldReminder';

const ws = () => useWorkspaceStore.getState();
const code = (rel: string) => readFileSync(resolve(__dirname, '..', '..', rel), 'utf8');
const task = (m: 1 | 3 | 4 | 5 | 6 | 7 | 8, id: string): SessionTask => {
  const t = (getSessionTasks(m, 'green_path') ?? []).find((x) => x.id === id);
  if (!t) throw new Error(`no task ${id}`);
  return t;
};

/** s4_g_t1: 1,245 + 328 = 1,573, two exercises so the next one can open. */
function loadS4() {
  ws().resetWorkspace();
  useAuthStore.setState({ user: { uid: 'student_user1', student_id: 1 } } as any);
  const t = task(4, 's4_g_t1');
  useWorkspaceStore.setState({
    activeSupportProfileId: null, sessionNumber: 4, dynamicTasks: [t, { ...t, id: 's4_g_t1_next' }],
    standardTaskIdx: 0, flowStatus: 'task', helpState: 'closed', currentState: 'PROBLEM_ACTIVE',
  } as any);
  sent.events.length = 0;
}

/** The child's own work: 1,245 and 328 in blocks, the ten units grouped, 1,573 typed. */
function solveS4() {
  const drop = (place: 'units' | 'tens' | 'hundreds' | 'thousands', n: number) => {
    for (let i = 0; i < n; i++) ws().applyDrop({ source: 'palette', sourcePlace: place, target: { kind: 'column', place } });
  };
  drop('thousands', 1); drop('hundreds', 5); drop('tens', 6); drop('units', 13);
  ws().groupColumnClick('units');
  ws().setCarryDigit('tens', '1');
  for (const [p, d] of [['units', '3'], ['tens', '7'], ['hundreds', '5'], ['thousands', '1']] as const) ws().setAnswerDigit(p, d);
}

beforeEach(() => {
  vi.useFakeTimers();
  loadS4();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('the explanation says what is true on the board', () => {
  it('the trades still in effect, then the board, then a zero inside the number', () => {
    const before = { ...EMPTY_COUNTS, thousands: 1, hundreds: 5, tens: 6, units: 13 };
    const after = { ...EMPTY_COUNTS, thousands: 1, hundreds: 5, tens: 7, units: 3 };
    const trades = tradesFromUndoStack([{ counts: before, actionType: 'REGROUPING_SUCCESS' }], after);
    expect(trades).toEqual([{ kind: 'group', from: 'units' }]);
    expect(successExplanationHe({ counts: after, answer: 1573, trades, fallback: 'x' })).toBe(
      'קיבצתם 10 יחידות לעשרת אחת. עכשיו בבית המספרים יש אלף אחד, 5 מאות, 7 עשרות ו-3 יחידות, וזה בדיוק 1,573.'
    );
    expect(successExplanationHe({ counts: { ...EMPTY_COUNTS, hundreds: 3, units: 5 }, answer: 305, trades: [], fallback: 'x' })).toBe(
      'בבית המספרים יש 3 מאות ו-5 יחידות, וזה בדיוק 305. אין עשרות, ולכן כותבים 0 במקום העשרות.'
    );
    expect(successExplanationHe({ counts: { ...EMPTY_COUNTS, thousands: 2 }, answer: 2000, trades: [], fallback: 'x' })).toBe(
      'בבית המספרים יש 2 אלפים, וזה בדיוק 2,000. אין מאות, עשרות ויחידות, ולכן כותבים 0 במקום המאות, 0 במקום העשרות ו-0 במקום היחידות.'
    );
  });

  it('a split, twice and once', () => {
    const b1 = { ...EMPTY_COUNTS, hundreds: 2, tens: 0, units: 5 };
    const b2 = { ...EMPTY_COUNTS, hundreds: 1, tens: 10, units: 5 };
    const b3 = { ...EMPTY_COUNTS, hundreds: 1, tens: 9, units: 15 };
    expect(tradesFromUndoStack([{ counts: b1, actionType: 'REGROUPING_SUCCESS' }, { counts: b2, actionType: 'REGROUPING_SUCCESS' }], b3)).toEqual([
      { kind: 'split', from: 'hundreds' },
      { kind: 'split', from: 'tens' },
    ]);
  });

  it('a board that is not the answer in its plain form keeps the exercise\'s own sentence', () => {
    const fallback = 'בניתם את המספר מלבני עשרת בלבד, והתשובה שכתבתם נכונה.';
    // 450 built from 45 tens: a column over nine.
    expect(successExplanationHe({ counts: { ...EMPTY_COUNTS, tens: 45 }, answer: 45, trades: [], fallback })).toBe(fallback);
    // A skeleton solved by the number found (314), not the result (568).
    expect(successExplanationHe({ counts: { ...EMPTY_COUNTS, hundreds: 3, tens: 1, units: 4 }, answer: 568, trades: [], fallback })).toBe(fallback);
  });
});

describe('the hold', () => {
  it('a correct answer holds the exercise: no toast, no advance, PROBLEM_COMPLETE once, COMPLETE state', () => {
    solveS4();
    ws().proceed();
    const hold = activeSuccessHold(ws());
    expect(hold?.taskId).toBe('s4_g_t1');
    expect(hold?.explanationHe).toBe('קיבצתם 10 יחידות לעשרת אחת. עכשיו בבית המספרים יש אלף אחד, 5 מאות, 7 עשרות ו-3 יחידות, וזה בדיוק 1,573.');
    expect(ws().feedback).toBeNull();
    expect(ws().standardTaskIdx).toBe(0);
    expect(ws().currentState).toBe('COMPLETE');
    expect(sent.events.filter((e) => e.event_type === 'PROBLEM_COMPLETE')).toHaveLength(1);
    expect(selectCanProceed(ws())).toBe(true);
  });

  it('a wrong answer\'s message does not stay beside "נכון!"', () => {
    solveS4();
    ws().setAnswerDigit('tens', '6');
    ws().proceed();
    expect(ws().feedback?.correct).toBe(false);
    ws().setAnswerDigit('tens', '7');
    ws().proceed();
    expect(activeSuccessHold(ws())).not.toBeNull();
    expect(ws().feedback).toBeNull();
    vi.advanceTimersByTime(10_000);
    expect(activeSuccessHold(ws())).not.toBeNull();
  });

  it('the board takes no change while held: blocks, groupings, undo, trash, digits', () => {
    solveS4();
    ws().proceed();
    const board = { ...ws().counts };
    const answer = { ...ws().answerDigits };
    ws().applyDrop({ source: 'palette', sourcePlace: 'units', target: { kind: 'column', place: 'units' } });
    ws().splitBlockClick('thousands');
    ws().undo();
    ws().clearBoard();
    ws().setAnswerDigit('units', '9');
    ws().setCarryDigit('hundreds', '1');
    expect(ws().counts).toEqual(board);
    expect(ws().answerDigits).toEqual(answer);
    expect(activeSuccessHold(ws())).not.toBeNull();
  });

  it('"ממשיכים" moves on, and the next exercise starts clean', () => {
    solveS4();
    ws().proceed();
    ws().proceed();
    expect(ws().standardTaskIdx).toBe(1);
    expect(ws().successHold).toBeNull();
    expect(ws().currentState).toBe('PROBLEM_ACTIVE');
    expect(ws().counts).toEqual(EMPTY_COUNTS);
  });

  it('the columns are not dimmed and the digits are shown while held', () => {
    solveS4();
    ws().proceed();
    expect(boardDimmedColumns(ws(), null).size).toBe(0);
    render(React.createElement(DndContext, null, React.createElement(PlaceValueBoard, null)));
    expect(screen.getByTestId('column-digit-units').textContent).toContain('3');
    expect(screen.getByTestId('column-digit-thousands').textContent).toContain('1');
  });

  it('a reload keeps the hold on its exercise; another learner on the device does not inherit it', () => {
    solveS4();
    ws().proceed();
    const saved = JSON.parse(JSON.stringify({ ...ws(), successHold: ws().successHold }));
    ws().restoreSession(saved);
    // (The test's two-exercise set is not a bank a reload rebuilds; the field is what is checked.)
    expect(ws().successHold?.taskId).toBe('s4_g_t1');
    expect(ws().successHold?.explanationHe).toBe(saved.successHold.explanationHe);
    ws().resetWorkspace();
    expect(ws().successHold).toBeNull();
    expect(code('infrastructure/services/FirebaseSyncService.ts')).toContain('successHold: state.successHold ?? null');
  });

  it('who is held: exercises of meetings 1 and 3–7; not the tool steps, not 347, not meetings 2 and 8', () => {
    expect(holdsAfterSuccess(4, { id: 's4_g_t1', type: 'vertical_addition' })).toBe(true);
    expect(holdsAfterSuccess(1, { id: 's1_r_words703', type: 'representation' })).toBe(true);
    expect(holdsAfterSuccess(1, { id: 's1_sandbox_controlled', type: 'session1_intro' })).toBe(false);
    expect(holdsAfterSuccess(1, { id: 's1_target_347', type: 'representation' })).toBe(false);
    expect(holdsAfterSuccess(2, { id: 'q1', type: 'place_value_zero' })).toBe(false);
    expect(holdsAfterSuccess(8, { id: 's8_g_t1', type: 'vertical_addition' })).toBe(false);
  });

  it('the radar is paused, and a grid deferred behind a card does not open onto a solved exercise', () => {
    const page = code('features/workspace/StudentWorkspacePage.tsx');
    expect(page).toContain("!isTeacherOrAdmin && !successHeld");
    expect(code('application/useCognitiveHesitationRadar.ts')).toMatch(/!state\.awaitingNext &&[\s\S]{0,200}!activeSuccessHold\(state\)/);
  });
});

describe('what the child sees', () => {
  it('"נכון!" and the explanation in the instruction\'s place; ten seconds on, the reminder', () => {
    solveS4();
    ws().proceed();
    render(React.createElement(TaskCard));
    expect(screen.queryByTestId('task-instruction')).toBeNull();
    expect(screen.getByTestId('success-panel').textContent).toContain('נכון!');
    expect(screen.getByTestId('success-explanation').textContent).toContain('וזה בדיוק 1,573');
    expect(screen.queryByTestId('success-reminder')).toBeNull();
    act(() => { vi.advanceTimersByTime(SUCCESS_REMINDER_MS + 50); });
    expect(screen.getByTestId('success-reminder').textContent).toBe('כשתהיו מוכנים, לחצו על "ממשיכים".');
  });

  it('"ממשיכים" keeps its fixed place at the top (מסמך 04, עקביות) and gets the ring there', () => {
    const bar = code('features/workspace/WorkspaceTopbar.tsx');
    expect(bar).toContain('data-testid="proceed-button"');
    expect(bar).toContain("data-reminder={remindProceed ? 'true' : undefined}");
  });
});
