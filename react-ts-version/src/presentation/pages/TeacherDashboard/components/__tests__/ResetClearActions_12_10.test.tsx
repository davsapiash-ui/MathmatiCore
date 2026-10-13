/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { ResetConfirmationModal, CLEAR_ACTIONS_LABEL_HE } from '../ResetConfirmationModal';
import { withResetSeparators, resetsOfMeeting, resetSeparatorHe, ACTIONS_CLEARED_NOTE_HE } from '@/infrastructure/services/LearnerJourneyService';

// PRD 23א §ב.2 (owner, 12.10.2026): "לנקות גם את רשימת הפעולות", one learner
// only, unticked by default; the cleared actions are kept only in the backup.

afterEach(cleanup);
const executeButton = () => screen.getByRole('button', { name: /בצעו איפוס מבוקר/ }) as HTMLButtonElement;
const chooseReason = (value: string) => fireEvent.change(screen.getByLabelText('סיבת האיפוס (שדה חובה):'), { target: { value } });

describe('the reset dialog of one learner', () => {
  it('offers the tick unticked, and sends it only when ticked', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<ResetConfirmationModal isOpen onClose={() => {}} resetLevel="single_student" targetStudentId="student_user3" targetStudentName="תלמיד 3" activeSessionNumber={4} onConfirm={onConfirm} />);
    const box = screen.getByLabelText(new RegExp(CLEAR_ACTIONS_LABEL_HE)) as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect(screen.getByText(/תימחק מהמערכת ותישמר רק בגיבוי/)).toBeTruthy();
    chooseReason('student_stuck');
    await act(async () => { fireEvent.click(executeButton()); });
    expect(onConfirm).toHaveBeenCalledWith('student_stuck', undefined, { scope: 'active_session', sessionNumber: 4, clearActions: true });
  });

  it('is not offered for the whole class', () => {
    render(<ResetConfirmationModal isOpen onClose={() => {}} resetLevel="single_student" resetTarget="class" activeSessionNumber={4} onConfirm={vi.fn()} />);
    expect(screen.queryByLabelText(new RegExp(CLEAR_ACTIONS_LABEL_HE))).toBeNull();
  });
});

describe('the journey after a reset that cleared the actions', () => {
  const entries = [{
    reset_id: 'r1', reset_level: 'single_student', reset_scope: 'active_session', session_number: 3,
    affected_student_ids: [4], performed_at: 1000, deletion_status: 'completed', actions_cleared: true,
  }];

  it('shows the reset even with no action before it, and says where the actions are', () => {
    const resets = resetsOfMeeting(entries, 4, 3);
    expect(resets[0]).toMatchObject({ actionsCleared: true, resetId: 'r1' });
    const rows = withResetSeparators([], resets);
    expect(rows).toHaveLength(1);
    expect(resetSeparatorHe(resets[0])).toContain(ACTIONS_CLEARED_NOTE_HE);
  });
});
