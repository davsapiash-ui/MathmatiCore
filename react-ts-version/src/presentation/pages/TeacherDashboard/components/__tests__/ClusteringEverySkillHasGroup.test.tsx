/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';

// ClusteringWidgets imports only a type from the store; without this the import
// still loads the store, which starts the Firebase sync (and an anonymous sign-in).
vi.mock('@/application/useStore', () => ({}));

import { ClusteringWidgets, CLUSTER_WIDGETS, isStudentBelow } from '../ClusteringWidgets';
import { CONCEPT_LABELS_HE, DIAGNOSTIC_DOMAINS, type CognitiveConcept } from '@/core/QMatrix';

/**
 * מסמך 03, "מפגש שתיים", מטרה פדגוגית: "מיפוי ... של המבנה העשרוני והאפס,
 * הקבצה ופריטה, וחישוב במאונך". החלטת בעל המוצר 26.9.2026: מסך "מיפוי
 * מיומנויות כיתתי" מציג את שלושת התחומים האלה בלבד — לא את שש המיומנויות
 * שסוכן המציא ב-8.7.2026, ששלוש מהן לא נמדדו על ידי אף משימה והוצגו תמיד
 * כשליטה מלאה.
 *
 * כל תחום הוא מסנן, ולכל מסנן חייב להיות כרטיס קבוצה בדשבורד (ביקורת
 * 26.9.2026: מסנן בלי כרטיס הסתיר את כל הכרטיסים).
 */

const dashboard = readFileSync(resolve(__dirname, '../../../TeacherDashboard.tsx'), 'utf-8');

afterEach(cleanup);

const mastery = (overrides: Partial<Record<CognitiveConcept, number>>) => ({
  decimal_structure: 1, number_magnitude: 1, regrouping_fluency: 1,
  procedural_fluency: 1, relational_thinking: 1, algebraic_reasoning: 1, ...overrides,
});

describe('three domains, in document 03 words', () => {
  it('exactly the three diagnostic domains, in the order document 03 names them', () => {
    expect(CLUSTER_WIDGETS.map((w) => w.key)).toEqual([...DIAGNOSTIC_DOMAINS]);
    expect(CLUSTER_WIDGETS.map((w) => w.label)).toEqual(['המבנה העשרוני והאפס', 'הקבצה ופריטה', 'חישוב במאונך']);
    expect(CLUSTER_WIDGETS.map((w) => w.strugglingLabel)).toEqual([
      'מתקשים במבנה העשרוני והאפס',
      'מתקשים בהקבצה ובפריטה',
      'מתקשים בחישוב במאונך',
    ]);
  });

  it('the three unmeasured skills are not on the teacher screen', () => {
    for (const gone of ['number_magnitude', 'relational_thinking', 'algebraic_reasoning']) {
      expect(dashboard, `${gone} still appears in TeacherDashboard.tsx`).not.toContain(gone);
      expect(CLUSTER_WIDGETS.map((w) => w.key as string)).not.toContain(gone);
    }
    expect(dashboard).not.toContain('תחושת גודל המספר');
    expect(dashboard).not.toContain('חשיבה יחסית');
    expect(dashboard).not.toContain('חשיבה אלגברית');
  });

  for (const { key } of CLUSTER_WIDGETS) {
    it(`${key}: a card that the filter shows, listing its group`, () => {
      const open = `(!activeClusterFilter || activeClusterFilter === '${key}') && (`;
      const at = dashboard.indexOf(open);
      expect(at, `no group card for ${key}`).toBeGreaterThan(-1);
      const card = dashboard.slice(at, dashboard.indexOf('</AccessibleCard>', at));
      expect(card).toContain(`{CONCEPT_LABELS_HE.${key}}`);
      expect(card).toMatch(/data=\{\w+Group\.map\(/);
      const group = /data=\{(\w+Group)\.map\(/.exec(card)![1];
      if (key === 'regrouping_fluency') {
        // The group is decided by the shared no-mixing rule, not by the merged number alone.
        expect(dashboard).toMatch(new RegExp(`const ${group} = allStudents\\.filter\\(\\s*\\(s\\) => s\\.conceptMastery && isStudentBelow\\(s, 'regrouping_fluency', 0\\.5\\)`));
        expect(card).toContain('regroupingOf(s)');
        expect(card).not.toContain('s.conceptMastery.regrouping_fluency');
      } else {
        expect(card).toContain(`s.conceptMastery.${key} * 100`);
        expect(dashboard).toMatch(new RegExp(`const ${group} = allStudents\\.filter\\(\\s*\\(s\\) => s\\.conceptMastery && s\\.conceptMastery\\.${key} < 0\\.5`));
      }
    });
  }

  it('the class chart shows the same three domains with the same rule as the widget and the cards', () => {
    expect(dashboard).toContain('DIAGNOSTIC_DOMAINS.map((domain) => ({ name: CONCEPT_LABELS_HE[domain]');
    expect(dashboard).toContain('if (isStudentBelow(s, domain, 0.8)) counts[i].struggle++; else counts[i].success++;');
  });
});

describe('הקבצה ופריטה are never merged into one number without their parts', () => {
  it('the regrouping card shows a הקבצה column and a פריטה column beside the combined mastery, all from the live results', () => {
    const open = "(!activeClusterFilter || activeClusterFilter === 'regrouping_fluency') && (";
    const at = dashboard.indexOf(open);
    const card = dashboard.slice(at, dashboard.indexOf('</AccessibleCard>', at));
    expect(card).toContain('{ key: "mastery", header: "רמת שליטה" }');
    expect(card).toContain('{ key: "grouping", header: REGROUPING_KIND_LABELS_HE.grouping }');
    expect(card).toContain('{ key: "decomposition", header: REGROUPING_KIND_LABELS_HE.decomposition }');
    expect(card).toContain('mastery: view.combined === null ? "חסר מידע" : `${Math.round(view.combined * 100)}%`');
    expect(card).toContain('grouping: regroupingKindCell(view.split.grouping)');
    expect(card).toContain('decomposition: regroupingKindCell(view.split.decomposition)');
    // regroupingOf reads the live task results and falls back to the stored profile only without them.
    expect(dashboard).toMatch(/const regroupingOf = \(s: StudentData\) =>\s*computeRegroupingDomain\(\s*s\.qMatrixResults as Record<string, unknown> \| undefined,\s*s\.conceptMastery\?\.regrouping_fluency\s*\)/);
  });

  it('the per-task report list and the gate list name the task with (הקבצה)/(פריטה)', () => {
    expect(dashboard).toContain('{diagnosticTaskLabelHe(task)}');
    expect(dashboard).toContain(').map(diagnosticTaskLabelHe);');
    expect(dashboard).not.toMatch(/\{task\.titleHe\}/);
    expect(dashboard).not.toContain('.map((t) => t.titleHe)');
  });
});

describe('no mixing: a learner who groups but cannot decompose is in the group', () => {
  // הקבצה 2/2, פריטה 0/2 → merged 0.5, which `< 0.5` alone would hide.
  const groupsButCannotDecompose = {
    studentId: 'student_user5',
    name: 'תלמיד 5',
    conceptMastery: mastery({ regrouping_fluency: 0.5 }),
    qMatrixResults: {
      task3_subtraction_regrouping: 'fail',
      task5_units_to_tens: 'success',
      task6_vertical_addition: 'success',
      task7_subtraction_zero_tens: 'fail',
    },
  } as any;

  it('isStudentBelow puts them below 0.5 in הקבצה ופריטה', () => {
    expect(isStudentBelow(groupsButCannotDecompose, 'regrouping_fluency', 0.5)).toBe(true);
    expect(isStudentBelow(groupsButCannotDecompose, 'decimal_structure', 0.5)).toBe(false);
  });

  it('the widget counts them and clicking it selects the group', () => {
    const onFilterChange = vi.fn();
    render(
      <ClusteringWidgets
        students={[groupsButCannotDecompose]}
        activeFilter={null}
        onFilterChange={onFilterChange}
      />
    );
    const button = screen.getByRole('button', { name: /מתקשים בהקבצה ובפריטה/ });
    expect(button.textContent).toContain('1');
    fireEvent.click(button);
    expect(onFilterChange).toHaveBeenCalledWith('regrouping_fluency');
  });

  it('a stored profile that disagrees with the live results does not decide: the results do', () => {
    // Stored 0.9 (a profile computed before 26.9.2026, over task 4 too) but the live
    // results say פריטה 0/2 — the learner is counted.
    const stale = { ...groupsButCannotDecompose, conceptMastery: mastery({ regrouping_fluency: 0.9 }) };
    expect(isStudentBelow(stale, 'regrouping_fluency', 0.5)).toBe(true);
    // And the other way: stored 0.2 but every regrouping task solved — not counted.
    const solvedAll = {
      ...groupsButCannotDecompose,
      conceptMastery: mastery({ regrouping_fluency: 0.2 }),
      qMatrixResults: {
        task3_subtraction_regrouping: 'success',
        task5_units_to_tens: 'success',
        task6_vertical_addition: 'success',
        task7_subtraction_zero_tens: 'success',
      },
    };
    expect(isStudentBelow(solvedAll, 'regrouping_fluency', 0.5)).toBe(false);
  });

  it('without task results the stored profile is the fallback', () => {
    const storedOnly = { studentId: 'student_user6', name: 'תלמיד 6', conceptMastery: mastery({ regrouping_fluency: 0.3 }), qMatrixResults: {} } as any;
    expect(isStudentBelow(storedOnly, 'regrouping_fluency', 0.5)).toBe(true);
  });
});

describe('the filter itself', () => {
  it('a learner low only in an unmeasured skill shows no widget at all', () => {
    render(
      <ClusteringWidgets
        students={[{ studentId: 'student_user4', name: 'תלמיד 4', conceptMastery: mastery({ number_magnitude: 0.1, algebraic_reasoning: 0.1 }) } as any]}
        activeFilter={null}
        onFilterChange={vi.fn()}
      />
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
