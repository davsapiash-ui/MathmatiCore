import { describe, it, expect } from 'vitest';
import {
  CONCEPT_LABELS_HE,
  DIAGNOSTIC_DOMAINS,
  Q_LEGACY_TASK_ALIASES,
  Q_MATRIX_MAPPING,
  REGROUPING_KIND_BY_TASK,
  REGROUPING_KIND_LABELS_HE,
  TASKS,
  computeCognitiveMastery,
  computeRegroupingDomain,
  computeRegroupingSplit,
  diagnosticTaskLabelHe,
  isRegroupingBelow,
} from '@/core/QMatrix';

/**
 * החלטת בעל המוצר 26.9.2026, על פי מסמך 03 (§"מפגש שתיים", מטרה פדגוגית):
 * מפגש 2 מאבחן שלושה תחומים — "המבנה העשרוני והאפס, הקבצה ופריטה, וחישוב
 * במאונך" — ובכל מקום שמוצגת תוצאה למשימה כתוב אם נמדדה הקבצה או פריטה.
 */
describe('the three diagnostic domains of document 03', () => {
  it('are named in document 03 words', () => {
    expect(DIAGNOSTIC_DOMAINS.map((d) => CONCEPT_LABELS_HE[d])).toEqual([
      'המבנה העשרוני והאפס',
      'הקבצה ופריטה',
      'חישוב במאונך',
    ]);
  });

  it('every one of the seven diagnostic tasks maps onto these three and nothing else', () => {
    expect(TASKS).toHaveLength(7);
    for (const t of TASKS) {
      const concepts = Q_MATRIX_MAPPING[t.id];
      expect(concepts, `${t.id} has no mapping`).toBeDefined();
      expect(concepts.length).toBeGreaterThan(0);
      for (const c of concepts) expect(DIAGNOSTIC_DOMAINS).toContain(c);
    }
  });

  it('task by task: reading with zero, digit value and decomposition are decimal structure; vertical exercises are procedural', () => {
    expect(Q_MATRIX_MAPPING.task1_read_write_zero).toEqual(['decimal_structure']);
    expect(Q_MATRIX_MAPPING.task2_digit_value).toEqual(['decimal_structure']);
    expect(Q_MATRIX_MAPPING.task4_decompose_number).toEqual(['decimal_structure']);
    expect(Q_MATRIX_MAPPING.task3_subtraction_regrouping).toContain('procedural_fluency');
    expect(Q_MATRIX_MAPPING.task6_vertical_addition).toContain('procedural_fluency');
    expect(Q_MATRIX_MAPPING.task7_subtraction_zero_tens).toContain('procedural_fluency');
    expect(Q_MATRIX_MAPPING.task7_subtraction_zero_tens).toContain('decimal_structure');
  });

  it('"הקבצה ופריטה" is measured by exactly the tasks that have a kind, so the split covers the whole domain', () => {
    const regroupingTasks = TASKS.filter((t) => Q_MATRIX_MAPPING[t.id].includes('regrouping_fluency')).map((t) => t.id).sort();
    expect(regroupingTasks).toEqual(Object.keys(REGROUPING_KIND_BY_TASK).sort());
  });
});

describe('הקבצה and פריטה are counted separately', () => {
  it('units→tens (5) and addition with a carry (6) are הקבצה; subtraction with regrouping (3, 7) is פריטה', () => {
    expect(REGROUPING_KIND_BY_TASK).toEqual({
      task3_subtraction_regrouping: 'decomposition',
      task5_units_to_tens: 'grouping',
      task6_vertical_addition: 'grouping',
      task7_subtraction_zero_tens: 'decomposition',
    });
    expect(REGROUPING_KIND_LABELS_HE).toEqual({ grouping: 'הקבצה', decomposition: 'פריטה' });
  });

  it('the teacher-facing task label says which of the two was measured', () => {
    const byId = Object.fromEntries(TASKS.map((t) => [t.id, t]));
    expect(diagnosticTaskLabelHe(byId.task5_units_to_tens)).toBe('המרה עצמאית בין עזרים וירטואליים (הקבצה)');
    expect(diagnosticTaskLabelHe(byId.task6_vertical_addition)).toBe('חיבור במאונך עם המרה מעל מאה (הקבצה)');
    expect(diagnosticTaskLabelHe(byId.task3_subtraction_regrouping)).toBe('חיסור חד-שלבי עם פריטה בתחום המאה (פריטה)');
    expect(diagnosticTaskLabelHe(byId.task7_subtraction_zero_tens)).toBe('חיסור במאונך עם פריטה אחת, כשבמחוסר יש 0 בטור העשרות (פריטה)');
    // Tasks that measure neither keep their plain title.
    expect(diagnosticTaskLabelHe(byId.task1_read_write_zero)).toBe(byId.task1_read_write_zero.titleHe);
    expect(diagnosticTaskLabelHe(byId.task4_decompose_number)).toBe(byId.task4_decompose_number.titleHe);
  });

  it('a learner who groups well but cannot decompose is not averaged into one number silently', () => {
    const results = {
      task3_subtraction_regrouping: 'fail',
      task5_units_to_tens: 'success',
      task6_vertical_addition: 'success',
      task7_subtraction_zero_tens: 'fail',
    };
    // The combined profile number says 50% ...
    expect(computeCognitiveMastery(results).regrouping_fluency).toBe(0.5);
    // ... and the split says what that 50% is made of.
    expect(computeRegroupingSplit(results)).toEqual({
      grouping: { attempted: 2, succeeded: 2, ratio: 1 },
      decomposition: { attempted: 2, succeeded: 0, ratio: 0 },
    });
  });

  it('a kind whose tasks were never attempted is null, not 100%', () => {
    const split = computeRegroupingSplit({ task5_units_to_tens: 'success' });
    expect(split.grouping).toEqual({ attempted: 1, succeeded: 1, ratio: 1 });
    expect(split.decomposition).toEqual({ attempted: 0, succeeded: 0, ratio: null });
    expect(computeRegroupingSplit(undefined).grouping.ratio).toBeNull();
  });

  it('legacy alias rows carry exactly what their canonical task carries', () => {
    for (const [canonical, alias] of Object.entries(Q_LEGACY_TASK_ALIASES)) {
      expect(Q_MATRIX_MAPPING[alias], `${alias} differs from ${canonical}`).toEqual(Q_MATRIX_MAPPING[canonical]);
    }
    for (const concepts of Object.values(Q_MATRIX_MAPPING)) {
      for (const c of concepts) expect(DIAGNOSTIC_DOMAINS).toContain(c);
    }
  });

  it('the dashboard domain number is computed from the live results when they exist, from the stored profile only without them', () => {
    const results = {
      task3_subtraction_regrouping: 'fail',
      task5_units_to_tens: 'success',
      task6_vertical_addition: 'success',
      task7_subtraction_zero_tens: 'fail',
    };
    const live = computeRegroupingDomain(results, 0.9);
    expect(live.source).toBe('live');
    expect(live.combined).toBe(0.5);
    const stored = computeRegroupingDomain({}, 0.3);
    expect(stored).toMatchObject({ source: 'stored', combined: 0.3 });
    expect(computeRegroupingDomain(undefined, undefined)).toMatchObject({ source: 'none', combined: null });
  });

  it('no mixing: either part below the threshold puts the learner below it', () => {
    const groupsOnly = computeRegroupingDomain({
      task3_subtraction_regrouping: 'fail',
      task5_units_to_tens: 'success',
      task6_vertical_addition: 'success',
      task7_subtraction_zero_tens: 'fail',
    });
    expect(groupsOnly.combined).toBe(0.5);
    expect(isRegroupingBelow(groupsOnly, 0.5)).toBe(true); // פריטה 0/2
    expect(isRegroupingBelow(groupsOnly, 0.8)).toBe(true);
    const allSolved = computeRegroupingDomain({
      task3_subtraction_regrouping: 'success',
      task5_units_to_tens: 'success',
      task6_vertical_addition: 'success',
      task7_subtraction_zero_tens: 'success',
    });
    expect(isRegroupingBelow(allSolved, 0.8)).toBe(false);
    // An unattempted part is unknown, not a failure; a missing domain is not "below".
    expect(isRegroupingBelow(computeRegroupingDomain({ task5_units_to_tens: 'success' }), 0.5)).toBe(false);
    expect(isRegroupingBelow(computeRegroupingDomain(undefined, undefined), 0.5)).toBe(false);
    expect(isRegroupingBelow(computeRegroupingDomain(undefined, 0.2), 0.5)).toBe(true);
  });

  it('reads legacy task ids through the same alias table as the rest of the diagnostic', () => {
    const split = computeRegroupingSplit({ task6_subtraction_regrouping: 'success' });
    // task6_subtraction_regrouping is the legacy alias of task3_subtraction_regrouping (פריטה).
    expect(split.decomposition.attempted).toBe(1);
    expect(split.decomposition.succeeded).toBe(1);
  });
});
