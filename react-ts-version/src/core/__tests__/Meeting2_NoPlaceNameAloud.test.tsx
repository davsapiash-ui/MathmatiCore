/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';

vi.mock('@/presentation/design-system/UdlSpeechButton', () => ({
  UdlSpeechButton: ({ text }: { text: string }) => <span data-testid="speech" data-text={text} />,
}));

import { TASKS } from '@/core/QMatrix';
import { initQFlow, type QMatrixFlowState } from '@/core/qmatrixFlow';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { ENHANCED_SUPPORT_PROFILE_ID } from '@/core/supportProfile';
import { PLACE_COLORS, NEUTRAL_BOX_BORDER } from '@/features/workspace/placeColors';

/**
 * Station 2 (owner, 29.9.2026, items 2, 3 and 12 of the station-2 review):
 *  - without the enhanced support profile the sighted child sees no column
 *    names or colours (owner, 27.9.2026), so a screen reader must not say them
 *    either: "ספרת העשרות בתשובה" told where each digit goes;
 *  - the frame of task 5's picture was the units column's colour;
 *  - task 1's "הפעם פתרו לבד." is said once, not again in the correction round.
 */
function atTask(id: string, phase: QMatrixFlowState['phase'] = 'primary', subphase: QMatrixFlowState['subphase'] = 'subtask') {
  const taskIdx = TASKS.findIndex((t) => t.id === id);
  useWorkspaceStore.setState({ qflow: { ...initQFlow(), taskIdx, phase, subphase, failedTasks: [id] } });
}
const setProfile = (enhanced: boolean) =>
  useWorkspaceStore.setState({ activeSupportProfileId: enhanced ? ENHANCED_SUPPORT_PROFILE_ID : null });
async function renderCard() {
  const { TaskCard } = await import('@/features/workspace/tasks/TaskCard');
  return render(<TaskCard />);
}
const PLACE_WORDS = /יחידות|עשרות|מאות|אלפים/;

beforeEach(() => {
  useAuthStore.setState({ user: { uid: 'student_user12', student_id: 12 } as never, role: 'student', isAuthenticated: true });
  useWorkspaceStore.getState().resetWorkspace();
  useWorkspaceStore.getState().initSession(2, false);
  setProfile(false);
});
afterEach(cleanup);

describe('meeting 2, vertical tasks: no column name read aloud without the profile', () => {
  for (const id of ['task3_subtraction_regrouping', 'task6_vertical_addition', 'task7_subtraction_zero_tens']) {
    it(id, async () => {
      atTask(id);
      await renderCard();
      const labels = [...document.querySelectorAll('input')].map((i) => i.getAttribute('aria-label') ?? '');
      expect(labels.length).toBeGreaterThan(0);
      for (const l of labels) expect(l).not.toMatch(PLACE_WORDS);
      expect(labels.some((l) => /^ספרה 1 מתוך \d בשורת התוצאה$/.test(l))).toBe(true);
      expect(labels.some((l) => /^עיגול זיכרון 1 מתוך \d$/.test(l))).toBe(true);
    });
  }

  it('with the enhanced profile the column names stay (as the boxes show them)', async () => {
    setProfile(true);
    atTask('task6_vertical_addition');
    await renderCard();
    expect(screen.getByLabelText('ספרת העשרות בתשובה')).toBeTruthy();
  });
});

describe('task 5: the picture frame carries no place colour without the profile', () => {
  it('neutral without, units colour with', async () => {
    atTask('task5_units_to_tens');
    const { unmount } = await renderCard();
    const frame = () => screen.getByTestId('unit-blocks-picture') as HTMLElement;
    expect(frame().style.borderColor).toContain(NEUTRAL_BOX_BORDER);
    unmount();
    setProfile(true);
    atTask('task5_units_to_tens');
    await renderCard();
    expect(frame().style.borderColor).toContain(PLACE_COLORS.units.border);
  });
});

describe('task 1: "הפעם פתרו לבד." only the first time', () => {
  it('primary round says it, the correction round does not', async () => {
    atTask('task1_read_write_zero', 'primary', 'subtask');
    const first = await renderCard();
    expect(first.container.textContent).toContain('הפעם פתרו לבד.');
    first.unmount();
    atTask('task1_read_write_zero', 'correction', 'retry');
    const again = await renderCard();
    expect(again.container.textContent).toContain('קראו את המספר וכתבו אותו בשורת התוצאה.');
    expect(again.container.textContent).not.toContain('הפעם פתרו לבד');
  });
});
