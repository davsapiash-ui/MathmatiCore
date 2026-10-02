import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  PRE_RESET_HEADING_HE,
  PRE_RESET_NOTE_HE,
  answeredSince,
  reportFromData,
  resetSeparatorHe,
  resetsOfMeeting,
  withResetSeparators,
  type JourneyEvent,
} from '@/infrastructure/services/LearnerJourneyService';
import { classReportFromData, preResetNotesFromData } from '@/infrastructure/services/ClassReportService';
import { RESEARCH_EXPORT_RETRY_HE, describeResearchExportError } from '@/presentation/pages/TeacherDashboard/components/HeatmapGrid';
import { RESET_REASON_HE, resetReasonHe } from '@/core/routeLabels';

/**
 * Teacher-dashboard truth audit, fixes of 2.10.2026:
 *
 *  - M-reports-reset — owner, 2.10.2026: "אני כן רוצה אבל שיהיה תיעוד איפה היו
 *    טעויות בלי הורדת ציונים". The reports score the run since the meeting's
 *    last reset; a "לפני האיפוס" part documents the earlier mistakes; the
 *    journey marks where a meeting was reset, so two runs do not read as one.
 *  - M-export — a refused research export says why; only a transient failure
 *    asks for a retry.
 */

const T = Date.UTC(2026, 9, 2, 10, 13, 0);
const entry = (over: Record<string, unknown> = {}) => ({
  reset_level: 'single_student',
  reset_scope: 'active_session',
  session_number: 3,
  affected_student_ids: [4],
  backup_status: 'success',
  performed_at: T,
  reset_reason: 'technical_fault',
  ...over,
});
const ev = (id: string, timestamp: number): JourneyEvent => ({
  id, timestamp, sessionNumber: 3, sessionId: 'session_3_student_student_user4', exerciseId: 's3_g_t1', eventType: 'DIGIT_ENTERED', details: {},
});

describe('the journey marks where a meeting was reset', () => {
  it('the same rule as the server: this meeting, the whole learner or the system; carried out; this learner', () => {
    expect(resetsOfMeeting([entry()], 4, 3)).toEqual([{ at: T, reasonHe: 'תקלה טכנית במכשיר או בתקשורת', scope: 'active_session' }]);
    expect(resetsOfMeeting([entry({ reset_scope: 'full_student', session_number: null })], 4, 5)).toHaveLength(1);
    expect(resetsOfMeeting([entry({ reset_level: 'system' })], 4, 7)).toHaveLength(1);
    expect(resetsOfMeeting([entry({ session_number: 4 })], 4, 3)).toEqual([]);
    expect(resetsOfMeeting([entry({ backup_status: 'failed' })], 4, 3)).toEqual([]);
    expect(resetsOfMeeting([entry({ affected_student_ids: [5] })], 4, 3)).toEqual([]);
    expect(resetsOfMeeting([entry({ reset_level: 'alerts' })], 4, 3)).toEqual([]);
  });

  it('a separator row between the two runs; none when the reset cut nothing', () => {
    const [reset] = resetsOfMeeting([entry()], 4, 3);
    const rows = withResetSeparators([ev('a', T - 2000), ev('b', T - 1000), ev('c', T + 1000)], [reset]);
    expect(rows.map((r) => (r.kind === 'reset' ? 'איפוס' : r.event.id))).toEqual(['a', 'b', 'איפוס', 'c']);
    // A reset before the learner started the meeting separates nothing.
    expect(withResetSeparators([ev('c', T + 1000)], [reset]).some((r) => r.kind === 'reset')).toBe(false);
    // Reset and not yet done again: the separator closes the old run.
    expect(withResetSeparators([ev('a', T - 1000)], [reset]).map((r) => r.kind)).toEqual(['event', 'reset']);
  });

  it('the separator says when, why, and that the report counts from there on', () => {
    const [reset] = resetsOfMeeting([entry()], 4, 3);
    const text = resetSeparatorHe(reset);
    expect(text).toMatch(/^איפוס · /);
    expect(text).toContain('המפגש אופס. הסיבה: תקלה טכנית במכשיר או בתקשורת.');
    // One wording with the reports, and no "לומד" on the teacher's screens.
    expect(resetSeparatorHe({ ...reset, scope: 'full_student' })).toContain('כל העבודה של התלמיד אופסה.');
    expect(text).not.toMatch(/לומד/);
    expect(text).toContain('הדוח של המפגש נבנה רק מהעבודה שמכאן והלאה.');
  });

  it('the screen reopening after a reset is not working on the meeting; an answer is', () => {
    const open = (id: string, t: number, type: string): JourneyEvent => ({ ...ev(id, t), eventType: type });
    expect(answeredSince([open('s', T + 1000, 'SESSION_START'), open('p', T + 2000, 'PROBLEM_LOAD')], T)).toBe(false);
    expect(answeredSince([open('d', T - 1000, 'DIGIT_ENTERED')], T)).toBe(false);
    expect(answeredSince([open('d', T + 3000, 'DIGIT_ENTERED')], T)).toBe(true);
    expect(answeredSince([open('c', T + 3000, 'PROBLEM_COMPLETE')], T)).toBe(true);
  });

  it('the journey renders the separator rows and the stale-report note', () => {
    const journey = readFileSync(resolve(__dirname, '../../presentation/pages/TeacherDashboard/components/LearnerJourney.tsx'), 'utf-8');
    expect(journey).toContain('withResetSeparators(visibleEvents, sessionResets)');
    expect(journey).toContain('data-testid="reset-separator"');
    expect(journey).toContain('הדוח הזה הופק לפני האיפוס של המפגש');
    // "הפיקו מחדש" is offered only once the learner answered since the reset; otherwise the server would refuse.
    expect(journey).toContain('answeredSince(sessionEvents, lastCuttingReset.at)');
    expect(journey).toContain('התלמיד עוד לא עבד על המפגש מחדש, ולכן אפשר להפיק דוח חדש רק אחרי שיעבוד עליו.');
    expect(journey).toContain('data-testid="pre-reset"');
  });
});

describe('the report shows "לפני האיפוס" apart', () => {
  it('from the stored lines; absent when the meeting was not reset', () => {
    const lines = ['המפגש אופס ב-2.10.2026 בשעה 13:13. הסיבה: תקלה טכנית במכשיר או בתקשורת.', 'ירוק 1: ספרה שגויה בטור העשרות (פעמיים). התרגיל הושלם לפני האיפוס.'];
    expect(reportFromData({ session_number: 3, score_percent: 100, pre_reset: { lines_he: lines } }, 's', null).preReset).toEqual({ lines });
    expect(reportFromData({ session_number: 3, score_percent: 100 }, 's', null).preReset).toBeNull();
  });

  it('the heading and the note are the server\'s words', () => {
    const server = readFileSync(resolve(__dirname, '../../../../functions/src/preResetRecord.ts'), 'utf-8');
    expect(server).toContain(`export const PRE_RESET_HEADING_HE = "${PRE_RESET_HEADING_HE}";`);
    expect(server).toContain(`"${PRE_RESET_NOTE_HE}"`);
  });

  it('the class report: one line per reset learner, and those not yet back', () => {
    const data = {
      session_number: 3,
      learners: [
        { student_id: 4, pre_reset: { class_note_he: 'המפגש אופס ב-2.10.2026 בשעה 13:13 (תקלה טכנית במכשיר או בתקשורת). לפני האיפוס: ביטול אחד, בתרגיל אחד.' } },
        { student_id: 5, pre_reset: null },
      ],
      awaiting_rerun: [{ student_id: 6, pre_reset: { class_note_he: 'המפגש אופס ב-2.10.2026 בשעה 13:13.' } }],
    };
    expect(preResetNotesFromData(data)).toEqual([
      'תלמיד 4: המפגש אופס ב-2.10.2026 בשעה 13:13 (תקלה טכנית במכשיר או בתקשורת). לפני האיפוס: ביטול אחד, בתרגיל אחד.',
      'תלמיד 6: עוד לא עבד על המפגש מחדש, ולכן אין לו ציון במפגש הזה. המפגש אופס ב-2.10.2026 בשעה 13:13.',
    ]);
    expect(classReportFromData(data).preResetNotes).toHaveLength(2);
    expect(classReportFromData({ session_number: 3, learners: [] }).preResetNotes).toEqual([]);
    // The panel's sentence for a learner not yet back is the server's.
    const server = readFileSync(resolve(__dirname, '../../../../functions/src/preResetRecord.ts'), 'utf-8');
    expect(server).toContain('export const AWAITING_RERUN_HE = "עוד לא עבד על המפגש מחדש, ולכן אין לו ציון במפגש הזה.";');
  });

  it('the reason names: the dialog\'s list, "other" without its request for a note', () => {
    expect(resetReasonHe('other')).toBe('אחר');
    expect(resetReasonHe('student_stuck')).toBe('התלמיד נתקע וזקוק להתחלה מחדש');
    expect(RESET_REASON_HE.student_stuck).toBe('התלמיד נתקע וזקוק להתחלה מחדש');
    expect(resetReasonHe('nope')).toBeNull();
  });
});

describe('the research export says why it failed', () => {
  const pii = 'ייצוא נתוני המחקר נעצר: בקבצים נמצא מידע שנראה מזהה (כתובת מייל, מספר טלפון או מספר בן 9 ספרות). שום קובץ לא נשלח. ניסיון חוזר לא יעזור, כי הנתונים לא השתנו. פנו למנהל המערכת.';

  it('the PII refusal: the server\'s sentence, not "try again later"', () => {
    expect(describeResearchExportError({ code: 'functions/failed-precondition', message: pii, details: { reason: 'pii' } })).toBe(pii);
  });

  it('another final refusal: the server\'s Hebrew sentence', () => {
    expect(describeResearchExportError({ code: 'functions/invalid-argument', message: 'מספר המפגש אינו תקין. הייצוא בוטל.' }))
      .toBe('מספר המפגש אינו תקין. הייצוא בוטל.');
    expect(describeResearchExportError({ code: 'functions/permission-denied', message: 'Teacher is strictly restricted' }))
      .toBe('אין לחשבון הזה הרשאה לייצא את נתוני המחקר.');
  });

  it('only a transient failure asks for a retry', () => {
    expect(describeResearchExportError({ code: 'functions/internal', message: 'boom' })).toBe(RESEARCH_EXPORT_RETRY_HE);
    expect(describeResearchExportError({ code: 'functions/deadline-exceeded' })).toBe(RESEARCH_EXPORT_RETRY_HE);
    expect(describeResearchExportError(new Error('network'))).toBe(RESEARCH_EXPORT_RETRY_HE);
  });

  it('the server sends exactly that sentence with details.reason "pii"', () => {
    const server = readFileSync(resolve(__dirname, '../../../../functions/src/exportDriveReport.ts'), 'utf-8');
    expect(server).toContain(`"${pii}"`);
    expect(server).toContain('{ reason: "pii" }');
  });
});
