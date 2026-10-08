// @vitest-environment jsdom
/**
 * PRD Module 14 §ב (v7.9): "בתרגילי חיבור וחיסור במאונך, במפגש 2 (משימות 3, 6
 * ו-7) ובכל המפגשים, סדר העבודה הוא מהיחידות שמאלה, אבל אחרי שהוקלדה ספרה
 * המיקוד אינו עובר אוטומטית לטור הבא: הלומד עובר בעצמו לטור הבא, כך שיש לו
 * זמן לרשום את ההמרה או את הפריטה בעיגול הזיכרון."
 *
 * Tasks 4 and 5 of meeting 2 (PlaceValueInputBoxes) keep their move to the
 * right; that is covered by Meeting2_PerSpec_OwnerDecisions.test.tsx.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

vi.mock('@/presentation/design-system/UdlSpeechButton', () => ({ UdlSpeechButton: () => null }));

import { VerticalAdditionTask } from '@/features/workspace/tasks/VerticalAdditionTask';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';

function resultRow(props: { numberA: number; numberB: number; isSubtraction?: boolean; answerLength: number }) {
  const { container } = render(<VerticalAdditionTask {...props} />);
  return [...container.querySelectorAll('input')].filter((i) =>
    /בשורת התוצאה|בתשובה/.test(i.getAttribute('aria-label') ?? '')
  ) as HTMLInputElement[];
}

describe('Module 14 §ב — a digit in a vertical exercise does not move the focus to the next column', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { uid: 'student_user4', student_id: 4 } as never, role: 'student', isAuthenticated: true });
    useWorkspaceStore.getState().resetWorkspace();
  });
  afterEach(() => cleanup());

  for (const sessionNumber of [2, 4]) {
    it(`addition, meeting ${sessionNumber}: the focus stays in the units box after its digit`, () => {
      useWorkspaceStore.setState({ sessionNumber } as never);
      const boxes = resultRow({ numberA: 85, numberB: 17, answerLength: 3 });
      const units = boxes[boxes.length - 1];
      units.focus();
      fireEvent.change(units, { target: { value: '2' } });
      expect(document.activeElement).toBe(units);
      expect(units.value).toBe('2');

      // The learner moves on by himself, and the next digit stays there too.
      const tens = boxes[boxes.length - 2];
      tens.focus();
      fireEvent.change(tens, { target: { value: '0' } });
      expect(document.activeElement).toBe(tens);
    });

    it(`subtraction, meeting ${sessionNumber}: the focus stays in the units box after its digit`, () => {
      useWorkspaceStore.setState({ sessionNumber } as never);
      const boxes = resultRow({ numberA: 61, numberB: 24, isSubtraction: true, answerLength: 2 });
      const units = boxes[boxes.length - 1];
      units.focus();
      fireEvent.change(units, { target: { value: '7' } });
      expect(document.activeElement).toBe(units);
    });
  }
});
