import { describe, it, expect } from 'vitest';
import { computeFirstAttemptScore, DIAGNOSTIC_COMPULSORY_COUNT } from '../meetingMetrics';

/**
 * Audit finding X1 — the meeting-2 events as the learner's client now sends
 * them (react-ts-version: useWorkspaceStore, diagnosticDigitTask), scored by
 * the formula the completion trigger and the class report use (PRD 23 §ב).
 *
 * Owner's rulings, 28.9.2026: task 2 is judged by the value in its box at
 * "התקדם" (its keystrokes go out with is_correct: null, and a wrong final value
 * sends no PROBLEM_COMPLETE); in every other task a wrong digit counts even
 * after it is corrected.
 */
const ev = (exercise_id: string, event_type: string, details: Record<string, unknown> = {}) => ({
  exercise_id,
  event_type,
  client_timestamp: 0,
  details,
});
const digit = (id: string, is_correct: boolean | null) => ev(id, 'DIGIT_ENTERED', { is_correct });
const done = (id: string) => ev(id, 'PROBLEM_COMPLETE');

describe('meeting 2: the diagnostic score from the digit events', () => {
  it('a corrected wrong digit in task 6 takes the task out of the first-attempt count', () => {
    const events = [
      digit('task6_vertical_addition', true),
      digit('task6_vertical_addition', false),
      digit('task6_vertical_addition', true),
      digit('task6_vertical_addition', true),
      done('task6_vertical_addition'),
    ];
    expect(computeFirstAttemptScore(events, DIAGNOSTIC_COMPULSORY_COUNT).correctFirstAttempt).toBe(0);
  });

  it('several wrong digits in one task count that task once', () => {
    const events = [
      digit('task1_read_write_zero', false),
      digit('task1_read_write_zero', false),
      done('task1_read_write_zero'),
      digit('task4_decompose_number', true),
      done('task4_decompose_number'),
    ];
    const score = computeFirstAttemptScore(events, DIAGNOSTIC_COMPULSORY_COUNT);
    expect(score.correctFirstAttempt).toBe(1);
    expect(score.scorePercent).toBe(14);
  });

  it('task 2: keystrokes on the way to 40 are not judged; the right final value counts', () => {
    const events = [
      digit('task2_digit_value', null),
      digit('task2_digit_value', null),
      digit('task2_digit_value', null),
      digit('task2_digit_value', null),
      done('task2_digit_value'),
    ];
    expect(computeFirstAttemptScore(events, DIAGNOSTIC_COMPULSORY_COUNT).correctFirstAttempt).toBe(1);
  });

  it('task 2: a wrong final value sends no PROBLEM_COMPLETE and does not count', () => {
    const events = [digit('task2_digit_value', null), digit('task2_digit_value', null)];
    expect(computeFirstAttemptScore(events, DIAGNOSTIC_COMPULSORY_COUNT).correctFirstAttempt).toBe(0);
  });
});
