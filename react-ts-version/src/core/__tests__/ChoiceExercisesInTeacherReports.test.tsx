/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, within } from '@testing-library/react';

vi.mock('@/infrastructure/firebase', () => ({ database: {}, firestore: {}, functions: {}, authReady: Promise.resolve() }));

import { SESSION_BRANCH_TASKS } from '@/data/sessionBranchTasks';
import { getHardcodedCatalogBanks } from '@/data/sessionTasks';
import { CHOICE_EXERCISES_HEADING_HE, CHOICE_PATH_LABEL_HE, exercisePathType } from '@/core/choiceExercises';
import { exerciseTitle, reportFromData } from '@/infrastructure/services/LearnerJourneyService';
import { classReportFromData } from '@/infrastructure/services/ClassReportService';
import { ClassExerciseTables } from '@/presentation/pages/TeacherDashboard/components/ClassMeetingReportPanel';

/**
 * מסמך 03 (מדיניות סיום מוקדם): ביצועי הלומדים בתרגילי הבחירה "יופיעו בדוחות
 * המורה מסומנים כתרגילי בחירה, בנפרד משבעת תרגילי החובה".
 * ביקורת 26.9.2026 (מרשם שורה 18): הדוחות לא סימנו אותם, ותרגיל אתגר סווג
 * כתרגיל ביסוס. הצד של השרת נבדק ב-functions/src/__tests__/choiceExercises.test.ts.
 */

afterEach(cleanup);

describe('which exercise is a choice exercise (teacher side)', () => {
  it('every exercise of the choice banks, by its branch', () => {
    let count = 0;
    for (const byPath of Object.values(SESSION_BRANCH_TASKS)) {
      for (const bank of Object.values(byPath)) {
        for (const t of bank.reinforcement) { expect(exercisePathType(t.id), t.id).toBe('consolidation'); count++; }
        for (const t of bank.challenge) { expect(exercisePathType(t.id), t.id).toBe('challenge'); count++; }
      }
    }
    expect(count).toBe(30);
  });

  it('no exercise of a published compulsory bank', () => {
    for (const bank of getHardcodedCatalogBanks()) {
      for (const t of bank.tasks) expect(exercisePathType(t.id), t.id).toBe('compulsory');
    }
  });

  it('the server\'s value wins when it sent one', () => {
    expect(exercisePathType('s4_g_t1', 'challenge')).toBe('challenge');
    expect(exercisePathType('s4_g_challenge_1', 'nonsense')).toBe('challenge');
  });
});

describe('the learner report on the teacher page', () => {
  it('shows the choice exercises apart, as the server stored them', () => {
    const r = reportFromData({
      session_number: 4, score_percent: 86,
      exercise_narratives: ['בתרגיל הראשון (s4_g_t1) הלומד והשלים את התרגיל בניסיון הראשון.'],
      choice_exercise_narratives: ['תרגיל בחירה — נתיב האתגר והעומק (s4_g_challenge_1): הלומד והשלים את התרגיל בניסיון הראשון.'],
    }, 'session_4_student_3', null);
    expect(r.exerciseNarratives).toHaveLength(1);
    expect(r.choiceExerciseNarratives).toEqual(['תרגיל בחירה — נתיב האתגר והעומק (s4_g_challenge_1): הלומד והשלים את התרגיל בניסיון הראשון.']);
  });

  it('a report stored before the split: the choice paragraphs are moved out and marked', () => {
    const r = reportFromData({
      session_number: 4, score_percent: 86,
      exercise_narratives: [
        'בתרגיל השביעי (s4_g_t7) הלומד והשלים את התרגיל בניסיון הראשון.',
        'בתרגיל השמיני (s4_g_reinforce_1) הלומד והשלים את התרגיל בניסיון הראשון.',
      ],
    }, 'session_4_student_3', null);
    expect(r.exerciseNarratives).toEqual(['בתרגיל השביעי (s4_g_t7) הלומד והשלים את התרגיל בניסיון הראשון.']);
    expect(r.choiceExerciseNarratives).toEqual([
      `${CHOICE_PATH_LABEL_HE.consolidation}: בתרגיל השמיני (s4_g_reinforce_1) הלומד והשלים את התרגיל בניסיון הראשון.`,
    ]);
  });

  it('names a choice exercise by its title, marked as one — not by its bare id', () => {
    expect(exerciseTitle(4, 's4_g_challenge_1')).toBe(`${CHOICE_PATH_LABEL_HE.challenge}: אתגר: שלוש המרות רצופות`);
    expect(exerciseTitle(4, 's4_r_reinforce_1')).toBe(`${CHOICE_PATH_LABEL_HE.consolidation}: ביסוס 1: חיבור ללא המרה`);
    expect(exerciseTitle(4, 's4_g_t1')).not.toContain('תרגיל בחירה');
  });
});

describe('the class report on the teacher page', () => {
  const report = classReportFromData({
    session_number: 4,
    aggregates: {
      exercises: [
        { exercise_id: 's4_g_t1', path_type: 'compulsory', attempted: 3, completed: 3, first_try: 2 },
        { exercise_id: 's4_g_challenge_1', path_type: 'challenge', attempted: 1, completed: 1, first_try: 1 },
        // stored before the server sent path_type
        { exercise_id: 's4_g_reinforce_2', attempted: 2, completed: 2, first_try: 2 },
      ],
    },
  });

  it('carries each exercise\'s path', () => {
    expect(report.exercises.map((e) => e.pathType)).toEqual(['compulsory', 'challenge', 'consolidation']);
  });

  it('prints the choice exercises in their own table, each with its path', () => {
    render(<ClassExerciseTables exercises={report.exercises} />);
    const choice = screen.getByTestId('choice-exercises');
    expect(within(choice).getByText(CHOICE_EXERCISES_HEADING_HE)).toBeTruthy();
    expect(within(choice).getByText('s4_g_challenge_1')).toBeTruthy();
    expect(within(choice).getByText(CHOICE_PATH_LABEL_HE.challenge)).toBeTruthy();
    expect(within(choice).getByText(CHOICE_PATH_LABEL_HE.consolidation)).toBeTruthy();
    expect(within(choice).queryByText('s4_g_t1')).toBeNull();
  });

  it('no choice table when nobody did a choice exercise', () => {
    render(<ClassExerciseTables exercises={report.exercises.filter((e) => e.pathType === 'compulsory')} />);
    expect(screen.queryByTestId('choice-exercises')).toBeNull();
  });
});
