import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  CHOICE_PATH_LABEL_HE,
  computeFirstAttemptScore,
  exercisePathType,
  isChoiceExercise,
} from '../meetingMetrics';
import { aggregateClass, buildLearnerRow } from '../classReport';
import { classReportHtml, pedagogicalReportHtml, CHOICE_EXERCISES_HEADING_HE } from '../reportHtml';
import { buildFailedExercises } from '../reportAnalysis';
import { generateExerciseNarrativeFromEvents } from '../pedagogicalReport';

/**
 * מסמך 03 (מדיניות סיום מוקדם): "ביצועי הלומדים במשימות האקסטרה של נתיבי
 * הבחירה יתועדו בשקט ברקע ויופיעו בדוחות המורה מסומנים כתרגילי בחירה, בנפרד
 * משבעת תרגילי החובה". מדד העצמאות המושגית מחושב על תרגילי החובה בלבד.
 *
 * ביקורת 26.9.2026 (מרשם שורה 18, "סימון תרגילי הבחירה בדוחות"): תרגיל אתגר
 * סווג "consolidation", ובדוחות תרגילי הבחירה הופיעו כתרגיל השמיני והתשיעי.
 */

const FRONTEND = resolve(__dirname, '../../../react-ts-version/src/data');
const branchSource = readFileSync(resolve(FRONTEND, 'sessionBranchTasks.ts'), 'utf-8');
const compulsorySource = readFileSync(resolve(FRONTEND, 'sessionTasks.ts'), 'utf-8');

/** Every choice exercise of the banks, with the branch its builder call declares (`, R)` / `, C)`). */
function branchTasksFromSource(): Array<{ id: string; branch: 'R' | 'C' }> {
  const idRe = /'(s\d+_[gr]_[a-z]+_\d+)'/g;
  const found: Array<{ id: string; at: number }> = [];
  for (let m = idRe.exec(branchSource); m; m = idRe.exec(branchSource)) found.push({ id: m[1], at: m.index });
  return found.map(({ id, at }, i) => {
    const until = i + 1 < found.length ? found[i + 1].at : branchSource.length;
    const call = branchSource.slice(at, until);
    // `, C)` or `{ ...C, targetNode }` — the bank's own challenge marker.
    const branch = /,\s*C\)|\.\.\.C\b/.test(call) ? 'C' : 'R';
    return { id, branch };
  });
}

const ev = (exercise: string, type: string, details: Record<string, unknown> = {}, t = 0) => ({
  session_id: 'session_4_student_student_user3',
  student_id: 3,
  exercise_id: exercise,
  event_type: type,
  details,
  client_timestamp: 1_000_000 + t,
});
const done = (exercise: string, t: number) => ev(exercise, 'PROBLEM_COMPLETE', { total_duration_ms: 1000 }, t);
const wrong = (exercise: string, t: number) => ev(exercise, 'DIGIT_ENTERED', { digit_value: 1, is_correct: false }, t);

/** Seven compulsory exercises, then one consolidation and one challenge exercise. */
const meeting = [
  done('s4_g_t1', 1), done('s4_g_t2', 2), wrong('s4_g_t3', 3), done('s4_g_t3', 4),
  done('s4_g_t4', 5), done('s4_g_t5', 6), done('s4_g_t6', 7), done('s4_g_t7', 8),
  done('s4_g_reinforce_1', 9),
  wrong('s4_g_challenge_1', 10), done('s4_g_challenge_1', 11),
];

describe('which exercise is a choice exercise', () => {
  it('every exercise of the choice banks, by the branch its bank declares', () => {
    const tasks = branchTasksFromSource();
    expect(tasks).toHaveLength(30); // sessions 3–7 × two paths × (2 consolidation + 1 challenge)
    for (const { id, branch } of tasks) {
      expect(exercisePathType(id), id).toBe(branch === 'C' ? 'challenge' : 'consolidation');
    }
    expect(tasks.filter((t) => t.branch === 'C')).toHaveLength(10);
  });

  it('no compulsory exercise looks like one', () => {
    const ids = Array.from(compulsorySource.matchAll(/'(s\d+_[a-z0-9_]+)'/g), (m) => m[1]);
    expect(ids.length).toBeGreaterThan(40);
    for (const id of ids) expect(isChoiceExercise(id), id).toBe(false);
    for (const id of ['task1_read_write_zero', 's8_g_t7', 'ex_3_01', '']) expect(isChoiceExercise(id)).toBe(false);
  });

  it('a catalog task that declares itself optional is trusted', () => {
    expect(exercisePathType('x', { isOptionalChoiceTask: true, branchType: 'challenge' })).toBe('challenge');
    expect(exercisePathType('x', { isOptionalChoiceTask: true, branchType: 'reinforcement' })).toBe('consolidation');
    expect(exercisePathType('x', { isOptionalChoiceTask: false })).toBe('compulsory');
  });
});

describe('the conceptual-independence score counts the compulsory exercises only', () => {
  it('with or without the compulsory ids', () => {
    // 6 of 7 compulsory first try (t3 after a correction); both choice exercises ignored.
    expect(computeFirstAttemptScore(meeting, 7).scorePercent).toBe(86);
    expect(computeFirstAttemptScore(meeting, 7).correctFirstAttempt).toBe(6);
  });
});

describe('the individual report', () => {
  it('numbers the compulsory exercises only, and lists the choice exercises apart, marked', () => {
    const { compulsory, choice } = generateExerciseNarrativeFromEvents(meeting);
    expect(compulsory).toHaveLength(7);
    expect(compulsory[6]).toMatch(/^בתרגיל השביעי \(s4_g_t7\)/);
    expect(compulsory.join(' ')).not.toMatch(/השמיני|התשיעי|reinforce|challenge/);
    expect(choice).toEqual([
      `${CHOICE_PATH_LABEL_HE.consolidation} (s4_g_reinforce_1): הלומד והשלים את התרגיל בניסיון הראשון.`,
      expect.stringMatching(/^תרגיל בחירה — נתיב האתגר והעומק \(s4_g_challenge_1\): הלומד הזין ספרות שגויות.*והשלים את התרגיל לאחר תיקון\.$/),
    ]);
  });

  it('the PDF prints them under their own heading', () => {
    const html = pedagogicalReportHtml({
      session_number: 4, score_percent: 86, exercise_narratives: ['בתרגיל הראשון (s4_g_t1) הלומד והשלים את התרגיל בניסיון הראשון.'],
      choice_exercise_narratives: ['תרגיל בחירה — נתיב האתגר והעומק (s4_g_challenge_1): הלומד והשלים את התרגיל בניסיון הראשון.'],
    });
    expect(html).toContain(CHOICE_EXERCISES_HEADING_HE);
    expect(html.indexOf('s4_g_t1')).toBeLessThan(html.indexOf(CHOICE_EXERCISES_HEADING_HE));
    expect(html.indexOf(CHOICE_EXERCISES_HEADING_HE)).toBeLessThan(html.indexOf('s4_g_challenge_1'));
  });

  it('no heading when the learner did no choice exercise', () => {
    expect(pedagogicalReportHtml({ session_number: 4, exercise_narratives: ['x'] })).not.toContain(CHOICE_EXERCISES_HEADING_HE);
  });

  it('is stored with the report, so the teacher page shows it too', () => {
    const src = readFileSync(resolve(__dirname, '../pedagogicalReport.ts'), 'utf-8');
    expect(src.match(/choice_exercise_narratives: choiceExerciseNarratives,/g)).toHaveLength(2);
  });

  it('the AI engine is told what each failed exercise is — a challenge is not a consolidation', () => {
    const failed = buildFailedExercises(['s4_g_challenge_1', 's4_g_reinforce_2', 's4_g_t3'], {}, [
      { id: 's4_g_t3', type: 'vertical_addition', numberA: 1, numberB: 2, titleHe: 't3' },
    ], 4, 'green_path');
    expect(failed.map((f) => f.path_type)).toEqual(['challenge', 'consolidation', 'compulsory']);
    const fromCatalog = buildFailedExercises(['c1'], {}, [
      { id: 'c1', isOptionalChoiceTask: true, branchType: 'challenge', titleHe: 'אתגר' },
    ], 4, 'green_path');
    expect(fromCatalog[0].path_type).toBe('challenge');
  });
});

describe('the class report', () => {
  const row = buildLearnerRow(3, meeting, 7, 'green_path', null, null, 0);
  const a = aggregateClass([row], new Map([[3, meeting]]));

  it('marks each exercise, compulsory first and the choice exercises after', () => {
    expect(a.exercises.map((e) => [e.exercise_id, e.path_type])).toEqual([
      ['s4_g_t1', 'compulsory'], ['s4_g_t2', 'compulsory'], ['s4_g_t3', 'compulsory'], ['s4_g_t4', 'compulsory'],
      ['s4_g_t5', 'compulsory'], ['s4_g_t6', 'compulsory'], ['s4_g_t7', 'compulsory'],
      ['s4_g_challenge_1', 'challenge'], ['s4_g_reinforce_1', 'consolidation'],
    ]);
  });

  it('prints the choice exercises in their own table, each with its path', () => {
    const html = classReportHtml({ session_number: 4, aggregates: a, learners: [row] });
    const heading = html.indexOf(CHOICE_EXERCISES_HEADING_HE);
    expect(heading).toBeGreaterThan(-1);
    const exercisesSection = html.slice(html.indexOf('3. תרגילים'), html.indexOf('4. טבלת הלומדים'));
    expect(exercisesSection.indexOf('s4_g_t7')).toBeLessThan(exercisesSection.indexOf(CHOICE_EXERCISES_HEADING_HE));
    expect(exercisesSection).toContain(CHOICE_PATH_LABEL_HE.challenge);
    expect(exercisesSection).toContain(CHOICE_PATH_LABEL_HE.consolidation);
    // The per-learner outcome table marks the choice columns too.
    expect(html).toContain('(תרגיל בחירה)');
  });

  it('a report stored before path_type existed is still split by the exercise id', () => {
    const old = { ...a, exercises: a.exercises.map(({ path_type: _p, ...rest }) => rest) } as any;
    const html = classReportHtml({ session_number: 4, aggregates: old, learners: [row] });
    expect(html).toContain(CHOICE_EXERCISES_HEADING_HE);
  });
});
