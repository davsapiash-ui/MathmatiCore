/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';

vi.mock('@/presentation/design-system/UdlSpeechButton', () => ({
  UdlSpeechButton: ({ text }: { text: string }) => <span data-testid="speech" data-text={text} />,
}));

import { TaskCard } from '@/features/workspace/tasks/TaskCard';
import { useWorkspaceStore, selectCanProceed, judgeStandardTask } from '@/application/useWorkspaceStore';
import { getSessionTasks } from '@/data/sessionTasks';
import { approvePath } from '@/test/approvedPath';
import { EMPTY_COUNTS } from '@/core/placeValue';

/**
 * Owner, 9.10.2026: in a subtraction of stations 3–7 the child may leave the
 * hundreds box empty when the answer is shorter than the row. 204 − 112 = 92
 * written "92" in three boxes: "ממשיכים" accepts it, and the writing step's
 * tick and the done box come with it, at the same render.
 */

const ws = () => useWorkspaceStore.getState();

beforeEach(() => {
  ws().resetWorkspace();
  approvePath('remediation_path');
  const tasks = getSessionTasks(6, 'remediation_path');
  ws().initSession(6, false, tasks.findIndex((t) => t.id === 's6_r_t3'));
});
afterEach(cleanup);

describe('204 − 112 = 92 written "_92" (station 6)', () => {
  it('the done box appears, and "ממשיכים" is lit', () => {
    const task = getSessionTasks(6, 'remediation_path').find((t) => t.id === 's6_r_t3')!;
    expect([task.numberA, task.numberB]).toEqual([204, 112]);
    useWorkspaceStore.setState({
      counts: { ...EMPTY_COUNTS, tens: 9, units: 2 }, // 204 built, 112 taken away
      takeAwayTrack: { taskId: 's6_r_t3', held: true, started: true },
      answerDigits: { tens: '9', units: '2' },
      hasInteracted: true,
    });
    expect(selectCanProceed(ws())).toBe(true);
    expect(judgeStandardTask(ws(), task).kind).toBe('success');
    render(<TaskCard />);
    expect(screen.getByTestId('session1-done')).toBeTruthy();
  });

  it('"9_2" leaves the done box out', () => {
    useWorkspaceStore.setState({
      counts: { ...EMPTY_COUNTS, tens: 9, units: 2 }, // 204 built, 112 taken away
      takeAwayTrack: { taskId: 's6_r_t3', held: true, started: true },
      answerDigits: { hundreds: '9', units: '2' },
      hasInteracted: true,
    });
    render(<TaskCard />);
    expect(screen.queryByTestId('session1-done')).toBeNull();
  });
});
