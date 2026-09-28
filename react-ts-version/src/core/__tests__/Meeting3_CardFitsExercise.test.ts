import { describe, it, expect, vi, afterEach } from 'vitest';
import { SocraticEngine, inferIsSubtraction } from '@/infrastructure/services/SocraticEngine';
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

/** "נשתמש ב-4 אלפים, 11 מאות ו-13 עשרות" → { thousands: 4, hundreds: 11, tens: 13 }. */
function parseCounts(text: string): Partial<Record<keyof typeof PLACES, number>> | null {
  const m = /^נשתמש ב-?(.*)$/.exec(text);
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
      expect(card.questionHe, t.id).toBe(`בואו נחשוב רגע יחד: באילו לבנים ההנחיה מבקשת לבנות את המספר ${N}?`);
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
      ['נשתמש ב-3 אלפים ו-4 מאות', true],
      ['נשתמש ב-4 אלפים ו-3 מאות', false],
      ['נשתמש ב-3,400 יחידות', false],
    ]);
    expect(SocraticEngine.getSynchronousTaskHint(byId('s3_r_t1'), EMPTY).choices.map((c) => [c.textHe, c.isCorrect])).toEqual([
      ['נשתמש ב-3 מאות ו-4 עשרות', true],
      ['נשתמש ב-4 מאות ו-3 עשרות', false],
      ['נשתמש ב-340 יחידות', false],
    ]);
  });

  it('the fixed hints: the usual way in a non-standard task, and the units option', () => {
    const t2 = SocraticEngine.getSynchronousTaskHint(byId('s3_g_t2'), EMPTY);
    expect(t2.choices[1]).toMatchObject({ textHe: 'נשתמש ב-3 אלפים ו-4 מאות', feedbackHe: 'רמז: גם זה 3,400, בדרך הרגילה. ההנחיה מבקשת דרך אחרת. קראו אותה שוב.' });
    expect(t2.choices[2]).toMatchObject({ textHe: 'נשתמש ב-3,400 יחידות', feedbackHe: 'רמז: גם זה 3,400, אבל ההנחיה מבקשת לבנות אותו בטורים אחרים.' });
  });

  it('a standard task whose instruction names an empty column: the digit moves into it (★ chosen)', () => {
    expect(SocraticEngine.getSynchronousTaskHint(byId('s3_r_t5'), EMPTY).choices[1]).toMatchObject({
      textHe: 'נשתמש ב-5 מאות ו-6 עשרות', isCorrect: false, feedbackHe: 'רמז: במספר 506 הספרה 6 היא ספרת היחידות, וטור העשרות נשאר ריק.',
    });
    expect(SocraticEngine.getSynchronousTaskHint(byId('s3_g_t5'), EMPTY).choices[1]).toMatchObject({
      textHe: 'נשתמש ב-6 אלפים ו-3 מאות', isCorrect: false, feedbackHe: 'רמז: במספר 6,030 הספרה 3 היא ספרת העשרות, וטור המאות נשאר ריק.',
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

describe('s3_r_t7 ("160 is 100 and how much more?") is not a subtraction', () => {
  const t = byId('s3_r_t7');
  const states = { empty: EMPTY, zeroTens: { ...EMPTY, hundreds: 1 }, built: { ...EMPTY, hundreds: 1, tens: 6 } };

  it('is not inferred as a subtraction', () => {
    expect(inferIsSubtraction(t, t.targetNode)).toBe(false);
  });

  for (const [name, counts] of Object.entries(states)) {
    it(`board ${name}: the missing-element card, no subtraction card, no "34" card`, () => {
      expect(SocraticEngine.analyzeLiveBoardState(t, t.targetNode ?? '', counts)).toBeNull();
      const card = SocraticEngine.getSynchronousTaskHint(t, counts);
      expect(card.questionHe).toBe('בואו נחשוב רגע יחד: איך נגלה מה יש במספר 160 חוץ ממאה אחת?');
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
