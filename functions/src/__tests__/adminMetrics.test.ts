import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { buildAdminMetrics, groupTelemetryByMeeting } from '../adminAggregator';

/**
 * PRD Module 24 §ב: the aggregator "מחשבת מדדים מצטברים (אחוזי השלמת מפגשים,
 * סך תרגילים שנפתרו, מדדי שגיאות גלובליים) ושומרת אותם במסמך מטמון
 * store_cache".
 *
 * The cache used to count the `sessions` collection alone. Only meeting 2 has a
 * session document, so the admin console's cards for meetings 3–8 never had
 * data, and neither exercises solved nor any error metric was in the cache.
 */
const ev = (meeting: number, learner: number, exercise: string, type: string, details: Record<string, unknown> = {}, t = 0) => ({
  session_id: `session_${meeting}_student_student_user${learner}`,
  student_id: learner,
  exercise_id: exercise,
  event_type: type,
  details,
  client_timestamp: 1_000_000 + t,
});

const telemetry = [
  // Meeting 3, learner 1: s3_g_t1 first try, s3_g_t2 after one wrong digit. Completed the meeting.
  ev(3, 1, 's3_g_t1', 'DIGIT_ENTERED', { is_correct: true }, 1),
  ev(3, 1, 's3_g_t1', 'PROBLEM_COMPLETE', {}, 2),
  ev(3, 1, 's3_g_t2', 'DIGIT_ENTERED', { is_correct: false }, 3),
  ev(3, 1, 's3_g_t2', 'DIGIT_DELETED', {}, 4),
  ev(3, 1, 's3_g_t2', 'DIGIT_ENTERED', { is_correct: true }, 5),
  ev(3, 1, 's3_g_t2', 'PROBLEM_COMPLETE', {}, 6),
  // Meeting 3, learner 2: opened one exercise, one wrong digit, did not finish the meeting.
  ev(3, 2, 's3_g_t1', 'DIGIT_ENTERED', { is_correct: false }, 1),
  ev(3, 2, 's3_g_t1', 'HESITATION_DETECTED', { hesitation_seconds: 45 }, 2),
  ev(3, 2, 's3_g_t1', 'SOCRATIC_CARD_SHOWN', {}, 3),
];

const build = (overrides: Partial<Parameters<typeof buildAdminMetrics>[0]> = {}) =>
  buildAdminMetrics({
    byMeeting: groupTelemetryByMeeting(telemetry),
    sessionDocs: [],
    highestCompletedByLearner: new Map([[1, 3], [2, 2]]),
    pathByLearner: new Map(),
    compulsory: new Map([['3:green_path', { total: 2, ids: new Set(['s3_g_t1', 's3_g_t2']) }]]),
    ...overrides,
  });

describe('Module 24: store_cache/admin_metrics', () => {
  it('meetings 3–8 get a row from their telemetry and the learners\' completion record', () => {
    const m = build();
    expect(m.session_breakdown['3']).toMatchObject({
      created: 2,
      completed: 1,
      completion_rate_percent: 50,
      // Learner 1 completed: one of two compulsory exercises first try = 50%.
      average_score_percent: 50,
    });
  });

  it('carries exercises solved and the global error metrics', () => {
    const m = build();
    expect(m.session_breakdown['3']).toMatchObject({
      exercises_completed: 2,
      digits_entered: 4,
      wrong_digits: 2,
      digit_error_rate_percent: 50,
      deletions: 1,
      hesitations: 1,
      socratic_cards: 1,
    });
    expect(m.total_exercises_completed).toBe(2);
    expect(m.global_error_metrics).toEqual({
      digits_entered: 4, wrong_digits: 2, digit_error_rate_percent: 50,
      deletions: 1, undos: 0, hesitations: 1, socratic_cards: 1,
    });
  });

  it('meeting 2 keeps the score of its session document', () => {
    const m = build({
      sessionDocs: [{ id: 'session_02_student_2', data: { session_number: 2, is_completed: true, session_score_percent: 71 } }],
    });
    expect(m.session_breakdown['2']).toMatchObject({ created: 1, completed: 1, average_score_percent: 71 });
  });

  it('a completion record does not invent a meeting the learner has no trace of', () => {
    // Learner 1's record says "up to 3", but she has no events in meeting 2 and no document.
    const m = build();
    expect(m.session_breakdown['2']).toBeUndefined();
    expect(m.session_breakdown['4']).toBeUndefined();
  });

  it('meeting 1 is not scored', () => {
    const m = build({
      byMeeting: groupTelemetryByMeeting([ev(1, 1, 's1_refresh_1', 'PROBLEM_COMPLETE', {}, 1)]),
      highestCompletedByLearner: new Map([[1, 1]]),
    });
    // Not scored is "no score", never a score of 0.
    expect(m.session_breakdown['1']).toMatchObject({ created: 1, completed: 1, average_score_percent: null });
    expect(m.average_mastery_percent).toBeNull();
  });

  it('a meeting learners started but none completed has no score (null), not 0', () => {
    const m = build({ highestCompletedByLearner: new Map([[1, 2], [2, 2]]) });
    expect(m.session_breakdown['3']).toMatchObject({ created: 2, completed: 0, average_score_percent: null });
  });

  it('a completed meeting whose compulsory exercises cannot be resolved has no score (null)', () => {
    const m = build({ compulsory: new Map() });
    expect(m.session_breakdown['3']).toMatchObject({ completed: 1, average_score_percent: null });
  });

  it('a learner who got nothing right on the first try keeps a real 0', () => {
    const m = build({
      byMeeting: groupTelemetryByMeeting([
        ev(3, 1, 's3_g_t1', 'DIGIT_ENTERED', { is_correct: false }, 1),
        ev(3, 1, 's3_g_t1', 'PROBLEM_COMPLETE', {}, 2),
        ev(3, 1, 's3_g_t2', 'DIGIT_ENTERED', { is_correct: false }, 3),
        ev(3, 1, 's3_g_t2', 'PROBLEM_COMPLETE', {}, 4),
      ]),
      highestCompletedByLearner: new Map([[1, 3]]),
    });
    expect(m.session_breakdown['3']).toMatchObject({ completed: 1, average_score_percent: 0 });
    expect(m.average_mastery_percent).toBe(0);
  });

  it('events read in random document order are scored in the order they happened', () => {
    const m = build({ byMeeting: groupTelemetryByMeeting([...telemetry].reverse()) });
    expect(m.session_breakdown['3']).toMatchObject({ average_score_percent: 50 });
  });

  it('holds aggregates only: no learner number, and the cache is replaced, not merged', () => {
    const json = JSON.stringify(build());
    expect(json).not.toMatch(/student_user|"student_id"/);
    const src = readFileSync(resolve(__dirname, '..', 'adminAggregator.ts'), 'utf-8');
    expect(src).toContain('.doc("admin_metrics").set(aggregatedMetrics);');
  });
});
