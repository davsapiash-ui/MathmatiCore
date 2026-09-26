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
import { CONCEPT_LABELS_HE, type CognitiveConcept } from '@/core/QMatrix';

/**
 * מסמך 04, "מיפוי מיומנויות כיתתי": "לכל אחת משש מיומנויות הליבה מוצג מספר
 * הלומדים המתקשים בה, ולחיצה על מיומנות מציגה את קבוצת הלומדים שלה ואת רמת
 * השליטה של כל אחד".
 *
 * ביקורת 26.9.2026 (מרשם שורה 18, ממצא 5): שש מיומנויות הוצגו כמסננים אבל
 * היו רק חמש טבלאות קבוצה. לחיצה על "תחושת גודל המספר" (number_magnitude)
 * הסתירה את כל הכרטיסים ולא הציגה דבר.
 */

const dashboard = readFileSync(resolve(__dirname, '../../../TeacherDashboard.tsx'), 'utf-8');

afterEach(cleanup);

describe('every skill filter has a group card', () => {
  it('six skills — the six of the mastery profile', () => {
    expect(CLUSTER_WIDGETS.map((w) => w.key).sort()).toEqual(Object.keys(CONCEPT_LABELS_HE).sort());
    expect(CLUSTER_WIDGETS).toHaveLength(6);
  });

  for (const { key } of CLUSTER_WIDGETS) {
    it(`${key}: a card that the filter shows, listing its group with that skill's mastery`, () => {
      const open = `(!activeClusterFilter || activeClusterFilter === '${key}') && (`;
      const at = dashboard.indexOf(open);
      expect(at, `no group card for ${key}`).toBeGreaterThan(-1);
      const card = dashboard.slice(at, dashboard.indexOf('</AccessibleCard>', at));
      expect(card).toMatch(/data=\{\w+Group\.map\(/);
      expect(card).toContain(`s.conceptMastery.${key} * 100`);
      // The group the card lists is the learners below 0.5 in that same skill.
      const group = /data=\{(\w+Group)\.map\(/.exec(card)![1];
      expect(dashboard).toMatch(new RegExp(`const ${group} = allStudents\\.filter\\(\\s*\\(s\\) => s\\.conceptMastery && s\\.conceptMastery\\.${key} < 0\\.5`));
    });
  }

  it('number_magnitude is no longer computed and thrown away', () => {
    expect(dashboard).not.toContain('_numberMagnitudeGroup');
  });
});

describe('the filter itself', () => {
  it('a learner struggling in number magnitude shows the widget, and clicking it selects that group', () => {
    const onFilterChange = vi.fn();
    const mastery = (overrides: Partial<Record<CognitiveConcept, number>>) => ({
      decimal_structure: 1, number_magnitude: 1, regrouping_fluency: 1,
      procedural_fluency: 1, relational_thinking: 1, algebraic_reasoning: 1, ...overrides,
    });
    render(
      <ClusteringWidgets
        students={[{ studentId: 'student_user3', name: 'תלמיד 3', conceptMastery: mastery({ number_magnitude: 0.3 }) } as any]}
        activeFilter={null}
        onFilterChange={onFilterChange}
      />
    );
    const button = screen.getByRole('button', { name: new RegExp(CONCEPT_LABELS_HE.number_magnitude) });
    fireEvent.click(button);
    expect(onFilterChange).toHaveBeenCalledWith('number_magnitude');
  });
});
