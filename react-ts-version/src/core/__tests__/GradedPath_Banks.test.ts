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
      ...([3, 4, 5, 6, 7, 8] as const).flatMap((s) => (['green_path', 'remediation_path', 'graded_path'] as const).flatMap((p) => SESSIONS_BY_PATH[s][p].map((t) => t.id))),
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
