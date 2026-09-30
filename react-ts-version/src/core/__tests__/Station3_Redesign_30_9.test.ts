/**
 * Station 3 and station 7's two grouping exercises — the owner's redesign of
 * 30.9.2026. Until then every station-3 instruction named the blocks to build
 * AND the number ("…בדרך הרגילה: 3 מאות ו-4 עשרות", "…באמצעות 45 מאות"), the
 * big number card over the result row showed it, and the number checked was
 * the number given: nothing was tested.
 *
 * Here: the approved texts word for word; what each exercise checks (the
 * board, the child's own break or grouping, the answer of its kind); the one
 * answer box and the digits it records; that no instruction of stations 3 and
 * 7 holds its own answer; and that "בדרך הרגילה" is gone.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

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

import { useWorkspaceStore, answerDigitsFromText, answerTextFromDigits, breakItYourselvesHe, groupItYourselvesHe } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { getSessionTasks, SESSION1_TASKS, SESSIONS_BY_PATH, type SessionTask } from '@/data/sessionTasks';
import { SESSION_BRANCH_TASKS, getSessionBranchTasks } from '@/data/sessionBranchTasks';
import { REPRESENTATION_LOCKS } from '@/data/representationLocks';
import { EMPTY_COUNTS, type Place, type PlaceCounts } from '@/core/placeValue';

const ws = () => useWorkspaceStore.getState();
const UNIT: Record<Place, number> = { units: 1, tens: 10, hundreds: 100, thousands: 1000 };
const PLACES: Place[] = ['units', 'tens', 'hundreds', 'thousands'];

function stationTasks(meeting: 3 | 7): SessionTask[] {
  const out: SessionTask[] = [];
  for (const p of ['remediation_path', 'green_path'] as const) {
    out.push(...getSessionTasks(meeting, p));
    out.push(...getSessionBranchTasks(meeting, 'reinforcement', p), ...getSessionBranchTasks(meeting, 'challenge', p));
  }
  return out;
}
const all = [...stationTasks(3), ...stationTasks(7)];
const byId = (id: string) => {
  const t = all.find((x) => x.id === id) ?? SESSION1_TASKS.find((x) => x.id === id);
  if (!t) throw new Error(`no task ${id}`);
  return t;
};

/* ── The approved texts (owner, 30.9.2026), word for word ─────────────────── */

const APPROVED: Record<string, { kind: string; text: string; numberA: number; answer: number; board: Partial<PlaceCounts> }> = {
  s3_r_t1: {
    kind: 'read_write', numberA: 340, answer: 340, board: { hundreds: 3, tens: 4 },
    text: 'בנו בבית המספרים את המספר שלוש מאות וארבעים. כתבו אותו בספרות בשורת התוצאה.',
  },
  s3_r_t2: {
    kind: 'compose_break', numberA: 340, answer: 340, board: { hundreds: 2, tens: 14 },
    text: 'בנו בבית המספרים 3 לבני מאה ו-4 לבני עשרת. פרטו לבנת מאה אחת לעשר לבני עשרת. איזה מספר מייצגות הלבנים לאחר הפריטה? כתבו אותו בשורת התוצאה.',
  },
  s3_r_t3: {
    kind: 'decompose', numberA: 450, answer: 45, board: { tens: 45 },
    text: 'בנו בבית המספרים את המספר 450 מלבני עשרת בלבד. בכמה לבני עשרת השתמשתם? כתבו את התשובה בשורת התוצאה.',
  },
  s3_r_t4: {
    kind: 'compose_break', numberA: 85, answer: 85, board: { tens: 7, units: 15 },
    text: 'בנו בבית המספרים 8 לבני עשרת ו-5 לבני יחידה. פרטו לבנת עשרת אחת לעשר לבני יחידה. איזה מספר מייצגות הלבנים לאחר הפריטה? כתבו אותו בשורת התוצאה.',
  },
  s3_r_t5: {
    kind: 'read_write', numberA: 506, answer: 506, board: { hundreds: 5, units: 6 },
    text: 'בנו בבית המספרים את המספר חמש מאות ושש. כתבו אותו בספרות בשורת התוצאה.',
  },
  s3_r_t6: {
    kind: 'compose_break', numberA: 506, answer: 506, board: { hundreds: 4, tens: 10, units: 6 },
    text: 'בנו בבית המספרים 5 לבני מאה ו-6 לבני יחידה. פרטו לבנת מאה אחת לעשר לבני עשרת. איזה מספר מייצגות הלבנים לאחר הפריטה? כתבו אותו בשורת התוצאה.',
  },
  s3_g_t1: {
    kind: 'read_write', numberA: 3400, answer: 3400, board: { thousands: 3, hundreds: 4 },
    text: 'בנו בבית המספרים את המספר שלושת אלפים וארבע מאות. כתבו אותו בספרות בשורת התוצאה.',
  },
  s3_g_t2: {
    kind: 'compose_break', numberA: 3400, answer: 3400, board: { thousands: 2, hundreds: 14 },
    text: 'בנו בבית המספרים 3 לבני אלף ו-4 לבני מאה. פרטו לבנת אלף אחת לעשר לבני מאה. איזה מספר מייצגות הלבנים לאחר הפריטה? כתבו אותו בשורת התוצאה.',
  },
  s3_g_t3: {
    kind: 'decompose', numberA: 4500, answer: 45, board: { hundreds: 45 },
    text: 'בנו בבית המספרים את המספר 4,500 מלבני מאה בלבד. בכמה לבני מאה השתמשתם? כתבו את התשובה בשורת התוצאה.',
  },
  s3_g_t4: {
    kind: 'compose_break', numberA: 5230, answer: 5230, board: { thousands: 4, hundreds: 11, tens: 13 },
    text: 'בנו בבית המספרים 5 לבני אלף, 2 לבני מאה ו-3 לבני עשרת. פרטו לבנת אלף אחת לעשר לבני מאה. אחר כך פרטו לבנת מאה אחת לעשר לבני עשרת. איזה מספר מייצגות הלבנים לאחר הפריטה? כתבו אותו בשורת התוצאה.',
  },
  s3_g_t5: {
    kind: 'read_write', numberA: 6030, answer: 6030, board: { thousands: 6, tens: 3 },
    text: 'בנו בבית המספרים את המספר ששת אלפים ושלושים. כתבו אותו בספרות בשורת התוצאה.',
  },
  s3_g_t6: {
    kind: 'compose_break', numberA: 6030, answer: 6030, board: { thousands: 5, hundreds: 10, tens: 3 },
    text: 'בנו בבית המספרים 6 לבני אלף ו-3 לבני עשרת. פרטו לבנת אלף אחת לעשר לבני מאה. איזה מספר מייצגות הלבנים לאחר הפריטה? כתבו אותו בשורת התוצאה.',
  },
  s3_r_reinforce_1: {
    kind: 'read_write', numberA: 270, answer: 270, board: { hundreds: 2, tens: 7 },
    text: 'בנו בבית המספרים את המספר מאתיים ושבעים. כתבו אותו בספרות בשורת התוצאה.',
  },
  s3_r_reinforce_2: {
    kind: 'decompose', numberA: 270, answer: 27, board: { tens: 27 },
    text: 'בנו בבית המספרים את המספר 270 מלבני עשרת בלבד. בכמה לבני עשרת השתמשתם? כתבו את התשובה בשורת התוצאה.',
  },
  s3_g_reinforce_1: {
    kind: 'read_write', numberA: 3600, answer: 3600, board: { thousands: 3, hundreds: 6 },
    text: 'בנו בבית המספרים את המספר שלושת אלפים ושש מאות. כתבו אותו בספרות בשורת התוצאה.',
  },
  s3_g_reinforce_2: {
    kind: 'decompose', numberA: 3600, answer: 36, board: { hundreds: 36 },
    text: 'בנו בבית המספרים את המספר 3,600 מלבני מאה בלבד. בכמה לבני מאה השתמשתם? כתבו את התשובה בשורת התוצאה.',
  },
  s7_r_t1: {
    kind: 'compose_group', numberA: 125, answer: 125, board: { hundreds: 1, tens: 2, units: 5 },
    text: 'בנו בבית המספרים 12 לבני עשרת ו-5 לבני יחידה. קבצו 10 לבני עשרת ללבנת מאה אחת. איזה מספר מייצגות הלבנים לאחר ההקבצה? כתבו אותו בשורת התוצאה.',
  },
  s7_g_t1: {
    kind: 'compose_group', numberA: 2500, answer: 2500, board: { thousands: 2, hundreds: 5 },
    text: 'בנו בבית המספרים 25 לבני מאה. קבצו 10 לבני מאה ללבנת אלף אחת. קבצו שוב 10 לבני מאה ללבנת אלף אחת. איזה מספר מייצגות הלבנים לאחר ההקבצה? כתבו אותו בשורת התוצאה.',
  },
  // The green path's second reinforcement of station 7 (owner, 30.9.2026), with its own numbers.
  s7_g_reinforce_2: {
    kind: 'compose_group', numberA: 1430, answer: 1430, board: { thousands: 1, hundreds: 4, tens: 3 },
    text: 'בנו בבית המספרים 14 לבני מאה ו-3 לבני עשרת. קבצו 10 לבני מאה ללבנת אלף אחת. איזה מספר מייצגות הלבנים לאחר ההקבצה? כתבו אותו בשורת התוצאה.',
  },
};

describe('the approved exercises (owner, 30.9.2026)', () => {
  it('every one is in the bank under its old id, with its kind, its text, its numbers and its board', () => {
    for (const [id, a] of Object.entries(APPROVED)) {
      const t = byId(id);
      expect(t.type, id).toBe('representation');
      expect(t.representationKind, id).toBe(a.kind);
      expect(t.instructionHe, id).toBe(a.text);
      expect(t.numberA, id).toBe(a.numberA);
      expect(t.correctAnswer, id).toBe(a.answer);
      expect(t.requiredCounts, id).toEqual(a.board);
      // The board is worth the number built.
      expect(PLACES.reduce((s, p) => s + (a.board[p] ?? 0) * UNIT[p], 0), id).toBe(a.numberA);
    }
  });

  it('every station-3 representation exercise has a kind; the seventh exercises are unchanged', () => {
    for (const t of stationTasks(3).filter((x) => x.type === 'representation')) expect(APPROVED[t.id], t.id).toBeDefined();
    expect(byId('s3_r_t7')).toMatchObject({
      type: 'missing_element', numberA: 100, numberB: 160, correctAnswer: 60,
      instructionHe: 'בנו את המספר 160 בבית המספרים. המספר 160 מורכב ממאה אחת ועוד כמה? כתבו את החלק החסר בתיבה הריקה.',
    });
    expect(byId('s3_g_t7')).toMatchObject({ type: 'flexible_decomp', numberA: 2100 });
    expect(byId('s3_r_challenge_1')).toMatchObject({ type: 'flexible_decomp', numberA: 320 });
    expect(byId('s3_g_challenge_1')).toMatchObject({ type: 'flexible_decomp', numberA: 4200 });
    // Station 7's other representation exercises keep their row of digits: no kind.
    for (const id of ['s7_r_t6', 's7_g_t5', 's7_g_t6']) expect(byId(id).representationKind, id).toBeUndefined();
  });

  it('the green path is built like the gap-closing path, kind for kind: the same opening and the same closing', () => {
    const CLOSING: Record<string, string> = {
      read_write: 'כתבו אותו בספרות בשורת התוצאה.',
      compose_break: 'איזה מספר מייצגות הלבנים לאחר הפריטה? כתבו אותו בשורת התוצאה.',
      decompose: 'כתבו את התשובה בשורת התוצאה.',
      compose_group: 'איזה מספר מייצגות הלבנים לאחר ההקבצה? כתבו אותו בשורת התוצאה.',
    };
    for (const [id, a] of Object.entries(APPROVED)) {
      expect(a.text.startsWith('בנו בבית המספרים '), id).toBe(true);
      expect(a.text.endsWith(CLOSING[a.kind]), id).toBe(true);
    }
  });

  it('compose_break asks for the child\'s own break, compose_group for the grouping; the others for none', () => {
    for (const [id, a] of Object.entries(APPROVED)) {
      const t = byId(id);
      expect(Boolean(t.requiresUngrouping), id).toBe(a.kind === 'compose_break');
      expect(Boolean(t.requiresGrouping), id).toBe(a.kind === 'compose_group');
      expect(Boolean(REPRESENTATION_LOCKS[id]), id).toBe(a.kind === 'compose_break' || a.kind === 'compose_group');
    }
    expect(REPRESENTATION_LOCKS.s3_g_t4.columns).toEqual(['hundreds', 'tens']); // a thousand, then a hundred
    expect(REPRESENTATION_LOCKS.s7_g_t1).toEqual({ conversion: 'composition', columns: ['hundreds', 'hundreds'] }); // twice in one column
  });

  it('the conversions the instruction names, done on the blocks it names, give exactly the board checked', () => {
    const below = (p: Place) => PLACES[PLACES.indexOf(p) - 1];
    const above = (p: Place) => PLACES[PLACES.indexOf(p) + 1];
    const clean = (c: Partial<PlaceCounts>) => Object.fromEntries(Object.entries(c).filter(([, n]) => (n ?? 0) > 0));
    const built: Record<string, Partial<PlaceCounts>> = {
      s3_r_t2: { hundreds: 3, tens: 4 }, s3_r_t4: { tens: 8, units: 5 }, s3_r_t6: { hundreds: 5, units: 6 },
      s3_g_t2: { thousands: 3, hundreds: 4 }, s3_g_t4: { thousands: 5, hundreds: 2, tens: 3 }, s3_g_t6: { thousands: 6, tens: 3 },
      s7_r_t1: { tens: 12, units: 5 }, s7_g_t1: { hundreds: 25 }, s7_g_reinforce_2: { hundreds: 14, tens: 3 },
    };
    const steps: Record<string, Array<['break' | 'group', Place]>> = {
      s3_r_t2: [['break', 'hundreds']], s3_r_t4: [['break', 'tens']], s3_r_t6: [['break', 'hundreds']],
      s3_g_t2: [['break', 'thousands']], s3_g_t4: [['break', 'thousands'], ['break', 'hundreds']], s3_g_t6: [['break', 'thousands']],
      s7_r_t1: [['group', 'tens']], s7_g_t1: [['group', 'hundreds'], ['group', 'hundreds']], s7_g_reinforce_2: [['group', 'hundreds']],
    };
    for (const [id, start] of Object.entries(built)) {
      const c: Partial<PlaceCounts> = { ...start };
      for (const [op, p] of steps[id]) {
        if (op === 'break') {
          expect(c[p] ?? 0, id).toBeGreaterThan(0);
          c[p] = (c[p] ?? 0) - 1;
          c[below(p)] = (c[below(p)] ?? 0) + 10;
        } else {
          expect(c[p] ?? 0, id).toBeGreaterThanOrEqual(10);
          c[p] = (c[p] ?? 0) - 10;
          c[above(p)] = (c[above(p)] ?? 0) + 1;
        }
      }
      expect(clean(c), id).toEqual(APPROVED[id].board);
    }
  });

  it('ranges: the gap-closing path within 1,000, the green path within 10,000 (Module 26)', () => {
    for (const [id, a] of Object.entries(APPROVED)) {
      const limit = id.includes('_r_') ? 1000 : 10000;
      expect(a.numberA, id).toBeLessThanOrEqual(limit);
      expect(a.answer, id).toBeLessThanOrEqual(limit);
    }
  });
});

/* ── No instruction of stations 3 and 7 holds its own answer ──────────────── */

/** Every number written in a text: "3,400" is 3400, "31▢" is not a number. */
function numbersIn(text: string): number[] {
  return (text.match(/\d[\d,]*/g) ?? []).map((s) => Number(s.replace(/,/g, '')));
}

describe('no instruction of stations 3 and 7 holds its own answer', () => {
  it('representation and missing-part exercises: the number the child writes is not in the instruction', () => {
    const checked: string[] = [];
    for (const t of all) {
      if (t.type !== 'representation' && t.type !== 'missing_element') continue;
      expect(numbersIn(t.instructionHe), t.id).not.toContain(t.correctAnswer);
      checked.push(t.id);
    }
    // 12 + 4 in station 3, s3_r_t7, and s7_r_t1, s7_g_t1, s7_g_reinforce_2, s7_r_t6, s7_g_t5, s7_g_t6.
    expect(checked).toHaveLength(23);
  });

  it('the representation exercises of both stations: nor the board to build, where the blocks are the answer', () => {
    // read_write: the blocks of the standard form are the number in digits.
    for (const [id, a] of Object.entries(APPROVED)) {
      if (a.kind !== 'read_write') continue;
      expect(byId(id).instructionHe, id).not.toMatch(/\d/);
    }
    // decompose: the instruction names the number built, never how many blocks.
    for (const [id, a] of Object.entries(APPROVED)) {
      if (a.kind !== 'decompose') continue;
      expect(numbersIn(byId(id).instructionHe), id).toEqual([a.numberA]);
    }
  });

  it('skeletons show the result and never the whole hidden number; error analyses never the right result', () => {
    for (const t of all) {
      if (t.type !== 'vertical_addition') continue;
      const nums = numbersIn(t.instructionHe);
      if (t.hiddenDigits?.a?.length) expect(nums, t.id).not.toContain(t.numberA);
      if (t.hiddenDigits?.b?.length) expect(nums, t.id).not.toContain(t.numberB);
      if (!t.hiddenDigits) expect(nums, t.id).not.toContain(t.correctAnswer);
    }
  });

  it('"בדרך הרגילה" is nowhere in stations 3 and 7 — not in an instruction, not in a teacher\'s title', () => {
    for (const t of all) {
      expect(t.instructionHe, t.id).not.toContain('בדרך הרגילה');
      expect(t.titleHe, t.id).not.toContain('בדרך הרגילה');
    }
    expect(byId('s3_r_reinforce_1').titleHe).toBe('ביסוס 1: ייצוג סטנדרטי של 270');
    expect(byId('s3_g_reinforce_1').titleHe).toBe('ביסוס 1: ייצוג סטנדרטי של 3,600');
  });

  it('block names: לבנת / לבני + יחידה, עשרת, מאה, אלף; never "לטור" in a conversion', () => {
    for (const [id, a] of Object.entries(APPROVED)) {
      // No "3 מאות" or "45 עשרות": a count of blocks names the block.
      expect(a.text, id).not.toMatch(/לטור|לבנים של|\d (יחידות|עשרות|מאות|אלפים)/);
      for (const m of a.text.match(/לבנ[תי] \S+/g) ?? []) expect(m, id).toMatch(/^לבנ[תי] (יחידה|עשרת|מאה|אלף)[.,?]?$/);
    }
  });
});

/* ── What "התקדם" checks, kind by kind ───────────────────────────────────── */

/** The exercise on the screen; a second one after it, so a success's own message stays on the screen. */
function load(task: SessionTask, meeting = Number(task.id[1])) {
  ws().resetWorkspace();
  useAuthStore.setState({ user: { uid: 'student_user1', student_id: 1 } } as any);
  useWorkspaceStore.setState({
    activeSupportProfileId: null,
    sessionNumber: meeting, dynamicTasks: [task, { ...task, id: `${task.id}_next` }], standardTaskIdx: 0, flowStatus: 'task',
    helpState: 'none', currentState: 'PROBLEM_ACTIVE', taskStartTime: Date.now(),
  } as any);
  sent.events.length = 0;
}
const drop =(place: Place, n = 1) => {
  for (let i = 0; i < n; i++) ws().applyDrop({ source: 'palette', sourcePlace: place, target: { kind: 'column', place } });
};
const buildBlocks = (c: Partial<PlaceCounts>) => PLACES.forEach((p) => drop(p, c[p] ?? 0));
const answer = (text: string) => ws().setRepresentationAnswer(text);
const press = () => ws().proceed();
const sub = () => ws().feedback?.sub ?? '';
const title = () => ws().feedback?.title ?? '';
const done = () => sent.events.some((e) => e.event_type === 'PROBLEM_COMPLETE');
const digitsEntered = () => sent.events.filter((e) => e.event_type === 'DIGIT_ENTERED');

const SUCCESS = 'בניתם בדיוק את מה שהתבקש, והמספר שכתבתם מתאים ללבנים בבית המספרים.';
const WRONG_NUMBER = 'המספר שכתבתם לא מתאים ללבנים בבית המספרים. בדקו שוב!';
const WRONG_BOARD = 'בית המספרים עוד לא מראה את מה שההנחיה מבקשת. קראו אותה שוב ובדקו כמה לבנים יש בכל טור.';

beforeEach(() => {
  sent.events.length = 0;
});

describe('read_write: build the number said in words, write it in digits', () => {
  it('s3_r_t5: 506 with its empty tens column; 56 is the number the blocks do not show', () => {
    load(byId('s3_r_t5'));
    buildBlocks({ hundreds: 5, units: 6 });
    answer('56');
    press();
    expect(sub()).toBe(WRONG_NUMBER);
    expect(done()).toBe(false);
    answer('506');
    press();
    expect(sub()).toBe(SUCCESS);
    expect(done()).toBe(true);
  });

  it('no conversion is asked: the standard blocks, dragged, are the exercise', () => {
    load(byId('s3_g_t1'));
    buildBlocks({ thousands: 3, hundreds: 4 });
    answer('3400');
    press();
    expect(done()).toBe(true);
  });
});

describe('compose_break: the break is the child\'s own, and the answer is the number the blocks still make', () => {
  it('s3_r_t2: the final board built by hand is refused, naming the hundred block; the break passes', () => {
    load(byId('s3_r_t2'));
    buildBlocks({ hundreds: 2, tens: 14 });
    answer('340');
    press();
    expect(title()).toBe('פִּרְטוּ 🧱');
    expect(sub()).toBe('הלבנים מסודרות נכון, אבל המשימה היא לפרוט בעצמכם. בנו את הלבנים שבהנחיה. לחצו על לבנת מאה כדי לפרוט אותה.');
    expect(done()).toBe(false);
    ws().clearBoard();
    buildBlocks({ hundreds: 3, tens: 4 });
    ws().splitBlockClick('hundreds');
    press();
    expect(sub()).toBe(SUCCESS);
    expect(done()).toBe(true);
  });

  it('each exercise names its own block: a ten in 85, a thousand in 3,400 and 6,030', () => {
    expect(breakItYourselvesHe('units')).toContain('לחצו על לבנת עשרת כדי לפרוט אותה.');
    expect(breakItYourselvesHe('tens')).toContain('לחצו על לבנת מאה כדי לפרוט אותה.');
    expect(breakItYourselvesHe('hundreds')).toContain('לחצו על לבנת אלף כדי לפרוט אותה.');
    load(byId('s3_g_t6'));
    buildBlocks({ thousands: 5, hundreds: 10, tens: 3 });
    press();
    expect(sub()).toContain('לחצו על לבנת אלף כדי לפרוט אותה.');
  });

  it('s3_g_t4: both breaks — after the thousand, the message asks for the hundred', () => {
    load(byId('s3_g_t4'));
    buildBlocks({ thousands: 5, hundreds: 2, tens: 3 });
    ws().splitBlockClick('thousands'); // 4 thousands, 12 hundreds, 3 tens
    // The second "break" made by hand: a hundred to the trash, ten tens from the palette.
    ws().applyDrop({ source: 'column', sourcePlace: 'hundreds', target: { kind: 'trash' } });
    drop('tens', 10);
    expect(ws().counts).toEqual({ ...EMPTY_COUNTS, thousands: 4, hundreds: 11, tens: 13 });
    answer('5230');
    press();
    expect(sub()).toContain('לחצו על לבנת מאה כדי לפרוט אותה.');
    expect(done()).toBe(false);
  });

  it('a break taken back with undo is not a break', () => {
    load(byId('s3_r_t4'));
    buildBlocks({ tens: 8, units: 5 });
    ws().splitBlockClick('tens');
    ws().undo();
    ws().clearBoard();
    buildBlocks({ tens: 7, units: 15 });
    answer('85');
    press();
    expect(title()).toBe('פִּרְטוּ 🧱');
    expect(done()).toBe(false);
  });

  it('a wrong number after the break: the blocks still make the same number', () => {
    load(byId('s3_g_t2'));
    buildBlocks({ thousands: 3, hundreds: 4 });
    ws().splitBlockClick('thousands');
    answer('2140');
    press();
    expect(sub()).toBe(WRONG_NUMBER);
    answer('3400');
    press();
    expect(done()).toBe(true);
  });
});

describe('decompose: the answer is the number of blocks', () => {
  it('s3_r_t3: 450 from tens only — 450 is not the answer, 45 is', () => {
    load(byId('s3_r_t3'));
    drop('tens', 45);
    answer('450');
    press();
    expect(title()).toBe('כִּמְעַט... 🧐');
    expect(sub()).toBe('בדקו שוב: כמה לבני עשרת יש בבית המספרים?');
    expect(sub()).not.toMatch(/ערך|ספרה/);
    answer('45');
    press();
    expect(sub()).toBe('בניתם את המספר מלבני עשרת בלבד, והתשובה שכתבתם נכונה.');
    expect(done()).toBe(true);
  });

  it('s3_g_reinforce_2: 3,600 from hundreds only → 36; an empty box asks for "the answer"', () => {
    load(byId('s3_g_reinforce_2'));
    drop('hundreds', 36);
    press();
    expect(sub()).toBe('הלבנים מסודרות בדיוק כנדרש! עכשיו כתבו את התשובה בשורת התוצאה.');
    answer('35');
    press();
    expect(sub()).toBe('בדקו שוב: כמה לבני מאה יש בבית המספרים?');
    answer('36');
    press();
    expect(sub()).toBe('בניתם את המספר מלבני מאה בלבד, והתשובה שכתבתם נכונה.');
  });

  it('building 450 as 4 hundreds and 5 tens is not the exercise', () => {
    load(byId('s3_r_t3'));
    buildBlocks({ hundreds: 4, tens: 5 });
    answer('45');
    press();
    expect(sub()).toBe(WRONG_BOARD);
    expect(done()).toBe(false);
  });
});

describe('compose_group (station 7): the grouping is the child\'s own', () => {
  it('s7_r_t1: 1 hundred, 2 tens, 5 units built by hand is refused, naming the button; the grouping passes', () => {
    load(byId('s7_r_t1'));
    buildBlocks({ hundreds: 1, tens: 2, units: 5 });
    answer('125');
    press();
    expect(title()).toBe('קַבְּצוּ 🧱');
    expect(sub()).toBe('הלבנים מסודרות נכון, אבל המשימה היא לקבץ בעצמכם. בנו את הלבנים שבהנחיה. לחצו על הכפתור "קבצו 10 למאה" שבראש טור העשרות.');
    ws().clearBoard();
    buildBlocks({ tens: 12, units: 5 });
    ws().groupColumnClick('tens');
    press();
    expect(sub()).toBe(SUCCESS);
    expect(done()).toBe(true);
  });

  it('s7_g_reinforce_2: 14 hundreds and 3 tens, one grouping, 1,430; the hand-built board names the hundreds\' button', () => {
    load(byId('s7_g_reinforce_2'));
    buildBlocks({ thousands: 1, hundreds: 4, tens: 3 });
    answer('1430');
    press();
    expect(sub()).toBe('הלבנים מסודרות נכון, אבל המשימה היא לקבץ בעצמכם. בנו את הלבנים שבהנחיה. לחצו על הכפתור "קבצו 10 לאלף" שבראש טור המאות.');
    ws().clearBoard();
    buildBlocks({ hundreds: 14, tens: 3 });
    ws().groupColumnClick('hundreds');
    answer('1340');
    press();
    expect(sub()).toBe(WRONG_NUMBER);
    answer('1430');
    press();
    expect(sub()).toBe(SUCCESS);
    expect(done()).toBe(true);
  });

  it('s7_g_t1: 25 hundreds, grouped twice; the button of the hundreds is "קבצו 10 לאלף"', () => {
    expect(groupItYourselvesHe('hundreds')).toContain('לחצו על הכפתור "קבצו 10 לאלף" שבראש טור המאות.');
    load(byId('s7_g_t1'));
    drop('hundreds', 25);
    ws().groupColumnClick('hundreds');
    answer('2500');
    press();
    expect(sub()).toBe(WRONG_BOARD); // 1 thousand and 15 hundreds: group once more
    ws().groupColumnClick('hundreds');
    press();
    expect(done()).toBe(true);
  });
});

describe('station 1 keeps its own wording (s1_r_value368, s1_r_group26)', () => {
  it('368 → the value of the 6 (60): "the value of the digit", as before', () => {
    load(byId('s1_r_value368'), 1);
    buildBlocks({ hundreds: 3, tens: 6, units: 8 });
    ws().setAnswerDigit('tens', '6');
    ws().setAnswerDigit('units', '1');
    press();
    expect(sub()).toBe('זה עוד לא הערך של הספרה. הסתכלו בבית המספרים ובדקו שוב!');
    ws().setAnswerDigit('units', '0');
    press();
    expect(sub()).toBe('מצאתם את הערך של הספרה במספר.');
  });

  it('26 units grouped into tens: the station-1 "do it yourselves" sentence is unchanged', () => {
    const t = byId('s1_r_group26');
    load(t, 1);
    // 20 of the 26 units to the trash, and two tens from the palette: the right board, no grouping.
    useWorkspaceStore.setState({ counts: { ...EMPTY_COUNTS, units: 26 } });
    for (let i = 0; i < 20; i++) ws().applyDrop({ source: 'column', sourcePlace: 'units', target: { kind: 'trash' } });
    drop('tens', 2);
    ws().setAnswerDigit('tens', '2');
    ws().setAnswerDigit('units', '6');
    press();
    expect(sub()).toBe('הלבנים מסודרות נכון, אבל המשימה היא לקבץ בעצמכם: 10 לבנים בכל פעם, בעזרת הכפתור שבראש הטור.');
  });
});

/* ── The one answer box records its digits at the press ─────────────────── */

describe('the one answer box: its digits are recorded when "התקדם" is pressed, each at its place in the number', () => {
  it('"45" typed from the left is a 4 in the tens and a 5 in the units — both right, first attempt', () => {
    load(byId('s3_r_t3'));
    drop('tens', 45);
    answer('4');
    answer('45');
    expect(digitsEntered()).toHaveLength(0); // nothing while typing
    press();
    const d = digitsEntered();
    expect(d.map((e) => [e.column_index, e.details.digit_value, e.details.is_correct])).toEqual([
      [0, 5, true],
      [1, 4, true],
    ]);
    expect(done()).toBe(true);
    const complete = sent.events.findIndex((e) => e.event_type === 'PROBLEM_COMPLETE');
    expect(sent.events.findIndex((e) => e.event_type === 'DIGIT_ENTERED')).toBeLessThan(complete);
  });

  it('a wrong number is recorded as wrong digits, the wrong ones first; the same wrong answer again records one wrong digit', () => {
    load(byId('s3_r_t1'));
    buildBlocks({ hundreds: 3, tens: 4 });
    answer('304');
    press();
    let d = digitsEntered();
    // 304 against 340: the units 4 and the tens 0 are wrong, the hundreds 3 is right.
    expect(d.map((e) => [e.column_index, e.details.digit_value, e.details.is_correct])).toEqual([
      [0, 4, false],
      [1, 0, false],
      [2, 3, true],
    ]);
    press(); // the same wrong answer: one wrong digit, the lowest place — every wrong press counts once
    expect(digitsEntered().slice(3).map((e) => [e.column_index, e.details.digit_value, e.details.is_correct])).toEqual([[0, 4, false]]);
    answer('340');
    press();
    d = digitsEntered().slice(4);
    // Only the digits that changed: the units and the tens.
    expect(d.map((e) => [e.column_index, e.details.digit_value, e.details.is_correct])).toEqual([
      [0, 0, true],
      [1, 4, true],
    ]);
    expect(done()).toBe(true);
    for (const e of digitsEntered()) {
      expect([0, 1, 2, 3]).toContain(e.column_index);
      expect(e.exercise_id).toBe('s3_r_t1');
    }
  });

  it('a wrong number always records a wrong digit: "40" for 340 has 0 hundreds', () => {
    load(byId('s3_r_t1'));
    buildBlocks({ hundreds: 3, tens: 4 });
    answer('40');
    press();
    expect(digitsEntered().map((e) => [e.column_index, e.details.digit_value, e.details.is_correct])).toEqual([
      [2, 0, false], // the hundreds of 40: none, where 340 has 3
      [0, 0, true],
      [1, 4, true],
    ]);
    // Another wrong number: only the wrong digit that changed; the unchanged
    // wrong hundreds and right units are not recorded again.
    answer('50');
    press();
    expect(digitsEntered().slice(3).map((e) => [e.column_index, e.details.digit_value, e.details.is_correct])).toEqual([
      [1, 5, false],
    ]);
    answer('340');
    press();
    expect(digitsEntered().slice(4).map((e) => [e.column_index, e.details.digit_value, e.details.is_correct])).toEqual([
      [1, 4, true],
      [2, 3, true],
    ]);
    expect(done()).toBe(true);
  });

  it('a digit beyond the answer is a wrong digit in its own place: 3400 for 340', () => {
    load(byId('s3_r_t1'));
    buildBlocks({ hundreds: 3, tens: 4 });
    answer('3400');
    press();
    const d = digitsEntered().map((e) => [e.column_index, e.details.digit_value, e.details.is_correct]);
    expect(d[0]).toEqual([1, 0, false]);
    expect(d).toContainEqual([3, 3, false]);
    expect(d).toContainEqual([2, 4, false]);
    expect(d).toContainEqual([0, 0, true]);
  });

  it('the digits are recorded at the press even when the board is refused', () => {
    load(byId('s3_r_t1'));
    buildBlocks({ hundreds: 3, tens: 3 });
    answer('330');
    press();
    expect(sub()).toBe(WRONG_BOARD);
    expect(digitsEntered().some((e) => e.details.is_correct === false)).toBe(true);
  });

  it('the text and the digits of the row: right-aligned, digits only, four at most', () => {
    expect(answerDigitsFromText('340')).toEqual({ hundreds: '3', tens: '4', units: '0' });
    expect(answerDigitsFromText('4,500')).toEqual({ thousands: '4', hundreds: '5', tens: '0', units: '0' });
    expect(answerDigitsFromText('45 ')).toEqual({ tens: '4', units: '5' });
    expect(answerDigitsFromText('')).toEqual({});
    expect(answerTextFromDigits({ tens: '4', units: '5' })).toBe('45');
    expect(answerTextFromDigits(answerDigitsFromText('123456'))).toBe('1234');
  });

  it('typing is one undo step per change (Module 11 §א), and a reload restarts the record', () => {
    load(byId('s3_r_t3'));
    drop('tens', 45);
    answer('4');
    answer('45');
    ws().undo();
    expect(answerTextFromDigits(ws().answerDigits)).toBe('4');
    ws().undo();
    expect(answerTextFromDigits(ws().answerDigits)).toBe('');
    expect(ws().counts.tens).toBe(45);
  });
});

describe('the banks (sanity): 7 compulsory per path, ids unchanged', () => {
  it('station 3 and station 7 keep their seven ids per path', () => {
    for (const m of [3, 7] as const) {
      for (const p of ['remediation_path', 'green_path'] as const) {
        const ids = SESSIONS_BY_PATH[m][p].map((t) => t.id);
        expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7].map((i) => `s${m}_${p === 'green_path' ? 'g' : 'r'}_t${i}`));
      }
    }
    expect(SESSION_BRANCH_TASKS[3].remediation_path.reinforcement.map((t) => t.id)).toEqual(['s3_r_reinforce_1', 's3_r_reinforce_2']);
    expect(SESSION_BRANCH_TASKS[3].green_path.reinforcement.map((t) => t.id)).toEqual(['s3_g_reinforce_1', 's3_g_reinforce_2']);
  });
});
