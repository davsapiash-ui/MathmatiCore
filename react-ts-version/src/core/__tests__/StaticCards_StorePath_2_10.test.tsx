/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The static coaching cards through the store's own path (integration,
 * 2.10.2026; independent audit of 1.10.2026, D1–D17). The card a child gets
 * is SocraticEngine.getSynchronousTaskHint(task, counts,
 * staticCardContextFor(state, id, task, { reason, place })) — the context
 * built from the store's state, never by hand: the cards author's coverage
 * test fed the fields straight in, so it passed while the app reached none
 * of the branches it pinned (audit D1, "unreachable code").
 *
 *  1. Every situation of the audit (and four added), with every trigger it
 *     meets: the card at the first, second and third opening.
 *  2. Every exercise of every bank, in board states, triggers and levels:
 *     the house rules of a card, a kind on every card, a next level for
 *     every family, nothing the child must find.
 *  3. No skeleton hint computes a hidden digit (D4).
 *  4. Through the real store (openSocraticCard and the board's own actions):
 *     the fields reach the card.
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

import {
  useWorkspaceStore,
  staticCardContextFor,
  cardFocusPlace,
  emptyColumnConversions,
  MAX_IDENTICAL_SOCRATIC_CARDS,
  nextTakeAwayTrack,
  type SocraticTriggerReason,
  type TakeAwayTrack,
} from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { useBoardFocusStore } from '@/application/useBoardFocusStore';
import { SocraticEngine, TASK_HINTS, absentAidViolation, cardFrameOf, type SocraticHintResponse } from '@/infrastructure/services/SocraticEngine';
import {
  STATIC_CARD_KINDS,
  cardFamilyOf,
  meetingOfTaskId,
  revealsSecret,
  secretNumbersOf,
  statesBoardCount,
  wrongHintViolation,
} from '@/infrastructure/services/staticSocraticCards';
import { SESSION1_TASKS, getSessionTasks, type SessionTask } from '@/data/sessionTasks';
import { getSessionBranchTasks } from '@/data/sessionBranchTasks';
import { EMPTY_COUNTS, type Place, type PlaceCounts } from '@/core/placeValue';
import { CARD_SITUATIONS, type CardSituation } from './fixtures/staticCardSituations_2_10';

type Counts = Record<Place, number>;
const C = (th: number, h: number, t: number, u: number): Counts => ({ thousands: th, hundreds: h, tens: t, units: u });
const countsWorth = (c: Partial<Counts>) => (c.thousands ?? 0) * 1000 + (c.hundreds ?? 0) * 100 + (c.tens ?? 0) * 10 + (c.units ?? 0);
const digitsOf = (n: number): Counts => C(Math.floor(n / 1000) % 10, Math.floor(n / 100) % 10, Math.floor(n / 10) % 10, n % 10);
const PLACE_OF_HL: Record<string, Place> = { 'tour-column-units': 'units', 'tour-column-tens': 'tens', 'tour-column-hundreds': 'hundreds', 'tour-column-thousands': 'thousands' };
/** Existing questions without "נסו לחשוב:" (audit §4c; owner's texts of 29.9 — flagged for him, not changed). */
const EXISTING_WITHOUT_OPENING = new Set([
  's1_number_in_words', 's1_crowded', 's1_digit_value', 's1_group_in_addition', 's1_group_units',
  's1_finished_taking_away', 's1_find_short_column', 'sub_board_empty',
]);
/** The owner's approved cards of 30.9 whose hints ask two questions (C1, C2, C5, C7) — flagged for him, not changed. */
const APPROVED_TWO_QUESTION_KINDS = new Set(['compose_break', 'decompose', 'borrow_check', 'compose_group']);
const TRIGGERS: SocraticTriggerReason[] = ['hesitation_45s', 'repeated_errors', 'consecutive_errors_4', 'conversion_not_performed', 'consecutive_undos_3'];

const bank: SessionTask[] = [...SESSION1_TASKS];
for (const m of [3, 4, 5, 6, 7, 8] as const) {
  for (const p of ['green_path', 'remediation_path'] as const) {
    bank.push(...getSessionTasks(m, p));
    if (m <= 7) for (const b of ['reinforcement', 'challenge'] as const) bank.push(...getSessionBranchTasks(m, b, p));
  }
}
const byId = (id: string) => {
  const t = bank.find((x) => x.id === id);
  if (!t) throw new Error(`no task ${id}`);
  return t;
};
const textsOf = (h: SocraticHintResponse) => [h.questionHe, ...h.choices.flatMap((c) => [c.textHe, c.feedbackHe ?? ''])];
const sitKey = (c: SocraticHintResponse) => {
  const col = c.suggested_highlight ? PLACE_OF_HL[c.suggested_highlight] : undefined;
  return col ? `${c.situation}__${col}` : String(c.situation);
};

/** The store's state in a situation: what the app holds, field by field (useWorkspaceStore). */
function stateOf(s: Partial<CardSituation> & { counts: Counts }, task: any, kinds: string[], prev: any, focusedPlace: Place | null) {
  const conv = emptyColumnConversions();
  for (const p of s.composed ?? []) conv.composed[p] = true;
  for (const p of s.decomposed ?? []) conv.decomposed[p] = true;
  if (s.times) conv.times = s.times;
  const meeting = meetingOfTaskId(task.id) ?? 0;
  // The trash history (undoStack: the board before each action).
  const history = s.history
    ?? (s.blocksRemoved && task.initialCounts ? [{ ...EMPTY_COUNTS, ...task.initialCounts }]
      : s.blocksRemoved && typeof task.numberA === 'number' ? [digitsOf(task.numberA)] : []);
  // Subtraction: the store's take-away record, the board's history replayed
  // through its own reducer (final review, 2.10.2026).
  let takeAwayTrack: TakeAwayTrack | null = null;
  if (task.isSubtraction && typeof task.numberA === 'number') {
    let before = 0;
    for (const c of [...history, s.counts]) {
      const v = countsWorth(c);
      takeAwayTrack = nextTakeAwayTrack(takeAwayTrack, task.id, task.numberA, before, v);
      before = v;
    }
  }
  return {
    takeAwayTrack,
    sessionNumber: meeting,
    isASD: false,
    placeCuesShown: s.placeCuesShown === true,
    socraticCardKinds: { taskId: task.id, kinds },
    conversionsByColumn: conv,
    hasGrouped: s.hasGrouped === true,
    hasUngrouped: s.hasUngrouped === true,
    counts: s.counts,
    answerDigits: s.answer ?? {},
    carryDigits: s.circles ?? {},
    operandDigits: { a: s.operand?.a ?? {}, b: s.operand?.b ?? {} },
    boardOpen: s.boardHidden !== true,
    hasDeletedBlock: s.blocksRemoved === true,
    undoStack: history.map((counts) => ({ counts, actionType: 'BLOCK_DRAG_COMPLETE' })),
    focusedPlace,
    socraticTriggerReason: null,
    socraticCardPlace: null,
    previousSocraticCard: prev,
  } as any;
}

/** The cards of three openings in a row, as the store serves them (kinds recorded, the identical card twice at most). */
function openings(s: Partial<CardSituation> & { counts: Counts }, task: any, trigger: SocraticTriggerReason, focus?: Place) {
  const kinds: string[] = [];
  const shown: { family: string; q: string }[] = [];
  const out: (SocraticHintResponse | null)[] = [];
  let prev: any = null;
  for (let level = 1; level <= 3; level++) {
    const base = stateOf(s, task, kinds, prev, trigger === 'hesitation_45s' && focus ? focus : null);
    const own = trigger === 'consecutive_errors_4' || trigger === 'conversion_not_performed' || trigger === 'consecutive_undos_3';
    const place = own && focus ? focus : cardFocusPlace(base, task, trigger);
    const card = SocraticEngine.getSynchronousTaskHint(task, s.counts, staticCardContextFor(base, task.id, task, { reason: trigger, place }));
    const family = cardFamilyOf(card);
    if (shown.filter((x) => x.family === family && x.q === card.questionHe).length >= MAX_IDENTICAL_SOCRATIC_CARDS) {
      out.push(null);
      continue;
    }
    out.push(card);
    shown.push({ family, q: card.questionHe });
    if (card.cardKind && !kinds.includes(card.cardKind)) kinds.push(card.cardKind);
    prev = { taskId: task.id, reason: trigger, place, kind: card.cardKind ?? null, family, staticQuestionHe: card.questionHe, questionHe: card.questionHe, shown: true, answeredCorrect: false, openedAt: 0 };
  }
  return out;
}

describe('1. every situation, every trigger it meets: the card at the first, second and third opening', () => {
  it('covers the audit\'s 103 situations and the 4 added', () => {
    expect(new Set(CARD_SITUATIONS.map((s) => s.id)).size).toBe(107);
  });

  for (const s of CARD_SITUATIONS) {
    it(`${s.id} ${s.trigger}${s.focus ? `@${s.focus}` : ''}: ${s.what}`, () => {
      const cards = openings(s, byId(s.task), s.trigger, s.focus);
      const got = cards.map((c) => (c ? sitKey(c).replace(/__(units|tens|hundreds|thousands)$/, (m) => m) : 'REFUSED'));
      const want = s.levels.map((k) => (k.includes('__') ? k : k));
      // The situation id (and the column where the card names one).
      expect(got.map((k, i) => (want[i].includes('__') ? k : k.split('__')[0]))).toEqual(want);
      // The second opening is the family's next level, never the first card again (audit D5).
      expect(cards[1]!.questionHe).not.toBe(cards[0]!.questionHe);
    });
  }
});

describe('2. every exercise of every bank, in board states, triggers and levels', () => {
  const served: { task: SessionTask; counts: Counts; trigger: SocraticTriggerReason; level: number; card: SocraticHintResponse }[] = [];
  const noNextLevel: string[] = [];
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  for (const task of bank) {
    if (task.type === 'session1_intro') continue;
    const states: Counts[] = [C(0, 0, 0, 0), C(0, 1, 2, 3), C(0, 0, 1, 12), C(0, 0, 14, 3), C(0, 12, 0, 0)];
    if (typeof task.numberA === 'number') states.push(digitsOf(task.numberA));
    if (typeof task.numberA === 'number' && typeof task.numberB === 'number') {
      states.push(digitsOf(task.isSubtraction ? task.numberA - task.numberB : task.numberA + task.numberB));
      states.push(digitsOf(task.numberA + (task.isSubtraction ? 10 : 0)));
    }
    if (task.requiredCounts) states.push({ ...C(0, 0, 0, 0), ...task.requiredCounts });
    for (const counts of states) {
      for (const trigger of TRIGGERS) {
        if (trigger === 'consecutive_undos_3' && meetingOfTaskId(task.id) !== 8) continue;
        const cards = openings({ counts }, task, trigger);
        cards.forEach((card, i) => card && served.push({ task, counts, trigger, level: i + 1, card }));
        // 2,730's B2 is its family's last level, and is served at once when
        // undo does not lead back to the opening board — as on these boards,
        // set with no undo step (owner, 4.10.2026, cards round 3: "אחרת B2
        // מוגש ישירות"). Station7_2730_Cards reads its B1 → B2 ladder.
        const lastLevelAtOnce = cards[0]!.cardKind === 'restore_given_how';
        if (!lastLevelAtOnce && cards[1] && cards[1].questionHe === cards[0]!.questionHe) noNextLevel.push(`${task.id} ${JSON.stringify(counts)} ${trigger}: ${cards[0]!.situation}`);
      }
    }
  }
  warn.mockRestore();

  it('covers the banks', () => {
    expect(served.length).toBeGreaterThan(10000);
  });

  it('every family has its next level: the second card is never the first again (audit D5)', () => {
    expect(noNextLevel.slice(0, 10)).toEqual([]);
  });

  it('every card has a kind the store keeps, and a frame: a situation id, a level 1–3 and a Hebrew intent', () => {
    const bad: string[] = [];
    for (const { task, counts, card } of served) {
      const where = `${task.id} ${JSON.stringify(counts)}`;
      if (!card.cardKind || !(STATIC_CARD_KINDS as readonly string[]).includes(card.cardKind)) bad.push(`${where}: kind ${card.cardKind}`);
      if (!card.situation || !/^[a-z0-9_]+$/.test(card.situation)) bad.push(`${where}: situation ${card.situation}`);
      if (![1, 2, 3].includes(card.frameLevel as number)) bad.push(`${where}: level ${card.frameLevel}`);
      if (!card.intentHe || !/[א-ת]/.test(card.intentHe)) bad.push(`${where}: intent ${card.intentHe}`);
      const f = cardFrameOf(card, task);
      if (f.situation !== card.situation || f.level !== card.frameLevel) bad.push(`${where}: frame ${JSON.stringify(f)}`);
    }
    expect([...new Set(bad)].slice(0, 10)).toEqual([]);
  });

  it('every wrong option is "רמז:" and ONE question; the right one opens "נכון מאוד!"; the question opens "נסו לחשוב:"', () => {
    const bad: string[] = [];
    for (const { task, card } of served) {
      if (wrongHintViolation(card)) bad.push(`${task.id}: ${wrongHintViolation(card)} — ${card.questionHe}`);
      for (const c of card.choices) {
        const fb = c.feedbackHe ?? '';
        if (c.isCorrect && !fb.startsWith('נכון מאוד!')) bad.push(`${task.id}: ${fb}`);
        // ONE question — except the owner's approved hints of 30.9 that ask two (C1, C2, C5, C7: flagged for him, not changed).
        if (!c.isCorrect && (fb.match(/\?/g) ?? []).length !== 1 && !APPROVED_TWO_QUESTION_KINDS.has(card.cardKind ?? '')) bad.push(`${task.id}: ${fb}`);
      }
      if (card.choices.filter((c) => c.isCorrect).length !== 1 || card.choices.length !== 3) bad.push(`${task.id} ${card.situation}: options`);
      // The opening "נסו לחשוב:" — except the existing station-1 and empty-subtraction
      // questions the owner approved without it (flagged for him, not changed).
      if (!card.questionHe.startsWith('נסו לחשוב:') && !EXISTING_WITHOUT_OPENING.has(card.situation ?? '')) bad.push(`${task.id} ${card.situation}: ${card.questionHe}`);
    }
    expect([...new Set(bad)].slice(0, 10)).toEqual([]);
  });

  it('never shows what the child must find: the result, a hidden digit (as its operand), the number asked for', () => {
    const bad: string[] = [];
    for (const { task, counts, card } of served) {
      const leaked = revealsSecret(textsOf(card), secretNumbersOf(task).filter((n) => ![10, 100, 1000].includes(n)));
      if (leaked !== null) bad.push(`${task.id} ${JSON.stringify(counts)}: ${leaked} — ${card.questionHe}`);
    }
    expect([...new Set(bad)].slice(0, 10)).toEqual([]);
  });

  it('meeting 8 names no blocks, no number house, no trash and no grouping button', () => {
    const bad = served
      .filter(({ task }) => meetingOfTaskId(task.id) === 8)
      .filter(({ card }) => absentAidViolation(textsOf(card), 8) !== null)
      .map(({ task, card }) => `${task.id}: ${card.questionHe}`);
    expect([...new Set(bad)]).toEqual([]);
  });

  it('stations 1 and 3–7 never state how many blocks a column holds (one owner item open: 368\'s "כמה שוות 6 לבני עשרת?")', () => {
    const bad: string[] = [];
    for (const { task, counts, card } of served) {
      const m = meetingOfTaskId(task.id);
      if (m === null || m === 2 || m === 8) continue;
      const col = statesBoardCount(textsOf(card), counts, []);
      // The owner's open item (handoff, 2.10.2026): station 1's 368, the digit's own count — left as it is.
      if (col && !(task.id === 's1_r_value368' && card.situation === 'digit_column')) bad.push(`${task.id} ${JSON.stringify(counts)}: ${col} — ${card.questionHe}`);
    }
    expect([...new Set(bad)].slice(0, 10)).toEqual([]);
  });

  it('meeting 1 names no column in the question of a card about where the difficulty is', () => {
    const bad: string[] = [];
    // The cards of station 1 that may name a column: the child picks it among all of them (the deficit card, the 368 card).
    const picks = new Set(['s1_find_short_column', 'digit_column']);
    for (const { task, card } of served) {
      if (meetingOfTaskId(task.id) !== 1 || picks.has(card.situation ?? '')) continue;
      if (/טור ה(יחידות|עשרות|מאות|אלפים)/.test(card.questionHe)) bad.push(`${task.id} ${card.situation}: ${card.questionHe}`);
    }
    expect([...new Set(bad)].slice(0, 10)).toEqual([]);
  });
});

describe('3. no skeleton hint computes a hidden digit (audit D4)', () => {
  it('every skeleton exercise, every hidden column, every trigger and level: no sum or difference in a card is a hidden digit', () => {
    const bad: string[] = [];
    const dig = (n: number, p: Place) => Math.floor(n / { units: 1, tens: 10, hundreds: 100, thousands: 1000 }[p]) % 10;
    const skeletons = bank.filter((t) => t.hiddenDigits && (t.hiddenDigits.a?.length || t.hiddenDigits.b?.length));
    expect(skeletons.length).toBeGreaterThan(10);
    for (const task of skeletons) {
      const side = task.hiddenDigits!.a?.length ? 'a' : 'b';
      const hiddenOf = (side === 'a' ? task.numberA : task.numberB) as number;
      const hidden = (task.hiddenDigits![side] ?? []) as Place[];
      const hiddenDigits = hidden.map((p) => dig(hiddenOf, p));
      for (const p of hidden) {
        for (const trigger of ['hesitation_45s', 'repeated_errors', 'consecutive_errors_4'] as SocraticTriggerReason[]) {
          for (const card of openings({ counts: C(0, 0, 0, 0) }, task, trigger, p)) {
            if (!card) continue;
            const col = card.suggested_highlight ? PLACE_OF_HL[card.suggested_highlight] : undefined;
            const own = col && hidden.includes(col) ? dig(hiddenOf, col) : null;
            for (const text of textsOf(card)) {
              for (const m of text.matchAll(/(\d+) (ועוד|פחות) (\d+)/g)) {
                const v = m[2] === 'ועוד' ? Number(m[1]) + Number(m[3]) : Number(m[1]) - Number(m[3]);
                if (hiddenDigits.includes(v) || (own !== null && v % 10 === own)) bad.push(`${task.id} ${trigger}: "${text}" → ${v}`);
              }
            }
          }
        }
      }
    }
    expect([...new Set(bad)]).toEqual([]);
  });

  it('2,▢3▢ + 1,554 = 4,191 and 5,▢3▢ + 1,246 = 6,784: the units card no longer asks "כמה זה 4 ועוד 3?" / "כמה זה 6 ועוד 2?"', () => {
    for (const [id, leak] of [['s7_g_t2', 'כמה זה 4 ועוד 3?'], ['s7_g_reinforce_1', 'כמה זה 6 ועוד 2?']] as const) {
      const cards = openings({ counts: C(0, 0, 0, 0) }, byId(id), 'consecutive_errors_4', 'units');
      expect(cards[1]!.situation).toBe('skeleton_missing_addend_column');
      expect(textsOf(cards[1]!).join(' ')).not.toContain(leak);
    }
  });
});

// ───────────────────────── 4. through the real store ─────────────────────────

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
/** Opens a card for `reason`, lets it settle (the engine is offline: the static card), returns it, and closes it. */
async function cardFor(reason: SocraticTriggerReason, place?: Place): Promise<SocraticHintResponse | null> {
  ws().openSocraticCard(reason, place);
  await flush();
  const card = ws().helpState === 'socratic' ? ws().aiSocraticHint : null;
  ws().recordSocraticAnswer(false);
  ws().closeHelp();
  return card;
}

describe('4. through the real store: the fields the cards read reach them (audit D1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockLocalStorage.clear();
    vi.spyOn(SocraticEngine, 'getSocraticHint').mockRejectedValue(new Error('offline'));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('the store\'s context carries the trigger, the column, the digits, the circles, the conversions, the hidden board and the trash history', () => {
    load(5, byId('s5_r_t2'), { counts: C(0, 0, 4, 13), answerDigits: { units: '5' }, carryDigits: { tens: '4' }, boardOpen: false, hasDeletedBlock: true });
    const ctx = staticCardContextFor(ws(), 's5_r_t2', byId('s5_r_t2'), { reason: 'consecutive_errors_4', place: 'units' });
    expect(ctx).toMatchObject({ trigger: 'consecutive_errors_4', focusColumn: 'units', answerDigits: { units: '5' }, memoryCircles: { tens: '4' }, boardHidden: true });
    expect(ctx.conversionsDone).toEqual([]);
    expect(ctx.blocksRemoved).toBe(false); // the board never held 53, so nothing was taken away yet
  });

  it('D15: the number house hidden with the top-bar button — its own cards, never a card about the blocks', async () => {
    load(5, byId('s5_r_t2'));
    board({ tens: 5, units: 3 });
    ws().toggleBoard();
    const first = await cardFor('hesitation_45s');
    const second = await cardFor('hesitation_45s');
    const third = await cardFor('repeated_errors');
    expect(first!.situation).toBe('board_hidden');
    // Coordinator's decision (2.10.2026): showing the board is suggested once;
    // then the column card worded without blocks — help for a child who works
    // without the board, never a card about the blocks.
    for (const c of [second!, third!]) {
      expect(c.situation).toBe('borrow_column');
      expect(textsOf(c).join(' ')).not.toMatch(/לבנ|בית המספרים|קבצו|פח האשפה/);
    }
    ws().toggleBoard();
    expect((await cardFor('hesitation_45s'))!.situation).toBe('check_enough_to_subtract');
  });

  it('D7: 53 − 18, a ten broken and 9 units taken — "too much taken", then that column; still building and a block thrown away is not taking away', async () => {
    load(5, byId('s5_r_t2'));
    board({ tens: 5, units: 3 });
    ws().splitBlockClick('tens');
    for (let i = 0; i < 9; i++) ws().removeBlockClick('units');
    expect(ws().counts).toMatchObject({ tens: 4, units: 4 });
    expect((await cardFor('hesitation_45s'))!.situation).toBe('took_too_many');
    const second = (await cardFor('hesitation_45s'))!;
    expect(second.situation).toBe('took_too_many_column');
    expect(second.suggested_highlight).toBe('tour-column-units');

    load(5, byId('s5_r_t2'));
    board({ hundreds: 1, tens: 2 }); // a hundred dragged by mistake while building 53
    ws().removeBlockClick('hundreds');
    expect((await cardFor('hesitation_45s'))!.situation).toBe('build_first_number');
  });

  it('D6: 61 − 24 just after the right break — take away now, never "check you did not take too much"', async () => {
    load(1, byId('s1_r_sub61'));
    board({ tens: 6, units: 1 });
    ws().splitBlockClick('tens');
    const first = (await cardFor('hesitation_45s'))!;
    const second = (await cardFor('hesitation_45s'))!;
    expect(first.situation).toBe('s1_finished_taking_away');
    expect(second.situation).toBe('take_away_how');
    expect(textsOf(second).join(' ')).not.toMatch(/יותר מדי|כפתור ביטול הפעולה/);
  });

  it('D8: meeting 1\'s 26 units, 18 thrown away — is it still the same number? Then back with the undo button', async () => {
    load(1, byId('s1_r_group26'), { counts: C(0, 0, 0, 26) });
    for (let i = 0; i < 18; i++) ws().removeBlockClick('units');
    const first = (await cardFor('hesitation_45s'))!;
    const second = (await cardFor('hesitation_45s'))!;
    expect(first.situation).toBe('same_number_check');
    expect(second.situation).toBe('s1_restore_start');
    expect(first.choices.find((c) => c.isCorrect)!.textHe).not.toMatch(/פחות מ-10/);
  });

  it('D16: meeting 1\'s 347 built by hand in its final form, nothing broken — break it yourselves, not "what happened to the ten you broke"', async () => {
    load(1, byId('s1_target_347'));
    board({ hundreds: 3, tens: 3, units: 17 });
    expect((await cardFor('hesitation_45s'))!.situation).toBe('convert_yourselves');
    // After a real break, the card about the ten.
    load(1, byId('s1_target_347'));
    board({ hundreds: 3, tens: 4, units: 7 });
    ws().splitBlockClick('tens');
    expect((await cardFor('hesitation_45s'))!.situation).toBe('s1_after_break');
  });

  it('D3 (audit C30): meeting 8, 1,245 + 328, the units done and 1 above the tens — the second card is the tens, not the units again', async () => {
    load(8, byId('s8_g_t1'));
    ws().setAnswerDigit('units', '3');
    ws().setCarryDigit('tens', '1');
    ws().setFocusedPlace('tens');
    expect((await cardFor('hesitation_45s'))!.situation).toBe('check_each_column');
    const second = (await cardFor('hesitation_45s'))!;
    expect(second.situation).toBe('add_column');
    expect(second.suggested_highlight).toBe('tour-column-tens');
  });

  it('D13: meeting 8, three undos on a skeleton — מסמך 03\'s card, grounded in the exercise as the screen shows it (no hidden digit)', async () => {
    load(8, byId('s8_r_t7')); // 4▢6 + 281 = 737
    ws().setOperandDigit('a', 'tens', '1');
    ws().setOperandDigit('a', 'tens', '2');
    ws().setOperandDigit('a', 'tens', '3');
    ws().undo(); ws().undo(); ws().undo();
    await flush();
    expect(ws().socraticTriggerReason).toBe('consecutive_undos_3');
    const card = ws().aiSocraticHint!;
    expect(card.situation).toBe('guessing_loop');
    expect(card.questionHe).toContain('4▢6 + 281 = 737');
    expect(revealsSecret(textsOf(card), secretNumbersOf(byId('s8_r_t7')))).toBeNull();
  });

  it('D12: 7,045 + 1,283 answered 8,228 twice — the hundreds, where the ten from the tens was forgotten', async () => {
    load(4, byId('s4_g_t6'));
    for (const [p, d] of [['units', '8'], ['tens', '2'], ['hundreds', '2'], ['thousands', '8']] as const) ws().setAnswerDigit(p, d);
    ws().proceed();
    ws().proceed();
    if (ws().helpState === 'friction') ws().helpFrictionDone();
    await flush();
    const card = ws().aiSocraticHint!;
    expect(ws().socraticTriggerReason).toBe('repeated_errors');
    expect(card.situation).toBe('carry_forgotten');
    expect(card.suggested_highlight).toBe('tour-column-hundreds');
  });

  it('D17: the station-1 sandbox card keeps its question and options; only its feedback follows the hint rule', () => {
    const c = TASK_HINTS['s1_sandbox_controlled'];
    expect(c.choices.map((o) => o.textHe)).toEqual([
      'לגרור עוד לבנים לטורים ולצפות בספרות בבית המספרים',
      'לקבץ 10 לבני עשרת ללבנת מאה אחת',
      'לכתוב מספר בשורת התוצאה',
    ]);
    expect(c.choices[0].feedbackHe).toBe('נכון מאוד! גררו עוד לבנים, ושימו לב איך הספרות משתנות.');
    expect(wrongHintViolation(c)).toBeNull();
    expect(textsOf(c).join(' ')).not.toMatch(/בוצעה/);
  });
});
