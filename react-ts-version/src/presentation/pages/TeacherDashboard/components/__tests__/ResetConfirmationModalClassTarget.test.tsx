/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, act, cleanup, screen } from '@testing-library/react';
import { ResetConfirmationModal } from '../ResetConfirmationModal';

/**
 * Register, deviation 20: level 2 has two targets. These tests click through the
 * real dialog, because the decision tree is the feature: one learner behaves as
 * it always did, and the whole class can restart the open meeting only — never
 * without an open meeting, never without the explicit tick, never as a full wipe.
 */

afterEach(cleanup);

const executeButton = () => screen.getByRole('button', { name: /בצע איפוס מבוקר/ }) as HTMLButtonElement;

describe('ResetConfirmationModal — level 2, whole class', () => {
  it('needs the explicit tick, then sends the open meeting with scope active_session', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <ResetConfirmationModal isOpen onClose={() => {}} resetLevel="single_student" resetTarget="class" activeSessionNumber={4} onConfirm={onConfirm} />
    );

    expect(screen.getByText('איפוס מפגש 4 לכל הכיתה (רמה 2)')).toBeTruthy();
    expect(executeButton().disabled).toBe(true);

    fireEvent.click(executeButton());
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(executeButton().disabled).toBe(false);

    await act(async () => { fireEvent.click(executeButton()); });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith('restart_session', undefined, { scope: 'active_session', sessionNumber: 4 });
  });

  it('offers no full wipe: the scope choice of a single learner is absent', () => {
    render(
      <ResetConfirmationModal isOpen onClose={() => {}} resetLevel="single_student" resetTarget="class" activeSessionNumber={4} onConfirm={vi.fn()} />
    );
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByText('איפוס מוחלט של הלומד')).toBeNull();
    expect(screen.getByText(/מפגשים קודמים, הקלטות והודעות צ'אט נשמרים/)).toBeTruthy();
  });

  it('with no open meeting it explains why and cannot be executed', () => {
    const onConfirm = vi.fn();
    render(
      <ResetConfirmationModal isOpen onClose={() => {}} resetLevel="single_student" resetTarget="class" activeSessionNumber={null} onConfirm={onConfirm} />
    );
    expect(screen.getByRole('alert').textContent).toContain('אין מפגש פתוח לכיתה');
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(executeButton().disabled).toBe(true);
    fireEvent.click(executeButton());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('closing the dialog clears the tick, so the next opening starts unconfirmed', () => {
    const { rerender } = render(
      <ResetConfirmationModal isOpen onClose={() => {}} resetLevel="single_student" resetTarget="class" activeSessionNumber={4} onConfirm={vi.fn()} />
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(executeButton().disabled).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'ביטול' }));
    rerender(
      <ResetConfirmationModal isOpen onClose={() => {}} resetLevel="single_student" resetTarget="class" activeSessionNumber={4} onConfirm={vi.fn()} />
    );
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    expect(executeButton().disabled).toBe(true);
  });
});

describe('ResetConfirmationModal — level 2, one learner (unchanged)', () => {
  it('still defaults to the active meeting, with no tick required', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <ResetConfirmationModal isOpen onClose={() => {}} resetLevel="single_student" targetStudentId="student_user3" targetStudentName="תלמיד 3" activeSessionNumber={4} onConfirm={onConfirm} />
    );
    expect(screen.getByText('איפוס לומד יחיד (רמה 2): תלמיד 3')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(executeButton().disabled).toBe(false);

    await act(async () => { fireEvent.click(executeButton()); });
    expect(onConfirm).toHaveBeenCalledWith('restart_session', undefined, { scope: 'active_session', sessionNumber: 4 });
  });

  it('still lets the teacher choose the full wipe of that learner', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <ResetConfirmationModal isOpen onClose={() => {}} resetLevel="single_student" targetStudentId="student_user3" targetStudentName="תלמיד 3" activeSessionNumber={4} onConfirm={onConfirm} />
    );
    fireEvent.click(screen.getByRole('radio', { name: /איפוס מוחלט של הלומד/ }));
    await act(async () => { fireEvent.click(executeButton()); });
    expect(onConfirm).toHaveBeenCalledWith('restart_session', undefined, { scope: 'full_student', sessionNumber: 4 });
  });
});
