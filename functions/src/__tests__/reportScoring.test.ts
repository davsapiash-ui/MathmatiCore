import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  computeFirstAttemptScore,
  computePersistenceIndex,
  exerciseAttempts,
  isExerciseEvent,
  persistenceHe,
  sessionDocumentIdCandidates,
  summarizeMeeting,
} from '../meetingMetrics';
import { aggregateClass, buildLearnerRow } from '../classReport';
import { classReportHtml } from '../reportHtml';

/**
 * ביקורת הדשבורד, 20.9.2026 — מה שהדוחות אומרים על ילד צריך להיות נכון, וזהה בכל מסך.
 * PRD מודול 23 §ב: ציון = תרגילי החובה שנפתרו נכון בניסיון ראשון ÷ תרגילי החובה.
 */
const ev = (exercise: string, type: string, details: Record<string, unknown> = {}, t = 0) => ({
  session_id: 'session_4_student_student_user3',
  student_id: 3,
  exercise_id: exercise,
  event_type: type,
  details,
  client_timestamp: 1_000_000 + t,
});
const done = (exercise: string, t: number) => ev(exercise, 'PROBLEM_COMPLETE', { total_duration_ms: 1000, undo_count: 0, error_count: 0 }, t);
const wrong = (exercise: string, t: number) => ev(exercise, 'DIGIT_ENTERED', { digit_value: 1, is_correct: false }, t);

const COMPULSORY = new Set(['s4_g_t1', 's4_g_t2', 's4_g_t3', 's4_g_t4', 's4_g_t5', 's4_g_t6', 's4_g_t7']);
/** t1, t2, t4, t5 first try; t3, t6, t7 after a wrong digit; then both optional ביסוס tasks first try. */
const earlyFinisher = [
  done('s4_g_t1', 1), done('s4_g_t2', 2),
  wrong('s4_g_t3', 3), done('s4_g_t3', 4),
  done('s4_g_t4', 5), done('s4_g_t5', 6),
  wrong('s4_g_t6', 7), done('s4_g_t6', 8),
  wrong('s4_g_t7', 9), done('s4_g_t7', 10),
  done('s4_g_reinforce_1', 11), done('s4_g_reinforce_2', 12),
];

describe('optional early-finisher tasks do not count towards the score', () => {
  it('4 of 7 compulsory first try + 2 optional first try is 57%, not 86%', () => {
    expect(computeFirstAttemptScore(earlyFinisher, 7, COMPULSORY).scorePercent).toBe(57);
    // Every report used to compute 86% here, because only a dead trigger passed
    // the ids. A choice exercise is now known by its id and never counts, so the
    // score stays on the compulsory exercises even without them (26.9.2026).
    expect(computeFirstAttemptScore(earlyFinisher, 7).scorePercent).toBe(57);
  });

  it('the class report row takes the ids, so its tier is the PRD\'s', () => {
    const row = buildLearnerRow(3, earlyFinisher, 7, 'green_path', null, null, 0, null, null, COMPULSORY);
    expect(row.score_percent).toBe(57);
    expect(row.recommendation_tier).toBe('between_50_75');
  });

  it('all three report paths pass the ids', () => {
    const read = (f: string) => readFileSync(resolve(__dirname, '..', f), 'utf-8');
    expect(read('classReport.ts')).toContain('computeFirstAttemptScore(sorted, compulsoryTotal, compulsoryIds)');
    expect(read('pedagogicalReport.ts')).toContain('compulsoryIdsByBank.get(`${resolvedSessionNumber}:${scoringPath}`) ?? null');
    expect(read('exportDriveReport.ts')).toContain('computeFirstAttemptScore(events, compulsory, compulsoryIdsByBank.get(`${m}:${path}`) ?? null)');
  });
});

describe('SESSION_START and REFLECTION_SUBMITTED are not exercises', () => {
  const events = [
    ev('ex_4_01', 'SESSION_START', { session_number: 4 }, 0),
    done('s4_g_t1', 1),
    ev('reflection_meeting_8', 'REFLECTION_SUBMITTED', { reflection_step: 3 }, 2),
  ];

  it('no phantom exercise in the counts, the attempts or the class table', () => {
    expect(isExerciseEvent(events[0])).toBe(false);
    expect(isExerciseEvent(events[1])).toBe(true);
    expect(summarizeMeeting(events).exercises_attempted).toBe(1);
    expect(Object.keys(exerciseAttempts(events))).toEqual(['s4_g_t1']);
    expect(computeFirstAttemptScore(events, 7).attempted).toBe(1);
    const row = buildLearnerRow(3, events, 7, 'green_path', null, null, 0);
    expect(Object.keys(row.exercise_outcomes)).toEqual(['s4_g_t1']);
    const aggregates = aggregateClass([row], new Map([[3, events]]));
    expect(aggregates.exercises.map((e) => e.exercise_id)).toEqual(['s4_g_t1']);
    // The reflection is still seen as a reflection.
    expect(summarizeMeeting(events).reflection_submitted).toBe(true);
  });

  it('the learner report\'s narrative skips them too', () => {
    const report = readFileSync(resolve(__dirname, '../pedagogicalReport.ts'), 'utf-8');
    const start = report.indexOf('function generateExerciseNarrativeFromEvents');
    expect(report.slice(start, start + 900)).toContain('if (!isExerciseEvent(doc)) continue;');
  });
});

describe('measure 2 — Persistence Index on the server (Module 16 §ב formula)', () => {
  it('U ÷ (U + E + G) × 100; is_correct null is not counted at all', () => {
    const p = computePersistenceIndex([
      ev('a', 'UNDO_EXECUTED', {}, 1), ev('a', 'UNDO_EXECUTED', {}, 2), ev('a', 'UNDO_EXECUTED', {}, 3),
      wrong('a', 4),
      ev('a', 'DIGIT_ENTERED', { digit_value: 2, is_correct: null }, 5),
      ev('a', 'DIGIT_ENTERED', { digit_value: 2, is_correct: true }, 6),
      ev('a', 'SOCRATIC_OPTION_SELECTED', { option_id: 'opt_1', is_correct: false }, 7),
      ev('a', 'SOCRATIC_OPTION_SELECTED', { option_id: 'opt_2', is_correct: true }, 8),
    ]);
    expect(p).toEqual({ undos: 3, wrong_digits: 1, wrong_options: 1, percent: 60 });
    expect(persistenceHe(p)).toBe('60% (ביטולים 3, ספרות שגויות 1, בחירות שגויות בכרטיס 1)');
  });

  it('U + E + G = 0 is 100', () => {
    expect(computePersistenceIndex([done('a', 1)]).percent).toBe(100);
  });

  it('is on every class-report row and in the learner report', () => {
    expect(buildLearnerRow(3, earlyFinisher, 7, 'green_path', null, null, 0).persistence)
      .toEqual({ undos: 0, wrong_digits: 3, wrong_options: 0, percent: 0 });
    expect(readFileSync(resolve(__dirname, '../pedagogicalReport.ts'), 'utf-8')).toContain('persistence: computePersistenceIndex(telemetryDocs),');
  });
});

describe('the SessionDocument is found where the client writes it', () => {
  it('candidates cover the client\'s spelling and the older ones', () => {
    expect(sessionDocumentIdCandidates(4, 2)).toEqual([
      'session_02_student_4', 'session_2_student_4', 'session_02_student_user4', 'session_2_student_user4',
    ]);
  });

  it('no report path filters session documents by class_id, and no stub document is written under the telemetry id', () => {
    const read = (f: string) => readFileSync(resolve(__dirname, '..', f), 'utf-8');
    for (const f of ['classReport.ts', 'exportDriveReport.ts']) {
      expect(read(f)).not.toContain('collection("sessions").where("class_id"');
    }
    const report = read('pedagogicalReport.ts');
    expect(report).toContain('sessionDocumentIdCandidates(clampedStudentNum, requestedMeeting)');
    expect(report).not.toContain('db.collection("sessions").doc(sessionId).set({');
    expect(report).toContain('await sessionDoc.ref.set({');
  });
});

describe('a score that was not measured is said so', () => {
  it('the class report prints "לא נמדד", names the learners and says what to do — never "%"', () => {
    const row = buildLearnerRow(3, [done('s4_g_t1', 1)], null, 'green_path', null, null, 0);
    expect(row.score_percent).toBeNull();
    const aggregates = aggregateClass([row], new Map([[3, [done('s4_g_t1', 1)]]]));
    const html = classReportHtml({ session_number: 4, learners: [row], aggregates, class_patterns: [], teaching_recommendations: [] });
    expect(html).toContain('לא נמדד');
    expect(html).not.toMatch(/<td>%<\/td>/);
    expect(html).not.toContain('null');
    expect(html).toContain('ללא ציון:');
    expect(html).toContain('לפרסם את תוכנית הלימודים');
    expect(html).toContain('התמדה וויסות עצמי');
  });
});
