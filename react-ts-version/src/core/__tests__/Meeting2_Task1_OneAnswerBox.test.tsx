/**
 * @vitest-environment jsdom
 */
/**
 * Owner's decision, 4.10.2026 (final): meeting 2, task 1 ("שש מאות וחמש" →
 * 605) has ONE free answer box for every learner — regular and enhanced
 * support alike — exactly like task 2: no headings, no colours, no box per
 * digit, at least four digits typeable without a hint of the length, judged
 * at the press on the whole number. Three boxes prevented the two errors the
 * task is there to catch (65, 6005). Meeting 1 and tasks 2–7 are unchanged.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';

vi.mock('@/presentation/design-system/UdlSpeechButton', () => ({
  UdlSpeechButton: ({ text }: { text: string }) => <span data-testid="speech" data-text={text} />,
}));

import { TASKS, hasOneDiagnosticAnswerBox } from '@/core/QMatrix';
import { initQFlow, type QMatrixFlowState } from '@/core/qmatrixFlow';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { ENHANCED_SUPPORT_PROFILE_ID } from '@/core/supportProfile';
import { NEUTRAL_BOX_BORDER } from '@/features/workspace/placeColors';

const ws = () => useWorkspaceStore.getState();
const T1 = 'task1_read_write_zero';

function atTask(id: string, phase: QMatrixFlowState['phase'] = 'primary', subphase: QMatrixFlowState['subphase'] = 'subtask') {
  const taskIdx = TASKS.findIndex((t) => t.id === id);
  useWorkspaceStore.setState({ qflow: { ...initQFlow(), taskIdx, phase, subphase, failedTasks: phase === 'correction' ? [id] : [] } });
}
const setProfile = (enhanced: boolean) =>
  useWorkspaceStore.setState({ activeSupportProfileId: enhanced ? ENHANCED_SUPPORT_PROFILE_ID : null });

import { TaskCard } from '@/features/workspace/tasks/TaskCard';

async function renderCard() {
  return render(<TaskCard />);
}

/** The one box, by the name it is read with. */
const theBox = () => screen.getByRole('textbox', { name: 'התשובה' }) as HTMLInputElement;

function expectOneNeutralBox(container: HTMLElement) {
  const boxes = screen.getAllByRole('textbox') as HTMLInputElement[];
  expect(boxes).toHaveLength(1);
  expect(boxes[0]).toBe(theBox());
  expect(screen.queryByTestId('pv-result-row')).toBeNull();
  expect(container.querySelectorAll('[id^="pv-label-"]').length).toBe(0);
  expect(boxes[0].style.borderColor).toBe(NEUTRAL_BOX_BORDER);
  // no length hint: no maxLength, and the placeholder is task 2's "?"
  expect(boxes[0].maxLength).toBe(-1);
  expect(boxes[0].getAttribute('placeholder')).toBe('?');
  // no heading over the box (task 2's "ערך הספרה:" asks about a marked digit)
  expect(container.textContent).not.toMatch(/ערך הספרה|מאות:|עשרות:|יחידות:/);
  expect(container.querySelector('[data-place]')).toBeNull();
}

beforeEach(() => {
  useAuthStore.setState({ user: { uid: 'student_user12', student_id: 12 } as never, role: 'student', isAuthenticated: true });
  ws().resetWorkspace();
  ws().initSession(2, false);
  setProfile(false);
});
afterEach(cleanup);

describe('task 1: one free answer box for every learner', () => {
  it('the form follows the task id, not the published type', () => {
    expect(hasOneDiagnosticAnswerBox({ id: T1, type: 'place_value_zero' })).toBe(true);
    expect(hasOneDiagnosticAnswerBox({ id: 'task4_decompose_number', type: 'number_breakdown' })).toBe(false);
  });

  for (const enhanced of [false, true]) {
    it(`${enhanced ? 'enhanced' : 'regular'} profile: one neutral box, no headings, no colours`, async () => {
      setProfile(enhanced);
      atTask(T1);
      const { container } = await renderCard();
      expectOneNeutralBox(container);
      expect(container.textContent).toContain('שש מאות וחמש');
      expect(document.activeElement).toBe(theBox());
    });
  }

  it('the enhanced toggle changes nothing on task 1', async () => {
    atTask(T1);
    const { container } = await renderCard();
    const before = container.innerHTML;
    act(() => setProfile(true));
    expect(container.innerHTML).toBe(before);
  });

  for (const typed of ['65', '605', '6005']) {
    it(`${typed} can be typed in full and is held as typed`, async () => {
      atTask(T1);
      await renderCard();
      for (let i = 1; i <= typed.length; i++) fireEvent.change(theBox(), { target: { value: typed.slice(0, i) } });
      expect(theBox().value).toBe(typed);
      expect(ws().probeAnswer).toBe(typed);
      // no per-digit penalty before the press
      expect(ws().hasDigitErrorInTask).toBe(false);
      expect(ws().typedErrorCount).toBe(0);
    });
  }

  it('the correction round shows task 1 in the same one-box form', async () => {
    atTask(T1, 'correction', 'retry');
    const { container } = await renderCard();
    expectOneNeutralBox(container);
  });

  it('a restore mid-task keeps the typed text in the box', async () => {
    atTask(T1);
    await renderCard();
    fireEvent.change(theBox(), { target: { value: '6005' } });
    const saved = JSON.parse(JSON.stringify({ ...ws(), qflow: ws().qflow }));
    cleanup();
    ws().resetWorkspace();
    ws().initSession(2, false);
    ws().restoreSession({ ...saved, sessionNumber: 2 });
    await renderCard();
    expect(ws().probeAnswer).toBe('6005');
    expect(theBox().value).toBe('6005');
  });
});

describe('unchanged: task 2 and task 4 keep their forms', () => {
  it('task 2 keeps its heading "ערך הספרה:"', async () => {
    atTask('task2_digit_value');
    await renderCard();
    expect(screen.getByLabelText('ערך הספרה:')).toBeTruthy();
  });

  it('task 4 keeps three boxes', async () => {
    atTask('task4_decompose_number');
    await renderCard();
    expect(screen.getByTestId('pv-result-row').querySelectorAll('input')).toHaveLength(3);
  });
});
