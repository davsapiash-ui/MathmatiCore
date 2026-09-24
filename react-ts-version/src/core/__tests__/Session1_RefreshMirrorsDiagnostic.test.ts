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
