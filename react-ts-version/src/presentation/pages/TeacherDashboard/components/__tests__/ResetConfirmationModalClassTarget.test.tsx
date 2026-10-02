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

const executeButton = () => screen.getByRole('button', { name: /בצעו איפוס מבוקר/ }) as HTMLButtonElement;
// PRD 23א §ד: the teacher chooses a reason every time; nothing is preselected.
const chooseReason = (value = 'restart_session') =>
  fireEvent.change(screen.getByLabelText('סיבת האיפוס (שדה חובה):'), { target: { value } });

describe('ResetConfirmationModal — level 2, whole class', () => {
  it('needs the explicit tick, then sends the open meeting with scope active_session', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <ResetConfirmationModal isOpen onClose={() => {}} resetLevel="single_student" resetTarget="class" activeSessionNumber={4} onConfirm={onConfirm} />
    );

    expect(screen.getByText('איפוס המפגש לכיתה (רמה 2)')).toBeTruthy();
    // The meeting under the name the children see (owner, 27.9.2026, register ט).
    expect(screen.getByText('מפגש 4 · אצל התלמידים: חיבור במאונך עם הקבצה')).toBeTruthy();
    expect(executeButton().disabled).toBe(true);

    fireEvent.click(executeButton());
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(executeButton().disabled).toBe(true); // ticked, no reason yet
    chooseReason();
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
    expect(screen.queryByText('איפוס מוחלט של התלמיד')).toBeNull();
    expect(screen.getByText(/העבודה במפגשים האחרים, ההקלטות והודעות הצ'אט נשמרות/)).toBeTruthy();
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
    chooseReason();
    expect(executeButton().disabled).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'ביטול' }));
    rerender(
      <ResetConfirmationModal isOpen onClose={() => {}} resetLevel="single_student" resetTarget="class" activeSessionNumber={4} onConfirm={vi.fn()} />
    );
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    // The reason does not carry over to the next reset either.
    expect((screen.getByLabelText('סיבת האיפוס (שדה חובה):') as HTMLSelectElement).value).toBe('');
    expect(executeButton().disabled).toBe(true);
  });
});

describe('ResetConfirmationModal — level 2, one learner (unchanged)', () => {
  it('still defaults to the active meeting, with no tick required', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <ResetConfirmationModal isOpen onClose={() => {}} resetLevel="single_student" targetStudentId="student_user3" targetStudentName="תלמיד 3" activeSessionNumber={4} onConfirm={onConfirm} />
    );
    expect(screen.getByText('איפוס של תלמיד אחד (רמה 2): תלמיד 3')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(executeButton().disabled).toBe(true); // no reason chosen yet
    chooseReason('student_stuck');
    expect(executeButton().disabled).toBe(false);

    await act(async () => { fireEvent.click(executeButton()); });
    expect(onConfirm).toHaveBeenCalledWith('student_stuck', undefined, { scope: 'active_session', sessionNumber: 4 });
  });

  it('names the meeting as the children see it — and names none for the full reset of all eight', () => {
    render(
      <ResetConfirmationModal isOpen onClose={() => {}} resetLevel="single_student" targetStudentId="student_user3" targetStudentName="תלמיד 3" activeSessionNumber={4} onConfirm={vi.fn()} />
    );
    const label = 'מפגש 4 · אצל התלמידים: חיבור במאונך עם הקבצה';
    // Default scope: the line under the heading and the "… בלבד" choice both carry the station name.
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByRole('radio', { name: new RegExp(`המפגש הזה בלבד \\(ברירת המחדל\\): ${label}`) })).toBeTruthy();
    expect(screen.getByText(`יימחקו העבודה וההתקדמות של התלמיד ב${label}.`)).toBeTruthy();

    // The full reset touches all eight meetings: no single meeting under the heading.
    fireEvent.click(screen.getByRole('radio', { name: /איפוס מוחלט של התלמיד/ }));
    expect(screen.queryByText(label)).toBeNull();
    expect(screen.getByText(/יימחקו: ההתקדמות בכל 8 המפגשים/)).toBeTruthy();
  });

  it('still lets the teacher choose the full wipe of that learner', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <ResetConfirmationModal isOpen onClose={() => {}} resetLevel="single_student" targetStudentId="student_user3" targetStudentName="תלמיד 3" activeSessionNumber={4} onConfirm={onConfirm} />
    );
    fireEvent.click(screen.getByRole('radio', { name: /איפוס מוחלט של התלמיד/ }));
    chooseReason('student_stuck');
    await act(async () => { fireEvent.click(executeButton()); });
    expect(onConfirm).toHaveBeenCalledWith('student_stuck', undefined, { scope: 'full_student', sessionNumber: 4 });
  });
});

describe('ResetConfirmationModal — the reason is the teacher’s choice, every time (PRD 23א §ד)', () => {
  it('level 1 opens with no reason, cannot run without one, and logs the one chosen', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<ResetConfirmationModal isOpen onClose={() => {}} resetLevel="alerts" onConfirm={onConfirm} />);
    const select = screen.getByLabelText('סיבת האיפוס (שדה חובה):') as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(executeButton().disabled).toBe(true);
    fireEvent.click(executeButton());
    expect(onConfirm).not.toHaveBeenCalled();

    chooseReason('technical_fault');
    await act(async () => { fireEvent.click(executeButton()); });
    expect(onConfirm).toHaveBeenCalledWith('technical_fault', undefined, undefined);
  });

  it('level 3 does not reach its final step without a reason', () => {
    render(<ResetConfirmationModal isOpen onClose={() => {}} resetLevel="system" onConfirm={vi.fn()} />);
    const next = screen.getByRole('button', { name: 'המשיכו לשלב אישור סופי' }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    chooseReason('test_run');
    expect(next.disabled).toBe(false);
  });

  it('the close button has a name', () => {
    render(<ResetConfirmationModal isOpen onClose={() => {}} resetLevel="alerts" onConfirm={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'סגירת החלון' })).toBeTruthy();
  });
});
