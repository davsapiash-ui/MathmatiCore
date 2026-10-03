/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The final review of the Socratic coaching round (2.10.2026), client side —
 * every fix through the real store (its actions, its subscription, its
 * snapshot and restore):
 *  1. "you took out too much" only after the board held the first number;
 *  2. the 1 in the memory circle of a column that reaches 10 again;
 *  3. no card about blocks or the button on an empty board;
 *  4. the take-away intent says "יצאו", not "הוצא";
 *  5. a hidden digit the screen shows nowhere is a secret in any wording;
 *  6. the hidden board: showing it is suggested once, then help without blocks;
 *  7. a refused "four errors" card does not shut the conversion card;
 *  8. a reload keeps the cards opened with the kinds;
 *  9. a card rebuilt under the hourglass is recorded as the card shown;
 * 10. the wording fixes.
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
vi.mock('@/infrastructure/services/FirebaseSyncService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/infrastructure/services/FirebaseSyncService')>();
  return { ...actual, emitTelemetry: vi.fn(async () => undefined) };
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

import { useWorkspaceStore, staticCardContextFor, getActiveTasks, type SocraticTriggerReason } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { useBoardFocusStore } from '@/application/useBoardFocusStore';
import { SocraticEngine, SOCRATIC_PROXY_TIMEOUT_MS, type SocraticHintResponse } from '@/infrastructure/services/SocraticEngine';
import { cardFamilyOf, hiddenDigitsOffScreen, revealsHiddenDigit, mentionsDigitAnywhere } from '@/infrastructure/services/staticSocraticCards';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';
import { SESSION1_TASKS, getSessionTasks, type SessionTask } from '@/data/sessionTasks';
import { EMPTY_COUNTS, type Place, type PlaceCounts } from '@/core/placeValue';
import { approvePath } from '@/test/approvedPath';
import { languageViolation } from '../../../../functions/src/socraticLanguage';

const bank: SessionTask[] = [...SESSION1_TASKS];
for (const m of [3, 4, 5, 6, 7, 8] as const) for (const p of ['green_path', 'remediation_path'] as const) bank.push(...getSessionTasks(m, p));
const byId = (id: string) => {
  const t = bank.find((x) => x.id === id);
  if (!t) throw new Error(`no task ${id}`);
  return t;
};
const textsOf = (h: SocraticHintResponse) => [h.questionHe, ...h.choices.flatMap((c) => [c.textHe, c.feedbackHe ?? ''])];
const ws = () => useWorkspaceStore.getState();
const flush = () => vi.advanceTimersByTimeAsync(0);

function load(meeting: number, task: SessionTask, extra: Record<string, unknown> = {}) {
  ws().resetWorkspace();
  useAuthStore.setState({ user: { uid: 'student_user1', student_id: 1, role: 'student' } } as any);
  useWorkspaceStore.setState({
    sessionNumber: meeting,
    dynamicTasks: [task],
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
}
const board = (c: Partial<PlaceCounts>) => useWorkspaceStore.setState({ counts: { ...EMPTY_COUNTS, ...c } });
const drag = (p: Place, n = 1) => { for (let i = 0; i < n; i++) ws().applyDrop({ source: 'palette', sourcePlace: p, target: { kind: 'column', place: p } }); };
const trash = (p: Place, n = 1) => { for (let i = 0; i < n; i++) ws().removeBlockClick(p); };
const ctxNow = () => {
  const task = getActiveTasks(ws())[ws().standardTaskIdx];
  return staticCardContextFor(ws(), task.id, task);
};
async function cardFor(reason: SocraticTriggerReason, place?: Place, right = false): Promise<SocraticHintResponse | null> {
  ws().openSocraticCard(reason, place);
  await flush();
  const card = ws().helpState === 'socratic' ? ws().aiSocraticHint : null;
  ws().recordSocraticAnswer(right);
  ws().closeHelp();
  return card;
}

beforeEach(() => {
  vi.useFakeTimers();
  mockLocalStorage.clear();
  vi.spyOn(SocraticEngine, 'getSocraticHint').mockRejectedValue(new Error('offline'));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('1 (blocker): "took too much" only once the board held the first number', () => {
  it('806 − 351: 9 hundreds dragged, one thrown away, 2 units added — still building, never "press undo"', async () => {
    load(1, byId('s1_r_sub806'));
    drag('hundreds', 9);
    trash('hundreds');
    drag('units', 2);
    // 12 actions: the undo history is full (its cap used to make this "taking away").
    expect(ws().undoStack.length).toBe(10);
    expect(ctxNow().blocksRemoved).toBe(false);
    for (let i = 0; i < 3; i++) {
      const c = (await cardFor('hesitation_45s'))!;
      expect(c.situation).not.toMatch(/took_too_many/);
      expect(textsOf(c).join(' ')).not.toContain('כפתור ביטול הפעולה עד שהלבנים');
    }
  });

  it('53 − 18: 35 built, the board cleared, 3 tens added — a clear is starting over, not taking away', async () => {
    load(5, byId('s5_r_t2'));
    drag('tens', 3);
    drag('units', 5);
    ws().clearBoard();
    drag('tens', 3);
    expect(ctxNow().blocksRemoved).toBe(false);
    expect((await cardFor('hesitation_45s'))!.situation).not.toMatch(/took_too_many/);
  });

  it('806 − 351: 3 hundreds, cleared, 7 hundreds — never "took too much", three openings', async () => {
    load(1, byId('s1_r_sub806'));
    drag('hundreds', 3);
    ws().clearBoard();
    drag('hundreds', 7);
    for (let i = 0; i < 3; i++) {
      const c = await cardFor('hesitation_45s');
      if (c) expect(c.situation).not.toMatch(/took_too_many/);
    }
  });

  it('53 − 18: the board held 53 and blocks left it — taking away; a clear starts over', async () => {
    load(5, byId('s5_r_t2'));
    drag('tens', 5);
    drag('units', 3);
    expect(ws().takeAwayTrack).toMatchObject({ taskId: 's5_r_t2', held: true, started: false });
    ws().splitBlockClick('tens');
    trash('units', 9);
    expect(ctxNow().blocksRemoved).toBe(true);
    expect((await cardFor('hesitation_45s'))!.situation).toBe('took_too_many');
    ws().clearBoard();
    expect(ws().takeAwayTrack).toMatchObject({ held: false, started: false });
    expect(ctxNow().blocksRemoved).toBe(false);
  });
});

describe('2: the 1 in the memory circle of a column that reaches 10 again (5,678 + 2,453)', () => {
  it('the hundreds (6 + 4 + 1 = 11): write the units digit, record 1 above the thousands', async () => {
    load(4, byId('s4_g_t5'), { answerDigits: { units: '1', tens: '3', hundreds: '0' }, carryDigits: { hundreds: '1' } });
    const first = (await cardFor('consecutive_errors_4', 'hundreds'))!;
    expect(first.cardKind).toBe('carry_forgotten');
    const second = (await cardFor('consecutive_errors_4', 'hundreds'))!;
    expect(second.situation).toBe('carry_circle_add');
    expect(second.questionHe).toContain('רשמתם 1 בעיגול הזיכרון שמעל טור המאות. מה עושים איתו כשמחברים את הספרות של הטור הזה?');
    const right = second.choices.find((c) => c.isCorrect)!.feedbackHe!;
    expect(right).toContain('כתבו בתיבה רק את ספרת היחידות שלו');
    expect(right).toContain('ורשמו 1 בעיגול הזיכרון שמעל טור האלפים');
    expect(languageViolation(textsOf(second))).toBeNull();
  });

  it('a column that stays under 10 keeps "כתבו את התוצאה בתיבה" (128 + 35, the tens: 2 + 3 + 1)', async () => {
    load(4, byId('s4_r_t2'), { counts: { ...EMPTY_COUNTS, hundreds: 1, tens: 6, units: 3 }, answerDigits: { units: '3', tens: '5' }, carryDigits: { tens: '1' } });
    await cardFor('consecutive_errors_4', 'tens');
    const second = (await cardFor('consecutive_errors_4', 'tens'))!;
    expect(second.situation).toBe('carry_circle_add');
    expect(second.choices.find((c) => c.isCorrect)!.feedbackHe).toContain('וכתבו את התוצאה בתיבה');
  });
});

describe('3: an empty board — no card about blocks or the button', () => {
  it('128 + 35, units typed "2", a pause: the column card without blocks, then what is built', async () => {
    load(4, byId('s4_r_t2'));
    ws().setAnswerDigit('units', '2');
    await flush();
    ws().closeHelp();
    useWorkspaceStore.setState({ socraticCardHistory: { taskId: null, cards: [] }, socraticCardKinds: { taskId: null, kinds: [] } } as any);
    const first = (await cardFor('hesitation_45s', 'units'))!;
    expect(first.situation).toBe('add_column');
    expect(textsOf(first).join(' ')).not.toMatch(/לבנ|קבצו|כפתור/);
    const second = (await cardFor('hesitation_45s', 'units'))!;
    expect(second.questionHe).not.toBe(first.questionHe);
    expect(textsOf(second).join(' ')).not.toMatch(/קבצו|כפתור/);
    // The column triggers too.
    useWorkspaceStore.setState({ socraticCardHistory: { taskId: null, cards: [] }, socraticCardKinds: { taskId: null, kinds: [] } } as any);
    const own = (await cardFor('consecutive_errors_4', 'units'))!;
    expect(textsOf(own).join(' ')).not.toMatch(/לבנ|קבצו|כפתור/);
  });
});

describe('4: the take-away intent goes to the engine without "הוצא"', () => {
  it('53 − 18, taking away under way, the second card of the check', async () => {
    load(5, byId('s5_r_t2'));
    drag('tens', 5);
    drag('units', 3);
    ws().splitBlockClick('tens');
    trash('units', 2);
    const first = (await cardFor('hesitation_45s'))!;
    const second = (await cardFor('hesitation_45s'))!;
    const progress = [first, second].find((c) => c.situation === 'take_away_progress')!;
    expect(progress.intentHe).toContain('כמה לבנים כבר יצאו ממנו');
    expect(progress.intentHe).not.toContain('הוצא');
    expect(languageViolation([progress.intentHe!])).toBeNull();
  });
});

describe('5: a hidden digit the screen shows nowhere', () => {
  it('3▢6 + 271 = 657: 8 is hidden and off the screen; the visible digits are not', () => {
    const task = byId('s7_r_t3');
    expect(hiddenDigitsOffScreen(task)).toEqual([8]);
    expect(revealsHiddenDigit(['מוסיפים 8'], task)).toBe(8);
    expect(revealsHiddenDigit(['נכון מאוד! הספרה שמונה.'], task)).toBe(8);
    expect(revealsHiddenDigit(['7 ועוד ▢ הם 15'], task)).toBeNull();
    for (const t of ['מה כתוב בהנחיה?', 'כותבים ספרה אחת בכל תיבה', 'רושמים 1 בעיגול הזיכרון', 'מקבצים 10 יחידות לעשרת אחת', 'בודקים את שני המספרים', 'בתרגיל 3▢6 + 271 = 657']) {
      expect(revealsHiddenDigit([t], task)).toBeNull();
    }
    expect(mentionsDigitAnywhere('18', 8)).toBe(false);
  });

  it('the store serves no skeleton card that names its hidden digit', async () => {
    load(7, byId('s7_r_t3'));
    for (const reason of ['hesitation_45s', 'repeated_errors', 'consecutive_errors_4'] as SocraticTriggerReason[]) {
      const c = await cardFor(reason, 'tens');
      if (c) expect(revealsHiddenDigit(textsOf(c), byId('s7_r_t3'))).toBeNull();
    }
  });
});

describe('6 (coordinator\'s decision): the hidden board — showing it is suggested once, then help without blocks', () => {
  it('85 + 17 style addition, the board hidden: board_hidden once, then the column card', async () => {
    load(4, byId('s4_r_t2'), { answerDigits: { units: '3' } });
    ws().toggleBoard();
    expect(ctxNow().boardHidden).toBe(true);
    const first = (await cardFor('hesitation_45s'))!;
    expect(first.situation).toBe('board_hidden');
    for (const reason of ['hesitation_45s', 'repeated_errors', 'consecutive_errors_4'] as SocraticTriggerReason[]) {
      const c = await cardFor(reason, 'tens');
      expect(c).not.toBeNull();
      expect(c!.situation).not.toMatch(/board_hidden|show_board/);
      expect(textsOf(c!).join(' ')).not.toMatch(/לבנ|בית המספרים|קבצו|פח האשפה/);
    }
  });
});

describe('7: a refused "four errors" card does not shut the conversion card', () => {
  it('5,678 + 2,453: the four-errors card answered right before; four more wrong units digits → the conversion card', async () => {
    load(4, byId('s4_g_t5'));
    expect(await cardFor('consecutive_errors_4', 'units', true)).not.toBeNull();
    useWorkspaceStore.setState({ digitErrorStreak: 3, digitErrorStreakPlace: 'units' } as any);
    ws().setAnswerDigit('units', '5');
    await flush();
    await flush();
    expect(ws().helpState).toBe('socratic');
    expect(ws().socraticTriggerReason).toBe('conversion_not_performed');
    expect(ws().digitErrorStreak).toBe(0);
  });
});

describe('8: a reload keeps the cards opened, with the kinds', () => {
  const likeTheDatabase = (value: unknown): any => {
    const prune = (v: unknown): unknown => {
      if (Array.isArray(v)) {
        const out = v.map(prune).filter((x) => x !== undefined);
        return out.length ? out : undefined;
      }
      if (v && typeof v === 'object') {
        const out = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, prune(x)]).filter(([, x]) => x !== undefined));
        return Object.keys(out).length ? out : undefined;
      }
      return v === null ? undefined : v;
    };
    return prune(JSON.parse(JSON.stringify(value)));
  };

  it('5,432 − 2,118: a card answered right does not come back after a reload; taking away survives it too', async () => {
    const svc = firebaseSyncService as any;
    ws().resetWorkspace();
    approvePath('green_path');
    ws().initSession(5, false, 0);
    const idx = getActiveTasks(ws()).findIndex((t) => t.id === 's5_g_t1');
    ws().initSession(5, false, idx);
    useWorkspaceStore.setState({ flowStatus: 'task', awaitingNext: false, helpState: 'closed' } as any);
    board({ thousands: 5, hundreds: 4, tens: 3, units: 2 });
    const card = (await cardFor('hesitation_45s', undefined, true))!;
    expect(card).not.toBeNull();
    ws().splitBlockClick('tens');
    trash('units', 1);
    expect(ws().takeAwayTrack).toMatchObject({ taskId: 's5_g_t1', started: true });
    const saved = likeTheDatabase(svc.getSyncableWorkspaceState());
    expect(saved.socraticCardHistory.cards).toHaveLength(1);
    ws().resetWorkspace();
    approvePath('green_path');
    ws().restoreSession(saved);
    expect(ws().socraticCardHistory.cards).toHaveLength(1);
    expect(ws().socraticCardHistory.cards[0]).toMatchObject({ reason: 'hesitation_45s', answeredCorrect: true, shown: true, family: cardFamilyOf(card) });
    expect(ws().takeAwayTrack).toMatchObject({ taskId: 's5_g_t1', held: true, started: true });
    expect(ctxNow().blocksRemoved).toBe(true);
    // An exercise with nothing opened: the database drops the empty list.
    ws().initSession(5, false, idx + 1);
    const fresh = likeTheDatabase(svc.getSyncableWorkspaceState());
    ws().restoreSession(fresh);
    expect(ws().socraticCardHistory).toEqual({ taskId: null, cards: [] });
  });
});

describe('9: a card rebuilt under the hourglass is recorded as the card shown', () => {
  it('53 − 18: opened on 53 (a column short), the ten broken before it settled', async () => {
    vi.spyOn(SocraticEngine, 'getSocraticHint').mockImplementation(() => new Promise(() => undefined));
    load(5, byId('s5_r_t2'));
    board({ tens: 5, units: 3 });
    ws().openSocraticCard('hesitation_45s');
    const opened = ws().socraticCardHistory.cards[0];
    ws().splitBlockClick('tens');
    await vi.advanceTimersByTimeAsync(SOCRATIC_PROXY_TIMEOUT_MS + 10);
    const shown = ws().aiSocraticHint!;
    const rec = ws().socraticCardHistory.cards[0];
    expect(shown.questionHe).not.toBe(opened.staticQuestionHe);
    expect(rec).toMatchObject({ shown: true, staticQuestionHe: shown.questionHe, kind: shown.cardKind ?? null, family: cardFamilyOf(shown) });
  });
});

describe('10: the wording fixes', () => {
  it('take away "בדיוק לפי הספרה"; too much from a column "ספרת … של"; undo "לבנים בדיוק לפי"', async () => {
    load(5, byId('s5_r_t2'));
    drag('tens', 5);
    drag('units', 3);
    ws().splitBlockClick('tens');
    trash('units', 9);
    await cardFor('hesitation_45s');
    const second = (await cardFor('hesitation_45s'))!;
    expect(second.situation).toBe('took_too_many_column');
    expect(second.choices.find((c) => c.isCorrect)!.textHe).toBe('ספרת היחידות של 18');
    const all = textsOf(second).join(' ') + (second.intentHe ?? '');
    expect(all).not.toContain('כמה שהספרה');
  });

  it('meeting 1, 61 − 24, too much taken: the undo card checks each column "בדיוק לפי הספרה"', async () => {
    load(1, byId('s1_r_sub61'));
    const a = byId('s1_r_sub61');
    board({ tens: 6, units: 1 });
    if (a.initialCounts) board(a.initialCounts as Partial<PlaceCounts>);
    ws().splitBlockClick('tens');
    trash('units', 11);
    trash('tens', 3);
    const cards: SocraticHintResponse[] = [];
    for (let i = 0; i < 3; i++) {
      const c = await cardFor('hesitation_45s');
      if (c) cards.push(c);
    }
    const undo = cards.find((c) => c.situation === 'took_too_many_undo')!;
    expect(undo.choices.find((c) => c.isCorrect)!.feedbackHe).toBe('נכון מאוד! אחר כך בדקו שמכל טור הוצאתם לבנים בדיוק לפי הספרה של 24 באותו טור.');
  });

  it('53 − 18, more than 53 on the board: the second card checks the board, not "undo until 53 is left"', async () => {
    load(5, byId('s5_r_t2'));
    board({ tens: 7, units: 3 }); // 73: two tens too many (not a ten from the tool box instead of a break)
    await cardFor('hesitation_45s');
    const second = (await cardFor('hesitation_45s'))!;
    expect(second.situation).toBe('build_only_first_undo');
    expect(second.choices.find((c) => c.isCorrect)!.textHe).toBe('בודקים כל טור לפי הספרה של 53, ומוציאים לפח האשפה את הלבנים המיותרות');
    expect(languageViolation(textsOf(second))).toBeNull();
  });

  it('take_away_how: "לבנים בדיוק לפי הספרה של 18 באותו טור"', async () => {
    load(5, byId('s5_r_t2'));
    drag('tens', 5);
    drag('units', 3);
    ws().splitBlockClick('tens');
    await cardFor('hesitation_45s');
    const second = (await cardFor('hesitation_45s'))!;
    expect(second.situation).toBe('take_away_how');
    expect(second.choices.find((c) => c.isCorrect)!.textHe).toBe('מכל טור גוררים לפח האשפה לבנים בדיוק לפי הספרה של 18 באותו טור');
  });
});
