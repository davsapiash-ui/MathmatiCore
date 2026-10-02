/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';

vi.mock('@/infrastructure/firebase', () => ({ database: {}, firestore: {}, functions: {}, authReady: Promise.resolve() }));

import { classCatchUpFromData, classReportFromData } from '@/infrastructure/services/ClassReportService';
import { ClassCatchUpBlock, catchUpReasonsHe, catchUpTotalsHe } from '@/presentation/pages/TeacherDashboard/components/ClassMeetingReportPanel';

/**
 * Catch-up time, part D2 — the class report panel's catch-up block.
 * Owner, 2.10.2026: "המורה יקח את אותם ילדים שלא סיימו למפגש נוסף \ זמן נוסף
 * וזה יתועד מה הסיבה לכך ואז אחרי שהם יישרו קו נמשיך עם כל הקבוצה למפגש הבא".
 */

afterEach(cleanup);

const stored = {
  learners: [
    { student_number: 9, rounds: 1, minutes: 1, reasons: ['technical_fault'], note: null, line_he: 'קיבל זמן השלמה: דקה אחת · סיבה: תקלה טכנית' },
    { student_number: 4, rounds: 2, minutes: 8, reasons: ['slow_pace', 'nonsense'], note: 'עבד לאט', line_he: 'קיבל זמן השלמה: 8 דקות · סיבה: עבד בקצב איטי · הערה: עבד לאט' },
    { student_number: 2, rounds: 0, minutes: 0, reasons: ['slow_pace'], note: null, line_he: 'לא סיים את המפגש · סיבה: עבד בקצב איטי' },
  ],
  reason_counts: { slow_pace: 2, partial_absence: 0, technical_fault: 1, content_difficulty: 0, other: 0 },
  learners_with_rounds: 2,
  total_minutes: 9,
};

describe('the catch-up block as the service reads it', () => {
  it('a report stored before catch-up time has no block', () => {
    expect(classReportFromData({ session_number: 3 }).catchUp).toBeNull();
    expect(classCatchUpFromData(null)).toBeNull();
  });

  it('learners ascending, unknown reasons dropped, counts per reason', () => {
    const c = classReportFromData({ session_number: 3, catch_up: stored }).catchUp!;
    expect(c.learners.map((l) => l.studentNumber)).toEqual([2, 4, 9]);
    expect(c.learners[1].reasons).toEqual(['slow_pace']);
    expect(c.learners[1].note).toBe('עבד לאט');
    expect(c.reasonCounts).toEqual({ slow_pace: 2, partial_absence: 0, technical_fault: 1, content_difficulty: 0, other: 0 });
    expect(c.learnersWithRounds).toBe(2);
    expect(c.totalMinutes).toBe(9);
  });
});

describe('the catch-up block on the panel', () => {
  const c = classCatchUpFromData(stored)!;

  it('the totals and the reasons, in the closed list\'s order', () => {
    expect(catchUpTotalsHe(c)).toBe('2 תלמידים קיבלו זמן השלמה, 9 דקות בסך הכול');
    expect(catchUpTotalsHe({ ...c, learnersWithRounds: 1, totalMinutes: 1 })).toBe('תלמיד אחד קיבל זמן השלמה, דקה אחת בסך הכול');
    expect(catchUpTotalsHe({ ...c, learnersWithRounds: 0, totalMinutes: 0 })).toBe('אף תלמיד עוד לא קיבל זמן השלמה');
    expect(catchUpReasonsHe(c)).toBe('הסיבות שנרשמו: עבד בקצב איטי (2 תלמידים) · תקלה טכנית (תלמיד אחד)');
  });

  it('renders the heading, the summary and one line per learner', () => {
    render(<ClassCatchUpBlock catchUp={c} />);
    const block = screen.getByTestId('class-catch-up');
    expect(block.textContent).toContain('תלמידים שלא סיימו את המפגש');
    expect(block.textContent).toContain('2 תלמידים קיבלו זמן השלמה, 9 דקות בסך הכול');
    expect(block.textContent).toContain('הסיבות שנרשמו: עבד בקצב איטי (2 תלמידים) · תקלה טכנית (תלמיד אחד)');
    const items = Array.from(block.querySelectorAll('li')).map((li) => li.textContent);
    expect(items).toEqual([
      '• תלמיד 2: לא סיים את המפגש · סיבה: עבד בקצב איטי',
      '• תלמיד 4: קיבל זמן השלמה: 8 דקות · סיבה: עבד בקצב איטי · הערה: עבד לאט',
      '• תלמיד 9: קיבל זמן השלמה: דקה אחת · סיבה: תקלה טכנית',
    ]);
  });

  it('nothing when no reason was recorded in the meeting', () => {
    render(<ClassCatchUpBlock catchUp={{ ...c, learners: [] }} />);
    expect(screen.queryByTestId('class-catch-up')).toBeNull();
  });
});
