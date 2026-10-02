/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, act, cleanup, screen } from '@testing-library/react';
import type { ResetMeetingLookup } from '@/application/useResetMeetingTarget';

/**
 * Owner, 2.10.2026: "תתקן ותפטור כבר עכשיו את הבאג של 4".
 *
 * PRD 23א §ה: the window "מפרט במפורש מה עומד להימחק". With no meeting open,
 * a single learner's reset said only "יאופס המפגש שהלומד נמצא בו" — no number,
 * so the teacher could not know which meeting she was deleting. It now names
 * the meeting by the server's own rule, says what else goes with meeting 2
 * (register deviation 10) and meeting 8, and sends that meeting, which the
 * server checks.
 */

const lookup = vi.hoisted(() => ({ current: { loading: false, target: null } as ResetMeetingLookup }));
vi.mock('@/application/useResetMeetingTarget', () => ({
  useResetMeetingTarget: () => lookup.current,
}));

import { ResetConfirmationModal } from '../ResetConfirmationModal';

afterEach(cleanup);

const executeButton = () => screen.getByRole('button', { name: /בצעו איפוס מבוקר/ }) as HTMLButtonElement;
const chooseReason = () => fireEvent.change(screen.getByLabelText('סיבת האיפוס (שדה חובה):'), { target: { value: 'student_stuck' } });
const open = (onConfirm = vi.fn().mockResolvedValue(undefined)) => {
  render(
    <ResetConfirmationModal isOpen onClose={() => {}} resetLevel="single_student" targetStudentId="student_user3" targetStudentName="תלמיד 3" activeSessionNumber={null} onConfirm={onConfirm} />
  );
  return onConfirm;
};

describe('a single learner\'s reset names the meeting before the teacher confirms', () => {
  it('no open meeting: the meeting the learner is in, by number, and that meeting is sent', async () => {
    lookup.current = { loading: false, target: { sessionNumber: 5, source: 'learner', completed: false } };
    const onConfirm = open();
    expect(screen.getByText('אין מפגש פתוח לכיתה, ולכן יאופס מפגש 5, המפגש שהתלמיד נמצא בו.')).toBeTruthy();
    // The heading line and the default choice name it too, as the children see it.
    expect(screen.getByText('מפגש 5 · אצל התלמידים: חיסור במאונך עם פריטה')).toBeTruthy();
    expect(screen.queryByText(/המפגש הנוכחי/)).toBeNull();
    chooseReason();
    await act(async () => { fireEvent.click(executeButton()); });
    expect(onConfirm).toHaveBeenCalledWith('student_stuck', undefined, { scope: 'active_session', sessionNumber: 5 });
  });

  it('an open class meeting: that meeting, said so', () => {
    lookup.current = { loading: false, target: { sessionNumber: 3, source: 'class', completed: false } };
    open();
    expect(screen.getByText('יאופס מפגש 3, המפגש הפתוח לכיתה.')).toBeTruthy();
  });

  it('a meeting the class has open and this learner finished: the window says the finish is undone', () => {
    lookup.current = { loading: false, target: { sessionNumber: 3, source: 'class', completed: true } };
    open();
    expect(screen.getByText('התלמיד כבר סיים את מפגש 3, והאיפוס יבטל גם את הסיום.')).toBeTruthy();
  });

  it('(A) no meeting open and the learner finished meeting 4: refused before confirming; the full reset stays', () => {
    lookup.current = { loading: false, target: { sessionNumber: 4, source: 'learner', completed: true, finished: true } };
    const onConfirm = open();
    expect(screen.getByText('תלמיד 3 סיים את מפגש 4, ועכשיו הוא לא באמצע מפגש. כדי לאפס מפגש שהסתיים, פתחו אותו לכיתה ואפסו אותו בזמן שהוא פתוח, או בחרו איפוס מוחלט של התלמיד.')).toBeTruthy();
    expect(screen.queryByText(/יאופס מפגש 4/)).toBeNull();
    chooseReason();
    expect(executeButton().disabled).toBe(true);
    fireEvent.click(executeButton());
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('radio', { name: /איפוס מוחלט/ }));
    expect(executeButton().disabled).toBe(false);
  });

  it('(B) no meeting open and the learner finished meeting 2 (waiting for a path, or approved): refused', () => {
    lookup.current = { loading: false, target: { sessionNumber: 2, source: 'learner', completed: true, finished: true } };
    open();
    expect(screen.getByText(/^תלמיד 3 סיים את מפגש 2, ועכשיו הוא לא באמצע מפגש\./)).toBeTruthy();
    expect(screen.queryByText(/במפגש 2 יימחקו/)).toBeNull();
    chooseReason();
    expect(executeButton().disabled).toBe(true);
  });

  it('meeting 2: the diagnostic results, the recommendation and the approved path go too, and the learner waits', () => {
    lookup.current = { loading: false, target: { sessionNumber: 2, source: 'class', completed: true } };
    open();
    expect(screen.getByText('במפגש 2 יימחקו גם תוצאות האבחון, ההמלצה והמסלול שאושר ב"שלב החלוקה למסלולים". עד שהתלמיד ישלים שוב את מפגש 2 ויאושר לו מסלול, הוא ימתין ולא ייכנס למפגשים הבאים.')).toBeTruthy();
    expect(screen.queryByText(/הרפלקציה/)).toBeNull();
  });

  it('meeting 8: the reflection goes too', () => {
    lookup.current = { loading: false, target: { sessionNumber: 8, source: 'class', completed: false } };
    open();
    expect(screen.getByText('במפגש 8 תימחק גם הרפלקציה של התלמיד.')).toBeTruthy();
    expect(screen.queryByText(/במפגש 2 יימחקו/)).toBeNull();
  });

  it('no meeting can be determined: said plainly, and the meeting reset cannot be confirmed', () => {
    lookup.current = { loading: false, target: null };
    const onConfirm = open();
    expect(screen.getByText('אין מפגש פתוח לכיתה, ולא ידוע באיזה מפגש התלמיד נמצא, ולכן אין מפגש לאפס.')).toBeTruthy();
    chooseReason();
    expect(executeButton().disabled).toBe(true);
    fireEvent.click(executeButton());
    expect(onConfirm).not.toHaveBeenCalled();
    // The full reset of the learner needs no meeting and stays available.
    fireEvent.click(screen.getByRole('radio', { name: /איפוס מוחלט/ }));
    expect(executeButton().disabled).toBe(false);
  });

  it('while the records are read: no meeting is named yet, and nothing can be confirmed', () => {
    lookup.current = { loading: true, target: null };
    open();
    expect(screen.getByText('בודקים איזה מפגש יאופס…')).toBeTruthy();
    chooseReason();
    expect(executeButton().disabled).toBe(true);
  });
});
