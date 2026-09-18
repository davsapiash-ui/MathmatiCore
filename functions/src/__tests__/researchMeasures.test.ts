import { describe, it, expect } from 'vitest';
import {
  computeFlexibilityIndex,
  computeMediationEffectiveness,
  flexibilityHe,
  mediationHe,
  sessionIdsOfSameLearner,
} from '../meetingMetrics';
import { aggregateClass, buildLearnerRow, buildClassCsv } from '../classReport';

/**
 * מדדי המחקר 3 ו-4 (PRD 7.3, מודול 23 §ב "מדדי המחקר").
 * מדד 3, גמישות ייצוגית: R ÷ T × 100 על תרגילי החובה שה-operation שלהם
 * representation, במפגשים 3 ו-7. מדד 4, אפקטיביות התיווך: S ÷ C × 100,
 * לפי התשובה הבאה של הלומד באותו תרגיל אחרי כל כרטיס חניכה.
 */
const ev = (session: number, exercise: string, type: string, details: Record<string, unknown> = {}, t = 0) => ({
  session_id: `session_${session}_student_user1`,
  student_id: 'student_user1',
  exercise_id: exercise,
  event_type: type,
  details,
  client_timestamp: 1_000_000 + t,
});
const complete = (session: number, exercise: string, errorCount: number, t: number) =>
  ev(session, exercise, 'PROBLEM_COMPLETE', { total_duration_ms: 20_000, undo_count: 0, error_count: errorCount }, t);

describe('measure 3 — Flexibility Index', () => {
  it('counts completed compulsory representation exercises, and first try means error_count === 0', () => {
    const f = computeFlexibilityIndex([
      complete(3, 's3_r_t1', 0, 1),
      complete(3, 's3_r_t2', 2, 2),
      complete(3, 's3_r_t3', 0, 3),
      ev(3, 's3_r_t4', 'PROBLEM_LOAD', {}, 4), // opened, never completed: not in T
    ]);
    expect(f).toEqual({ completed: 3, first_try: 2, percent: 67 });
  });

  it('ignores exercises that are not compulsory representation exercises', () => {
    const f = computeFlexibilityIndex([
      complete(4, 's4_r_t1', 0, 1),            // column addition
      complete(3, 's3_r_reinforce_1', 0, 2),   // optional branch task
      complete(3, 's3_g_t7', 0, 3),
    ]);
    expect(f).toEqual({ completed: 1, first_try: 1, percent: 100 });
  });

  it('T = 0 is not computed: null, never 0% or 100%', () => {
    expect(computeFlexibilityIndex([complete(4, 's4_r_t1', 0, 1)])).toEqual({ completed: 0, first_try: 0, percent: null });
    expect(flexibilityHe(computeFlexibilityIndex([]))).toBe('לא נמדד');
  });

  it('an exercise counts once, by its first completion', () => {
    const f = computeFlexibilityIndex([complete(3, 's3_r_t1', 1, 1), complete(3, 's3_r_t1', 0, 2)]);
    expect(f).toEqual({ completed: 1, first_try: 0, percent: 0 });
  });

  it('cumulative: meetings 3 and 7 together are ΣR ÷ ΣT', () => {
    const f = computeFlexibilityIndex([
      complete(3, 's3_r_t1', 0, 1), complete(3, 's3_r_t2', 1, 2),
      complete(7, 's7_r_t1', 0, 3), complete(7, 's7_r_t6', 0, 4),
    ]);
    expect(f).toEqual({ completed: 4, first_try: 3, percent: 75 });
  });
});

describe('measure 4 — Mediation Effectiveness', () => {
  const card = (session: number, exercise: string, t: number) =>
    ev(session, exercise, 'SOCRATIC_CARD_SHOWN', { trigger_reason: 'repeated_errors', error_category: null }, t);
  const digit = (session: number, exercise: string, isCorrect: boolean | null, t: number) =>
    ev(session, exercise, 'DIGIT_ENTERED', { digit_value: 5, is_correct: isCorrect }, t);

  it('the next digit in the same exercise decides; is_correct null is skipped', () => {
    const m = computeMediationEffectiveness([
      card(4, 's4_r_t1', 1), digit(4, 's4_r_t1', null, 2), digit(4, 's4_r_t1', true, 3),
      card(4, 's4_r_t2', 4), digit(4, 's4_r_t2', false, 5), digit(4, 's4_r_t2', true, 6),
    ]);
    expect(m).toEqual({ cards: 2, effective: 1, percent: 50 });
  });

  it('only the NEXT answer counts, not a later success in the same exercise', () => {
    const m = computeMediationEffectiveness([
      card(4, 's4_r_t1', 1), digit(4, 's4_r_t1', false, 2), digit(4, 's4_r_t1', true, 3), complete(4, 's4_r_t1', 1, 4),
    ]);
    expect(m).toEqual({ cards: 1, effective: 0, percent: 0 });
  });

  it('an answer in another exercise does not settle the card', () => {
    const m = computeMediationEffectiveness([card(4, 's4_r_t1', 1), digit(4, 's4_r_t2', true, 2)]);
    expect(m).toEqual({ cards: 1, effective: 0, percent: 0 });
  });

  it('with no digits typed, completion before another card is a success; another card first is not', () => {
    const m = computeMediationEffectiveness([
      card(3, 's3_r_t1', 1), complete(3, 's3_r_t1', 1, 2),
      card(3, 's3_r_t2', 3), card(3, 's3_r_t2', 4), complete(3, 's3_r_t2', 2, 5),
    ]);
    expect(m).toEqual({ cards: 3, effective: 2, percent: 67 });
  });

  it('C = 0 is not a percentage: null, shown as "לא נדרש תיווך"', () => {
    const m = computeMediationEffectiveness([digit(4, 's4_r_t1', true, 1), complete(4, 's4_r_t1', 0, 2)]);
    expect(m).toEqual({ cards: 0, effective: 0, percent: null });
    expect(mediationHe(m)).toBe('לא נדרש תיווך (0 כרטיסים)');
    // C is always shown next to the percentage.
    expect(mediationHe({ cards: 4, effective: 3, percent: 75 })).toBe('3 מתוך 4 כרטיסים (75%)');
  });
});

describe('the class report carries both measures', () => {
  const rowOf = (studentId: number, session: number, events: Record<string, any>[], all: Record<string, any>[] = events) =>
    buildLearnerRow(studentId, events, 7, 'remediation_path', null, null, 0, null, { sessionNumber: session, allEvents: all });

  it('flexibility only in meetings 3 and 7; mediation never in meeting 2', () => {
    expect(rowOf(1, 3, [complete(3, 's3_r_t1', 0, 1)]).flexibility).toEqual({ completed: 1, first_try: 1, percent: 100 });
    expect(rowOf(1, 4, [complete(4, 's4_r_t1', 0, 1)]).flexibility).toBeNull();
    expect(rowOf(1, 2, [complete(2, 'task1_read_write_zero', 0, 1)]).mediation).toBeNull();
    expect(rowOf(1, 4, [complete(4, 's4_r_t1', 0, 1)]).mediation).toEqual({ cards: 0, effective: 0, percent: null });
  });

  it('cumulative values come from all of the learner\'s meetings', () => {
    const s3 = [complete(3, 's3_r_t1', 0, 1)];
    const s7 = [complete(7, 's7_r_t1', 1, 2)];
    const row = rowOf(1, 7, s7, [...s3, ...s7]);
    expect(row.flexibility).toEqual({ completed: 1, first_try: 0, percent: 0 });
    expect(row.flexibility_cumulative).toEqual({ completed: 2, first_try: 1, percent: 50 });
  });

  it('the class aggregate names the learners who needed no mediation', () => {
    const withCard = [ev(4, 's4_r_t1', 'SOCRATIC_CARD_SHOWN', {}, 1), complete(4, 's4_r_t1', 1, 2)];
    const rows = [rowOf(1, 4, withCard), rowOf(2, 4, [complete(4, 's4_r_t1', 0, 1)]), rowOf(5, 4, [complete(4, 's4_r_t2', 0, 1)])];
    const events = new Map<number, Record<string, any>[]>();
    expect(aggregateClass(rows, events).learners_without_mediation).toEqual([2, 5]);
    // Meeting 2: the card is disabled, so there is no such count at all.
    expect(aggregateClass([rowOf(1, 2, [complete(2, 'task1_read_write_zero', 0, 1)])], events).learners_without_mediation).toBeNull();
  });

  it('the CSV has a column for every value, including C', () => {
    const rows = [rowOf(1, 3, [complete(3, 's3_r_t1', 0, 1)])];
    const header = buildClassCsv(rows, []).split('\n')[0];
    for (const col of [
      'flexibility_completed', 'flexibility_first_try', 'flexibility_percent', 'flexibility_cumulative_percent',
      'mediation_cards', 'mediation_effective', 'mediation_percent', 'mediation_cumulative_cards', 'mediation_cumulative_percent',
    ]) {
      expect(header).toContain(`"${col}"`);
    }
  });
});

describe('sessionIdsOfSameLearner', () => {
  it('keeps the spelling of the id it was given', () => {
    expect(sessionIdsOfSameLearner('session_3_student_user4')).toContain('session_7_student_user4');
    expect(sessionIdsOfSameLearner('session_03_student_4')).toContain('session_07_student_4');
    expect(sessionIdsOfSameLearner('session_3_student_user4')).toHaveLength(8);
    expect(sessionIdsOfSameLearner('something_else')).toEqual([]);
  });
});
