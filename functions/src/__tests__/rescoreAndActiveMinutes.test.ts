import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { rescoreFields, completionVisible, meetingFromCompletionKey } from '../sessionTrigger';
import { countActiveMinutes, noteEventArrival, summarizeMeeting, activeMinutesOfEvents } from '../meetingMetrics';
import { computeActiveMinutes } from '../catchUpRounds';
import { buildLearnerRow, classReportStoragePath } from '../classReport';
import { pedagogicalReportHtml, PREVIOUS_SCORE_LABEL_HE } from '../reportHtml';

/**
 * PRD 14 §ב0: "בכל מפגש שיש לו ציון … ציון המפגש מחושב מחדש בכל פעם שהלומד משלים
 * אותו; הציון הקודם נשמר גם הוא ואינו נדרס, ושני הציונים מוצגים בדוח הלומד
 * (מודול 23) ובייצוא נתוני המחקר (מודול 24). המסלול המומלץ מתעדכן לפי הציון
 * החדש, ואישור שהמורה כבר נתנה בשער (מודול 20) אינו משתנה."
 * "השרת … סוגר אותו עם מספר הדקות השלמות שבהן הגיעה מהלומד טלמטריה באותו מפגש
 * (active_minutes). זו ההגדרה היחידה של דקות פעילות במערכת, גם בדוחות ובייצוא."
 */

describe('rescoring a completed meeting (PRD 14 §ב0)', () => {
  it('a new score keeps the stored one as previous_score_percent and updates the recommendation', () => {
    const r = rescoreFields({ session_score_percent: 43, matrix_recommended_path: 'remediation_path' }, 71, 'green_path');
    expect(r.changed).toBe(true);
    expect(r.fields).toEqual({ session_score_percent: 71, matrix_recommended_path: 'green_path', previous_score_percent: 43 });
  });

  it('never touches the gate approval or the path the teacher chose', () => {
    const stored = { session_score_percent: 43, matrix_recommended_path: 'remediation_path', teacher_gate_approved: true, teacher_selected_path: 'remediation_path' };
    const r = rescoreFields(stored, 86, 'green_path');
    expect(Object.keys(r.fields)).not.toContain('teacher_gate_approved');
    expect(Object.keys(r.fields)).not.toContain('teacher_selected_path');
    expect(Object.keys(r.fields)).not.toContain('gate_approved_at');
  });

  it('the same score writes nothing, so a previous score from an earlier completion stays', () => {
    const r = rescoreFields({ session_score_percent: 71, matrix_recommended_path: 'green_path', previous_score_percent: 43 }, 71, 'green_path');
    expect(r).toEqual({ changed: false, previousScore: null, fields: {} });
  });

  it('a first score in catch-up time takes the score before the catch-up round as the previous one', () => {
    const r = rescoreFields(null, 57, 'green_path', 29);
    expect(r.fields).toEqual({ session_score_percent: 57, matrix_recommended_path: 'green_path', previous_score_percent: 29 });
  });

  it('no stored score and no catch-up: no previous score', () => {
    expect(rescoreFields(null, 57, 'green_path').fields).not.toHaveProperty('previous_score_percent');
    expect(rescoreFields({ session_score_percent: null }, 57, 'green_path', null).fields).not.toHaveProperty('previous_score_percent');
  });

  it('every scored meeting, not only meeting 2: the score trigger and the completion mark of meetings 3–8', () => {
    const src = readFileSync(resolve(__dirname, '../sessionTrigger.ts'), 'utf-8');
    expect(src).toContain('export const onMeetingCompletionMarked = onValueWritten({');
    expect(src).toContain('ref: "/users/students/{studentKey}/completedMeetings/{meetingKey}"');
    expect(src).toMatch(/if \(!isScoredMeeting\(sessionNum\)\) return "no_score";/);
    const index = readFileSync(resolve(__dirname, '../index.ts'), 'utf-8');
    expect(index).toContain('onMeetingCompletionMarked');
  });

  it('only meeting 2 mirrors the score to the learner record (the gate reads it there)', () => {
    const src = readFileSync(resolve(__dirname, '../sessionTrigger.ts'), 'utf-8');
    expect(src).toContain('if (sessionNum !== 2) return;');
  });

  it('a catch-up round stamps the score before it, and the rules let only the server write the score fields', () => {
    const rounds = readFileSync(resolve(__dirname, '../catchUpRounds.ts'), 'utf-8');
    expect(rounds).toContain('await stampScoreBeforeCatchUp(db, n, meeting, openedAt);');
    const rules = readFileSync(resolve(__dirname, '../../../firestore.rules'), 'utf-8');
    expect(rules).toContain("'previous_score_percent',");
    expect(rules).toContain("sessionFieldUnchanged('previous_score_percent')");
    expect(rules).toContain("'score_before_catchup_percent', 'score_before_catchup_at'");
  });

  it('reads the completion mark of meetings 1–8 and when a run shows the completion', () => {
    expect(meetingFromCompletionKey('m3')).toBe(3);
    expect(meetingFromCompletionKey('3')).toBeNull();
    const done = (id: string) => ({ event_type: 'PROBLEM_COMPLETE', exercise_id: id });
    const seven = ['s4_g_t1', 's4_g_t2', 's4_g_t3', 's4_g_t4', 's4_g_t5', 's4_g_t6', 's4_g_t7'].map(done);
    expect(completionVisible(seven, 4)).toBe(true);
    expect(completionVisible(seven.slice(0, 6), 4)).toBe(false);
    expect(completionVisible(seven, 8)).toBe(false);
    expect(completionVisible([{ event_type: 'REFLECTION_SUBMITTED' }], 8)).toBe(true);
  });
});

describe('active minutes: one definition (PRD 14 §ב0, 23 §ב, 24)', () => {
  const MIN = 60_000;

  it('counts distinct whole minutes, not the span from the first event to the last', () => {
    expect(countActiveMinutes([0, 10_000, 59_999, 2 * MIN, 30 * MIN])).toBe(3);
    expect(countActiveMinutes([])).toBe(0);
  });

  it('the catch-up rounds use the same count within the round', () => {
    const times = [5 * MIN, 5 * MIN + 1, 6 * MIN, 20 * MIN];
    expect(computeActiveMinutes(times, 5 * MIN, 10 * MIN)).toBe(2);
    expect(computeActiveMinutes(times, 10 * MIN, 5 * MIN)).toBe(0);
  });

  it('the reports count the minute the event reached the server, as the catch-up rounds do', () => {
    // Two events made a minute apart on the tablet, delivered together after a drop.
    const a = { event_type: 'DIGIT_ENTERED', client_timestamp: 1 * MIN, details: { is_correct: true } };
    const b = { event_type: 'DIGIT_ENTERED', client_timestamp: 2 * MIN + 5_000, details: { is_correct: true } };
    expect(activeMinutesOfEvents([a, b])).toBe(2); // arrival unknown: the tablet's clock
    noteEventArrival(a, 40 * MIN + 1_000);
    noteEventArrival(b, 40 * MIN + 2_000);
    expect(summarizeMeeting([a, b]).active_minutes).toBe(1);
  });

  it('a learner who worked 3 minutes over half an hour has 3 active minutes, not 30', () => {
    const at = (m: number) => ({ event_type: 'DIGIT_ENTERED', client_timestamp: m * MIN, details: { is_correct: true } });
    expect(summarizeMeeting([at(0), at(15), at(30)]).active_minutes).toBe(3);
  });
});

describe('learning_path of a meeting (PRD 23 §ב, 24 §ב)', () => {
  const ev = (id: string) => ({ event_type: 'PROBLEM_LOAD', exercise_id: id, client_timestamp: 1 });

  it('is empty in meetings 1 and 2, in the class report row', () => {
    const row = buildLearnerRow(4, [ev('ex_2_01')], 7, 'green_path', null, null, 0, null, { sessionNumber: 2, allEvents: [] });
    expect(row.learning_path).toBeNull();
    const row1 = buildLearnerRow(4, [ev('ex_1_01')], null, 'green_path', null, null, 0, null, { sessionNumber: 1, allEvents: [] });
    expect(row1.learning_path).toBeNull();
  });

  it('is the meeting path in meetings 3–8', () => {
    const row = buildLearnerRow(4, [ev('s4_r_t1')], 7, 'remediation_path', null, null, 0, null, { sessionNumber: 4, allEvents: [] });
    expect(row.learning_path).toBe('remediation_path');
  });

  it('is empty in meetings 1–2 in the research export', () => {
    const src = readFileSync(resolve(__dirname, '../exportDriveReport.ts'), 'utf-8');
    expect(src).toContain('learning_path: m >= 3 ? path : "",');
  });
});

describe('the learner report shows both scores (PRD 23 §ב "זמן השלמה בדוח")', () => {
  it('prints the previous score beside the new one, under the PRD name of measure 1', () => {
    const html = pedagogicalReportHtml({ session_number: 4, score_percent: 71, previous_score_percent: 43, anonymous_student_label: 'תלמיד 4' });
    expect(html).toContain('ציון ניסיון ראשון (מדד 1)');
    expect(html).toContain(PREVIOUS_SCORE_LABEL_HE);
    expect(html).toContain('43%');
    expect(html).not.toContain('ציון שליטה');
  });

  it('prints no previous score when there was none', () => {
    const html = pedagogicalReportHtml({ session_number: 4, score_percent: 71, previous_score_percent: null });
    expect(html).not.toContain(PREVIOUS_SCORE_LABEL_HE);
  });
});

describe('class report links (PRD 23 §ב: valid for one hour)', () => {
  const src = readFileSync(resolve(__dirname, '../classReport.ts'), 'utf-8');

  it('issues signed links and stores no token link', () => {
    expect(src).not.toContain('firebaseStorageDownloadTokens');
    expect(src).not.toContain('alt=media&token=');
    expect(src).toContain('export const CLASS_REPORT_LINK_TTL_MS = 60 * 60 * 1000;');
    expect(src).toContain('pdf_url: null,');
  });

  it('a fresh link names only the stored file of the requested kind', () => {
    const stored = { storage_pdf_path: 'reports/class_1/session_3/class_report_1.pdf', storage_csv_path: 'reports/class_1/session_3/class_table_1.csv' };
    expect(classReportStoragePath(stored, 'pdf')).toBe(stored.storage_pdf_path);
    expect(classReportStoragePath(stored, 'csv')).toBe(stored.storage_csv_path);
    expect(classReportStoragePath(stored, 'json')).toBeNull();
    expect(classReportStoragePath({ storage_pdf_path: 'backups/x.json' }, 'pdf')).toBeNull();
    expect(classReportStoragePath(null, 'pdf')).toBeNull();
  });
});
