/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';

/**
 * Station 7's 2,730 (s7_g_t6) opens with its blocks on the board since
 * 4.10.2026 (owner): 1 thousand, 16 hundreds, 13 tens. The learner builds
 * nothing and groups twice. Every static card the store can serve for it —
 * board states, triggers, columns, three openings in a row — is read here
 * against that screen: no card may say the learner built the number.
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

import {
  staticCardContextFor,
  cardFocusPlace,
  emptyColumnConversions,
  MAX_IDENTICAL_SOCRATIC_CARDS,
  type SocraticTriggerReason,
} from '@/application/useWorkspaceStore';
import { SocraticEngine, type SocraticHintResponse } from '@/infrastructure/services/SocraticEngine';
import { cardFamilyOf } from '@/infrastructure/services/staticSocraticCards';
import { getSessionTasks, SESSION1_TASKS } from '@/data/sessionTasks';
import { EMPTY_COUNTS, type Place } from '@/core/placeValue';

type Counts = Record<Place, number>;
const C = (th: number, h: number, t: number, u: number): Counts => ({ thousands: th, hundreds: h, tens: t, units: u });
const TASK = getSessionTasks(7, 'green_path').find((t) => t.id === 's7_g_t6')!;
const START = C(1, 16, 13, 0);
const TRIGGERS: SocraticTriggerReason[] = ['hesitation_45s', 'repeated_errors', 'consecutive_errors_4', 'conversion_not_performed', 'consecutive_undos_3'];

interface Situation {
  what: string;
  counts: Counts;
  composed?: Partial<Record<Place, number>>;
  /** The board before each action (the undo stack). */
  history?: Counts[];
  removed?: boolean;
  answer?: Partial<Record<Place, string>>;
  boardHidden?: boolean;
}

/** What the child can have on the screen in this exercise. */
const SITUATIONS: Situation[] = [
  { what: 'the opening board, untouched', counts: START },
  { what: 'the opening board, the number typed', counts: START, answer: { thousands: '2', hundreds: '7', tens: '3', units: '0' } },
  { what: 'the opening board, the blocks counted into the row (1, 16→6, 13→3)', counts: START, answer: { thousands: '1', hundreds: '6', tens: '3', units: '0' } },
  { what: 'tens grouped', counts: C(1, 17, 3, 0), composed: { tens: 1 }, history: [START] },
  { what: 'hundreds grouped', counts: C(2, 6, 13, 0), composed: { hundreds: 1 }, history: [START] },
  { what: 'both grouped, nothing written', counts: C(2, 7, 3, 0), composed: { tens: 1, hundreds: 1 }, history: [START, C(1, 17, 3, 0)] },
  { what: 'both grouped, a wrong number written', counts: C(2, 7, 3, 0), composed: { tens: 1, hundreds: 1 }, history: [START, C(1, 17, 3, 0)], answer: { thousands: '2', hundreds: '3', tens: '7', units: '0' } },
  { what: 'both grouped, the hundreds box alone written', counts: C(2, 7, 3, 0), composed: { tens: 1, hundreds: 1 }, history: [START, C(1, 17, 3, 0)], answer: { hundreds: '7' } },
  { what: 'the final blocks arranged by hand, nothing grouped', counts: C(2, 7, 3, 0), removed: true, history: [START, C(0, 0, 0, 0)] },
  { what: 'tens grouped, the hundreds arranged by hand', counts: C(2, 7, 3, 0), composed: { tens: 1 }, removed: true, history: [START, C(1, 17, 3, 0), C(1, 7, 3, 0)] },
  { what: 'a ten deleted from the opening board', counts: C(1, 16, 12, 0), removed: true, history: [START] },
  { what: 'a hundred deleted from the opening board', counts: C(1, 15, 13, 0), removed: true, history: [START] },
  { what: 'a ten added to the opening board', counts: C(1, 16, 14, 0), history: [START] },
  { what: 'unit blocks added to the opening board', counts: C(1, 16, 13, 4), history: [START] },
  { what: 'the board cleared', counts: C(0, 0, 0, 0), removed: true, history: [START] },
  { what: 'a hundred broken into tens (1, 15, 23)', counts: C(1, 15, 23, 0), history: [START] },
  { what: 'the thousand broken into hundreds (0, 26, 13)', counts: C(0, 26, 13, 0), history: [START] },
  { what: 'a ten broken into units (1, 16, 12, 10)', counts: C(1, 16, 12, 10), history: [START] },
  { what: 'the board hidden, untouched', counts: START, boardHidden: true },
  { what: 'the board hidden, both grouped', counts: C(2, 7, 3, 0), composed: { tens: 1, hundreds: 1 }, history: [START, C(1, 17, 3, 0)], boardHidden: true },
];

function stateOf(s: Situation, kinds: string[], prev: any, focusedPlace: Place | null) {
  const conv = emptyColumnConversions();
  for (const [p, n] of Object.entries(s.composed ?? {})) {
    conv.composed[p as Place] = true;
    conv.times = { ...(conv.times ?? {}), composed: { ...(conv.times?.composed ?? {}), [p]: n } };
  }
  return {
    takeAwayTrack: null,
    sessionNumber: 7,
    isASD: false,
    placeCuesShown: false,
    socraticCardKinds: { taskId: TASK.id, kinds },
    conversionsByColumn: conv,
    hasGrouped: Object.keys(s.composed ?? {}).length > 0,
    hasUngrouped: false,
    counts: s.counts,
    answerDigits: s.answer ?? {},
    carryDigits: {},
    operandDigits: { a: {}, b: {} },
    boardOpen: s.boardHidden !== true,
    hasDeletedBlock: s.removed === true,
    undoStack: (s.history ?? []).map((counts) => ({ counts, actionType: 'BLOCK_DRAG_COMPLETE' })),
    focusedPlace,
    socraticTriggerReason: null,
    socraticCardPlace: null,
    previousSocraticCard: prev,
  } as any;
}

/** The cards of three openings in a row, as the store serves them. */
function openings(s: Situation, trigger: SocraticTriggerReason, focus: Place | null): SocraticHintResponse[] {
  const kinds: string[] = [];
  const shown: { family: string; q: string }[] = [];
  const out: SocraticHintResponse[] = [];
  let prev: any = null;
  for (let level = 1; level <= 3; level++) {
    const base = stateOf(s, kinds, prev, trigger === 'hesitation_45s' ? focus : null);
    const own = trigger !== 'hesitation_45s' && trigger !== 'repeated_errors';
    const place = own && focus ? focus : cardFocusPlace(base, TASK, trigger);
    const card = SocraticEngine.getSynchronousTaskHint(TASK, s.counts, staticCardContextFor(base, TASK.id, TASK, { reason: trigger, place }));
    const family = cardFamilyOf(card);
    if (shown.filter((x) => x.family === family && x.q === card.questionHe).length >= MAX_IDENTICAL_SOCRATIC_CARDS) continue;
    out.push(card);
    shown.push({ family, q: card.questionHe });
    if (card.cardKind && !kinds.includes(card.cardKind)) kinds.push(card.cardKind);
    prev = { taskId: TASK.id, reason: trigger, place, kind: card.cardKind ?? null, family, staticQuestionHe: card.questionHe, questionHe: card.questionHe, shown: true, answeredCorrect: false, openedAt: 0 };
  }
  return out;
}

const textsOf = (h: SocraticHintResponse) => [h.questionHe, ...h.choices.flatMap((c) => [c.textHe, c.feedbackHe ?? ''])];

interface Served { what: string; trigger: string; focus: Place | null; level: number; card: SocraticHintResponse }
const served: Served[] = [];
for (const s of SITUATIONS) {
  for (const trigger of TRIGGERS) {
    for (const focus of [null, 'units', 'tens', 'hundreds', 'thousands'] as (Place | null)[]) {
      openings(s, trigger, focus).forEach((card, i) => served.push({ what: s.what, trigger, focus, level: i + 1, card }));
    }
  }
}

describe('s7_g_t6 (2,730): the static cards against the board that opens with its blocks', () => {
  it('the exercise is the one the cards are read against', () => {
    expect(TASK.initialCounts).toEqual({ thousands: 1, hundreds: 16, tens: 13 });
    expect({ ...EMPTY_COUNTS, ...TASK.initialCounts }).toEqual(START);
    expect(served.length).toBeGreaterThan(500);
  });

  it('the cards it can get, by situation', () => {
    const situations = [...new Set(served.map((x) => String((x.card as any).situation)))].sort();
    expect(situations).toEqual([
      'board_hidden', 'crowded_column', 'group_action', 'restore_given', 'restore_given_how', 'show_board_button', 'which_number_built', 'write_digits',
    ]);
  });

  it('no card tells the learner to build, or says the learner built the number', () => {
    // Including the two hidden-board cards: their hint is "האם הלבנים נמחקו" (cards round 2, C).
    for (const x of served) {
      for (const t of textsOf(x.card)) {
        expect(t, `${x.what} / ${x.trigger} / opening ${x.level}`).not.toMatch(/בניתם|(?:^|[^א-ת])(?:בנו|בונים|תבנו|לבנות)(?![א-ת])/);
      }
    }
  });

  it('never the grouping-proof card of s7_g_t1 ("לפני ההקבצה בניתם מספר…"): the exercise has no such kind', () => {
    expect(TASK.representationKind).toBeUndefined();
    expect(served.some((x) => /לפני (?:שתי )?ההקבצ/.test(x.card.questionHe))).toBe(false);
    expect(served.some((x) => x.card.cardKind === 'compose_group' || x.card.cardKind === 'blocks_before_convert' || x.card.cardKind === 'build_before_convert')).toBe(false);
  });

  it('the opening board: the crowded column, then its button — the tens first, the hundreds after them', () => {
    const at = (what: string) => served.filter((x) => x.what === what && x.trigger === 'hesitation_45s' && x.focus === null).map((x) => x.card.questionHe);
    expect(at('the opening board, untouched')).toEqual([
      'נסו לחשוב: בטור העשרות יש 10 לבנים או יותר. מה עושים?',
      'נסו לחשוב: איך מקבצים 10 לבני עשרת ללבנת מאה אחת?',
      'נסו לחשוב: איך מקבצים 10 לבני עשרת ללבנת מאה אחת?',
    ]);
    expect(at('tens grouped')[0]).toBe('נסו לחשוב: בטור המאות יש 10 לבנים או יותר. מה עושים?');
  });

  // The owner's cards of 4.10.2026 (cards round 2, B1 and B2), word for word.
  const B1 = {
    q: 'נסו לחשוב: בית המספרים לא נראה עכשיו כמו בתחילת התרגיל. מה עושים?',
    options: [
      ['מחזירים את הלבנים שהיו בתחילת התרגיל', 'נכון מאוד! לחצו על כפתור ביטול הפעולה עד שבית המספרים ייראה כמו בתחילת התרגיל. הכפתור אפור, ובית המספרים עדיין נראה אחרת? לחצו על פח האשפה, ואז גררו מארגז הכלים את הלבנים שבהנחיה, כל לבנה אל הטור שלה. אחר כך לחצו על הכפתור "קבצו 10" בכל טור שיש בו 10 לבנים או יותר.', true],
      ['ממשיכים בתרגיל בלי להחזיר את הלבנים', 'רמז: אילו לבנים ההנחיה מתארת?', false],
      ['כותבים מספר בשורת התוצאה', 'רמז: מה ההנחיה מבקשת לעשות עם הלבנים שהיו בתחילת התרגיל?', false],
    ],
    intent: 'הלבנים שהתרגיל נתן השתנו: מחזירים אותן בכפתור ביטול הפעולה, או בונים אותן שוב לפי ההנחיה, ורק אז מקבצים',
  };
  const B2 = {
    q: 'נסו לחשוב: איך יודעים אילו לבנים היו בבית המספרים בתחילת התרגיל?',
    options: [
      ['קוראים בהנחיה אילו לבנים היו', 'נכון מאוד! לחצו על פח האשפה כדי לנקות את בית המספרים. אחר כך גררו מארגז הכלים את הלבנים שבהנחיה, כל לבנה אל הטור שלה. בסוף לחצו על הכפתור "קבצו 10" בכל טור שיש בו 10 לבנים או יותר.', true],
      ['אי אפשר לדעת', 'רמז: מה כתוב במשפט הראשון של ההנחיה?', false],
      ['מנחשים אילו לבנים היו', 'רמז: איפה על המסך כתוב אילו לבנים היו בבית המספרים?', false],
    ],
    intent: 'ההנחיה מונה את הלבנים שהיו בהתחלה: מנקים את בית המספרים, בונים אותן שוב מארגז הכלים ומקבצים',
  };
  const asPinned = (c: SocraticHintResponse) => ({
    q: c.questionHe,
    options: c.choices.map((o) => [o.textHe, o.feedbackHe, Boolean(o.isCorrect)]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    intent: c.intentHe,
  });
  const sorted = (b: typeof B1) => ({ ...b, options: [...b.options].sort((x, y) => String(x[0]).localeCompare(String(y[0]))) });

  const CHANGED = [
    'the board cleared',
    'a ten deleted from the opening board',
    'a hundred deleted from the opening board',
    'a ten added to the opening board',
    'unit blocks added to the opening board',
    'the final blocks arranged by hand, nothing grouped',
    'tens grouped, the hundreds arranged by hand',
  ];

  it('the given blocks changed — cleared, deleted, added, or the final blocks arranged by hand: B1, then B2', () => {
    for (const what of CHANGED) {
      for (const trigger of TRIGGERS) {
        const cards = served.filter((x) => x.what === what && x.trigger === trigger && x.focus === null).map((x) => x.card);
        expect(cards.length, `${what} / ${trigger}`).toBe(3);
        expect(asPinned(cards[0]), `${what} / ${trigger}`).toEqual(sorted(B1));
        expect(asPinned(cards[1]), `${what} / ${trigger}`).toEqual(sorted(B2));
        expect(cards[2].questionHe).toBe(B2.q);
        expect([cards[0].cardKind, cards[1].cardKind]).toEqual(['restore_given', 'restore_given_how']);
      }
    }
  });

  it('…and only then: the given blocks as they were, regrouped, or grouped by the buttons get their own cards', () => {
    const others = SITUATIONS.map((s) => s.what).filter((w) => !CHANGED.includes(w));
    expect(others.length).toBeGreaterThan(8);
    for (const x of served.filter((s) => others.includes(s.what))) {
      expect(String((x.card as any).situation), x.what).not.toMatch(/^restore_given/);
    }
  });

  it('no other exercise gets them: meeting 1\'s 26 units keep their own cards', () => {
    const g26 = SESSION1_TASKS.find((t) => t.id === 's1_r_group26')!;
    for (const counts of [C(0, 0, 0, 25), C(0, 0, 0, 0), C(0, 0, 2, 6)]) {
      const card = SocraticEngine.getSynchronousTaskHint(g26, counts, { conversionDone: false } as any);
      expect(String((card as any).situation)).not.toMatch(/^restore_given/);
    }
  });

  if (process.env.G7_DUMP) {
    it('dump', async () => {
      const fs = await import('node:fs');
      const byText = new Map<string, { texts: string[]; kind: string; situation: string; where: string[] }>();
      for (const x of served) {
        const key = textsOf(x.card).join(' | ');
        const e = byText.get(key) ?? { texts: textsOf(x.card), kind: String(x.card.cardKind), situation: String((x.card as any).situation), where: [] };
        const w = `${x.what} / ${x.trigger}${x.focus ? `@${x.focus}` : ''} / opening ${x.level}`;
        if (e.where.length < 400) e.where.push(w);
        byText.set(key, e);
      }
      fs.writeFileSync(process.env.G7_DUMP!, JSON.stringify([...byText.values()], null, 1));
    });
  }
});

describe('s7_g_t6 (2,730): what the coaching function is told', () => {
  it('the opening blocks go as start_counts with start_given, and whether both groupings are done', async () => {
    const { socraticTaskContextFor } = await import('@/infrastructure/services/SocraticEngine');
    const ctxOf = (s: Situation) => staticCardContextFor(stateOf(s, [], null, null), TASK.id, TASK, { reason: 'hesitation_45s', place: null });
    const at = (what: string) => SITUATIONS.find((s) => s.what === what)!;
    expect(socraticTaskContextFor(TASK, ctxOf(SITUATIONS[0]))).toMatchObject({
      kind: 'representation',
      required_counts: { thousands: 2, hundreds: 7, tens: 3 },
      start_counts: { thousands: 1, hundreds: 16, tens: 13 },
      start_given: true,
      conversion_done: false,
    });
    expect(socraticTaskContextFor(TASK, ctxOf(at('tens grouped')))!.conversion_done).toBe(false);
    expect(socraticTaskContextFor(TASK, ctxOf(at('both grouped, nothing written')))!.conversion_done).toBe(true);
    expect(socraticTaskContextFor(TASK, ctxOf(at('the final blocks arranged by hand, nothing grouped')))!.conversion_done).toBe(false);
  });

  it('meeting 1\'s 26 units are given blocks too; an exercise the child builds is not', async () => {
    const { socraticTaskContextFor } = await import('@/infrastructure/services/SocraticEngine');
    const g26 = SESSION1_TASKS.find((t) => t.id === 's1_r_group26')!;
    expect(socraticTaskContextFor(g26)).toMatchObject({ start_counts: { units: 26 }, start_given: true });
    const built = getSessionTasks(7, 'green_path').find((t) => t.id === 's7_g_t1')!;
    expect(socraticTaskContextFor(built)!.start_given).toBeUndefined();
    expect(socraticTaskContextFor(built)!.start_counts).toMatchObject({ hundreds: 25 });
  });
});
