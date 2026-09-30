import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { SESSION1_TASKS, getHardcodedCatalogBanks } from '@/data/sessionTasks';
import { TASKS as DIAGNOSTIC_TASKS } from '@/core/QMatrix';

/**
 * Meeting 1 refreshes what meeting 2 diagnoses, so that a wrong answer in the
 * diagnostic is a real gap the matrix can trace back — not rust, and not the
 * interface (owner, 24.9.2026). The refresh mirrors a diagnostic task's
 * structure with other numbers: the child meets the skill, never the exercise.
 *
 * s1_t8 mirrors diagnostic task 6 (124 + 85 = 209): three digits plus two, no
 * carry in the units, the tens sum to exactly 10, and the answer carries a 0
 * in the tens. The previous 385 + 152 shared only the column of the carry —
 * its tens made 13, so the 0 in the answer (the 219-for-209 error) was never
 * refreshed.
 */

const SRC = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');

const digits = (n: number) => String(n).length;
const unitsOf = (n: number) => n % 10;
const tensOf = (n: number) => Math.floor(n / 10) % 10;

function additionShape(a: number, b: number) {
  const unitsSum = unitsOf(a) + unitsOf(b);
  const unitsCarry = unitsSum >= 10 ? 1 : 0;
  const tensSum = tensOf(a) + tensOf(b) + unitsCarry;
  return {
    digits: [digits(a), digits(b)],
    unitsCarry,
    tensSum,
    answerTensDigit: tensOf(a + b),
  };
}

const refresh = SESSION1_TASKS.find((t) => t.id === 's1_t8')!;
const diagnostic = DIAGNOSTIC_TASKS.find((t) => t.id === 'task6_vertical_addition')!;

describe('Meeting 1 refresh s1_t8 mirrors diagnostic task 6', () => {
  it('computes: 713 + 94 = 807', () => {
    expect(refresh.numberA).toBe(713);
    expect(refresh.numberB).toBe(94);
    expect(refresh.correctAnswer).toBe(807);
    expect(refresh.numberA! + refresh.numberB!).toBe(refresh.correctAnswer);
  });

  it('has the same column structure as the diagnostic exercise', () => {
    const r = additionShape(refresh.numberA!, refresh.numberB!);
    const d = additionShape(diagnostic.numberA!, diagnostic.numberB!);
    expect(r).toEqual(d);
    // spelled out, so a change to either side fails loudly
    expect(r.digits).toEqual([3, 2]);
    expect(r.unitsCarry).toBe(0);
    expect(r.tensSum).toBe(10);
    expect(r.answerTensDigit).toBe(0);
  });

  it('carries the diagnostic skill name as its title', () => {
    expect(refresh.titleHe).toBe(diagnostic.titleHe);
  });

  it('shares no number with any diagnostic task, answer or backward probe', () => {
    const seen = new Set<number>();
    for (const t of DIAGNOSTIC_TASKS) {
      for (const v of [t.number, t.numberA, t.numberB, t.correctAnswer]) if (typeof v === 'number') seen.add(v);
      const bd = t.backwardDiagnosis;
      for (const v of [bd?.probeA, bd?.probeB, bd?.probeAnswer]) if (typeof v === 'number') seen.add(v);
    }
    for (const v of [refresh.numberA!, refresh.numberB!, refresh.correctAnswer as number]) {
      expect(seen.has(v), `${v} appears in meeting 2`).toBe(false);
    }
  });

  it('names its own numbers on screen', () => {
    expect(refresh.instructionHe).toContain('713');
    expect(refresh.instructionHe).toContain('94');
  });

  it('keeps its static Socratic card on the same exercise', () => {
    const src = SRC('infrastructure/services/SocraticEngine.ts');
    const start = src.indexOf("'s1_t8': {");
    const block = src.slice(start, src.indexOf('correctChoiceId', start));
    expect(block).toContain('713 + 94');
    expect(block).not.toMatch(/385|152|537|13 עשרות/);
  });

  it('ships in the session 1 catalog bank the administrator publishes', () => {
    const bank = getHardcodedCatalogBanks().find((b) => b.id === 'session_1')!;
    const t = bank.tasks.find((x) => x.id === 's1_t8')!;
    expect([t.numberA, t.numberB, t.correctAnswer]).toEqual([713, 94, 807]);
  });
});

/**
 * Two more refresh exercises (owner, 29.9.2026), for the two diagnostic tasks
 * meeting 1 did not refresh yet. Column by column, as for s1_t8 above.
 */
const digitAt = (n: number, i: number) => Math.floor(n / 10 ** i) % 10;
const placesOf = (n: number) => Array.from({ length: digits(n) }, (_, i) => digitAt(n, i));
/** The place (0 = units) whose digit, at its value, is `value` — or -1. */
const placeOfValue = (n: number, value: number) => placesOf(n).findIndex((d, i) => d !== 0 && d * 10 ** i === value);

describe('Meeting 1 refresh s1_r_value368 mirrors diagnostic task 2 (742, the 4 → 40)', () => {
  const r = SESSION1_TASKS.find((t) => t.id === 's1_r_value368')!;
  const d = DIAGNOSTIC_TASKS.find((t) => t.id === 'task2_digit_value')!;

  it('computes: in 368 the 6 is worth 60', () => {
    expect(r.numberA).toBe(368);
    expect(r.correctAnswer).toBe(60);
    expect(tensOf(368) * 10).toBe(60);
    expect(d.number).toBe(742);
    expect(d.correctAnswer).toBe(40);
  });

  it('has the same column structure: three digits, no zero, the digit asked about in the tens', () => {
    const shape = (n: number, answer: number) => ({
      digits: digits(n),
      zeros: placesOf(n).filter((x) => x === 0).length,
      askedPlace: placeOfValue(n, answer),
      // the digit asked about appears once, so "the 6" names one column
      askedDigitCount: placesOf(n).filter((x) => x === answer / 10 ** placeOfValue(n, answer)).length,
    });
    const rs = shape(r.numberA!, r.correctAnswer as number);
    const ds = shape(d.number!, d.correctAnswer as number);
    expect(rs).toEqual(ds);
    // spelled out, so a change to either side fails loudly
    expect(rs).toEqual({ digits: 3, zeros: 0, askedPlace: 1, askedDigitCount: 1 });
    // the diagnostic marks the same place: the middle digit of three
    expect(d.highlightIndex).toBe(1);
    expect(d.highlightedDigit).toBe(String(digitAt(d.number!, 1)));
  });

  it('the child builds the number, and the answer is the digit\'s value — not the number', () => {
    expect(r.requiredCounts).toEqual({ hundreds: 3, tens: 6, units: 8 });
    expect(r.correctAnswer).not.toBe(r.numberA);
    expect(r.hideRequiredCounts).toBe(true);
    expect(r.instructionHe).toContain('368');
    expect(r.instructionHe).toContain('הספרה 6');
    expect(r.instructionHe).not.toMatch(/60|עשרות/);
  });
});

/**
 * The refresh exercise for diagnostic task 1 (owner, 29.9.2026, added after
 * 368 and 482): a three-digit number said in words, with a 0 in the tens and
 * no other zero, written in digits. Column by column against 605.
 */
describe('Meeting 1 refresh s1_r_words703 mirrors diagnostic task 1 ("שש מאות וחמש" → 605)', () => {
  const r = SESSION1_TASKS.find((t) => t.id === 's1_r_words703')!;
  const d = DIAGNOSTIC_TASKS.find((t) => t.id === 'task1_read_write_zero')!;
  const blocks = (n: number) => ({ hundreds: digitAt(n, 2), tens: digitAt(n, 1), units: digitAt(n, 0) });

  it('computes: שבע מאות ושלוש is 703', () => {
    expect(r.numberA).toBe(703);
    expect(r.correctAnswer).toBe(703);
    expect(r.instructionHe).toContain('שבע מאות ושלוש');
    expect(d.givenHe).toBe('שש מאות וחמש');
    expect(d.correctAnswer).toBe(605);
  });

  it('has the same column structure: three digits, a 0 in the tens and no other zero', () => {
    const shape = (n: number) => ({
      digits: digits(n),
      zeroPlaces: placesOf(n).map((x, i) => (x === 0 ? i : -1)).filter((i) => i >= 0),
    });
    expect(shape(r.numberA!)).toEqual(shape(d.correctAnswer as number));
    // spelled out, so a change to either side fails loudly
    expect(shape(r.numberA!)).toEqual({ digits: 3, zeroPlaces: [1] });
    // column by column: hundreds and units hold a digit, the tens is empty
    expect(blocks(r.numberA!)).toEqual({ hundreds: 7, tens: 0, units: 3 });
    expect(blocks(d.correctAnswer as number)).toEqual({ hundreds: 6, tens: 0, units: 5 });
  });

  it('the blocks are the number\'s own digits, and the tens column stays empty, as in task 1', () => {
    const req = { hundreds: 0, tens: 0, units: 0, ...r.requiredCounts };
    expect(req).toEqual(blocks(r.numberA!));
    expect(d.expectedBlocks).toEqual(blocks(d.correctAnswer as number));
  });

  it('words to digits: no digit on the screen, the words name no tens, and the answer is the number itself', () => {
    expect(d.givenHe).not.toMatch(/[0-9]/);
    expect(r.instructionHe).not.toMatch(/[0-9]/);
    // the 0 is the child's to find: neither text says "zero" or names a tens word
    for (const text of [r.instructionHe, d.givenHe!]) expect(text).not.toMatch(/אפס|עשר|עשרים|שלושים|ארבעים|חמישים|שישים|שבעים|שמונים|תשעים/);
    expect(r.hideRequiredCounts).toBe(true);
    expect(r.instructionHe).toContain('בספרות');
  });

  it('shares no number with any diagnostic task, answer or backward probe', () => {
    const seen = new Set<number>();
    for (const t of DIAGNOSTIC_TASKS) {
      for (const v of [t.number, t.numberA, t.numberB, t.correctAnswer]) if (typeof v === 'number') seen.add(v);
      const bd = t.backwardDiagnosis;
      for (const v of [bd?.probeA, bd?.probeB, bd?.probeAnswer]) if (typeof v === 'number') seen.add(v);
    }
    expect(seen.has(r.numberA!), `${r.numberA} appears in meeting 2`).toBe(false);
  });
});

describe('Meeting 1 refresh s1_r_words482 mirrors diagnostic task 4 ("חמש מאות שישים ושלוש" → 563)', () => {
  const r = SESSION1_TASKS.find((t) => t.id === 's1_r_words482')!;
  const d = DIAGNOSTIC_TASKS.find((t) => t.id === 'task4_decompose_number')!;

  it('computes: ארבע מאות שמונים ושתיים is 482', () => {
    expect(r.numberA).toBe(482);
    expect(r.instructionHe).toContain('ארבע מאות שמונים ושתיים');
    expect(d.givenHe).toBe('חמש מאות שישים ושלוש');
    expect(d.correctAnswer).toBe(563);
  });

  it('has the same column structure: three digits, no zero, every place said in words', () => {
    const shape = (n: number) => ({ digits: digits(n), zeros: placesOf(n).filter((x) => x === 0).length });
    expect(shape(r.numberA!)).toEqual(shape(d.correctAnswer as number));
    expect(shape(r.numberA!)).toEqual({ digits: 3, zeros: 0 });
    // the blocks are the number's own digits, place by place, as in task 4
    const blocks = (n: number) => ({ hundreds: digitAt(n, 2), tens: digitAt(n, 1), units: digitAt(n, 0) });
    expect(r.requiredCounts).toEqual(blocks(r.numberA!));
    expect(d.expectedBlocks).toEqual(blocks(d.correctAnswer as number));
  });

  it('words to digits: no digit on the screen, and the answer is the number itself', () => {
    expect(d.givenHe).not.toMatch(/[0-9]/);
    expect(r.instructionHe).not.toMatch(/[0-9]/);
    expect(r.hideRequiredCounts).toBe(true);
    expect(r.correctAnswer ?? r.numberA).toBe(482);
    expect(r.instructionHe).toContain('בספרות');
  });
});
