/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';

/**
 * The client machinery that opens the Socratic coaching card — round of
 * 1.10.2026 (PRD Modules 9–14, 16, 18; register 2, 17; the owner's decisions
 * D1–D7 of 1.10.2026). Every trigger, through the real store:
 *  - opens the card exactly when it should, with its column in
 *    socraticCardPlace and in SOCRATIC_CARD_SHOWN.column_index;
 *  - never on a solved exercise, under a class screen, on the reflection
 *    board, nor again and again for the same situation;
 *  - one aid per answer (the place cues and the card never come on the same
 *    wrong answer), and the card on the SECOND wrong answer;
 *  - the research events are sent once per real action, never from the
 *    reflection board or from a card nobody saw.
 */

vi.mock('firebase/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/database')>();
  const noop = async () => undefined;
  return {
    ...actual,
    ref: vi.fn((_db: unknown, path = '') => ({ _path: path })),
    set: vi.fn(noop),
    update: vi.fn(noop),
    remove: vi.fn(noop),
    get: vi.fn(async () => ({ exists: () => false, val: () => null })),
    push: vi.fn(() => ({ key: 'k', _path: 'k' })),
    onValue: vi.fn(() => () => undefined),
    onDisconnect: vi.fn(() => ({ set: noop, cancel: noop })),
    runTransaction: vi.fn(noop),
    serverTimestamp: vi.fn(() => 0),
  };
});

const emitted = vi.hoisted(() => [] as any[]);
vi.mock('@/infrastructure/services/FirebaseSyncService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/infrastructure/services/FirebaseSyncService')>();
  return {
    ...actual,
    emitTelemetry: vi.fn(async (e: any) => { emitted.push(e); }),
  };
});

const mockStorage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((key: string) => (key in mockStorage ? mockStorage[key] : null)),
  setItem: vi.fn((key: string, val: string) => { mockStorage[key] = String(val); }),
  removeItem: vi.fn((key: string) => { delete mockStorage[key]; }),
  clear: vi.fn(() => { Object.keys(mockStorage).forEach((k) => delete mockStorage[k]); }),
};
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage, writable: true, configurable: true });
Object.defineProperty(window, 'sessionStorage', { value: mockLocalStorage, writable: true, configurable: true });

import {
  useWorkspaceStore,
  judgeStandardTask,
  cardFocusPlace,
  MAX_IDENTICAL_SOCRATIC_CARDS,
  CONVERSION_CARD_COOLDOWN_MS,
  MEETING8_SOLVED_SUB_HE,
  type SocraticTriggerReason,
} from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { useBoardFocusStore } from '@/application/useBoardFocusStore';
import { SocraticEngine, type SocraticHintResponse } from '@/infrastructure/services/SocraticEngine';
import { SocraticSidePanel, HelpOverlays } from '@/features/workspace/overlays/HelpOverlays';
import { session1Checklist } from '@/core/session1Checklist';
import { getSessionTasks, type SessionTask } from '@/data/sessionTasks';
import { getSessionBranchTasks } from '@/data/sessionBranchTasks';
import { EMPTY_COUNTS, type Place, type PlaceCounts } from '@/core/placeValue';

const ws = () => useWorkspaceStore.getState();
const flush = () => vi.advanceTimersByTimeAsync(0);
const stripNiqqud = (t: string) => t.replace(/[֑-ׇ]/g, '');
const ofType = (t: string) => emitted.filter((e) => e.event_type === t);
const cardOpen = () => ws().helpState === 'socratic';

function allTasks(): SessionTask[] {
  const out: SessionTask[] = [];
  for (const m of [1, 3, 4, 5, 6, 7, 8] as const) {
    for (const p of ['green_path', 'remediation_path'] as const) {
      out.push(...(getSessionTasks(m as any, p) ?? []));
      out.push(...getSessionBranchTasks(m, 'reinforcement', p), ...getSessionBranchTasks(m, 'challenge', p));
    }
  }
  return out;
}
const byId = (id: string) => {
  const t = allTasks().find((x) => x.id === id);
  if (!t) throw new Error(`no task ${id}`);
  return t;
};

/** The exercise on screen, as a task start leaves it (resetWorkspace + the task alone in the list). */
function load(meeting: number, task: SessionTask | SessionTask[], extra: Record<string, unknown> = {}) {
  ws().resetWorkspace();
  useAuthStore.setState({ user: { uid: 'student_user1', student_id: 1, role: 'student' } } as any);
  useWorkspaceStore.setState({
    sessionNumber: meeting,
    dynamicTasks: Array.isArray(task) ? task : [task],
    standardTaskIdx: 0,
    flowStatus: 'task',
    awaitingNext: false,
    openingScreenSeen: true,
    helpState: 'closed',
    currentState: 'PROBLEM_ACTIVE',
    operandDigits: { a: {}, b: {} },
    ...extra,
  } as any);
  useBoardFocusStore.setState({ focusedMemoryCircle: null });
  emitted.length = 0;
}
const board = (c: Partial<PlaceCounts>) => useWorkspaceStore.setState({ counts: { ...EMPTY_COUNTS, ...c } });
const boardOf = (n: number) =>
  board({ thousands: Math.floor(n / 1000) % 10, hundreds: Math.floor(n / 100) % 10, tens: Math.floor(n / 10) % 10, units: n % 10 });
/** The result row, digit by digit from the units (as the row's focus moves). */
function typeRow(n: string) {
  const places: Place[] = ['units', 'tens', 'hundreds', 'thousands'];
  [...n].reverse().forEach((d, i) => ws().setAnswerDigit(places[i], d));
}
/** "התקדם", and the 300 ms beat (HelpOverlays) if it started. */
async function press() {
  ws().proceed();
  if (ws().helpState === 'friction') ws().helpFrictionDone();
  await flush();
}

// s4_g_t1: 1,245 + 328 = 1,573 — only the units convert (5 + 8 = 13).
const T4 = () => byId('s4_g_t1');

beforeEach(() => {
  vi.useFakeTimers();
  mockLocalStorage.clear();
  emitted.length = 0;
  // The engine is not reachable: the static card settles at once.
  vi.spyOn(SocraticEngine, 'getSocraticHint').mockRejectedValue(new Error('offline'));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('a wrong "התקדם" (repeated_errors): the card on the second wrong answer in a row', () => {
  beforeEach(() => {
    load(4, T4());
    boardOf(1573);
  });

  it('the first wrong answer: feedback only; the second: the card, about the lowest WRONG column (the press took the focus away)', async () => {
    typeRow('1583'); // the tens are wrong (8 for 7), a slip — not a digit in the wrong place
    ws().setFocusedPlace(null);
    await press();
    expect(cardOpen()).toBe(false);
    expect(ws().wrongAnswerStreak).toBe(1);
    await press();
    expect(cardOpen()).toBe(true);
    expect(ws().socraticTriggerReason).toBe('repeated_errors');
    expect(ws().socraticCardPlace).toBe('tens');
  });

  it('an empty answer, and no choice made, are not wrong answers: no streak, no card (register 17)', async () => {
    for (let i = 0; i < 3; i++) await press();
    expect(ws().wrongAnswerStreak).toBe(0);
    expect(cardOpen()).toBe(false);

    // A choice question pressed with no option chosen (s4_g_t7).
    load(4, byId('s4_g_t7'), { hasInteracted: true });
    for (let i = 0; i < 3; i++) await press();
    expect(ws().feedback?.title).toBe('בַּחֲרוּ תְּשׁוּבָה');
    expect(ws().wrongAnswerStreak).toBe(0);
    expect(cardOpen()).toBe(false);
  });

  it('one aid per answer: the press that turns the place cues on opens no card; the next wrong answer does', async () => {
    typeRow('1583');
    await press(); // wrong 1: feedback
    typeRow('3751'); // the answer's digits in the wrong places
    await press(); // wrong 2: the place cues — and no card on this answer
    expect(ws().placeCuesShown).toBe(true);
    expect(ws().wrongAnswerStreak).toBe(2);
    expect(cardOpen()).toBe(false);
    expect(ws().helpState).toBe('closed');
    await press(); // wrong 3: the card
    expect(cardOpen()).toBe(true);
    expect(ws().socraticTriggerReason).toBe('repeated_errors');
  });

  it('a wrong press while the card is open does not kill the coaching: no beat, the card stays, and later triggers still open (item 1)', async () => {
    typeRow('1583');
    await press();
    await press();
    expect(cardOpen()).toBe(true);
    await press(); // wrong again with the card on the screen
    expect(ws().helpState).toBe('socratic');
    ws().closeHelp();
    expect(ws().currentState).toBe('PROBLEM_ACTIVE');
    ws().openSocraticCard('hesitation_45s');
    expect(cardOpen()).toBe(true);
  });

  it('a wrong press while the card is still under its hourglass leaves that card alone', async () => {
    let answer: (h: SocraticHintResponse) => void = () => undefined;
    vi.mocked(SocraticEngine.getSocraticHint).mockImplementation(() => new Promise((r) => { answer = r; }));
    typeRow('1583');
    await press();
    await press();
    expect(ws().socraticPending).toBe(true);
    ws().proceed();
    expect(ws().helpState).toBe('socratic'); // not the beat
    expect(ws().socraticPending).toBe(true);
    answer(SocraticEngine.getSynchronousTaskHint(T4(), ws().counts));
  });

  it('a beat that ends without a card ends through closeHelp: the machine never stays SOCRATIC_ACTIVE without a card', () => {
    useWorkspaceStore.setState({ helpState: 'friction', currentState: 'SOCRATIC_ACTIVE' });
    ws().lockSocraticCard(15_000); // the card is refused
    ws().helpFrictionDone();
    expect(ws().helpState).toBe('closed');
    expect(ws().currentState).toBe('PROBLEM_ACTIVE');
  });

  it('a SOCRATIC_ACTIVE left behind with no card no longer blocks every later card', () => {
    useWorkspaceStore.setState({ helpState: 'closed', currentState: 'SOCRATIC_ACTIVE' });
    ws().openSocraticCard('hesitation_45s');
    expect(cardOpen()).toBe(true);
  });

  it('no "נסו לחשוב…" beat when the card would be refused (the 15-second lockout)', async () => {
    typeRow('1583');
    await press();
    ws().lockSocraticCard(15_000);
    ws().proceed();
    expect(ws().helpState).toBe('closed');
  });
});

describe('D4 — stations 3–7: a right answer over the wrong blocks', () => {
  it('the card opens from the second press, about the blocks (the column whose blocks are wrong)', async () => {
    load(4, T4());
    board({ thousands: 1, hundreds: 5, tens: 6, units: 3 }); // 1,563
    typeRow('1573');
    await press();
    expect(ws().feedback?.sub).toContain('הלבנים שבבית המספרים אינן מתאימות');
    expect(cardOpen()).toBe(false);
    await press();
    expect(cardOpen()).toBe(true);
    expect(ws().socraticTriggerReason).toBe('repeated_errors');
    expect(ws().socraticCardPlace).toBe('tens');
  });

  it('it is not a solved exercise: the other triggers open the card there too', () => {
    load(4, T4());
    board({ thousands: 1, hundreds: 5, tens: 6, units: 3 });
    typeRow('1573');
    ws().openSocraticCard('hesitation_45s');
    expect(cardOpen()).toBe(true);
  });
});

describe('item 2 — skeleton exercises: solved means what "התקדם" accepts', () => {
  it('a hidden digit filled in WRONG is not solved: the card of the second wrong press opens (it used to show the beat, then nothing)', async () => {
    load(7, byId('s7_r_t2')); // 31▢ + 254 = 568
    boardOf(568);
    ws().setOperandDigit('a', 'units', '5');
    await press();
    await press();
    expect(cardOpen()).toBe(true);
    expect(ws().socraticCardPlace).toBe('units');
  });

  it('a hidden minuend (5▢▢ − 178 = 364): a pause opens the card while a hidden digit is wrong; right digits over the right blocks: none', async () => {
    load(7, byId('s7_r_t4'));
    boardOf(364);
    ws().setOperandDigit('a', 'tens', '4');
    ws().setOperandDigit('a', 'units', '1');
    ws().openSocraticCard('hesitation_45s');
    expect(cardOpen()).toBe(true);
    expect(ws().socraticCardPlace).toBe('units');

    load(7, byId('s7_r_t4'));
    boardOf(364);
    ws().setOperandDigit('a', 'tens', '4');
    ws().setOperandDigit('a', 'units', '2');
    ws().openSocraticCard('hesitation_45s');
    expect(cardOpen()).toBe(false);
  });
});

describe('item 5 — no card on a finished exercise, of any kind', () => {
  it('a representation exercise done (blocks, break, answer): no card', () => {
    const t = byId('s3_r_t2'); // 3 hundreds and 4 tens; break a hundred into tens; 340
    load(3, t);
    ws().applyDrop({ source: 'palette', sourcePlace: 'hundreds', target: { kind: 'column', place: 'hundreds' } });
    ws().applyDrop({ source: 'palette', sourcePlace: 'hundreds', target: { kind: 'column', place: 'hundreds' } });
    ws().applyDrop({ source: 'palette', sourcePlace: 'hundreds', target: { kind: 'column', place: 'hundreds' } });
    for (let i = 0; i < 4; i++) ws().applyDrop({ source: 'palette', sourcePlace: 'tens', target: { kind: 'column', place: 'tens' } });
    ws().splitBlockClick('hundreds');
    ws().setRepresentationAnswer('340');
    expect(judgeStandardTask(ws(), t).kind).toBe('success');
    ws().openSocraticCard('hesitation_45s');
    expect(cardOpen()).toBe(false);
  });

  it('a choice question answered right: no card; answered wrong: the card may open', () => {
    const t = allTasks().find((x) => x.type === 'small_change' && typeof x.correctAnswer === 'string')!;
    load(5, t, { selectedChoiceId: t.correctAnswer, hasInteracted: true });
    ws().openSocraticCard('hesitation_45s');
    expect(cardOpen()).toBe(false);
    load(5, t, { selectedChoiceId: '__wrong__', hasInteracted: true });
    ws().openSocraticCard('hesitation_45s');
    expect(cardOpen()).toBe(true);
  });

  it('the exercise solved while the hourglass turns: no card, no SOCRATIC_CARD_SHOWN', async () => {
    let answer: (h: SocraticHintResponse) => void = () => undefined;
    vi.mocked(SocraticEngine.getSocraticHint).mockImplementation(() => new Promise((r) => { answer = r; }));
    render(React.createElement(SocraticSidePanel, null));
    load(4, T4());
    boardOf(1573);
    act(() => { ws().openSocraticCard('hesitation_45s'); });
    typeRow('1573');
    ws().setCarryDigit('tens', '1');
    await act(async () => { answer(SocraticEngine.getSynchronousTaskHint(T4(), ws().counts)); await flush(); });
    expect(cardOpen()).toBe(false);
    expect(ws().currentState).not.toBe('SOCRATIC_ACTIVE');
    expect(ofType('SOCRATIC_CARD_SHOWN')).toHaveLength(0);
  });
});

describe('item 3 — the card\'s column, for every trigger (socraticCardPlace and SOCRATIC_CARD_SHOWN.column_index)', () => {
  it('a conversion not performed: the column just typed in, though the cursor already moved on', async () => {
    render(React.createElement(SocraticSidePanel, null));
    load(4, T4());
    ws().setAnswerDigit('units', '4'); // 5 + 8 = 13: the units need a grouping not done
    ws().setFocusedPlace('tens'); // the row's focus moved left
    await act(async () => { await flush(); });
    expect(ws().socraticTriggerReason).toBe('conversion_not_performed');
    expect(ws().socraticCardPlace).toBe('units');
    const shown = ofType('SOCRATIC_CARD_SHOWN');
    expect(shown).toHaveLength(1);
    expect(shown[0].column_index).toBe(0);
    expect(shown[0].details.trigger_reason).toBe('conversion_not_performed');
  });

  it('four wrong digits in one column: that column', async () => {
    load(4, byId('s4_g_t3')); // 3,456 + 2,183 = 5,639
    for (const d of ['1', '2', '4', '5']) ws().setAnswerDigit('hundreds', d);
    ws().setFocusedPlace('thousands');
    await flush();
    expect(ws().socraticTriggerReason).toBe('consecutive_errors_4');
    expect(ws().socraticCardPlace).toBe('hundreds');
  });

  it('a pause: the focused box; with none, the first unsolved column', () => {
    load(4, T4());
    ws().setFocusedPlace('hundreds');
    ws().openSocraticCard('hesitation_45s');
    expect(ws().socraticCardPlace).toBe('hundreds');

    load(4, T4());
    boardOf(1573);
    ws().setAnswerDigit('units', '3');
    ws().openSocraticCard('hesitation_45s');
    expect(ws().socraticCardPlace).toBe('tens');
  });

  it('meeting 8: the memory circle the child stands in is the column (it records the conversions there)', () => {
    load(8, byId('s8_g_t1'));
    useBoardFocusStore.setState({ focusedMemoryCircle: 'tens' });
    ws().openSocraticCard('hesitation_45s');
    expect(ws().socraticCardPlace).toBe('tens');
  });

  it('stations 3–7: the memory circle stays out of what is recorded (register gap יט) — the first unsolved column', () => {
    load(4, T4());
    useBoardFocusStore.setState({ focusedMemoryCircle: 'hundreds' });
    ws().openSocraticCard('hesitation_45s');
    expect(ws().socraticCardPlace).toBe('units');
    expect(ws().focusedPlace).toBeNull();
  });

  it('every trigger reason gets a column in a vertical exercise; a choice question has none', () => {
    const t = T4();
    const reasons: SocraticTriggerReason[] = ['hesitation_45s', 'repeated_errors', 'consecutive_undos_3'];
    load(4, t);
    for (const r of reasons) expect(cardFocusPlace(ws(), t, r)).not.toBeNull();
    const choice = allTasks().find((x) => x.type === 'small_change')!;
    load(5, choice);
    expect(cardFocusPlace(ws(), choice, 'hesitation_45s')).toBeNull();
  });
});

describe('item 4 — the same card does not come back again and again', () => {
  it('the very same card (trigger, column, question) opens twice at most in an exercise', async () => {
    load(4, T4());
    for (let i = 0; i < MAX_IDENTICAL_SOCRATIC_CARDS; i++) {
      ws().openSocraticCard('hesitation_45s');
      await flush();
      expect(cardOpen()).toBe(true);
      ws().closeHelp();
    }
    ws().openSocraticCard('hesitation_45s');
    expect(cardOpen()).toBe(false);
    // Another column is another card.
    ws().setFocusedPlace('hundreds');
    ws().openSocraticCard('hesitation_45s');
    expect(cardOpen()).toBe(true);
  });

  it('never again after its right option was chosen', async () => {
    load(4, T4());
    ws().openSocraticCard('hesitation_45s');
    await flush();
    ws().recordSocraticAnswer(true);
    ws().closeHelp();
    ws().openSocraticCard('hesitation_45s');
    expect(cardOpen()).toBe(false);
  });

  it('a card closed under its hourglass was not seen, and does not count', async () => {
    vi.mocked(SocraticEngine.getSocraticHint).mockImplementation(() => new Promise(() => undefined));
    load(4, T4());
    for (let i = 0; i < 3; i++) {
      ws().openSocraticCard('hesitation_45s');
      expect(cardOpen()).toBe(true);
      ws().closeHelp();
    }
  });

  it('a conversion not performed opens once a minute at most in its column; the column\'s four-errors streak still escalates', async () => {
    load(4, T4());
    ws().setAnswerDigit('units', '4');
    await flush();
    expect(ws().socraticTriggerReason).toBe('conversion_not_performed');
    ws().closeHelp();
    ws().setAnswerDigit('units', '2');
    await flush();
    expect(cardOpen()).toBe(false); // within the minute
    await vi.advanceTimersByTimeAsync(CONVERSION_CARD_COOLDOWN_MS);
    ws().setAnswerDigit('units', '6');
    await flush();
    expect(ws().socraticTriggerReason).toBe('conversion_not_performed');
    ws().closeHelp();
    await vi.advanceTimersByTimeAsync(CONVERSION_CARD_COOLDOWN_MS);
    ws().setAnswerDigit('units', '9'); // the fourth wrong digit in the units
    await flush();
    expect(cardOpen()).toBe(true);
    expect(ws().socraticTriggerReason).toBe('consecutive_errors_4');
  });

  it('meeting 8: three undos open the card, about the undone action\'s column, and the run starts again', async () => {
    load(8, byId('s8_g_t1')); // 1,245 + 328 = 1,573
    typeRow('1573');
    ws().setFocusedPlace(null);
    ws().undo(); ws().undo(); ws().undo(); // thousands, hundreds, tens
    await flush();
    expect(ws().socraticTriggerReason).toBe('consecutive_undos_3');
    expect(ws().socraticCardPlace).toBe('tens');
    expect(ws().consecutiveUndoCount).toBe(0);
    ws().closeHelp();
    ws().undo(); // the fourth: a new run of one, no card
    await flush();
    expect(cardOpen()).toBe(false);
    expect(ws().undoCount).toBe(4);
  });

  it('the next card\'s request knows the previous card of the exercise and whether its chosen option was right', async () => {
    load(4, T4());
    ws().openSocraticCard('hesitation_45s');
    await flush();
    const first = ws().aiSocraticHint!;
    ws().recordSocraticAnswer(false);
    ws().closeHelp();
    expect(ws().previousSocraticCard).toBeNull(); // the first card had none before it
    ws().setFocusedPlace('hundreds');
    ws().openSocraticCard('hesitation_45s');
    const prev = ws().previousSocraticCard!;
    expect(prev.taskId).toBe('s4_g_t1');
    expect(prev.questionHe).toBe(first.questionHe);
    expect(prev.answeredCorrect).toBe(false);
    expect(prev.reason).toBe('hesitation_45s');
    expect(prev.place).toBe('units');
  });
});

describe('item 5 — only inside an exercise in progress', () => {
  it('the reflection board: no card, and undo (also Ctrl/Cmd+Z, which calls it) changes nothing and sends nothing', async () => {
    load(8, byId('s8_g_t1'));
    typeRow('1573');
    useWorkspaceStore.setState({ flowStatus: 'reflection' } as any);
    emitted.length = 0;
    for (let i = 0; i < 3; i++) ws().undo();
    await flush();
    expect(ofType('UNDO_EXECUTED')).toHaveLength(0);
    expect(ws().answerDigits.thousands).toBe('1');
    expect(ws().undoCount).toBe(0);
    ws().openSocraticCard('hesitation_45s');
    expect(cardOpen()).toBe(false);
  });

  it('in the moments after the last exercise (awaitingNext): neither', async () => {
    load(8, byId('s8_g_t1'));
    typeRow('1573');
    useWorkspaceStore.setState({ awaitingNext: true });
    emitted.length = 0;
    ws().undo();
    ws().openSocraticCard('hesitation_45s');
    await flush();
    expect(ofType('UNDO_EXECUTED')).toHaveLength(0);
    expect(cardOpen()).toBe(false);
  });

  it('a card open when the last exercise is solved does not follow the child onto the reflection board', async () => {
    load(8, byId('s8_g_t1'));
    ws().openSocraticCard('hesitation_45s');
    await flush();
    expect(cardOpen()).toBe(true);
    typeRow('1573');
    ws().setCarryDigit('tens', '1');
    ws().proceed();
    expect(ws().helpState).toBe('closed');
    expect(ws().currentState).not.toBe('SOCRATIC_ACTIVE');
    await vi.advanceTimersByTimeAsync(2600);
    expect(ws().flowStatus).toBe('reflection');
    expect(ws().helpState).toBe('closed');
  });

  it('meeting 8\'s praise speaks of no number house (D11b)', () => {
    const t = byId('s8_g_t1');
    load(8, t);
    typeRow('1573');
    ws().setCarryDigit('tens', '1');
    const verdict = judgeStandardTask(ws(), t);
    expect(verdict.kind).toBe('success');
    expect(verdict.sub).toBe(MEETING8_SOLVED_SUB_HE);
    expect(stripNiqqud(verdict.sub)).toBe('פתרתם נכון.');
    // The other stations keep theirs.
    load(4, T4());
    boardOf(1573);
    typeRow('1573');
    ws().setCarryDigit('tens', '1');
    expect(stripNiqqud(judgeStandardTask(ws(), T4()).sub)).toContain('בבית המספרים');
  });

  it('…nor onto the choice screen, nor through "סיום המפגש כעת"', async () => {
    load(4, T4());
    boardOf(1573);
    ws().openSocraticCard('hesitation_45s');
    await flush();
    typeRow('1573');
    ws().setCarryDigit('tens', '1');
    ws().proceed();
    expect(ws().flowStatus).toBe('choice_branch');
    expect(ws().helpState).toBe('closed');

    load(4, T4());
    ws().openSocraticCard('hesitation_45s');
    ws().finishMeetingEarly();
    expect(ws().helpState).toBe('closed');
    expect(ws().socraticPending).toBe(false);
  });
});

describe('item 5 — a card that settles under the projector, pause or close screen is not recorded as seen', () => {
  it('SOCRATIC_CARD_SHOWN waits for the screen to go, then is sent once', async () => {
    render(React.createElement(SocraticSidePanel, null));
    load(4, T4());
    act(() => { ws().setClassScreenUp(true); });
    act(() => { ws().openSocraticCard('hesitation_45s'); });
    await act(async () => { await flush(); });
    expect(ws().aiSocraticHint).not.toBeNull();
    expect(ofType('SOCRATIC_CARD_SHOWN')).toHaveLength(0);
    act(() => { ws().setClassScreenUp(false); });
    expect(ofType('SOCRATIC_CARD_SHOWN')).toHaveLength(1);
    act(() => { ws().setClassScreenUp(true); });
    act(() => { ws().setClassScreenUp(false); });
    expect(ofType('SOCRATIC_CARD_SHOWN')).toHaveLength(1);
  });
});

describe('item 6 — a card is built on what is on the screen when it appears', () => {
  it('the board changed under the hourglass: the engine\'s card about the old board is replaced by the static card of the board now', async () => {
    let answer: (h: SocraticHintResponse) => void = () => undefined;
    vi.mocked(SocraticEngine.getSocraticHint).mockImplementation(() => new Promise((r) => { answer = r; }));
    load(4, T4());
    ws().openSocraticCard('hesitation_45s');
    const ai: SocraticHintResponse = {
      ...SocraticEngine.getSynchronousTaskHint(T4(), ws().counts),
      questionHe: 'שאלה על הלוח של הרגע שבו נפתח הכרטיס',
      error_category: 'procedural',
    };
    board({ thousands: 1, hundreds: 2, tens: 4, units: 13 });
    await act(async () => { answer(ai); await flush(); });
    expect(cardOpen()).toBe(true);
    const shown = ws().aiSocraticHint!;
    expect(shown.questionHe).not.toBe(ai.questionHe);
    expect(shown.questionHe).toBe(SocraticEngine.getSynchronousTaskHint(T4(), ws().counts, { placeCuesShown: false, shownKinds: [] }).questionHe);
    expect(shown.error_category).toBeNull();
  });

  it('nothing changed: the engine\'s card is the one shown', async () => {
    let answer: (h: SocraticHintResponse) => void = () => undefined;
    vi.mocked(SocraticEngine.getSocraticHint).mockImplementation(() => new Promise((r) => { answer = r; }));
    load(4, T4());
    ws().openSocraticCard('hesitation_45s');
    const ai: SocraticHintResponse = { ...SocraticEngine.getSynchronousTaskHint(T4(), ws().counts), questionHe: 'שאלת המנוע', error_category: 'procedural' };
    await act(async () => { answer(ai); await flush(); });
    expect(ws().aiSocraticHint?.questionHe).toBe('שאלת המנוע');
  });
});

describe('item 7 — a digit in the wrong place is not a conversion left undone', () => {
  it('the tens digit typed into the units box (1,573: a 7 in the units) opens no conversion card', async () => {
    load(4, T4());
    ws().setAnswerDigit('units', '7');
    await flush();
    expect(cardOpen()).toBe(false);
    // …while a wrong digit no other column has does.
    ws().setAnswerDigit('units', '4');
    await flush();
    expect(ws().socraticTriggerReason).toBe('conversion_not_performed');
  });
});

describe('item 8 — two digits in an addition memory circle', () => {
  it('each keystroke is recorded once (digit 0–9, judged on what the circle holds) and is undoable', () => {
    load(4, T4());
    const before = ws().undoStack.length;
    ws().setCarryDigit('tens', '1');
    ws().setCarryDigit('tens', '12');
    const digits = ofType('DIGIT_ENTERED');
    expect(digits.map((e) => [e.column_index, e.details.digit_value, e.details.is_correct])).toEqual([
      [1, 1, true],
      [1, 2, false],
    ]);
    expect(ws().undoStack.length).toBe(before + 2);
    ws().undo();
    expect(ws().carryDigits.tens).toBe('1');
  });

  it('meeting 8: a 12 in the circle is not a recorded carry — a wrong units digit opens the conversion card; a 1 is', async () => {
    load(8, byId('s8_g_t1'));
    ws().setCarryDigit('tens', '12');
    ws().setAnswerDigit('units', '4');
    await flush();
    expect(ws().socraticTriggerReason).toBe('conversion_not_performed');

    load(8, byId('s8_g_t1'));
    ws().setCarryDigit('tens', '1');
    ws().setAnswerDigit('units', '4');
    await flush();
    expect(cardOpen()).toBe(false);
  });

  it('a subtraction note keeps its meaning (the 13 above the units): recorded, judged by nobody', () => {
    load(5, byId('s5_r_t2')); // 53 − 18
    ws().setCarryDigit('units', '1');
    ws().setCarryDigit('units', '13');
    expect(ofType('DIGIT_ENTERED').map((e) => e.details.is_correct)).toEqual([null, null]);
  });
});

describe('item 9 — a new block from the palette dropped as ten lower blocks is not a break', () => {
  it('allowed and shown, but no conversion, no lock released, no REGROUPING event — and the conversion card still opens', async () => {
    load(5, byId('s5_r_t2'), { activeSupportProfileId: 'enhanced_cognitive_support' }); // 53 − 18: the units need a break
    board({ tens: 5, units: 3 });
    expect(ws().isColumnInputLocked('units', 53, 18, true)).toBe(true);
    ws().applyDrop({ source: 'palette', sourcePlace: 'tens', target: { kind: 'column', place: 'units' } });
    expect(ws().counts.units).toBe(13);
    expect(ws().conversionsByColumn.decomposed.units).toBeUndefined();
    expect(ws().hasUngrouped).toBe(false);
    expect(ws().isColumnInputLocked('units', 53, 18, true)).toBe(true);
    expect(ofType('REGROUPING_SUCCESS')).toHaveLength(0);
    expect(ofType('REGROUPING_TRIGGERED')).toHaveLength(0);
    const drag = ofType('BLOCK_DRAG_COMPLETE');
    expect(drag).toHaveLength(1);
    expect(drag[0].details.block_value).toBe(10);
    expect(drag[0].column_index).toBe(0);

    // A ten of the board broken by the child is the break.
    ws().splitBlockClick('tens');
    expect(ws().conversionsByColumn.decomposed.units).toBe(true);
    expect(ws().isColumnInputLocked('units', 53, 18, true)).toBe(false);
  });

  it('without the profile: a wrong units digit after the palette drop still opens the conversion card', async () => {
    load(5, byId('s5_r_t2'));
    board({ tens: 5, units: 3 });
    ws().applyDrop({ source: 'palette', sourcePlace: 'tens', target: { kind: 'column', place: 'units' } });
    ws().setAnswerDigit('units', '4');
    await flush();
    expect(ws().socraticTriggerReason).toBe('conversion_not_performed');
  });
});

describe('item 10 — a keyboard restored as LOCKED locks only the columns that need a conversion', () => {
  it('enhanced profile, 1,245 + 328: the units stay locked until grouped; the tens and hundreds are open', () => {
    load(4, T4(), { activeSupportProfileId: 'enhanced_cognitive_support', keyboardState: 'LOCKED' });
    const locked = (p: Place) => ws().isColumnInputLocked(p, 1245, 328, false);
    expect(locked('units')).toBe(true);
    expect(locked('tens')).toBe(false);
    expect(locked('hundreds')).toBe(false);
    board({ units: 13 });
    ws().groupColumnClick('units');
    expect(locked('units')).toBe(false);
  });
});

describe('D5 — the 15-second lockout ends with the exercise', () => {
  it('the next exercise starts with the card free', async () => {
    const [a, b] = [T4(), byId('s4_g_t2')];
    load(4, [a, b]);
    ws().triggerSocraticPenaltyLockout('רמז');
    expect(ws().isSocraticCardLocked).toBe(true);
    boardOf(1573);
    typeRow('1573');
    ws().setCarryDigit('tens', '1');
    ws().proceed();
    expect(ws().standardTaskIdx).toBe(1);
    expect(ws().isSocraticCardLocked).toBe(false);
    expect(ws().getSocraticPenaltyRemaining()).toBe(0);
    expect(mockLocalStorage.getItem('mc_socratic_penalty_until')).toBeNull();
    ws().openSocraticCard('hesitation_45s');
    expect(cardOpen()).toBe(true);
  });
});

describe('D6 — station 3\'s "another way": a wrong "הוספת ייצוג" is a wrong press', () => {
  it('the second wrong press in a row opens the card; a press that records a way breaks the run', async () => {
    const t = byId('s3_g_t7'); // two ways to show 2,100
    load(3, t);
    board({ thousands: 2 });
    ws().addRepresentation(); // 2,000: wrong
    expect(ws().wrongAnswerStreak).toBe(1);
    board({ thousands: 2, hundreds: 1 });
    ws().addRepresentation(); // 2,100: recorded
    expect(ws().q3Reps).toHaveLength(1);
    expect(ws().wrongAnswerStreak).toBe(0);
    ws().addRepresentation(); // the same way again: wrong
    board({ thousands: 2, tens: 5 });
    ws().addRepresentation(); // 2,050: wrong — the second in a row
    expect(ws().helpState).toBe('friction');
    ws().helpFrictionDone();
    await flush();
    expect(cardOpen()).toBe(true);
    expect(ws().socraticTriggerReason).toBe('repeated_errors');
  });
});

describe('D3 — while the call to the teacher is open, no hesitation card', () => {
  it('a pause opens no card; the other triggers still do', async () => {
    load(4, T4(), { hasRequestedBasicHelp: true });
    ws().setKeyboardSocratic();
    expect(cardOpen()).toBe(false);
    ws().setAnswerDigit('units', '4');
    await flush();
    expect(ws().socraticTriggerReason).toBe('conversion_not_performed');
  });
});

describe('the child texts of this round (D11a, D11c, D12)', () => {
  it('the beat before the card says what comes next, addressed to the children', () => {
    render(React.createElement(HelpOverlays, null));
    load(4, T4());
    act(() => { useWorkspaceStore.setState({ helpState: 'friction' }); });
    expect(document.body.textContent).toContain('נסו לחשוב…');
    expect(document.body.textContent).toContain('עוד רגע תופיע שאלה שתעזור לכם.');
    expect(document.body.textContent).not.toContain('מכין רמז');
  });

  it('a hidden minuend is found "בעזרת הלבנים", not by "the break" (s6_g_t7, s7_r_t4, s7_g_t3)', () => {
    for (const id of ['s6_g_t7', 's7_r_t4', 's7_g_t3']) {
      const text = byId(id).instructionHe;
      expect(text, id).toContain('בעזרת הלבנים וכתבו אותן בתיבות הריקות.');
      expect(text, id).not.toContain('הפריטה');
    }
  });

  it('the undo button has one name in every child text: "כפתור ביטול הפעולה"', () => {
    const texts = allTasks().map((t) => t.instructionHe);
    expect(texts.some((t) => t.includes('כפתור ביטול הפעולה'))).toBe(true);
    for (const t of texts) expect(t).not.toMatch(/כפתור ביטול פעולה/);
    expect(JSON.stringify(session1Checklist('s1_undo_trash', { counts: EMPTY_COUNTS, blocksAddedCount: 0, hasUngrouped: false, undoCount: 0, hasClearedBoard: false })))
      .toContain('לחצו על כפתור ביטול הפעולה ↺');
  });
});

describe('meeting 2 stays without cards', () => {
  it('no trigger opens one', () => {
    load(4, T4());
    useWorkspaceStore.setState({ sessionNumber: 2 } as any);
    for (const r of ['hesitation_45s', 'repeated_errors', 'consecutive_errors_4', 'conversion_not_performed', 'consecutive_undos_3'] as const) {
      ws().openSocraticCard(r, 'units');
    }
    expect(cardOpen()).toBe(false);
  });
});
