/**
 * PRD Module 15 §ג — מסך ההדגמה של המורה (owner, 9.10.2026). The
 * demonstration exercises (data/teacherDemos.ts):
 *   1. their arithmetic is right, conversion by conversion;
 *   2. none of them is an exercise the learners get (the PRD: "ומספריהם שונים
 *      מכל תרגיל שהלומדים מקבלים") — not in the compulsory banks, the
 *      branches, station 1 or the diagnostic.
 */
import { describe, it, expect } from 'vitest';
import { TEACHER_DEMOS, DEMO_S7_B_STEPS, type DemoVerticalBody, type DemoBuildBody } from '@/data/teacherDemos';
import { SESSION1_TASKS, SESSIONS_BY_PATH, type SessionTask } from '@/data/sessionTasks';
import { SESSION_BRANCH_TASKS } from '@/data/sessionBranchTasks';
import { TASKS as QMATRIX_TASKS } from '@/core/QMatrix';
import { PLACE_ORDER, type Place, type PlaceCounts } from '@/core/placeValue';

const VALUE: Record<Place, number> = { units: 1, tens: 10, hundreds: 100, thousands: 1000 };
const valueOf = (c: Partial<PlaceCounts>) => PLACE_ORDER.reduce((sum, p) => sum + (c[p] ?? 0) * VALUE[p], 0);
const digit = (n: number, p: Place) => Math.floor(n / VALUE[p]) % 10;

const vertical = (station: 4 | 5 | 6 | 7, i = 0) => TEACHER_DEMOS[station][i].body as DemoVerticalBody;
const build = (station: 3 | 7, i: number) => TEACHER_DEMOS[station][i].body as DemoBuildBody;

/** Columns that carry (addition) or borrow (subtraction), units first. */
function conversionColumns(a: number, b: number, isSubtraction: boolean): Place[] {
  const cols: Place[] = [];
  let carry = 0;
  for (const p of PLACE_ORDER) {
    if (isSubtraction) {
      const top = digit(a, p) - carry;
      carry = top < digit(b, p) ? 1 : 0;
    } else {
      carry = digit(a, p) + digit(b, p) + carry >= 10 ? 1 : 0;
    }
    if (carry) cols.push(p);
  }
  return cols;
}

describe('demonstration arithmetic', () => {
  it('station 3 ×א: 350 built, a hundred broken into ten tens — 2 hundreds and 15 tens, still 350', () => {
    const built = { hundreds: 3, tens: 5 };
    expect(valueOf(built)).toBe(350);
    const after = build(3, 0).finalCounts;
    expect(after).toEqual({ hundreds: built.hundreds - 1, tens: built.tens + 10 });
    expect(valueOf(after)).toBe(350);
    expect(build(3, 0).answer).toBe(350);
  });

  it('station 3 ×ב: "ארבע מאות ושבע" is 407 (4 hundreds, no tens, 7 units)', () => {
    const b = build(3, 1);
    expect(b.answer).toBe(407);
    expect(valueOf(b.finalCounts)).toBe(407);
    expect(TEACHER_DEMOS[3][1].instructionHe).toContain('ארבע מאות ושבע');
  });

  it('station 4: 238 + 146 = 384, one grouping, in the units; the tens circle gets 1', () => {
    const v = vertical(4);
    expect([v.a, v.b, v.isSubtraction]).toEqual([238, 146, false]);
    expect(v.a + v.b).toBe(384);
    expect(v.answer).toBe(384);
    expect(conversionColumns(v.a, v.b, false)).toEqual(['units']);
    expect(v.memoryCircles).toEqual({ tens: '1' });
  });

  it('station 5: 74 − 38 = 36, one break, in the units', () => {
    const v = vertical(5);
    expect(v.a - v.b).toBe(36);
    expect(v.answer).toBe(36);
    expect(conversionColumns(v.a, v.b, true)).toEqual(['units']);
    expect(v.memoryCircles).toEqual({ tens: '6', units: '14' });
  });

  it('station 6: 700 − 234 = 466, a double break through the zero in the tens (6 / 9 / 10)', () => {
    const v = vertical(6);
    expect(v.a - v.b).toBe(466);
    expect(v.answer).toBe(466);
    expect(digit(v.a, 'tens')).toBe(0);
    expect(conversionColumns(v.a, v.b, true)).toEqual(['units', 'tens']);
    expect(v.memoryCircles).toEqual({ hundreds: '6', tens: '9', units: '10' });
    // The circles hold the same number as the first number: 600 + 90 + 10.
    expect(6 * 100 + 9 * 10 + 10).toBe(700);
  });

  it('station 7 ×א: 2▢3 + 134 = 35▢ has one solution, 223 + 134 = 357', () => {
    const v = vertical(7, 0);
    expect(v.a + v.b).toBe(357);
    expect(v.answer).toBe(357);
    expect(v.hiddenA).toEqual(['tens']);
    expect(v.revealedResult).toEqual(['hundreds', 'tens']);
    const solutions: [number, number][] = [];
    for (let x = 0; x <= 9; x++) {
      for (let y = 0; y <= 9; y++) {
        if (200 + 10 * x + 3 + 134 === 350 + y) solutions.push([x, y]);
      }
    }
    expect(solutions).toEqual([[2, 7]]);
    expect(TEACHER_DEMOS[7][0].instructionHe).toContain('2▢3 + 134 = 35▢');
  });

  it('station 7 ×ב: 260, one hundred more (360), a hundred broken (16 tens), 8 tens away — 280', () => {
    const { start, add, takeAway } = DEMO_S7_B_STEPS;
    const plus = start + add;
    expect(plus).toBe(360);
    // 360 has 6 tens: too few to take 8, so a hundred is broken first.
    expect(digit(plus, 'tens')).toBeLessThan(takeAway / 10);
    const broken = { hundreds: 2, tens: 16 };
    expect(valueOf(broken)).toBe(360);
    const end = { hundreds: broken.hundreds, tens: broken.tens - takeAway / 10 };
    expect(valueOf(end)).toBe(280);
    expect(build(7, 1).finalCounts).toEqual(end);
    expect(build(7, 1).answer).toBe(280);
  });

  it('every demonstration is in the range of מסלול צמצום פערי קדם (≤ 1,000)', () => {
    for (const parts of Object.values(TEACHER_DEMOS)) {
      for (const { body } of parts) {
        const nums = body.kind === 'vertical' ? [body.a, body.b, body.answer] : [body.answer];
        for (const n of nums) expect(n).toBeLessThanOrEqual(1000);
      }
    }
  });
});

describe('no demonstration is a learner exercise', () => {
  const learnerTasks: SessionTask[] = [
    ...SESSION1_TASKS,
    ...Object.values(SESSIONS_BY_PATH).flatMap((byPath) => Object.values(byPath).flat()),
    ...Object.values(SESSION_BRANCH_TASKS).flatMap((byPath) =>
      Object.values(byPath).flatMap((bank) => [...bank.reinforcement, ...bank.challenge])
    ),
  ];

  /** Every operand and target a learner meets: the numbers, the answers, the boards to build. */
  const learnerNumbers = new Set<number>();
  for (const t of learnerTasks) {
    // A "decompose" exercise's answer is a count of blocks, not a number of
    // the exercise (3,600 from hundreds only: 36 blocks); the number built
    // (numberA) is what it shares with the others.
    const answer = t.representationKind === 'decompose' ? undefined : t.correctAnswer;
    for (const n of [t.numberA, t.numberB, t.asdNumberA, t.asdNumberB, answer]) {
      if (typeof n === 'number') learnerNumbers.add(n);
    }
    if (t.requiredCounts && t.representationKind !== 'decompose') learnerNumbers.add(valueOf(t.requiredCounts));
    if (t.initialCounts) learnerNumbers.add(valueOf(t.initialCounts));
  }
  for (const q of QMATRIX_TASKS) {
    for (const n of [q.number, q.asdNumber, q.numberA, q.numberB, q.asdNumberA, q.asdNumberB, q.correctAnswer, q.asdCorrectAnswer]) {
      if (typeof n === 'number') learnerNumbers.add(n);
    }
  }
  const learnerText = [...learnerTasks.map((t) => t.instructionHe), ...QMATRIX_TASKS.map((q) => `${q.instructionHe ?? ''} ${q.givenHe ?? ''}`)]
    .join(' ')
    .replace(/(\d),(\d)/g, '$1$2');

  const demoNumbers: number[] = [];
  for (const parts of Object.values(TEACHER_DEMOS)) {
    for (const { body } of parts) {
      if (body.kind === 'vertical') demoNumbers.push(body.a, body.b, body.answer);
      else demoNumbers.push(body.answer);
    }
  }
  demoNumbers.push(DEMO_S7_B_STEPS.start, DEMO_S7_B_STEPS.start + DEMO_S7_B_STEPS.add);

  it('the banks were read (sanity)', () => {
    expect(learnerTasks.length).toBeGreaterThan(100);
    expect(learnerNumbers.has(247)).toBe(true);
  });

  it.each(demoNumbers.map((n) => [n]))('%i is no operand, answer or board of a learner exercise', (n) => {
    expect(learnerNumbers.has(n)).toBe(false);
    expect(new RegExp(`(^|[^\\d▢])${n}([^\\d▢]|$)`).test(learnerText)).toBe(false);
  });

  it('no learner exercise is the same pair of numbers as a demonstration', () => {
    for (const parts of Object.values(TEACHER_DEMOS)) {
      for (const { body } of parts) {
        if (body.kind !== 'vertical') continue;
        const same = learnerTasks.filter((t) => t.numberA === body.a && t.numberB === body.b);
        expect(same.map((t) => t.id)).toEqual([]);
      }
    }
  });
});
