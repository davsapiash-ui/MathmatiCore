import { describe, it, expect, vi, afterEach } from 'vitest';
import { SocraticEngine, inferIsSubtraction } from '@/infrastructure/services/SocraticEngine';
import { countGroupsIn, contradictsRequiredRepresentation, revealsSecretInCounts } from '@/infrastructure/services/staticSocraticCards';
import { getSessionTasks, type SessionTask } from '@/data/sessionTasks';
import { getSessionBranchTasks } from '@/data/sessionBranchTasks';

/**
 * Owner-approved 28.9.2026 (שהB.1, audit row הB.11): the meeting-3 static card
 * fits each exercise. On "3,400 בדרך הרגילה: 3 אלפים ו-4 מאות" the card used
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

  it('representation tasks: the question names the criterion — which blocks the instruction asks for', () => {
    for (const t of reps) {
      const card = SocraticEngine.getSynchronousTaskHint(t, EMPTY);
      const N = (t.numberA as number).toLocaleString('en-US');
      expect(card.questionHe, t.id).toBe(`נסו לחשוב: באילו לבנים ההנחיה מבקשת לבנות את המספר ${N}?`);
    }
  });

  it('rule (2) for every representation task: correct = requiredCounts; no wrong option = requiredCounts; a wrong option is ≠ N or says it is also N', () => {
    for (const t of reps) {
      const N = t.numberA as number;
      const Nhe = N.toLocaleString('en-US');
      const card = SocraticEngine.getSynchronousTaskHint(t, EMPTY);
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
    expect(SocraticEngine.getSynchronousTaskHint(byId('s3_g_t1'), EMPTY).choices.map((c) => [c.textHe, c.isCorrect])).toEqual([
      ['משתמשים ב-3 אלפים ו-4 מאות', true],
      ['משתמשים ב-4 אלפים ו-3 מאות', false],
      ['משתמשים ב-3,400 יחידות', false],
    ]);
    expect(SocraticEngine.getSynchronousTaskHint(byId('s3_r_t1'), EMPTY).choices.map((c) => [c.textHe, c.isCorrect])).toEqual([
      ['משתמשים ב-3 מאות ו-4 עשרות', true],
      ['משתמשים ב-4 מאות ו-3 עשרות', false],
      ['משתמשים ב-340 יחידות', false],
    ]);
  });

  it('the fixed hints: the usual way in a non-standard task, and the units option', () => {
    const t2 = SocraticEngine.getSynchronousTaskHint(byId('s3_g_t2'), EMPTY);
    expect(t2.choices[1]).toMatchObject({ textHe: 'משתמשים ב-3 אלפים ו-4 מאות', feedbackHe: 'רמז: גם זה 3,400, בדרך הרגילה. ההנחיה מבקשת דרך אחרת. קראו אותה שוב.' });
    expect(t2.choices[2]).toMatchObject({ textHe: 'משתמשים ב-3,400 יחידות', feedbackHe: 'רמז: גם זה 3,400, אבל ההנחיה מבקשת לבנות אותו בטורים אחרים.' });
  });

  it('a standard task whose instruction names an empty column: the digit moves into it (★ chosen)', () => {
    expect(SocraticEngine.getSynchronousTaskHint(byId('s3_r_t5'), EMPTY).choices[1]).toMatchObject({
      textHe: 'משתמשים ב-5 מאות ו-6 עשרות', isCorrect: false, feedbackHe: 'רמז: במספר 506 הספרה 6 היא ספרת היחידות, וטור העשרות נשאר ריק.',
    });
    expect(SocraticEngine.getSynchronousTaskHint(byId('s3_g_t5'), EMPTY).choices[1]).toMatchObject({
      textHe: 'משתמשים ב-6 אלפים ו-3 מאות', isCorrect: false, feedbackHe: 'רמז: במספר 6,030 הספרה 3 היא ספרת העשרות, וטור המאות נשאר ריק.',
    });
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
