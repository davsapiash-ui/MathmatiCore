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
    expect(fn).toMatch(/const scope = buildResetScope\(reset_level, rawNum, singleScope, activeSessionNumber\);/);
    expect(fn).toMatch(/backup = await collectResetBackup\(rtdb, db, scope,/);
    expect(fn).toMatch(/const deletion = await executeResetDeletion\(rtdb, db, scope\);/);
  });

  it('covers every learning-data collection, and never the audit log (§ד)', () => {
    expect(fn).toContain('const LEARNING_COLLECTIONS = ["sessions", "telemetry_logs", "telemetry_events", "reports", "class_reports", "srl_reflections"] as const;');
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
    expect(fn).toMatch(/rtdb\.ref\("active_class_session"\)\.set\(\{ active: false, status: "closed", sessionNumber: null, endedAt: Date\.now\(\) \}\)/);
    expect(fn).not.toMatch(/active_class_session"\)\.set\(\{ active: true/);
  });

  it('a single-learner reset backs up all of that learner but deletes only the meeting state (§ב.2)', () => {
    expect(fn).toMatch(/backupOnly: collection !== "sessions",/);
    expect(fn).toMatch(/if \(entry\.backupOnly\) continue;/);
  });

  it("a single-learner reset restarts the active meeting by default; a full wipe is the teacher's explicit choice", () => {
    expect(fn).toContain("const singleScope: SingleStudentResetScope = reset_level === 'single_student' ? (reset_scope || 'active_session') : 'full_student';");
    expect(fn).toMatch(/if \(level === 'single_student' && singleScope === 'active_session'\) \{/);
    // The whole learner is still backed up, nothing of theirs is removed whole.
    expect(fn).toMatch(/rtdbPaths: \[\],\s*rtdbBackupOnlyPaths: \[/);
    // Only the meeting's own session documents go.
    expect(fn).toMatch(/collection === "sessions" \? \{ sessionNumber \} : \{\}/);
    expect(fn).toMatch(/entry\.sessionNumber\s*\? await deleteSessionDocsOfMeeting\(db, entry, entry\.sessionNumber\)/);
    // The audit entry records which scope and which meeting.
    expect(fn).toMatch(/reset_scope: singleScope, session_number: activeSessionNumber/);
  });

  it('the active-meeting reset touches only that meeting\'s fields on the learner record', () => {
    const start = fn.indexOf('export function buildActiveSessionResetValues');
    const end = fn.indexOf('export function buildResetScope', start);
    const body = fn.slice(start, end);
    expect(body).toContain('workspaceState: null');
    expect(body).toContain('sessionState: null');
    expect(body).toContain('[`completedMeeting${sessionNumber}`]: false');
    expect(body).toContain('highestCompletedMeeting: Math.min(highest, sessionNumber - 1)');
    expect(body).toContain('if (sessionNumber === 2)');
    expect(body).toContain('if (sessionNumber === 8)');
    // Recordings, chat and the support profile are not meeting progress.
    expect(body).not.toContain('telemetry_sessions');
    expect(body).not.toContain('chat_messages');
    expect(body).not.toContain('support_profile_id');
    expect(body).not.toContain('enhanced_support_profile');
  });

  it('the meeting to restart is the requested one, else the open class meeting, else the learner\'s, else 1', () => {
    const start = fn.indexOf('export async function resolveActiveSessionNumber');
    const body = fn.slice(start, start + 1500);
    expect(body.indexOf('valid(requested)')).toBeGreaterThan(-1);
    expect(body.indexOf('active_class_session/sessionNumber')).toBeGreaterThan(body.indexOf('valid(requested)'));
    expect(body.indexOf('/activeSessionId')).toBeGreaterThan(body.indexOf('active_class_session/sessionNumber'));
    expect(body).toMatch(/return 1;\s*\}/);
  });

  it('a system reset recomputes the admin cache the deleted data fed (Module 24 store_cache)', () => {
    // PRD 23א §ב.3: a system reset "מוחק את כלל נתוני הלמידה"; store_cache/admin_metrics
    // is derived from them, so it must not keep the pre-reset summary until 14:30 next day.
    const agg = readFileSync(resolve(__dirname, '../../../../functions/src/adminAggregator.ts'), 'utf-8');
    expect(agg).toMatch(/export async function recomputeAdminMetrics\(db: admin\.firestore\.Firestore\)/);
    expect(fn).toMatch(/import \{ recomputeAdminMetrics \} from "\.\/adminAggregator";/);
    const systemBlock = fn.indexOf("if (reset_level === 'system') {", fn.indexOf('const deletion = await executeResetDeletion'));
    expect(systemBlock).toBeGreaterThan(-1);
    const recompute = fn.indexOf('await recomputeAdminMetrics(db)', systemBlock);
    expect(recompute).toBeGreaterThan(systemBlock);
    // Runs only after deletion, and a failure is reported like any other incomplete step.
    expect(fn.slice(recompute, recompute + 200)).toContain('deletion.failures.push(`store_cache/admin_metrics:');
  });

  it('refuses a single-learner reset without a learner number instead of defaulting to learner 1', () => {
    expect(fn).not.toMatch(/replace\(\/\\D\/g, ''\) \|\| '1'/);
    expect(fn).toContain('student_id (1-12) is required for single_student reset.');
  });
});
