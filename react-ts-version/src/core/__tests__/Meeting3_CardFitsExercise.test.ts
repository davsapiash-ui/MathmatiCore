import { describe, it, expect, vi, afterEach } from 'vitest';
import { SocraticEngine, inferIsSubtraction } from '@/infrastructure/services/SocraticEngine';
import { countGroupsIn, contradictsRequiredRepresentation, revealsSecretInCounts } from '@/infrastructure/services/staticSocraticCards';
import { getSessionTasks, type SessionTask } from '@/data/sessionTasks';
import { getSessionBranchTasks } from '@/data/sessionBranchTasks';

/**
 * Owner-approved 28.9.2026 (שהB.1, audit row הB.11): the meeting-3 static card
 * fits each exercise. On "3,400, the usual way: 3 אלפים ו-4 מאות" the card used
 * to mark "3 אלפים ו-4 מאות" wrong and "34 מאות" right.
 *
 * All 20 meeting-3 exercises, both tracks: 12 representation tasks t1–t6,
 * s3_g_t7, s3_r_t7, 4 reinforcements, 2 challenges.
 */
const EMPTY = { units: 0, tens: 0, hundreds: 0, thousands: 0 };
const PLACES = { units: 1, tens: 10, hundreds: 100, thousands: 1000 } as const;
const WORD: Record<string, keyof typeof PLACES> = {
  'יחידות': 'units', 'יחידה': 'units', 'עשרות': 'tens', 'עשרת': 'tens', 'מאות': 'hundreds', 'מאה': 'hundreds', 'אלפים': 'thousands', 'אלף': 'thousands',
};

const tasks: SessionTask[] = [];
for (const path of ['green_path', 'remediation_path'] as const) {
  tasks.push(...getSessionTasks(3, path));
  for (const b of ['reinforcement', 'challenge'] as const) tasks.push(...getSessionBranchTasks(3, b, path));
}
const byId = (id: string) => tasks.find((t) => t.id === id)!;
const reps = tasks.filter((t) => t.type === 'representation');

/**
 * Since the owner's redesign of 30.9.2026 (sessionTasks.ts) no station-3
 * instruction names both its number and its blocks: that was the answer
 * written into the question. The card rules of שהB.1 below are for a
 * representation task whose instruction does name both, so they are checked
 * on the same sixteen exercises written that way, as they were until then
 * (`namesBoth`: the number, its blocks and — for 506 and 6,030 — the empty
 * column). What station 3's own exercises get is at the end of this block.
 */
const PLURAL_HE = { units: 'יחידות', tens: 'עשרות', hundreds: 'מאות', thousands: 'אלפים' } as const;
const COLUMN_HE = { units: 'טור היחידות', tens: 'טור העשרות', hundreds: 'טור המאות', thousands: 'טור האלפים' } as const;
const HIGH_TO_LOW = ['thousands', 'hundreds', 'tens', 'units'] as const;
function namesBoth(t: SessionTask): SessionTask {
  const req = t.requiredCounts ?? {};
  const parts = HIGH_TO_LOW.filter((p) => (req[p] ?? 0) > 0).map((p) => `${req[p]} ${PLURAL_HE[p]}`);
  const blocks = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} ו-${parts[parts.length - 1]}` : parts[0];
  const N = t.numberA as number;
  const digits = HIGH_TO_LOW.map((p) => Math.floor(N / PLACES[p]) % 10);
  const standard = HIGH_TO_LOW.every((p, i) => (req[p] ?? 0) === digits[i]);
  const first = digits.findIndex((d) => d > 0);
  const last = digits.length - 1 - [...digits].reverse().findIndex((d) => d > 0);
  const empty = standard ? HIGH_TO_LOW.find((_, i) => i > first && i < last && digits[i] === 0) : undefined;
  const { representationKind: _kind, requiresUngrouping: _u, requiresGrouping: _g, ...rest } = t;
  return {
    ...rest,
    // Not station 3's own id: the card chooser would read the kind from it
    // (staticSocraticCards.representationKindOf) and serve C1–C3.
    id: `${t.id}_named`,
    correctAnswer: N,
    instructionHe: `בנו את המספר ${N.toLocaleString('en-US')} מ-${blocks}.${empty ? ` ${COLUMN_HE[empty]} נשאר ריק.` : ''} כתבו אותו בשורת התוצאה.`,
  };
}
const namedBoth = reps.map(namesBoth);
const namedBothId = (id: string) => namedBoth.find((t) => t.id === `${id}_named`)!;

/** "משתמשים ב-4 אלפים, 11 מאות ו-13 עשרות" → { thousands: 4, hundreds: 11, tens: 13 }. */
function parseCounts(text: string): Partial<Record<keyof typeof PLACES, number>> | null {
  const m = /^משתמשים ב-?(.*)$/.exec(text);
  if (!m) return null;
  const out: Partial<Record<keyof typeof PLACES, number>> = {};
  for (const part of m[1].split(/, | ו-?/)) {
    const pm = /^([\d,]+) (\S+)$/.exec(part.trim()) ?? /^(\S+) (אחת|אחד)$/.exec(part.trim());
    if (!pm) return null;
    const [n, w] = /^\d/.test(pm[1]) ? [Number(pm[1].replace(/,/g, '')), pm[2]] : [1, pm[1]];
    if (!WORD[w]) return null;
    out[WORD[w]] = n;
  }
  return out;
}
const value = (c: Partial<Record<keyof typeof PLACES, number>>) =>
  Object.entries(c).reduce((s, [p, n]) => s + (n ?? 0) * PLACES[p as keyof typeof PLACES], 0);
const same = (a: object, b: object) =>
  (Object.keys(PLACES) as (keyof typeof PLACES)[]).every((p) => ((a as any)[p] ?? 0) === ((b as any)[p] ?? 0));

describe('meeting 3: the static card fits each exercise (שהB.1)', () => {
  it('covers all 20 meeting-3 exercises: 16 representation tasks, s3_g_t7, s3_r_t7, 2 challenges', () => {
    expect(tasks).toHaveLength(20);
    expect(reps).toHaveLength(16); // t1–t6 × 2 tracks + 4 reinforcements
    expect(tasks.filter((t) => t.type === 'flexible_decomp').map((t) => t.id).sort()).toEqual(['s3_g_challenge_1', 's3_g_t7', 's3_r_challenge_1']);
    expect(byId('s3_r_t7').type).toBe('missing_element');
  });

  // Owner, 30.9.2026: station 3's own exercises get the card of their kind
  // (C1–C3). The card that lists blocks stays for a representation task of no
  // known kind whose instruction names both (below).
  it('each representation task gets the card of its kind (C1–C3, owner 30.9.2026)', () => {
    const q = (id: string) => SocraticEngine.getSynchronousTaskHint(byId(id), EMPTY).questionHe;
    // The board the task ends with: something is built.
    const built = (id: string) => SocraticEngine.getSynchronousTaskHint(byId(id), { ...EMPTY, ...byId(id).requiredCounts }).questionHe;
    for (const id of ['s3_r_t1', 's3_g_t1', 's3_r_reinforce_1', 's3_g_reinforce_1']) {
      expect(built(id), id).toBe('נסו לחשוב: איך יודעים איזה מספר בנוי בבית המספרים?');
      // An empty board: build first what the instruction names (owner, 30.9.2026).
      expect(q(id), id).toBe('נסו לחשוב: בית המספרים עדיין ריק. מה עושים קודם?');
    }
    for (const id of ['s3_r_t5', 's3_g_t5']) {
      expect(built(id), id).toBe('נסו לחשוב: יש טור שאין בו לבנים. מה כותבים במספר בשביל הטור הזה?');
      expect(q(id), id).toBe('נסו לחשוב: בית המספרים עדיין ריק. מה עושים קודם?');
    }
    for (const id of ['s3_r_t2', 's3_r_t4', 's3_r_t6', 's3_g_t2', 's3_g_t4', 's3_g_t6']) {
      expect(built(id), id).toBe(id === 's3_g_t4'
        ? 'נסו לחשוב: לפני הפריטות בניתם מספר. האם הפריטות שינו אותו?' // two breaks (owner, 4.10.2026)
        : 'נסו לחשוב: לפני הפריטה בניתם מספר. האם הפריטה שינתה אותו?');
      // Nothing built yet: no card that says "you built a number" (owner, 30.9.2026).
      expect(q(id), id).not.toContain('בניתם');
    }
    for (const id of ['s3_r_t3', 's3_r_reinforce_2']) expect(q(id), id).toBe('נסו לחשוב: כמה לבני עשרת שוות ללבנת מאה אחת?');
    for (const id of ['s3_g_t3', 's3_g_reinforce_2']) expect(q(id), id).toBe('נסו לחשוב: כמה לבני מאה שוות ללבנת אלף אחת?');
  });

  it('representation tasks: the question names the criterion — which blocks the instruction asks for', () => {
    for (const t of namedBoth) {
      const card = SocraticEngine.getSynchronousTaskHint(t, EMPTY);
      const N = (t.numberA as number).toLocaleString('en-US');
      expect(card.questionHe, t.id).toBe(`נסו לחשוב: באילו לבנים ההנחיה מבקשת לבנות את המספר ${N}?`);
    }
  });

  it('rule (2) for every representation task: correct = requiredCounts; no wrong option = requiredCounts; a wrong option is ≠ N or says it is also N', () => {
    for (const t of namedBoth) {
      const N = t.numberA as number;
      const Nhe = N.toLocaleString('en-US');
      const card = SocraticEngine.getSynchronousTaskHint(t, EMPTY);
      expect(card.questionHe, t.id).toBe(`נסו לחשוב: באילו לבנים ההנחיה מבקשת לבנות את המספר ${Nhe}?`);
      expect(card.choices, t.id).toHaveLength(3);
      const [correct, ...wrong] = card.choices;
      expect(correct.isCorrect, t.id).toBe(true);
      expect(correct.feedbackHe, t.id).toBe('נכון מאוד! בנו את זה בבית המספרים.');
      const c = parseCounts(correct.textHe);
      expect(c && same(c, t.requiredCounts!), `${t.id}: ${correct.textHe}`).toBe(true);
      for (const w of wrong) {
        expect(w.isCorrect, t.id).toBe(false);
        const wc = parseCounts(w.textHe);
        expect(wc, `${t.id}: ${w.textHe}`).not.toBeNull();
        expect(same(wc!, t.requiredCounts!), `${t.id}: ${w.textHe}`).toBe(false);
        if (value(wc!) === N) {
          expect(w.feedbackHe, `${t.id}: ${w.textHe}`).toContain(`גם זה ${Nhe}`);
          expect(w.feedbackHe, `${t.id}: ${w.textHe}`).toContain('ההנחיה מבקשת');
        }
      }
    }
  });

  it('s3_g_t1 and s3_r_t1: the correct option is the usual way the instruction asks for', () => {
    expect(SocraticEngine.getSynchronousTaskHint(namedBothId('s3_g_t1'), EMPTY).choices.map((c) => [c.textHe, c.isCorrect])).toEqual([
      ['משתמשים ב-3 אלפים ו-4 מאות', true],
      ['משתמשים ב-4 אלפים ו-3 מאות', false],
      ['משתמשים ב-3,400 יחידות', false],
    ]);
    expect(SocraticEngine.getSynchronousTaskHint(namedBothId('s3_r_t1'), EMPTY).choices.map((c) => [c.textHe, c.isCorrect])).toEqual([
      ['משתמשים ב-3 מאות ו-4 עשרות', true],
      ['משתמשים ב-4 מאות ו-3 עשרות', false],
      ['משתמשים ב-340 יחידות', false],
    ]);
  });

  it('the fixed hints are guiding questions, and "בדרך הרגילה" is gone (owner, 30.9.2026)', () => {
    const t2 = SocraticEngine.getSynchronousTaskHint(namedBothId('s3_g_t2'), EMPTY);
    expect(t2.choices[1]).toMatchObject({ textHe: 'משתמשים ב-3 אלפים ו-4 מאות', feedbackHe: 'רמז: גם זה 3,400. באילו לבנים ההנחיה מבקשת לבנות אותו?' });
    expect(t2.choices[2]).toMatchObject({ textHe: 'משתמשים ב-3,400 יחידות', feedbackHe: 'רמז: גם זה 3,400. האם ההנחיה מבקשת לבנות אותו רק מלבני יחידה?' });
    for (const t of [...tasks, ...namedBoth]) expect(JSON.stringify(SocraticEngine.getSynchronousTaskHint(t, EMPTY)), t.id).not.toContain('בדרך הרגילה');
  });

  it('a standard task whose instruction names an empty column: the digit moves into it (★ chosen)', () => {
    expect(SocraticEngine.getSynchronousTaskHint(namedBothId('s3_r_t5'), EMPTY).choices[1]).toMatchObject({
      textHe: 'משתמשים ב-5 מאות ו-6 עשרות', isCorrect: false, feedbackHe: 'רמז: לאיזה טור שייכת הספרה 6 במספר 506?',
    });
    expect(SocraticEngine.getSynchronousTaskHint(namedBothId('s3_g_t5'), EMPTY).choices[1]).toMatchObject({
      textHe: 'משתמשים ב-6 אלפים ו-3 מאות', isCorrect: false, feedbackHe: 'רמז: לאיזה טור שייכת הספרה 3 במספר 6,030?',
    });
  });

  it("station 3's own exercises (owner, 30.9.2026): the card gives away neither the number to write nor the blocks", () => {
    for (const t of reps) {
      expect(t.representationKind, t.id).toBeDefined();
      for (const counts of [EMPTY, { ...EMPTY, ...t.requiredCounts }]) {
        const card = SocraticEngine.getSynchronousTaskHint(t, counts);
        const all = JSON.stringify(card);
        // The answer: the number built, or — a decomposition — the number of blocks.
        expect(all, t.id).not.toContain(String(t.correctAnswer));
        expect(all, t.id).not.toContain((t.correctAnswer as number).toLocaleString('en-US'));
        expect(all, t.id).not.toMatch(/משתמשים ב/);
      }
    }
  });

  it('the order of the options is unchanged: the correct option is first', () => {
    for (const t of tasks) expect(SocraticEngine.getSynchronousTaskHint(t, EMPTY).correctChoiceId, t.id).toBe('opt_1');
  });

  it('no meeting-3 card, in any board state, is the old "34" card', () => {
    for (const t of tasks) {
      for (const counts of [EMPTY, { ...EMPTY, hundreds: 1 }, { ...EMPTY, hundreds: 1, tens: 6 }, { ...EMPTY, thousands: 3, hundreds: 4 }]) {
        const card = SocraticEngine.getSynchronousTaskHint(t, counts);
        expect(JSON.stringify(card), t.id).not.toMatch(/34 (מאות|עשרות)|ערך המיקום|ייצוג הסטנדרטי/);
      }
    }
  });
});

describe('reading block counts in a card (the AI guards use it)', () => {
  it('one group per run of blocks, whatever joins them', () => {
    expect(countGroupsIn('נשתמש ב-4 מאות, 10 עשרות ו-6 יחידות')).toEqual([{ hundreds: 4, tens: 10, units: 6 }]);
    expect(countGroupsIn('נשתמש ב-3 אלפים ו-4 מאות')).toEqual([{ thousands: 3, hundreds: 4 }]);
    expect(countGroupsIn('מאה אחת ועשרת אחת')).toEqual([{ hundreds: 1, tens: 1 }]);
    expect(countGroupsIn('נשתמש ב-3,400 יחידות')).toEqual([{ units: 3400 }]);
    expect(countGroupsIn('בטור היחידות יש 3 יחידות, וצריך לחסר 8 יחידות')).toEqual([{ units: 3 }, { units: 8 }]);
  });
});

describe('the AI guard reads only an option that is a choice of blocks (second review, 28.9.2026)', () => {
  const opts = (right: string, wrong: string) => [{ textHe: right, isCorrect: true }, { textHe: wrong, isCorrect: false }];
  it('rejects a card that marks the instruction\'s blocks wrong, or other blocks right', () => {
    expect(contradictsRequiredRepresentation(byId('s3_g_t1'), opts('נשתמש ב-34 מאות', 'נשתמש ב-3 אלפים ו-4 מאות'))).toBe(true);
    expect(contradictsRequiredRepresentation(byId('s3_g_t1'), opts('נבנה את המספר ב-3,400 יחידות', 'ננחש'))).toBe(true);
    expect(contradictsRequiredRepresentation(byId('s3_g_t1'), opts('נשתמש ב-3 אלפים ו-4 מאות', 'נשתמש ב-34 מאות'))).toBe(false);
    // The cards, and the model since 28.9.2026, write the options in the impersonal present.
    expect(contradictsRequiredRepresentation(byId('s3_g_t1'), opts('משתמשים ב-34 מאות', 'משתמשים ב-3 אלפים ו-4 מאות'))).toBe(true);
    expect(contradictsRequiredRepresentation(byId('s3_g_t1'), opts('משתמשים ב-3 אלפים ו-4 מאות', 'משתמשים ב-34 מאות'))).toBe(false);
  });
  it('keeps a card whose options are steps or actions, not a choice of blocks', () => {
    const t347 = { id: 's1_target_347', type: 'representation', numberA: 347, requiredCounts: { hundreds: 3, tens: 3, units: 17 } };
    expect(contradictsRequiredRepresentation(t347, opts('מקבלים עשר יחידות שנוספות לטור היחידות', 'בית המספרים נשאר בלי שינוי'))).toBe(false);
    expect(contradictsRequiredRepresentation(byId('s3_r_t2'), opts('נפרוט מאה אחת ל-10 עשרות', 'נמחק לבנים'))).toBe(false);
    expect(contradictsRequiredRepresentation(byId('s3_r_t1'), opts('נשים 3 מאות בטור המאות ו-4 עשרות בטור העשרות', 'נכתוב 3 מאות ו-4 עשרות בלי לבנות אותן'))).toBe(false);
    expect(contradictsRequiredRepresentation(byId('s3_g_t6'), opts('נפרוט לבנת אלף אחת ל-10 מאות', 'ננחש'))).toBe(false);
  });
  it('the blocks-leak check is for the number a task asks for, not a sum on the board', () => {
    expect(revealsSecretInCounts(['יש מאה אחת ועוד 6 עשרות'], [60])).toBe(60);
    expect(revealsSecretInCounts(['יש 3 מאות ו-4 עשרות'], [60])).toBeNull();
  });
});

describe('s3_r_t7 ("160 is 100 and how much more?") is not a subtraction', () => {
  const t = byId('s3_r_t7');
  const states = {
    empty: EMPTY, zeroTens: { ...EMPTY, hundreds: 1 }, built: { ...EMPTY, hundreds: 1, tens: 6 },
    // Crowded boards that are still 160, or on the way (independent review, 28.9.2026).
    sixteenTens: { ...EMPTY, tens: 16 }, tenUnits: { ...EMPTY, hundreds: 1, tens: 5, units: 10 }, twelveHundreds: { ...EMPTY, hundreds: 12 },
  };

  it('is not inferred as a subtraction', () => {
    expect(inferIsSubtraction(t, t.targetNode)).toBe(false);
  });

  for (const [name, counts] of Object.entries(states)) {
    it(`board ${name}: the missing-element card, no subtraction card, no "34" card`, () => {
      expect(SocraticEngine.analyzeLiveBoardState(t, t.targetNode ?? '', counts)).toBeNull();
      const card = SocraticEngine.getSynchronousTaskHint(t, counts);
      expect(card.questionHe).toBe('נסו לחשוב: איך מגלים מה יש במספר 160 חוץ ממאה אחת?');
      expect(card.error_category).toBe('conceptual');
      expect(JSON.stringify(card)).not.toMatch(/חיסור|מחסר|להחסיר|פורטים|פח|ריק|34|(^|[^0-9])60(?![0-9])/);
    });
  }
});

describe('the AI request carries no addition/subtraction exercise_context for representation, flexible or missing-element tasks', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  const sent = async (task: SessionTask, counts: typeof EMPTY, withOperands: boolean) => {
    const spy = vi.spyOn(SocraticEngine, 'callGeminiProxy').mockResolvedValue({ data: null });
    await SocraticEngine.fetchGroundedGeminiSocraticQuery({
      currentTask: task,
      targetNode: task.targetNode ?? 'general',
      activeColumnName: 'יחידות',
      counts,
      qMatrixAnchor: SocraticEngine.getSynchronousTaskHint(task, counts),
      // The store sends the task's two numbers as operands when it has both.
      monitoring: withOperands && typeof task.numberB === 'number'
        ? { sessionNumber: 3, operands: { a: task.numberA as number, b: task.numberB as number, isSubtraction: false } }
        : { sessionNumber: 3 },
    });
    return spy.mock.calls[0][0].socratic_request!;
  };

  it('s3_r_t7 at three board states', async () => {
    const t = byId('s3_r_t7');
    for (const counts of [EMPTY, { ...EMPTY, hundreds: 1 }, { ...EMPTY, hundreds: 1, tens: 6 }]) {
      const req = await sent(t, counts, true);
      expect(req.exercise_context).toBeUndefined();
      expect(req.student_progress_state?.completed_columns).toEqual([]);
    }
  });

  it('every representation and flexible task of meeting 3', async () => {
    for (const t of tasks.filter((x) => x.type !== 'missing_element')) {
      expect((await sent(t, EMPTY, true)).exercise_context, t.id).toBeUndefined();
    }
  });
});
