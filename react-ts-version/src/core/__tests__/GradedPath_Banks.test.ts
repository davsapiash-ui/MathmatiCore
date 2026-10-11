import { describe, it, expect } from 'vitest';
import {
  SESSIONS_BY_PATH,
  SESSION1_TASKS,
  SESSION1_GRADED_TASKS,
  getSessionTasks,
  asLearningPathValue,
  type SessionTask,
} from '@/data/sessionTasks';
import { SESSION_BRANCH_TASKS, getSessionBranchTasks } from '@/data/sessionBranchTasks';
import { TASKS, GRADED_TASKS, diagnosticTasksFor, setActiveDiagnosticGraded, activeDiagnosticTasks } from '@/core/QMatrix';
import { catalogBankId } from '@/infrastructure/services/CurriculumCatalogService';
import { borrowCount } from '@/data/taskBuilders';
import { ROUTE_NAME_HE, ROUTE_APPROVE_HE, routeNameHe } from '@/core/routeLabels';
import { recommendedPathOf } from '@/core/recommendedPath';

/**
 * The graded path (owner, 11.10.2026): special education, the same topics and tools, the range graded as the
 * Ministry allows (1,000 first) and as מסמך 05 shows. These tests pin what the owner decided and what the two
 * independent reviews of the numbers checked: the arithmetic, the conversions each title promises, the range,
 * the structure, and that meetings 1–2 change only where the graded diagnostic changes.
 */

const graded = (s: 3 | 4 | 5 | 6 | 7 | 8): SessionTask[] => SESSIONS_BY_PATH[s].graded_path;
const choices = (s: 3 | 4 | 5 | 6 | 7) => [...SESSION_BRANCH_TASKS[s].graded_path.reinforcement, ...SESSION_BRANCH_TASKS[s].graded_path.challenge];

const carryCount = (a: number, b: number) => {
  let carry = 0;
  let n = 0;
  for (let x = a, y = b; x > 0 || y > 0; x = Math.floor(x / 10), y = Math.floor(y / 10)) {
    const sum = (x % 10) + (y % 10) + carry;
    carry = sum >= 10 ? 1 : 0;
    n += carry;
  }
  return n;
};

describe('the graded path: structure', () => {
  it('sessions 3–8 have seven compulsory exercises, sessions 3–7 two reinforcements and one challenge', () => {
    for (const s of [3, 4, 5, 6, 7, 8] as const) {
      expect(graded(s)).toHaveLength(7);
      for (const t of graded(s)) expect(t.isCompulsory).toBe(true);
    }
    for (const s of [3, 4, 5, 6, 7] as const) {
      expect(SESSION_BRANCH_TASKS[s].graded_path.reinforcement).toHaveLength(2);
      expect(SESSION_BRANCH_TASKS[s].graded_path.challenge).toHaveLength(1);
      for (const t of choices(s)) expect(t.isOptionalChoiceTask).toBe(true);
    }
  });

  it('ids carry the path letter d and are unique across all three paths', () => {
    const all = [
      ...([3, 4, 5, 6, 7, 8] as const).flatMap((s) => (['green_path', 'remediation_path', 'graded_path', 'graded_foundation_path'] as const).flatMap((p) => SESSIONS_BY_PATH[s][p].map((t) => t.id))),
      ...([3, 4, 5, 6, 7] as const).flatMap((s) => Object.values(SESSION_BRANCH_TASKS[s]).flatMap((b) => [...b.reinforcement, ...b.challenge].map((t) => t.id))),
    ];
    expect(new Set(all).size).toBe(all.length);
    for (const s of [3, 4, 5, 6, 7, 8] as const) for (const t of graded(s)) expect(t.id).toMatch(new RegExp(`^s${s}_d_t[1-7]$`));
  });

  it('arithmetic stays within 1,000; only station 3 builds one bridge number into the thousands (4,052, מסמך 05)', () => {
    const tasks = [...([3, 4, 5, 6, 7, 8] as const).flatMap(graded), ...([3, 4, 5, 6, 7] as const).flatMap(choices)];
    const over = tasks.filter((t) => [t.numberA, t.numberB, Number(t.correctAnswer)].some((n) => Number.isFinite(n) && (n as number) > 1000));
    expect(over.map((t) => t.id)).toEqual(['s3_d_t7']);
    expect(over[0].numberA).toBe(4052);
  });

  it('session 8 is vertical only and reuses numbers the graded learner met in sessions 4–6', () => {
    const met = new Set(([4, 5, 6] as const).flatMap((s) => graded(s).map((t) => `${t.numberA}${t.isSubtraction ? '-' : '+'}${t.numberB}`)));
    for (const t of graded(8)) {
      expect(t.type).toBe('vertical_addition');
      expect(met.has(`${t.numberA}${t.isSubtraction ? '-' : '+'}${t.numberB}`)).toBe(true);
    }
  });

  it('no fallback to another path: an unknown path gets no bank, the graded path gets its own', () => {
    expect(getSessionTasks(4, 'graded_path').map((t) => t.id)[0]).toBe('s4_d_t1');
    expect(getSessionBranchTasks(4, 'challenge', 'graded_path').map((t) => t.id)).toEqual(['s4_d_challenge_1']);
    expect(catalogBankId(4, 'graded_path')).toBe('session_4_graded_path');
    expect(catalogBankId(1, 'graded_path')).toBe('session_1_graded_path');
    expect(catalogBankId(1, null)).toBe('session_1');
    expect(asLearningPathValue('graded_path')).toBe('graded_path');
    expect(asLearningPathValue('yellow')).toBeNull();
  });
});

describe('the graded path: the conversions each title promises', () => {
  it('station 4 grades no grouping → one → two', () => {
    expect(graded(4).slice(0, 6).map((t) => carryCount(t.numberA!, t.numberB!))).toEqual([0, 1, 1, 1, 2, 2]);
  });

  it('station 5 grades no borrow → one → two', () => {
    expect(graded(5).slice(0, 6).map((t) => borrowCount(t.numberA!, t.numberB!))).toEqual([0, 1, 1, 1, 2, 2]);
  });

  it('station 6 has a zero in the minuend in every exercise', () => {
    for (const t of graded(6)) expect(String(t.numberA)).toContain('0');
  });

  it('every missing-digit exercise has exactly one solution', () => {
    const skeletons = [...([3, 4, 5, 6, 7, 8] as const).flatMap(graded), ...([3, 4, 5, 6, 7] as const).flatMap(choices)].filter((t) => t.hiddenDigits?.a?.length);
    expect(skeletons.length).toBeGreaterThan(0);
    for (const t of skeletons) {
      const places = t.hiddenDigits!.a!;
      const pow = { units: 1, tens: 10, hundreds: 100, thousands: 1000 } as const;
      const a = t.numberA!;
      const b = t.numberB!;
      const result = t.isSubtraction ? a - b : a + b;
      const base = places.reduce((acc, p) => acc - Math.floor(a / pow[p]) % 10 * pow[p], a);
      let solutions = 0;
      const tryAll = (i: number, acc: number) => {
        if (i === places.length) {
          if ((t.isSubtraction ? acc - b : acc + b) === result) solutions++;
          return;
        }
        for (let d = 0; d <= 9; d++) tryAll(i + 1, acc + d * pow[places[i]]);
      };
      tryAll(0, base);
      expect(solutions, t.id).toBe(1);
    }
  });
});

describe('meetings 1 and 2 for a learner marked as graded', () => {
  it('meeting 1 differs only in the two refresh exercises that mirror diagnostic tasks 6 and 7', () => {
    const changed = SESSION1_GRADED_TASKS.filter((t, i) => t.id !== SESSION1_TASKS[i].id).map((t) => t.id);
    expect(changed).toEqual(['s1_d_add47', 's1_d_sub307']);
    expect(SESSION1_GRADED_TASKS).toHaveLength(SESSION1_TASKS.length);
  });

  it('the graded diagnostic keeps the seven ids and changes tasks 6 and 7 only', () => {
    expect(GRADED_TASKS.map((t) => t.id)).toEqual(TASKS.map((t) => t.id));
    const changed = GRADED_TASKS.filter((t, i) => t.numberA !== TASKS[i].numberA || t.numberB !== TASKS[i].numberB).map((t) => t.id);
    expect(changed).toEqual(['task6_vertical_addition', 'task7_subtraction_zero_tens']);
    const t6 = GRADED_TASKS[5];
    const t7 = GRADED_TASKS[6];
    expect([t6.numberA, t6.numberB, t6.correctAnswer]).toEqual([54, 28, 82]);
    expect([t7.numberA, t7.numberB, t7.correctAnswer]).toEqual([203, 41, 162]);
    // The simpler exercises of the correction round have no conversion at all.
    expect(carryCount(t6.backwardDiagnosis!.probeA!, t6.backwardDiagnosis!.probeB!)).toBe(0);
    expect(borrowCount(t7.backwardDiagnosis!.probeA!, t7.backwardDiagnosis!.probeB!)).toBe(0);
  });

  it('each graded refresh exercise mirrors its graded diagnostic task column for column with other numbers', () => {
    const [add, sub] = [SESSION1_GRADED_TASKS.find((t) => t.id === 's1_d_add47')!, SESSION1_GRADED_TASKS.find((t) => t.id === 's1_d_sub307')!];
    expect(carryCount(add.numberA!, add.numberB!)).toBe(carryCount(54, 28));
    expect(borrowCount(sub.numberA!, sub.numberB!)).toBe(borrowCount(203, 41));
    expect(String(sub.numberA)[1]).toBe('0');
    const diagnosticNumbers = new Set([54, 28, 82, 203, 41, 162, 50, 20, 70, 300, 100, 200]);
    for (const n of [add.numberA, add.numberB, add.correctAnswer, sub.numberA, sub.numberB, sub.correctAnswer]) {
      expect(diagnosticNumbers.has(n as number)).toBe(false);
    }
  });

  it('the workspace runs the diagnostic it is told to, and the default stays the regular one', () => {
    expect(diagnosticTasksFor(false)).toBe(TASKS);
    expect(diagnosticTasksFor(true)).toBe(GRADED_TASKS);
    setActiveDiagnosticGraded(true);
    expect(activeDiagnosticTasks()).toBe(GRADED_TASKS);
    setActiveDiagnosticGraded(false);
    expect(activeDiagnosticTasks()).toBe(TASKS);
  });
});

describe('what the teacher reads', () => {
  it('one name and one approve button per path', () => {
    expect(ROUTE_NAME_HE.graded_path).toBe('המסלול המדורג');
    expect(ROUTE_APPROVE_HE.graded_path).toBe('אישור המסלול המדורג');
    expect(routeNameHe('graded_path')).toBe('המסלול המדורג');
    expect(routeNameHe('anything')).toBeNull();
  });
});

/**
 * The graded foundations path (owner, 11.10.2026): the second special-education level, for a marked learner whose
 * graded diagnostic is below 50%. The same topics and tools, addition and subtraction within the hundred (up to 200
 * at most in a challenge), place value from whole hundreds; ids with the letter f. Meetings 1–2 are the graded ones,
 * shared with the graded path.
 */
const foundation = (s: 3 | 4 | 5 | 6 | 7 | 8): SessionTask[] => SESSIONS_BY_PATH[s].graded_foundation_path;
const foundationChoices = (s: 3 | 4 | 5 | 6 | 7) => [
  ...SESSION_BRANCH_TASKS[s].graded_foundation_path.reinforcement,
  ...SESSION_BRANCH_TASKS[s].graded_foundation_path.challenge,
];
const allFoundation = () => [...([3, 4, 5, 6, 7, 8] as const).flatMap(foundation), ...([3, 4, 5, 6, 7] as const).flatMap(foundationChoices)];
/** The numbers of the teacher's demonstrations (data/teacherDemos.ts): a learner never meets them in an exercise. */
const TEACHER_DEMO_NUMBERS = [350, 407, 238, 146, 186, 384, 424, 324, 414, 74, 38, 36, 700, 234, 466, 223, 134, 357, 260, 360, 280];

describe('the graded foundations path', () => {
  it('sessions 3–8 have seven compulsory exercises, sessions 3–7 two reinforcements and one challenge', () => {
    for (const s of [3, 4, 5, 6, 7, 8] as const) {
      expect(foundation(s)).toHaveLength(7);
      for (const t of foundation(s)) expect(t.isCompulsory).toBe(true);
    }
    for (const s of [3, 4, 5, 6, 7] as const) {
      expect(SESSION_BRANCH_TASKS[s].graded_foundation_path.reinforcement).toHaveLength(2);
      expect(SESSION_BRANCH_TASKS[s].graded_foundation_path.challenge).toHaveLength(1);
      for (const t of foundationChoices(s)) expect(t.isOptionalChoiceTask).toBe(true);
    }
  });

  it('ids carry the path letter f, are unique, and are unique across all four paths', () => {
    for (const s of [3, 4, 5, 6, 7, 8] as const) for (const t of foundation(s)) expect(t.id).toMatch(new RegExp(`^s${s}_f_t[1-7]$`));
    for (const s of [3, 4, 5, 6, 7] as const) for (const t of foundationChoices(s)) expect(t.id).toMatch(new RegExp(`^s${s}_f_(reinforce|challenge)_[12]$`));
    const ids = allFoundation().map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('addition and subtraction of meetings 4–6 stay within 200 (the hundred, and a challenge just past it)', () => {
    const tasks = [...([4, 5, 6] as const).flatMap(foundation), ...([4, 5, 6] as const).flatMap(foundationChoices)];
    for (const t of tasks) {
      expect(t.type, t.id).toBe('vertical_addition');
      for (const n of [t.numberA, t.numberB, Number(t.correctAnswer)]) expect(n, t.id).toBeLessThanOrEqual(200);
    }
  });

  it('every vertical exercise has the right result', () => {
    for (const t of allFoundation().filter((x) => x.type === 'vertical_addition')) {
      expect(Number(t.correctAnswer), t.id).toBe(t.isSubtraction ? t.numberA! - t.numberB! : t.numberA! + t.numberB!);
    }
  });

  it('no exercise uses a number of the teacher demonstrations', () => {
    for (const t of allFoundation()) {
      for (const n of [t.numberA, t.numberB, Number(t.correctAnswer)]) {
        if (Number.isFinite(n)) expect(TEACHER_DEMO_NUMBERS, `${t.id}: ${n}`).not.toContain(n);
      }
    }
  });

  it('station 4 grades no grouping → one grouping in the units; station 5 no borrow → one borrow', () => {
    expect(foundation(4).slice(0, 6).map((t) => carryCount(t.numberA!, t.numberB!))).toEqual([0, 0, 1, 1, 1, 1]);
    expect(foundation(5).slice(0, 6).map((t) => borrowCount(t.numberA!, t.numberB!))).toEqual([0, 0, 1, 1, 1, 1]);
  });

  it('station 6 has a zero in the minuend in every exercise', () => {
    for (const t of foundation(6)) expect(String(t.numberA), t.id).toContain('0');
  });

  it('every missing-digit exercise has exactly one solution', () => {
    const skeletons = allFoundation().filter((t) => t.hiddenDigits?.a?.length || t.hiddenDigits?.b?.length);
    expect(skeletons.length).toBeGreaterThan(0);
    const pow = { units: 1, tens: 10, hundreds: 100, thousands: 1000 } as const;
    for (const t of skeletons) {
      const side = t.hiddenDigits!.a?.length ? 'a' : 'b';
      const places = t.hiddenDigits![side]!;
      const a = t.numberA!;
      const b = t.numberB!;
      const result = t.isSubtraction ? a - b : a + b;
      const own = side === 'a' ? a : b;
      const base = places.reduce((acc, p) => acc - Math.floor(own / pow[p]) % 10 * pow[p], own);
      let solutions = 0;
      const tryAll = (i: number, acc: number) => {
        if (i === places.length) {
          const [x, y] = side === 'a' ? [acc, b] : [a, acc];
          if ((t.isSubtraction ? x - y : x + y) === result) solutions++;
          return;
        }
        for (let d = 0; d <= 9; d++) tryAll(i + 1, acc + d * pow[places[i]]);
      };
      tryAll(0, base);
      expect(solutions, t.id).toBe(1);
    }
  });

  it('session 8 is vertical only and reuses numbers the learner met in sessions 4–6', () => {
    const met = new Set(([4, 5, 6] as const).flatMap((s) => foundation(s).map((t) => `${t.numberA}${t.isSubtraction ? '-' : '+'}${t.numberB}`)));
    for (const t of foundation(8)) {
      expect(t.type).toBe('vertical_addition');
      if (t.hiddenDigits) continue; // s8_f_t7, the missing-digit inquiry
      expect(met.has(`${t.numberA}${t.isSubtraction ? '-' : '+'}${t.numberB}`), t.id).toBe(true);
    }
  });

  it('its own banks, no fallback; meeting 1 is the graded refresh bank, shared with the graded path', () => {
    expect(getSessionTasks(4, 'graded_foundation_path').map((t) => t.id)[0]).toBe('s4_f_t1');
    expect(getSessionBranchTasks(4, 'challenge', 'graded_foundation_path').map((t) => t.id)).toEqual(['s4_f_challenge_1']);
    expect(catalogBankId(4, 'graded_foundation_path')).toBe('session_4_graded_foundation_path');
    expect(catalogBankId(1, 'graded_foundation_path')).toBe('session_1_graded_path');
    expect(getSessionTasks(1, 'graded_foundation_path').map((t) => t.id)).toEqual(SESSION1_GRADED_TASKS.map((t) => t.id));
    expect(asLearningPathValue('graded_foundation_path')).toBe('graded_foundation_path');
  });

  it('one name and one approve button', () => {
    expect(ROUTE_NAME_HE.graded_foundation_path).toBe('המסלול המדורג – יסודות');
    expect(ROUTE_APPROVE_HE.graded_foundation_path).toBe('אישור המסלול המדורג – יסודות');
    expect(routeNameHe('graded_foundation_path')).toBe('המסלול המדורג – יסודות');
  });
});

describe('the recommendation the teacher screens read (core/recommendedPath.ts)', () => {
  it('a regular learner: green or remediation; a marked learner: graded or graded foundations, at the same 50% line', () => {
    expect(recommendedPathOf({ session_score_percent: 50 })).toBe('green_path');
    expect(recommendedPathOf({ session_score_percent: 49 })).toBe('remediation_path');
    expect(recommendedPathOf({ session_score_percent: 50, graded_track: true })).toBe('graded_path');
    expect(recommendedPathOf({ session_score_percent: 49, graded_track: true })).toBe('graded_foundation_path');
    expect(recommendedPathOf({ matrix_recommended_path: 'graded_foundation_path', graded_track: true })).toBe('graded_foundation_path');
    // The session document carries no mark: the caller passes the learner record's.
    expect(recommendedPathOf({ session_score_percent: 29 }, true)).toBe('graded_foundation_path');
    // Stored before the server knew the two graded levels: read by the same line.
    expect(recommendedPathOf({ matrix_recommended_path: 'green_path', graded_track: true })).toBe('graded_path');
    expect(recommendedPathOf({ matrix_recommended_path: 'remediation_path', graded_track: true })).toBe('graded_foundation_path');
    expect(recommendedPathOf({})).toBeNull();
    expect(recommendedPathOf({ graded_track: true })).toBeNull();
  });
});
