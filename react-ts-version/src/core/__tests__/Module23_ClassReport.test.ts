import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Module 23, owner decision 6.9.2026 (register item 12): "צריך להיות בכל מפגש
 * גם דו"ח תלמיד וגם דו"ח כיתה" and "כל מה שנמדד ליחיד אני רוצה בפלט כיתתי
 * באופן שישמש את המחקר".
 *
 * Pinned from source: the functions package compiles under its own tsconfig.
 */
const server = readFileSync(resolve(__dirname, '../../../../functions/src/classReport.ts'), 'utf-8');
const index = readFileSync(resolve(__dirname, '../../../../functions/src/index.ts'), 'utf-8');
const drive = readFileSync(resolve(__dirname, '../../../../functions/src/exportDriveReport.ts'), 'utf-8');
const rules = readFileSync(resolve(__dirname, '../../../../firestore.rules'), 'utf-8');
const service = readFileSync(resolve(__dirname, '../../infrastructure/services/ClassReportService.ts'), 'utf-8');
const panel = readFileSync(resolve(__dirname, '../../presentation/pages/TeacherDashboard/components/ClassMeetingReportPanel.tsx'), 'utf-8');
const dashboard = readFileSync(resolve(__dirname, '../../presentation/pages/TeacherDashboard.tsx'), 'utf-8');

describe('Module 23 — class report per meeting (server)', () => {
  it('is deployed as its own callable, for any meeting 1–8', () => {
    expect(index).toContain('export { generateClassMeetingReport } from "./classReport";');
    expect(server).toMatch(/export const generateClassMeetingReport = onCall\(CLASS_REPORT_RUNTIME/);
    expect(server).toContain('throw new HttpsError("invalid-argument", "sessionNumber must be 1-8.");');
  });

  it('reads every event of the meeting for every learner, by the same functions as the individual report', () => {
    expect(server).toMatch(/await readAllDocs\(db\.collection\("telemetry_logs"\)\)/);
    expect(server).toMatch(/sessionNumberFromId\(String\(data\.session_id \|\| ""\)\) !== sessionNumber\) continue;/);
    expect(server).toMatch(/const first = computeFirstAttemptScore\(sorted, compulsoryTotal\);/);
    expect(server).toMatch(/const summary: MeetingSummary = summarizeMeeting\(sorted\);/);
    expect(server).toMatch(/resolveCompulsoryTotal\(db, sessionNumber, pathOf, compulsoryCache\)/);
  });

  it('carries every individual measurement into the class output', () => {
    for (const field of [
      'score_percent', 'recommendation_tier', 'correct_first_attempt', 'compulsory_total', 'wrong_digits_units', 'wrong_digits_tens',
      'wrong_digits_hundreds', 'deletions', 'undos', 'hesitations', 'hesitation_seconds_total', 'regroupings', 'socratic_cards',
      'socratic_triggers', 'error_categories', 'reflection_submitted', 'recording_minutes', 'exercise_outcomes', 'active_minutes',
    ]) {
      expect(server).toMatch(new RegExp(`^  ${field}:`, 'm'));
    }
  });

  it('aggregates the class: tiers by the PRD percentage rule, per-exercise first-try success, error columns', () => {
    expect(server).toMatch(/recommendation_tier: resolveRecommendationTier\(score\)/);
    expect(server).toMatch(/tiers\[r\.recommendation_tier\]\.push\(r\.student_id\)/);
    expect(server).toMatch(/first_try_percent: row\.attempted > 0 \? Math\.round\(\(row\.first_try \/ row\.attempted\) \* 100\) : 0/);
    expect(server).toMatch(/learners_without_data: ALL_STUDENT_IDS\.filter/);
    expect(server).toContain('score_median');
  });

  it('layer 2 may not move a learner between groups, and falls back to the exact PRD sentence', () => {
    expect(server).toContain('אל תעביר לומד מקבוצה לקבוצה');
    expect(server).toMatch(/const text = await Promise\.race\(\[call, timeout\]\);/);
    expect(server).toContain('line(EXACT_AI_FALLBACK_TEXT, 10, "#78350f");');
    expect(server).toMatch(/class_patterns: analysis\?\.class_patterns \?\? \[\]/);
  });

  it('writes PDF + CSV, mirrors to "05 דוחות כיתה / מפגש N", and stores every number in class_reports', () => {
    expect(drive).toContain('classReports: "05 דוחות כיתה",');
    expect(server).toMatch(/resolveDriveFolder\(\[DRIVE_FOLDERS\.classReports, `מפגש \$\{sessionNumber\}`\]\)/);
    expect(server).toMatch(/const csvText = buildClassCsv\(learners, aggregates\.exercises\);/);
    expect(server).toMatch(/await db\.collection\("class_reports"\)\.doc\(reportId\)\.set\(stored\);/);
    expect(server).toContain('const reportId = `${classId}_session_${sessionNumber}`;');
  });

  it('refuses with a clear Hebrew message when nobody has recorded actions in that meeting', () => {
    expect(server).toContain('אין פעולות מתועדות למפגש ${sessionNumber} של אף תלמיד; אין מה לנתח.');
  });

  it('the class report is readable by the class teacher only, written by the server only, and reset with the rest', () => {
    expect(rules).toMatch(/match \/class_reports\/\{reportId\} \{\s*allow read: if isTeacherOfClass\(resource\.data\.class_id\);\s*allow write: if false;/);
    expect(drive).toMatch(/LEARNING_COLLECTIONS = \[[^\]]*"class_reports"/);
  });
});

describe('Module 23 — class report per meeting (teacher page)', () => {
  it('sits in the reports tab with a meeting selector 1–8', () => {
    expect(dashboard).toContain('<ClassMeetingReportPanel />');
    expect(panel).toContain('const SESSION_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8] as const;');
    expect(panel).toContain('הפק דוח כיתה למפגש ${selectedSession}');
  });

  it('calls the deployed function and reads the stored document', () => {
    expect(service).toContain("httpsCallable(functions, 'generateClassMeetingReport'");
    expect(service).toMatch(/doc\(firestore, 'class_reports', `\$\{classId\}_session_\$\{sessionNumber\}`\)/);
  });

  it('shows the groups, the exercises, every learner\'s row, the PDF and the research CSV, and the PRD fallbacks', () => {
    for (const field of ['tiers', 'exercises', 'learners', 'pdfUrl', 'csvUrl', 'classPatterns', 'teachingRecommendations', 'wrongDigitsByColumn']) {
      expect(panel).toContain(`report.${field}`);
    }
    expect(panel).toMatch(/state === 'error' && \([\s\S]*?\{REPORT_PROCESSING_TEXT\}/);
    expect(panel).toMatch(/report\.aiAnalysisAvailable \? \([\s\S]*?\{AI_FALLBACK_TEXT\}/);
  });
});
