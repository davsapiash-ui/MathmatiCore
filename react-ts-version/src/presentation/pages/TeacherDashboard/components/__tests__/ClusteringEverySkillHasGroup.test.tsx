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

import { ClusteringWidgets, CLUSTER_WIDGETS } from '../ClusteringWidgets';
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

describe('three domains, in document 03 words', () => {
  it('exactly the three diagnostic domains, in the order document 03 names them', () => {
    expect(CLUSTER_WIDGETS.map((w) => w.key)).toEqual([...DIAGNOSTIC_DOMAINS]);
    expect(CLUSTER_WIDGETS.map((w) => w.label)).toEqual(['המבנה העשרוני והאפס', 'הקבצה ופריטה', 'חישוב במאונך']);
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
    it(`${key}: a card that the filter shows, listing its group with that domain's mastery`, () => {
      const open = `(!activeClusterFilter || activeClusterFilter === '${key}') && (`;
      const at = dashboard.indexOf(open);
      expect(at, `no group card for ${key}`).toBeGreaterThan(-1);
      const card = dashboard.slice(at, dashboard.indexOf('</AccessibleCard>', at));
      expect(card).toContain(`{CONCEPT_LABELS_HE.${key}}`);
      expect(card).toMatch(/data=\{\w+Group\.map\(/);
      expect(card).toContain(`s.conceptMastery.${key} * 100`);
      // The group the card lists is the learners below 0.5 in that same domain.
      const group = /data=\{(\w+Group)\.map\(/.exec(card)![1];
      expect(dashboard).toMatch(new RegExp(`const ${group} = allStudents\\.filter\\(\\s*\\(s\\) => s\\.conceptMastery && s\\.conceptMastery\\.${key} < 0\\.5`));
    });
  }

  it('the class chart shows the same three domains', () => {
    expect(dashboard).toContain('DIAGNOSTIC_DOMAINS.map((domain) => ({ name: CONCEPT_LABELS_HE[domain]');
  });
});

describe('הקבצה ופריטה are never merged into one number without their parts', () => {
  it('the regrouping card shows a הקבצה column and a פריטה column beside the combined mastery', () => {
    const open = "(!activeClusterFilter || activeClusterFilter === 'regrouping_fluency') && (";
    const at = dashboard.indexOf(open);
    const card = dashboard.slice(at, dashboard.indexOf('</AccessibleCard>', at));
    expect(card).toContain('{ key: "mastery", header: "רמת שליטה" }');
    expect(card).toContain('{ key: "grouping", header: REGROUPING_KIND_LABELS_HE.grouping }');
    expect(card).toContain('{ key: "decomposition", header: REGROUPING_KIND_LABELS_HE.decomposition }');
    expect(card).toContain('computeRegroupingSplit(s.qMatrixResults');
    expect(card).toContain('grouping: regroupingKindCell(split.grouping)');
    expect(card).toContain('decomposition: regroupingKindCell(split.decomposition)');
  });

  it('the per-task report list and the gate list name the task with (הקבצה)/(פריטה)', () => {
    expect(dashboard).toContain('{diagnosticTaskLabelHe(task)}');
    expect(dashboard).toContain(').map(diagnosticTaskLabelHe);');
    expect(dashboard).not.toMatch(/\{task\.titleHe\}/);
    expect(dashboard).not.toContain('.map((t) => t.titleHe)');
  });
});

describe('the filter itself', () => {
  const mastery = (overrides: Partial<Record<CognitiveConcept, number>>) => ({
    decimal_structure: 1, number_magnitude: 1, regrouping_fluency: 1,
    procedural_fluency: 1, relational_thinking: 1, algebraic_reasoning: 1, ...overrides,
  });

  it('a learner struggling in הקבצה ופריטה shows the widget, and clicking it selects that group', () => {
    const onFilterChange = vi.fn();
    render(
      <ClusteringWidgets
        students={[{ studentId: 'student_user3', name: 'תלמיד 3', conceptMastery: mastery({ regrouping_fluency: 0.3 }) } as any]}
        activeFilter={null}
        onFilterChange={onFilterChange}
      />
    );
    const button = screen.getByRole('button', { name: new RegExp(CONCEPT_LABELS_HE.regrouping_fluency) });
    expect(button.textContent).toContain('מתקשים בהקבצה ופריטה');
    fireEvent.click(button);
    expect(onFilterChange).toHaveBeenCalledWith('regrouping_fluency');
  });

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
