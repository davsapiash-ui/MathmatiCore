import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { GATE_PATHS } from '../teacherGate';
import { asLearningPath, learnerPathOf, recommendedPathFor } from '../learningPath';
import {
  CHOICE_TITLES_HE,
  FADING_PAIRS,
  REPRESENTATION_EXERCISES,
  computeFadingGap,
  computeFirstAttemptScore,
  exerciseLabelHe,
  exercisePathType,
  pathOfMeeting,
  readExerciseTitles,
  resolveCompulsoryTotal,
  resolveMeetingPath,
} from '../meetingMetrics';
import { aggregateClass, buildLearnerRow } from '../classReport';
import { classReportHtml } from '../reportHtml';
import { gradedTrackLearnersFromRecords, learnerPathsFromRecords } from '../exportDriveReport';
import { ROUTE_NAME_HE } from '../teacherLabels';

/**
 * The third path, המסלול המדורג (owner, 11.10.2026): stored value 'graded_path',
 * bank ids s{N}_d_*, catalog banks session_{N}_graded_path. The teacher chooses it
 * at the gate, or marks the learner before meeting 1 (graded_track). The matrix
 * recommendation stays two-valued. Every reader that used to resolve "not
 * remediation ⇒ green" must now see the graded path.
 */

const FRONTEND = resolve(__dirname, '../../../react-ts-version/src/data');
const gradedSource = readFileSync(resolve(FRONTEND, 'sessionGradedTasks.ts'), 'utf-8');

const GRADED_4 = ['s4_d_t1', 's4_d_t2', 's4_d_t3', 's4_d_t4', 's4_d_t5', 's4_d_t6', 's4_d_t7'];

const ev = (exercise: string, type: string, details: Record<string, unknown> = {}, t = 0, session = 4) => ({
  session_id: `session_${session}_student_student_user7`,
  student_id: 7,
  exercise_id: exercise,
  event_type: type,
  details,
  client_timestamp: 1_000_000 + t,
});
const done = (exercise: string, t: number, session = 4, ms = 30_000) =>
  ev(exercise, 'PROBLEM_COMPLETE', { total_duration_ms: ms }, t, session);

/** A fake catalog: the named banks exist, every other does not. */
const catalog = (banks: Record<string, string[]>) => ({
  collection: () => ({
    doc: (id: string) => ({
      get: async () => ({
        exists: id in banks,
        data: () => ({ tasks: (banks[id] ?? []).map((tid, i) => ({ id: tid, titleHe: `מדורג ${i + 1}` })) }),
      }),
    }),
  }),
});

describe('the gate and the learner record', () => {
  it('the teacher may approve any of the four paths', () => {
    expect([...GATE_PATHS]).toEqual(['green_path', 'remediation_path', 'graded_path', 'graded_foundation_path']);
    expect(asLearningPath('graded_path')).toBe('graded_path');
    expect(asLearningPath('yellow')).toBeNull();
  });

  it('a record resolves to its approved path, else graded when the teacher marked it, else green', () => {
    expect(learnerPathOf({ teacher_selected_path: 'graded_path' })).toBe('graded_path');
    expect(learnerPathOf({ pedagogicalPath: 'graded_path' })).toBe('graded_path');
    expect(learnerPathOf({ graded_track: true })).toBe('graded_path');
    // The approval at the gate wins over the mark made before meeting 1.
    expect(learnerPathOf({ graded_track: true, teacher_selected_path: 'green_path', pedagogicalPath: 'green_path' })).toBe('green_path');
    expect(learnerPathOf({ graded_track: true, pedagogicalPath: 'remediation_path' })).toBe('remediation_path');
    // As before: remediation on either field wins; nothing at all is green.
    expect(learnerPathOf({ teacher_selected_path: 'green_path', pedagogicalPath: 'remediation_path' })).toBe('remediation_path');
    expect(learnerPathOf({ graded_track: 'yes' })).toBe('green_path');
    expect(learnerPathOf(null)).toBe('green_path');
  });
});

describe('the research export', () => {
  it('names the graded path from the learner record, the canonical record first', () => {
    const node = {
      student_user4: { teacher_selected_path: 'graded_path' },
      student_user5: { graded_track: true },
      student_6: { graded_track: true },
      student_user6: {},
      student_user7: { teacher_selected_path: 'remediation_path' },
    };
    const paths = learnerPathsFromRecords(node);
    expect(paths.get(4)).toBe('graded_path');
    expect(paths.get(5)).toBe('graded_path');
    expect(paths.get(6)).toBe('green_path');
    expect(paths.get(7)).toBe('remediation_path');
    // Meetings 1–2: only the learners the teacher marked (the canonical record decides).
    expect([...gradedTrackLearnersFromRecords(node)]).toEqual([5]);
    expect([...gradedTrackLearnersFromRecords({ student_9: { graded_track: true } })]).toEqual([9]);
  });
});

describe('a graded learner is scored on the graded bank', () => {
  const meeting = GRADED_4.map((id, i) => done(id, i + 1));

  it('the id spelling alone names the graded path', () => {
    expect(pathOfMeeting(meeting)).toBe('graded_path');
    expect(pathOfMeeting([done('s4_d_t1', 1), done('s4_g_t1', 2), done('s4_g_t2', 3)])).toBe('green_path');
    // A tie between two paths names none (the learner's record decides).
    expect(pathOfMeeting([done('s4_d_t1', 1), done('s4_r_t1', 2)])).toBeNull();
  });

  it('the published graded bank: 100%, not the 0% the green bank\'s ids would give', async () => {
    const db = catalog({ session_4_graded_path: GRADED_4, session_4_green_path: GRADED_4.map((id) => id.replace('_d_', '_g_')) });
    const ids = new Map<string, ReadonlySet<string>>();
    const cache = new Map<string, number | null>();
    // The record fallback says green (no approval yet read); the events say graded.
    const path = await resolveMeetingPath(db as any, 4, meeting, 'green_path', cache, ids);
    expect(path).toBe('graded_path');
    const total = await resolveCompulsoryTotal(db as any, 4, path, cache, ids);
    expect(total).toBe(7);
    expect(ids.get('4:graded_path')?.size).toBe(7);
    expect(computeFirstAttemptScore(meeting, total, ids.get('4:graded_path') ?? null).scorePercent).toBe(100);
    expect(computeFirstAttemptScore(meeting, total, ids.get('4:green_path') ?? null).scorePercent).toBe(0);
  });

  it('the titles come from the graded bank too', async () => {
    const titles = await readExerciseTitles(catalog({ session_4_graded_path: GRADED_4 }) as any, 4);
    expect(titles.s4_d_t1).toBe('מדורג 1');
  });
});

describe('the class report counts three paths', () => {
  const rows = [
    buildLearnerRow(1, [done('s4_g_t1', 1)], 7, 'green_path', null, null, 0),
    buildLearnerRow(2, [done('s4_r_t1', 1)], 7, 'remediation_path', null, null, 0),
    buildLearnerRow(3, [done('s4_d_t1', 1)], 7, 'graded_path', null, null, 0),
    buildLearnerRow(4, [done('s4_d_t2', 1)], 7, 'graded_path', null, null, 0),
  ];
  const a = aggregateClass(rows, new Map(rows.map((r) => [r.student_id, []])));

  it('in the aggregates', () => {
    expect(a.paths).toEqual({ green_path: 1, remediation_path: 1, graded_path: 2, graded_foundation_path: 0 });
    expect(rows[2].learning_path).toBe('graded_path');
  });

  it('in the printed report, by the screens\' name', () => {
    const html = classReportHtml({ session_number: 4, aggregates: a, learners: rows });
    expect(html).toContain(`${ROUTE_NAME_HE.graded_path}:</b> 2`);
  });

  it('a stored report from before the third path prints 0 graded, not "undefined"', () => {
    const old = { ...a, paths: { green_path: 3, remediation_path: 1 } };
    const html = classReportHtml({ session_number: 4, aggregates: old, learners: rows });
    expect(html).toContain(`${ROUTE_NAME_HE.graded_path}:</b> 0`);
  });
});

describe('the graded choice exercises', () => {
  it('are choice exercises, by their branch, with their bank titles', () => {
    expect(exercisePathType('s4_d_reinforce_2')).toBe('consolidation');
    expect(exercisePathType('s6_d_challenge_1')).toBe('challenge');
    expect(exercisePathType('s4_d_t1')).toBe('compulsory');
    expect(Object.keys(CHOICE_TITLES_HE).filter((id) => /_d_/.test(id))).toHaveLength(15);
    expect(exerciseLabelHe(null, 's3_d_challenge_1')).toBe('אתגר: כל הדרכים לייצג את 250');
    expect(exerciseLabelHe(null, 's7_d_reinforce_9')).toBe('ביסוס 9 במפגש 7');
  });
});

describe('the fading gap of the graded path (meeting 8 without blocks)', () => {
  /** Each graded exercise's two operands, from the bank's own builder calls. */
  const operands = new Map<string, [number, number]>();
  for (const m of gradedSource.matchAll(/\b(?:addition|subtraction|skeleton|missingResultDigit)\('(s\d_d_t\d)',\s*(\d+),\s*(\d+)/g)) {
    operands.set(m[1], [Number(m[2]), Number(m[3])]);
  }
  const graded = Object.entries(FADING_PAIRS).filter(([id]) => id.startsWith('s8_d_'));

  it('pairs all seven meeting-8 exercises with a meeting 4–6 twin', () => {
    expect(graded.map(([id]) => id).sort()).toEqual(['s8_d_t1', 's8_d_t2', 's8_d_t3', 's8_d_t4', 's8_d_t5', 's8_d_t6']); // s8_d_t7 is a skeleton, unpaired like the other paths' skeletons
  });

  it('each pair has the same operands, as the bank writes them', () => {
    for (const [now, before] of graded) {
      expect(operands.get(now), now).toBeDefined();
      expect(operands.get(before), before).toBeDefined();
      expect(operands.get(now), `${now} ↔ ${before}`).toEqual(operands.get(before));
      expect(before, before).toMatch(/^s[4-6]_d_t\d$/);
    }
  });

  it('is measured for a graded learner', () => {
    const gap = computeFadingGap(
      [done('s8_d_t1', 1, 8, 20_000), done('s8_d_t4', 2, 8, 20_000)],
      [done('s4_d_t1', 1, 4), done('s5_d_t1', 2, 5)]
    );
    expect(gap.pairs_measured).toBe(2);
    expect(gap.unpaired_exercises).toEqual([]);
  });
});

describe('measure 3 (representation) counts the graded representation exercises', () => {
  it('by kind: the six of meeting 3 that build a number, and three of meeting 7', () => {
    for (const id of ['s3_d_t1', 's3_d_t2', 's3_d_t3', 's3_d_t4', 's3_d_t5', 's3_d_t7', 's7_d_t1', 's7_d_t6', 's7_d_t7']) {
      expect(REPRESENTATION_EXERCISES.has(id), id).toBe(true);
    }
    // s3_d_t6 is a missing-element task (as s3_r_t7), s7_d_t2 a skeleton.
    expect(REPRESENTATION_EXERCISES.has('s3_d_t6')).toBe(false);
    expect(REPRESENTATION_EXERCISES.has('s7_d_t2')).toBe(false);
  });
});

/**
 * The fourth path, המסלול המדורג – יסודות (owner, 11.10.2026): stored value 'graded_foundation_path', bank ids
 * s{N}_f_*, catalog banks session_{N}_graded_foundation_path. A learner the teacher marked graded is recommended
 * the graded path at 50% or more in meeting 2, and this one below; a regular learner keeps green / remediation.
 */
describe('the graded foundations path', () => {
  it('the recommendation: two levels for every learner, by the teacher\'s graded mark', () => {
    expect(recommendedPathFor(50, false)).toBe('green_path');
    expect(recommendedPathFor(49, false)).toBe('remediation_path');
    expect(recommendedPathFor(50, true)).toBe('graded_path');
    expect(recommendedPathFor(49, true)).toBe('graded_foundation_path');
    expect(recommendedPathFor(100, true)).toBe('graded_path');
    expect(recommendedPathFor(0, true)).toBe('graded_foundation_path');
    expect(recommendedPathFor(0, false)).toBe('remediation_path');
  });

  it('is a path of its own: the gate, the record, the id letter', () => {
    expect(GATE_PATHS).toContain('graded_foundation_path');
    expect(asLearningPath('graded_foundation_path')).toBe('graded_foundation_path');
    expect(learnerPathOf({ teacher_selected_path: 'graded_foundation_path' })).toBe('graded_foundation_path');
    expect(learnerPathOf({ graded_track: true, pedagogicalPath: 'graded_foundation_path' })).toBe('graded_foundation_path');
    // The two fields disagree: the foundations level wins over the graded one, as remediation over green.
    expect(learnerPathOf({ teacher_selected_path: 'graded_path', pedagogicalPath: 'graded_foundation_path' })).toBe('graded_foundation_path');
    // Before the gate a marked learner is on the shared graded meetings 1–2.
    expect(learnerPathOf({ graded_track: true })).toBe('graded_path');
    expect(pathOfMeeting(['s4_f_t1', 's4_f_t2', 's4_f_t3'].map((id, i) => done(id, i + 1)))).toBe('graded_foundation_path');
    expect(pathOfMeeting([done('s4_f_t1', 1), done('s4_d_t1', 2)])).toBeNull();
    expect(learnerPathsFromRecords({ student_user8: { teacher_selected_path: 'graded_foundation_path' } }).get(8)).toBe('graded_foundation_path');
  });

  it('the class report counts it, and prints it by the screens\' name', () => {
    const rows = [
      buildLearnerRow(1, [done('s4_f_t1', 1)], 7, 'graded_foundation_path', null, null, 0),
      buildLearnerRow(2, [done('s4_d_t1', 1)], 7, 'graded_path', null, null, 0),
    ];
    const a = aggregateClass(rows, new Map(rows.map((r) => [r.student_id, []])));
    expect(a.paths).toEqual({ green_path: 0, remediation_path: 0, graded_path: 1, graded_foundation_path: 1 });
    const html = classReportHtml({ session_number: 4, aggregates: a, learners: rows });
    expect(ROUTE_NAME_HE.graded_foundation_path).toBe('המסלול המדורג – יסודות');
    expect(html).toContain(`${ROUTE_NAME_HE.graded_foundation_path}:</b> 1`);
  });

  it('its choice exercises are choice exercises, with their bank titles', () => {
    expect(exercisePathType('s4_f_reinforce_2')).toBe('consolidation');
    expect(exercisePathType('s6_f_challenge_1')).toBe('challenge');
    expect(exercisePathType('s4_f_t1')).toBe('compulsory');
    expect(Object.keys(CHOICE_TITLES_HE).filter((id) => /_f_/.test(id))).toHaveLength(15);
    expect(exerciseLabelHe(null, 's3_f_challenge_1')).toBe('אתגר: כל הדרכים לייצג את 180');
  });

  it('its meeting-8 exercises pair with the meeting 4–6 exercises whose operands they repeat', () => {
    const operands = new Map<string, [number, number]>();
    for (const m of gradedSource.matchAll(/\b(?:addition|subtraction|skeleton|missingResultDigit)\('(s\d_f_t\d)',\s*(\d+),\s*(\d+)/g)) {
      operands.set(m[1], [Number(m[2]), Number(m[3])]);
    }
    const pairs = Object.entries(FADING_PAIRS).filter(([id]) => id.startsWith('s8_f_'));
    expect(pairs.map(([id]) => id).sort()).toEqual(['s8_f_t1', 's8_f_t2', 's8_f_t3', 's8_f_t4', 's8_f_t5', 's8_f_t6']); // s8_f_t7 is a skeleton
    for (const [now, before] of pairs) {
      expect(operands.get(now), now).toBeDefined();
      expect(operands.get(now), `${now} ↔ ${before}`).toEqual(operands.get(before));
      expect(before, before).toMatch(/^s[4-6]_f_t\d$/);
    }
    const gap = computeFadingGap(
      [done('s8_f_t1', 1, 8, 20_000), done('s8_f_t6', 2, 8, 20_000)],
      [done('s4_f_t1', 1, 4), done('s6_f_t5', 2, 6)]
    );
    expect(gap.pairs_measured).toBe(2);
    expect(gap.unpaired_exercises).toEqual([]);
  });

  it('measure 3 counts its representation exercises, by the same kinds', () => {
    for (const id of ['s3_f_t1', 's3_f_t2', 's3_f_t3', 's3_f_t4', 's3_f_t5', 's3_f_t7', 's7_f_t1', 's7_f_t6', 's7_f_t7']) {
      expect(REPRESENTATION_EXERCISES.has(id), id).toBe(true);
    }
    expect(REPRESENTATION_EXERCISES.has('s3_f_t6')).toBe(false);
    expect(REPRESENTATION_EXERCISES.has('s7_f_t2')).toBe(false);
  });
});
