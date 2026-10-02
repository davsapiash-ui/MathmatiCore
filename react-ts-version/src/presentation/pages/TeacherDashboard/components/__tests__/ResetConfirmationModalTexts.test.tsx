/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, screen, within } from '@testing-library/react';
import type { ResetMeetingLookup } from '@/application/useResetMeetingTarget';

/**
 * Module 23א, the texts round (2.10.2026). PRD 23א §ה: the window "מפרט
 * במפורש מה עומד להימחק". Every line below is checked against what the reset
 * really does (functions/src/exportDriveReport.ts buildResetScope and
 * buildActiveSessionResetValues; the live reset audit of 2.10.2026):
 *   - level 1 claimed a full backup it never makes;
 *   - every level promised Google Drive, though the backup falls back to the
 *     system's own storage (register gap יב);
 *   - level 3 listed four of the eleven things it deletes, and its second step
 *     said the backup already existed;
 *   - one action had two names (button and heading), "לומד" and "תלמיד" mixed;
 *   - all five reasons were offered everywhere (PRD 23א §ד keeps the five).
 * The full reset of one learner keeps the teacher's settings (owner,
 * 2.10.2026: "ברור שלשמור את הגדרות התלמיד אין צורך להקים לו את זה מחדש").
 */

const lookup = vi.hoisted(() => ({ current: { loading: false, target: null } as ResetMeetingLookup }));
vi.mock('@/application/useResetMeetingTarget', () => ({
  useResetMeetingTarget: () => lookup.current,
}));

import { ResetConfirmationModal, resetReasonsFor } from '../ResetConfirmationModal';

afterEach(cleanup);

const dialog = () => screen.getByRole('dialog', { name: 'אישור איפוס נתונים' });
const listItems = () => within(dialog()).getAllByRole('listitem').map((li) => li.textContent);
const reasonOptions = () =>
  Array.from((screen.getByLabelText('סיבת האיפוס (שדה חובה):') as HTMLSelectElement).options).map((o) => o.value).filter(Boolean);

describe('level 1 — alerts', () => {
  it('no backup is claimed, the lesson\'s alert history is named, one name for the log', () => {
    render(<ResetConfirmationModal isOpen onClose={() => {}} resetLevel="alerts" onConfirm={vi.fn()} />);
    expect(screen.getByText('איפוס התראות (רמה 1)')).toBeTruthy();
    expect(screen.getByText('הפעולה נרשמת ביומן האיפוסים. לא נשמר גיבוי, כי לא נמחקים נתוני למידה.')).toBeTruthy();
    expect(screen.queryByText(/גיבוי מלא/)).toBeNull();
    expect(listItems()).toEqual([
      'יימחקו הקריאות לעזרה של כל התלמידים והיסטוריית ההתראות של השיעור.',
      'המשבצות ברדאר יחזרו למצב רגיל. משבצת של תלמיד שפתוח אצלו עכשיו כרטיס חניכה, או שמהסס עכשיו, תישאר צבועה, כי זה המצב שלו ברגע זה.',
      'נתוני הלמידה לא משתנים: ההתקדמות, רישום הפעולות והמפגשים נשארים כמו שהם.',
      'האיפוס נרשם ביומן האיפוסים.',
    ]);
    expect(dialog().textContent).not.toMatch(/יומן הפעולות|לומד/);
  });
});

describe('level 2 — one learner', () => {
  const open = (sessionNumber = 5) => {
    lookup.current = { loading: false, target: { sessionNumber, source: 'class', completed: false } };
    render(<ResetConfirmationModal isOpen onClose={() => {}} resetLevel="single_student" targetStudentId="student_user3" targetStudentName="תלמיד 3" activeSessionNumber={sessionNumber} onConfirm={vi.fn()} />);
  };

  it('the meeting only: a backup without "Google Drive", the meeting named, "תלמיד" throughout', () => {
    open(5);
    expect(screen.getByText('איפוס של תלמיד אחד (רמה 2): תלמיד 3')).toBeTruthy();
    expect(screen.getByText('לפני שנמחק משהו נשמר גיבוי, והפעולה נרשמת ביומן האיפוסים.')).toBeTruthy();
    expect(listItems()).toEqual([
      'לפני האיפוס נשמר גיבוי של כל הנתונים של תלמיד 3.',
      'יימחקו העבודה וההתקדמות של התלמיד במפגש 5 · אצל התלמידים: חיסור במאונך עם פריטה.',
      "התלמיד יחזור לתחילת המפגש. העבודה במפגשים האחרים, ההקלטות והודעות הצ'אט נשמרות.",
      'יאופס מפגש 5, המפגש הפתוח לכיתה.',
      'האיפוס נרשם ביומן האיפוסים, ואי אפשר למחוק את הרישום.',
    ]);
    expect(dialog().textContent).not.toMatch(/Google Drive|לומד|כל שאר המפגשים נשמרים/);
    expect(screen.getByText('התלמיד מתחיל את המפגש הזה מההתחלה. העבודה במפגשים האחרים נשמרת.')).toBeTruthy();
  });

  it('the full reset: everything erased is listed, and what stays — the settings among them', () => {
    open(5);
    fireEvent.click(screen.getByRole('radio', { name: /איפוס מוחלט של התלמיד/ }));
    expect(listItems()).toEqual([
      'לפני האיפוס נשמר גיבוי של כל הנתונים של תלמיד 3.',
      'יימחקו: ההתקדמות בכל 8 המפגשים, תוצאות האבחון וההמלצה, המסלול שאושר ב"שלב החלוקה למסלולים", ההקלטות והודעות הצ\'אט.',
      'יישמרו: ההגדרות שקבעתם לתלמיד (פרופיל התמיכה המוגברת ומצב השקט החזותי), רישום הפעולות של התלמיד למחקר, הדוחות והרפלקציות.',
      'התלמיד יתחיל מההתחלה. כדי להגיע למפגש 3 הוא יצטרך לעשות שוב את מפגש 2, ותצטרכו לאשר לו מסלול מחדש.',
      'האיפוס נרשם ביומן האיפוסים, ואי אפשר למחוק את הרישום.',
    ]);
    expect(dialog().textContent).not.toMatch(/כאילו לא נכנס למערכת מעולם/);
    expect(screen.getByText("ההתקדמות בכל 8 המפגשים, תוצאות האבחון, המסלול, ההקלטות והצ'אט נמחקים. ההגדרות של התלמיד נשמרות.")).toBeTruthy();
  });

  it('only the reasons that can be true of one learner', () => {
    open(5);
    expect(reasonOptions()).toEqual(['technical_fault', 'student_stuck', 'test_run', 'other']);
    expect(screen.getByPlaceholderText('הסבר קצר על נסיבות האיפוס, בלי שמות. אפשר לכתוב מספר תלמיד.')).toBeTruthy();
  });
});

describe('level 2 — the whole class', () => {
  const open = (n: number | null) =>
    render(<ResetConfirmationModal isOpen onClose={() => {}} resetLevel="single_student" resetTarget="class" activeSessionNumber={n} onConfirm={vi.fn()} />);

  it('one name with its button, the tick in plain words, the class reasons', () => {
    open(4);
    expect(screen.getByText('איפוס המפגש לכיתה (רמה 2)')).toBeTruthy();
    expect(screen.getByText('כן, לאפס את מפגש 4 · אצל התלמידים: חיבור במאונך עם הקבצה לכל 12 התלמידים.')).toBeTruthy();
    expect(dialog().textContent).not.toMatch(/טלמטריה/);
    expect(screen.getByText('גם הקריאות לעזרה של התלמידים מתאפסות.')).toBeTruthy();
    expect(reasonOptions()).toEqual(['technical_fault', 'restart_session', 'test_run', 'other']);
    expect(dialog().textContent).not.toMatch(/לומד/);
  });

  it('meeting 2: the diagnostic and the approved paths of all 12 go too', () => {
    open(2);
    expect(screen.getByText('במפגש 2 יימחקו גם ציוני האבחון, ההמלצות והמסלולים שאושרו ב"שלב החלוקה למסלולים" לכל התלמידים. מי שכבר התקדם למפגש 3 ואילך ימתין עד שיעשה שוב את מפגש 2 ותאשרו לו מסלול מחדש.')).toBeTruthy();
  });

  it('meeting 8: what really happens to the reflections (register deviation 20 keeps them)', () => {
    open(8);
    expect(screen.getByText('במפגש 8 הרפלקציות שהתלמידים כבר שלחו נשמרות ונספרות בדוח הכיתה, ותלמיד ששלח רפלקציה לא ימלא אותה שוב.')).toBeTruthy();
  });

  it('no meeting open: the real way to reset one learner', () => {
    open(null);
    expect(screen.getByRole('alert').textContent).toBe('אין מפגש פתוח לכיתה, ולכן אי אפשר לאפס את המפגש לכל הכיתה. לאיפוס של תלמיד אחד, לחצו על המשבצת שלו ברדאר, אחר כך על "מעבר לניתוח מעמיק" ואז על "איפוס נתונים".');
  });
});

describe('level 3 — all the class\'s data', () => {
  it('the complete list, the open meeting closed, the backup not claimed before it exists', () => {
    render(<ResetConfirmationModal isOpen onClose={() => {}} resetLevel="system" onConfirm={vi.fn()} />);
    expect(screen.getByText('איפוס כל נתוני הכיתה (רמה 3)')).toBeTruthy();
    expect(listItems()).toEqual([
      'לפני שנמחק משהו נשמר גיבוי של הנתונים של כל 12 התלמידים.',
      "יימחקו כל נתוני הלמידה של הכיתה: ההתקדמות בכל המפגשים, ציוני האבחון והמסלולים שאושרו, ההקלטות, הודעות הצ'אט, הדוחות, הרפלקציות, רישום הפעולות והתראות הרדאר.",
      'יימחקו גם ההגדרות של כל התלמידים: פרופיל התמיכה המוגברת ומצב השקט החזותי.',
      'המפגש הפתוח ייסגר, והשידור למסכי התלמידים ייעצר.',
      'כל 12 התלמידים יתחילו מההתחלה.',
      'האיפוס נרשם ביומן האיפוסים, ואי אפשר למחוק את הרישום.',
    ]);
    expect(reasonOptions()).toEqual(['technical_fault', 'test_run', 'other']);
    fireEvent.change(screen.getByLabelText('סיבת האיפוס (שדה חובה):'), { target: { value: 'test_run' } });
    fireEvent.click(screen.getByRole('button', { name: 'המשיכו לשלב אישור סופי' }));
    expect(screen.getByText('⚠️ נדרש אישור נוסף לאיפוס כל נתוני הכיתה')).toBeTruthy();
    expect(screen.getByText('כל נתוני הלמידה של 12 התלמידים יימחקו. אחרי האישור נשמר גיבוי, ורק אחריו הנתונים נמחקים.')).toBeTruthy();
    expect(screen.getByText('כן, למחוק את כל נתוני הלמידה של הכיתה.')).toBeTruthy();
    expect(dialog().textContent).not.toMatch(/בדרייב|Google Drive|לומד/);
  });
});

describe('the reasons by reset (PRD 23א §ד: the five keys stay)', () => {
  it('each reason is offered somewhere, and each reset offers only fitting ones', () => {
    const all = new Set([...resetReasonsFor('alerts'), ...resetReasonsFor('single_student'), ...resetReasonsFor('single_student', 'class'), ...resetReasonsFor('system')]);
    expect([...all].sort()).toEqual(['other', 'restart_session', 'student_stuck', 'technical_fault', 'test_run']);
    expect(resetReasonsFor('alerts')).not.toContain('restart_session');
    expect(resetReasonsFor('alerts')).not.toContain('student_stuck');
    expect(resetReasonsFor('single_student', 'class')).not.toContain('student_stuck');
    expect(resetReasonsFor('system')).not.toContain('student_stuck');
  });
});
