import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * PRD Module 23א §ג: "המערכת מבצעת גיבוי מלא לפני כל מחיקה… הקובץ כולל את
 * כלל נתוני הטלמטריה, מסמכי הסשן, מצבי מרחב העבודה ונתוני הרפלקציה של
 * הלומדים הנמחקים". §ב.3: a system reset "מוחק את כלל נתוני הלמידה".
 *
 * Until 4.9.2026 the system reset backed up four RTDB nodes only, deleted at
 * most 500 documents per Firestore collection (one page, once), and reported a
 * fixed "12 records deleted". A class that had been used kept part of its
 * action log after a "full" reset, and the backup lacked every Firestore
 * record it did delete.
 *
 * Pinned from source, the way Module23_ReportAnalysis does: the functions
 * package compiles under its own tsconfig and cannot be imported here.
 */
const fn = readFileSync(resolve(__dirname, '../../../../functions/src/exportDriveReport.ts'), 'utf-8');

describe('Module 23א — one scope for backup and deletion', () => {
  it('the backup reads the scope and the deletion deletes the same scope', () => {
    expect(fn).toMatch(/const scope = buildResetScope\(reset_level, rawNum\);/);
    expect(fn).toMatch(/backup = await collectResetBackup\(rtdb, db, scope,/);
    expect(fn).toMatch(/const deletion = await executeResetDeletion\(rtdb, db, scope\);/);
  });

  it('covers every learning-data collection, and never the audit log (§ד)', () => {
    expect(fn).toContain('const LEARNING_COLLECTIONS = ["sessions", "telemetry_logs", "telemetry_events", "reports", "srl_reflections"] as const;');
    expect(fn).not.toMatch(/LEARNING_COLLECTIONS = \[[^\]]*reset_audit_log/);
  });

  it('reads and deletes whole collections page by page — no single 500-document cap', () => {
    expect(fn).toMatch(/async function readCollectionFully[\s\S]*?for \(let page = 0; page < FIRESTORE_MAX_PAGES; page\+\+\)/);
    expect(fn).toMatch(/async function deleteCollectionFully[\s\S]*?for \(let page = 0; page < FIRESTORE_MAX_PAGES; page\+\+\)/);
    expect(fn).not.toMatch(/db\.collection\(collName\)\.limit\(500\)\.get\(\)/);
  });

  it('deletes only after the backup write was confirmed', () => {
    const backupGate = fn.indexOf('throw new HttpsError("internal", "הגיבוי נכשל. האיפוס בוטל ולא נמחקו נתונים.");', fn.indexOf('All backup channels failed'));
    const deletion = fn.indexOf('const deletion = await executeResetDeletion(rtdb, db, scope);');
    expect(backupGate).toBeGreaterThan(-1);
    expect(deletion).toBeGreaterThan(backupGate);
  });

  it('writes the real number of deleted records to the audit entry', () => {
    expect(fn).toMatch(/records_deleted_count: deletion\.total,/);
    expect(fn).not.toMatch(/deletedCount = 12;/);
  });

  it('reports an incomplete deletion instead of swallowing it', () => {
    expect(fn).toMatch(/if \(deletion\.failures\.length > 0\)/);
    expect(fn).toContain('הגיבוי נשמר, אך חלק מהנתונים לא נמחקו');
  });

  it('a system reset leaves no active session (Module 14) on the server side too', () => {
    expect(fn).toMatch(/rtdb\.ref\("active_class_session"\)\.set\(\{ active: false, sessionNumber: null, endedAt: Date\.now\(\) \}\)/);
    expect(fn).not.toMatch(/active_class_session"\)\.set\(\{ active: true/);
  });

  it('a single-learner reset backs up all of that learner but deletes only the meeting state (§ב.2)', () => {
    expect(fn).toMatch(/backupOnly: collection !== "sessions",/);
    expect(fn).toMatch(/if \(entry\.backupOnly\) continue;/);
  });

  it('refuses a single-learner reset without a learner number instead of defaulting to learner 1', () => {
    expect(fn).not.toMatch(/replace\(\/\\D\/g, ''\) \|\| '1'/);
    expect(fn).toContain('student_id (1-12) is required for single_student reset.');
  });
});
