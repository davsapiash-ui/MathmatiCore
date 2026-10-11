/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { readFileSync } from 'fs';
import { resolve } from 'path';

vi.mock('@/infrastructure/firebase', () => ({ database: {}, firestore: {}, functions: {}, authReady: Promise.resolve() }));

import { CHOICE_EXERCISES_HEADING_HE } from '@/core/choiceExercises';
import { BACKUP_NOT_IN_DRIVE_HE, FIRST_ATTEMPT_SCORE_LABEL_HE, reportFromData } from '@/infrastructure/services/LearnerJourneyService';
import { classReportFromData } from '@/infrastructure/services/ClassReportService';
import { ClassExerciseTables, scaffoldsLineHe } from '../ClassMeetingReportPanel';

/**
 * The teacher's side of the reports round of 11.10.2026 (owner's decisions on
 * the audit): the dashboard shows what the server's reports print, in the PRD's names.
 */
afterEach(cleanup);
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf-8');
const panel = read('../ClassMeetingReportPanel.tsx');
const journey = read('../LearnerJourney.tsx');

describe('M5 — the result-row scaffold by profile, two numbers with their labels', () => {
  it('the panel line carries both, as the server line does', () => {
    const r = classReportFromData({ session_number: 4, aggregates: { place_cue_scaffolds_total: 5, place_cues_regular_total: 3, place_cues_enhanced_total: 2 } });
    expect(r.scaffolds.placeCuesRegular).toBe(3);
    expect(r.scaffolds.placeCuesEnhanced).toBe(2);
    expect(scaffoldsLineHe(r.scaffolds)).toMatch(/פיגום בשורת התוצאה: 5 \(3 בפרופיל הרגיל, 2 בפרופיל התמיכה המוגבר\)$/);
    const server = read('../../../../../../../functions/src/reportHtml.ts');
    expect(server).toContain('` (${a.place_cues_regular_total} בפרופיל הרגיל, ${a.place_cues_enhanced_total} בפרופיל התמיכה המוגבר)`');
  });

  it('a report stored before the split: the total alone', () => {
    const r = classReportFromData({ session_number: 4, aggregates: { place_cue_scaffolds_total: 5 } });
    expect(r.scaffolds.placeCuesRegular).toBeNull();
    expect(scaffoldsLineHe(r.scaffolds)).toMatch(/פיגום בשורת התוצאה: 5$/);
  });
});

describe('L15 — one name for measure 1 on every screen', () => {
  it('the choice heading, the same as the PDF', () => {
    expect(CHOICE_EXERCISES_HEADING_HE).toContain(FIRST_ATTEMPT_SCORE_LABEL_HE);
    expect(read('../../../../../../../functions/src/reportHtml.ts')).toContain(`"${CHOICE_EXERCISES_HEADING_HE}"`);
  });

  it('the "no report yet" texts name it, not "שיעור ההצלחה בניסיון ראשון"', () => {
    for (const src of [panel, journey]) {
      expect(src).not.toContain('שיעור ההצלחה בניסיון ראשון');
      expect(src).toContain('${FIRST_ATTEMPT_SCORE_LABEL_HE}');
    }
  });
});

describe('L17 — no percentage in the meeting-1 exercise table', () => {
  const exercises = classReportFromData({
    session_number: 1,
    aggregates: { scored: false, exercises: [{ exercise_id: 's1_t5', attempted: 4, completed: 3, first_try: 2, first_try_percent: 50 }] },
  }).exercises;

  it('meeting 1: the count only', () => {
    const { container } = render(<ClassExerciseTables exercises={exercises} sessionNumber={1} scored={false} />);
    expect(container.textContent).not.toContain('%');
  });

  it('a scored meeting keeps it', () => {
    const { container } = render(<ClassExerciseTables exercises={exercises} sessionNumber={4} />);
    expect(container.textContent).toContain('2 (50%)');
  });

  it('the panel passes the meeting\'s scored flag', () => {
    expect(panel).toContain('<ClassExerciseTables exercises={report.exercises} sessionNumber={selectedSession} scored={report.scored} />');
  });
});

describe('L18 — the thousands column in the wrong digits per column', () => {
  it('the stat, the header and every row', () => {
    expect(panel).toContain('· אלפים ${report.wrongDigitsByColumn.thousands}');
    expect(panel).toContain('<th>שגויות (א/ע/מ/אל)</th>');
    expect(panel).toContain('{l.wrongDigitsByColumn[2]}/{l.wrongDigitsByColumn[3]})');
  });
});

describe('L21 — the PRD chapter names', () => {
  it('"סיפור התרגילים", "פערי הידע"; no "לפי רמת הישג"', () => {
    expect(journey).toContain('>סיפור התרגילים</div>');
    expect(journey).toContain("'פערי הידע והמלצות ההוראה'");
    expect(journey).toContain("'פערי הידע שאותרו'");
    expect(journey).not.toContain('מהלך הפתרון לפי תרגילים');
    expect(panel).not.toContain('לפי רמת הישג');
  });
});

describe('L23 / L40 — no raw id, no English storage name', () => {
  it('a meeting-1 refresh exercise without a stored title gets a Hebrew label', () => {
    const r = reportFromData({ session_number: 1, meeting_kind: 'sandbox_refresh', tool_mastery: { used: {} }, exercise_outcomes: { ex_1_07: 'first_try' } }, 's');
    expect(r.sandbox?.refresh[0].title).toBe('תרגיל במפגש 1, מס׳ זיהוי 7');
  });

  it('the backup line on the reset separator is in Hebrew only', () => {
    expect(BACKUP_NOT_IN_DRIVE_HE).not.toMatch(/[A-Za-z]/);
    expect(BACKUP_NOT_IN_DRIVE_HE).toContain('באחסון הענן של המערכת');
  });
});

describe('the panel renders', () => {
  it('ClassExerciseTables shows the heading', () => {
    render(<ClassExerciseTables exercises={[]} sessionNumber={4} />);
    expect(screen.getByText('לא נרשמו תרגילי חובה.')).toBeTruthy();
  });
});
