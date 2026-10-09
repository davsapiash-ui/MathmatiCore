/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

vi.mock('@/infrastructure/firebase', () => ({ database: {}, firestore: {}, functions: {}, authReady: Promise.resolve() }));

import { classReportFromData } from '@/infrastructure/services/ClassReportService';
import { reportFromData, FIRST_ATTEMPT_SCORE_LABEL_HE, PREVIOUS_SCORE_LABEL_HE } from '@/infrastructure/services/LearnerJourneyService';

/**
 * PRD 14 §ב0 / 23 §ב: the learner report shows the new score and the previous
 * one; measure 1 has one name everywhere; the class report's links are made
 * per request, so the page asks for a fresh one; learning_path is empty in
 * meetings 1–2.
 */
describe('learner report: both scores, one name', () => {
  it('reads the previous score beside the new one', () => {
    const r = reportFromData({ session_number: 4, score_percent: 71, previous_score_percent: 43 }, 'session_4_student_student_user4', null);
    expect(r.scorePercent).toBe(71);
    expect(r.previousScorePercent).toBe(43);
  });

  it('no previous score when there was none, and none in meeting 1', () => {
    expect(reportFromData({ session_number: 4, score_percent: 71 }, 's', null).previousScorePercent).toBeNull();
    expect(reportFromData({ session_number: 1, meeting_kind: 'sandbox_refresh', previous_score_percent: 43 }, 's', null).previousScorePercent).toBeNull();
  });

  it('the journey page shows measure 1 under its PRD name and the previous score', () => {
    const page = readFileSync(resolve(__dirname, '../LearnerJourney.tsx'), 'utf-8');
    expect(FIRST_ATTEMPT_SCORE_LABEL_HE).toBe('ציון ניסיון ראשון (מדד 1)');
    expect(page).toContain('{FIRST_ATTEMPT_SCORE_LABEL_HE}');
    expect(page).toContain('{PREVIOUS_SCORE_LABEL_HE}');
    expect(page).not.toContain('>הצלחה בניסיון ראשון<');
    expect(PREVIOUS_SCORE_LABEL_HE).toBeTruthy();
  });
});

describe('class report: fresh per-request links, no path in meetings 1–2', () => {
  it('a stored report has files but keeps no link', () => {
    const r = classReportFromData({ session_number: 3, storage_pdf_path: 'reports/class_1/session_3/a.pdf', storage_csv_path: 'reports/class_1/session_3/a.csv', pdf_url: null, csv_url: null });
    expect(r.hasPdf).toBe(true);
    expect(r.hasCsv).toBe(true);
    expect(classReportFromData({ session_number: 3 }).hasPdf).toBe(false);
  });

  it('opening a file asks the server for a fresh signed link', () => {
    const panel = readFileSync(resolve(__dirname, '../ClassMeetingReportPanel.tsx'), 'utf-8');
    expect(panel).toContain("await fetchClassReportFileUrl(report.sessionNumber, kind)");
    const service = readFileSync(resolve(__dirname, '../../../../../infrastructure/services/ClassReportService.ts'), 'utf-8');
    expect(service).toContain("httpsCallable(functions, 'getClassReportDownloadUrl')");
  });

  it('choice screen in meetings 3–7 also after the target time: the deadline plays no part in it (PRD 14 §ג)', () => {
    const store = readFileSync(resolve(__dirname, '../../../../../application/useWorkspaceStore.ts'), 'utf-8');
    const start = store.indexOf('if (nextIdx >= tasks.length && !s.selectedBranch) {');
    const end = store.indexOf("set({ flowStatus: 'choice_branch'", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const gate = store.slice(start, end);
    expect(gate).toContain('s.sessionNumber >= 3 && s.sessionNumber <= 7');
    expect(gate).not.toMatch(/deadline/i);
    const screen = readFileSync(resolve(__dirname, '../../../../../features/workspace/overlays/ReinforcementOrChallengeScreen.tsx'), 'utf-8');
    expect(screen).toContain("'סיימתם את שבעת התרגילים של התחנה!'");
    // PRD 12 §ב: a wrong choice on the coaching card locks its buttons for 15 seconds.
    expect(store).toContain('export const SOCRATIC_LOCKOUT_MS = 15_000;');
  });

  it('learning_path is empty in meetings 1–2', () => {
    const r = classReportFromData({ session_number: 2, learners: [{ student_id: 4, learning_path: null }] });
    expect(r.learners[0].learningPath).toBeNull();
    const r4 = classReportFromData({ session_number: 4, learners: [{ student_id: 4, learning_path: 'remediation_path' }] });
    expect(r4.learners[0].learningPath).toBe('remediation_path');
  });
});
