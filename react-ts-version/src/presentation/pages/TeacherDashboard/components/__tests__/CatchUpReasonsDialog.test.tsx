/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';
import { CatchUpReasonsDialog, type CatchUpReasonsDialogProps } from '../CatchUpReasonsDialog';
import { CATCHUP_REASON_HE, CATCHUP_REASON_KEYS } from '@/core/catchUp';

/**
 * Catch-up time (owner, 2.10.2026): the teacher records, per learner who did
 * not finish, why — then reopens the meeting or goes on. Clicked through the
 * real dialog: nothing preselected, nothing leaves without a reason for every
 * learner, a note with PII never leaves, and cancelling calls nothing else.
 */

afterEach(cleanup);

const LEARNERS = [
  { studentNumber: 3, stoppedAtHe: 'תרגיל 4 מתוך 7' },
  { studentNumber: 9, stoppedAtHe: 'תרגיל 2 מתוך 7' },
];

function setup(over: Partial<CatchUpReasonsDialogProps> = {}) {
  const props: CatchUpReasonsDialogProps = {
    isOpen: true,
    meeting: 4,
    learners: LEARNERS,
    trigger: 'close',
    nextMeeting: null,
    isMeeting2: false,
    isSaving: false,
    onReopen: vi.fn(),
    onContinue: vi.fn(),
    onCancel: vi.fn(),
    ...over,
  };
  const utils = render(<CatchUpReasonsDialog {...props} />);
  return { props, ...utils };
}

const reopenBtn = () => screen.getByRole('button', { name: /פתחו שוב את המפגש להשלמה/ }) as HTMLButtonElement;
const continueBtn = () => screen.getByRole('button', { name: /המשיכו בכל זאת/ }) as HTMLButtonElement;
const reasonOf = (n: number) => screen.getByLabelText(`סיבה לתלמיד ${n}`) as HTMLSelectElement;
const noteOf = (n: number) => screen.getByLabelText(`הערה לתלמיד ${n}`) as HTMLInputElement;
const choose = (n: number, value: string) => fireEvent.change(reasonOf(n), { target: { value } });

describe('CatchUpReasonsDialog', () => {
  it('renders nothing when closed', () => {
    setup({ isOpen: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lists every learner with where they stopped and the five reasons, none chosen', () => {
    setup();
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('dir')).toBe('rtl');
    expect(screen.getByText('תלמיד 3')).toBeTruthy();
    expect(screen.getByText('הגיע עד: תרגיל 4 מתוך 7')).toBeTruthy();
    expect(screen.getByText('תלמיד 9')).toBeTruthy();
    for (const n of [3, 9]) {
      expect(reasonOf(n).value).toBe('');
      const options = Array.from(reasonOf(n).options).filter((o) => o.value);
      expect(options.map((o) => o.value)).toEqual([...CATCHUP_REASON_KEYS]);
      expect(options.map((o) => o.textContent)).toEqual(CATCHUP_REASON_KEYS.map((k) => CATCHUP_REASON_HE[k]));
    }
  });

  it('keeps both actions disabled until every learner has a reason', () => {
    const { props } = setup();
    expect(reopenBtn().disabled).toBe(true);
    expect(continueBtn().disabled).toBe(true);
    choose(3, 'slow_pace');
    expect(reopenBtn().disabled).toBe(true);
    fireEvent.click(reopenBtn());
    expect(props.onReopen).not.toHaveBeenCalled();
    choose(9, 'technical_fault');
    expect(reopenBtn().disabled).toBe(false);
    expect(continueBtn().disabled).toBe(false);
  });

  it('passes the entries back on reopen, with the trimmed note or null', () => {
    const { props } = setup();
    choose(3, 'slow_pace');
    choose(9, 'other');
    fireEvent.change(noteOf(9), { target: { value: '  עבד לאט עם הלוח  ' } });
    fireEvent.click(reopenBtn());
    expect(props.onReopen).toHaveBeenCalledTimes(1);
    expect(props.onReopen).toHaveBeenCalledWith([
      { studentNumber: 3, reason: 'slow_pace', note: null, stoppedAtHe: 'תרגיל 4 מתוך 7' },
      { studentNumber: 9, reason: 'other', note: 'עבד לאט עם הלוח', stoppedAtHe: 'תרגיל 2 מתוך 7' },
    ]);
    expect(props.onContinue).not.toHaveBeenCalled();
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it('passes the entries back on continue; "same reason for everyone" fills every row', () => {
    const { props } = setup();
    fireEvent.change(screen.getByLabelText('אותה סיבה לכל התלמידים:'), { target: { value: 'partial_absence' } });
    expect(reasonOf(3).value).toBe('partial_absence');
    expect(reasonOf(9).value).toBe('partial_absence');
    choose(9, 'content_difficulty'); // still editable per learner
    fireEvent.click(continueBtn());
    expect(props.onContinue).toHaveBeenCalledWith([
      { studentNumber: 3, reason: 'partial_absence', note: null, stoppedAtHe: 'תרגיל 4 מתוך 7' },
      { studentNumber: 9, reason: 'content_difficulty', note: null, stoppedAtHe: 'תרגיל 2 מתוך 7' },
    ]);
    expect(props.onReopen).not.toHaveBeenCalled();
  });

  it('shows no "same reason" shortcut for a single learner', () => {
    setup({ learners: [LEARNERS[0]] });
    expect(screen.queryByLabelText('אותה סיבה לכל התלמידים:')).toBeNull();
  });

  it('refuses a note with PII: error shown inline, both actions blocked', () => {
    const { props } = setup();
    choose(3, 'slow_pace');
    choose(9, 'slow_pace');
    fireEvent.change(noteOf(3), { target: { value: 'להתקשר לאמא 050-1234567' } });
    expect(screen.getByRole('alert').textContent).toBeTruthy();
    expect(noteOf(3).getAttribute('aria-invalid')).toBe('true');
    expect(reopenBtn().disabled).toBe(true);
    expect(continueBtn().disabled).toBe(true);
    fireEvent.click(continueBtn());
    expect(props.onContinue).not.toHaveBeenCalled();
    // Fixing the note releases the actions.
    fireEvent.change(noteOf(3), { target: { value: 'עבד לאט' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(continueBtn().disabled).toBe(false);
  });

  it('disables both actions while saving, but cancel still works (the teacher is never held here)', () => {
    const { props } = setup({ isSaving: true });
    choose(3, 'slow_pace');
    choose(9, 'slow_pace');
    expect(reopenBtn().disabled).toBe(true);
    expect(continueBtn().disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('שומרים את הסיבות');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'ביטול' }));
    expect(props.onCancel).toHaveBeenCalledTimes(2);
    expect(props.onReopen).not.toHaveBeenCalled();
    expect(props.onContinue).not.toHaveBeenCalled();
  });

  it.each([
    ['X button', () => fireEvent.click(screen.getByRole('button', { name: 'סגירת החלון' }))],
    ['cancel button', () => fireEvent.click(screen.getByRole('button', { name: 'ביטול' }))],
    ['Escape', () => fireEvent.keyDown(window, { key: 'Escape' })],
    ['backdrop', () => fireEvent.click(screen.getByTestId('catchup-backdrop'))],
  ])('cancel by %s calls onCancel only, writing nothing', (_name, doCancel) => {
    const { props } = setup();
    choose(3, 'slow_pace');
    choose(9, 'slow_pace');
    doCancel();
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onReopen).not.toHaveBeenCalled();
    expect(props.onContinue).not.toHaveBeenCalled();
  });

  it('a click inside the panel does not cancel', () => {
    const { props } = setup();
    fireEvent.click(screen.getByText('תלמיד 3'));
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it('starts with no reason chosen each time it opens again', () => {
    const { props, rerender } = setup();
    choose(3, 'slow_pace');
    rerender(<CatchUpReasonsDialog {...props} isOpen={false} />);
    rerender(<CatchUpReasonsDialog {...props} isOpen />);
    expect(reasonOf(3).value).toBe('');
  });

  it('titles the close and the opening of another meeting', () => {
    setup({ trigger: 'close', meeting: 5 });
    expect(screen.getByRole('heading', { name: 'לפני שסוגרים את מפגש 5' })).toBeTruthy();
    cleanup();
    setup({ trigger: 'open_other', meeting: 5, nextMeeting: 6 });
    expect(screen.getByRole('heading', { name: 'לפני שפותחים את מפגש 6' })).toBeTruthy();
    expect(screen.getByText(/במפגש 5 יש תלמידים שהתחילו ולא סיימו/)).toBeTruthy();
    expect(screen.getByText(/מפגש 6 לא ייפתח עכשיו/)).toBeTruthy();
  });

  it('meeting 2: says the close still completes the meeting and the reasons only document', () => {
    setup({ meeting: 2, isMeeting2: true });
    expect(screen.getByText(/במפגש 2, "המשיכו בכל זאת" מסיים את המפגש כרגיל/)).toBeTruthy();
    cleanup();
    setup({ meeting: 4, isMeeting2: false });
    expect(screen.queryByText(/במפגש 2, "המשיכו בכל זאת" מסיים/)).toBeNull();
  });
});
