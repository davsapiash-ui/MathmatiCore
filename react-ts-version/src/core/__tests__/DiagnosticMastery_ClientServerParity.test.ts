import { describe, it, expect } from 'vitest';
import { computeCognitiveMastery, Q_MATRIX_MAPPING } from '@/core/QMatrix';
import {
  computeCognitiveMastery as serverComputeCognitiveMastery,
  Q_MATRIX_MAPPING as SERVER_Q_MATRIX_MAPPING,
} from '../../../../functions/src/diagnosticMastery';

/**
 * The mastery profile (conceptMastery) is built in two places: in the learner's
 * browser at the seventh answer of meeting 2, and on the server for a learner
 * whom the teacher's close completed (functions/src/meeting2Close.ts). The
 * "מיפוי מיומנויות כיתתי" tab groups both kinds of learner together, so the two
 * must give the same profile for the same diagnostic results.
 */

const TASKS = [
  'task1_read_write_zero',
  'task2_digit_value',
  'task3_subtraction_regrouping',
  'task4_decompose_number',
  'task5_units_to_tens',
  'task6_vertical_addition',
  'task7_subtraction_zero_tens',
];
// Every value a diagnostic task can hold: the client's tags and error nodes,
// the close's 'not_answered', and the empty ones.
const VALUES: (string | null)[] = ['success', 'correct', 'fail', 'not_answered', 'digit_value_procedural_error', '', null];

describe('conceptMastery: the client and the server agree', () => {
  it('the same task-to-concept table', () => {
    expect(SERVER_Q_MATRIX_MAPPING).toEqual(Q_MATRIX_MAPPING);
  });

  it('the same profile for every value of every task, alone and all together', () => {
    for (const task of TASKS) {
      for (const v of VALUES) {
        const input = { [task]: v };
        expect(serverComputeCognitiveMastery(input), `${task}=${v}`).toEqual(computeCognitiveMastery(input));
      }
    }
    for (const v of VALUES) {
      const all = Object.fromEntries(TASKS.map((t) => [t, v]));
      expect(serverComputeCognitiveMastery(all), `all=${v}`).toEqual(computeCognitiveMastery(all));
    }
    expect(serverComputeCognitiveMastery({})).toEqual(computeCognitiveMastery({}));
  });

  it('the same profile for many mixed diagnostics, legacy keys and unknown keys included', () => {
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const keys = [...Object.keys(Q_MATRIX_MAPPING), 'not_a_task'];
    for (let i = 0; i < 3000; i++) {
      const input: Record<string, string | null> = {};
      for (const k of keys) if (rand(3) > 0) input[k] = VALUES[rand(VALUES.length)];
      expect(serverComputeCognitiveMastery(input)).toEqual(computeCognitiveMastery(input));
    }
  });
});
