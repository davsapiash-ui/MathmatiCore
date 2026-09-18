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
    expect(fn).toMatch(/const scope = buildResetScope\(reset_level, rawNum, singleScope, activeSessionNumber, resetTarget\);/);
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
    // The whole-class restart is the one level-2 request that carries no learner number.
    expect(fn).toContain("const isOneLearner = reset_level === 'single_student' && !isClassTarget;");
    expect(fn).not.toMatch(/replace\(\/\\D\/g, ''\) \|\| '1'/);
    expect(fn).toContain('student_id (1-12) is required for single_student reset.');
  });
});

/**
 * Register, deviation 20 (product owner, 14.9.2026, confirmed 18.9.2026):
 * level 2 gains a second target. "לומד אחד" stays exactly as it was; "כל
 * הכיתה" restarts the open meeting for all 12 learners in one action, for the
 * lesson that fell apart. It is a restart of one lesson — never a second road
 * to level 3, whose merging with the other levels §ב forbids.
 */
describe('Module 23א — level 2 for the whole class (register, deviation 20)', () => {
  const store = readFileSync(resolve(__dirname, '../../application/useStore.ts'), 'utf-8');
  const modal = readFileSync(resolve(__dirname, '../../presentation/pages/TeacherDashboard/components/ResetConfirmationModal.tsx'), 'utf-8');
  const heat = readFileSync(resolve(__dirname, '../../presentation/pages/TeacherDashboard/components/HeatmapGrid.tsx'), 'utf-8');
  const classScope = (() => {
    const start = fn.indexOf("if (level === 'single_student' && target === 'class') {");
    return fn.slice(start, fn.indexOf("if (level === 'single_student' && singleScope === 'active_session') {", start));
  })();

  it('the three levels stay three: the class target lives inside level 2', () => {
    expect(fn).toContain("if (!reset_level || !['alerts', 'single_student', 'system'].includes(reset_level)) {");
    expect(fn).toContain("export type ResetTarget = 'student' | 'class';");
    expect(fn).toContain("const isClassTarget = reset_level === 'single_student' && reset_target === 'class';");
    expect(fn).toContain("reset_target 'class' belongs to reset_level 'single_student' (level 2) only.");
  });

  it('a request without reset_target is a single learner, exactly as before', () => {
    expect(fn).toContain("const resetTarget: ResetTarget = isClassTarget ? 'class' : 'student';");
    expect(fn).toMatch(/target: ResetTarget = 'student'\s*\): ResetScope \{/);
  });

  it('the class target cannot wipe learners completely — that is level 3', () => {
    expect(fn).toMatch(/if \(isClassTarget && reset_scope === 'full_student'\) \{\s*throw new HttpsError\(\s*"invalid-argument"/);
    expect(fn).toContain('למחיקת כל נתוני הכיתה יש להשתמש באיפוס מערכת (רמה 3)');
    // Nothing is removed whole, and the system-only nodes are not in this scope at all.
    expect(classScope).toMatch(/rtdbPaths: \[\],/);
    expect(classScope).not.toContain('"replays"');
    expect(classScope).not.toContain('"telemetry_sessions"');
  });

  it('refuses when no meeting is open instead of guessing one for twelve learners', () => {
    const start = fn.indexOf('export async function resolveClassSessionNumber');
    const body = fn.slice(start, fn.indexOf('// ─── Reset scope, backup and deletion helpers', start));
    expect(body.indexOf('valid(requested)')).toBeGreaterThan(-1);
    expect(body.indexOf('active_class_session/sessionNumber')).toBeGreaterThan(body.indexOf('valid(requested)'));
    // No fall-back to a learner record and no "meeting 1" default.
    expect(body).not.toContain('/activeSessionId');
    expect(body).not.toMatch(/return 1;/);
    expect(fn).toMatch(/if \(isClassTarget && activeSessionNumber === null\) \{\s*throw new HttpsError\(\s*"failed-precondition"/);
    // The refusal comes before anything is collected, written or deleted.
    expect(fn.indexOf('isClassTarget && activeSessionNumber === null')).toBeLessThan(fn.indexOf('backup = await collectResetBackup('));
  });

  it('backs up the whole class and resets only the meeting on each of the 12 records', () => {
    expect(classScope).toContain('rtdbBackupOnlyPaths: ["users/students", "chat_messages"],');
    expect(classScope).toContain('ALL_STUDENT_IDS.flatMap((n) => studentAliases(String(n)))');
    expect(classScope).toContain('values: { __activeSessionNumber: sessionNumber }');
    // Same rule as one learner: every collection is backed up, only the meeting's session documents go.
    expect(classScope).toContain('backupOnly: collection !== "sessions",');
    expect(classScope).toContain('collection === "sessions" ? { sessionNumber } : {}');
    // Twelve learners under four aliases is past Firestore's 30-value "in" limit.
    expect(classScope).not.toContain('studentValues');
  });

  it('goes through the same backup-before-delete gate and leaves the class meeting open', () => {
    // One code path: no second copy of the backup or the deletion for the class target.
    expect((fn.match(/await collectResetBackup\(/g) || []).length).toBe(1);
    expect((fn.match(/await executeResetDeletion\(/g) || []).length).toBe(1);
    // Only a system reset closes the class meeting (Module 14: activation is the teacher's).
    const closing = fn.indexOf('rtdb.ref("active_class_session").set({ active: false');
    expect(fn.lastIndexOf("if (reset_level === 'system') {", closing)).toBeGreaterThan(fn.indexOf('const deletion = await executeResetDeletion'));
  });

  it('the audit entry says it was the class, which meeting, and all 12 learners', () => {
    expect(fn).toContain("? { reset_scope: singleScope, session_number: activeSessionNumber, reset_target: resetTarget }");
    expect(fn).toContain('const affectedStudentIds = isOneLearner ? [parseInt(rawNum, 10)] : [...ALL_STUDENT_IDS];');
    expect((fn.match(/\.\.\.level2Audit,/g) || []).length).toBe(2); // failed-backup entry and success entry
  });

  it('the teacher store sends level 2 + class + active_session, and never a learner id', () => {
    const start = store.indexOf('resetClassActiveSession: async');
    const body = store.slice(start, store.indexOf('resetStudentData: async', start));
    expect(body).toMatch(/reset_level: 'single_student',\s*reset_target: 'class',\s*reset_scope: 'active_session',/);
    expect(body).toContain('session_number: sessionNumber,');
    expect(body).not.toContain('student_id');
    // No meeting, no call.
    expect(body.indexOf("throw new Error('NO_ACTIVE_CLASS_SESSION')")).toBeLessThan(body.indexOf('httpsCallable('));
    // A failed backup aborts: local state is touched only after the callable resolved.
    expect(body.indexOf("throw new Error('BACKUP_FAILED_RESET_ABORTED')")).toBeLessThan(body.indexOf('patchStudentAfterSessionReset('));
  });

  it('the dialog offers no full wipe for the class, needs an open meeting and an explicit tick', () => {
    expect(modal).toContain("const isClassTarget = resetLevel === 'single_student' && resetTarget === 'class';");
    expect(modal).toContain('{isLevel2 && !isClassTarget && (');
    expect(modal).toContain("? { scope: isClassTarget ? 'active_session' : scope, sessionNumber: activeSessionNumber }");
    expect(modal).toContain('if (isClassTarget && (!activeSessionNumber || !classConfirmed)) {');
    expect(modal).toContain('(isClassTarget && (!activeSessionNumber || !classConfirmed))');
    // Escape must not leave the tick behind for the next opening (same trap as the level-3 double confirm).
    expect(modal).toMatch(/setScope\('active_session'\);\s*setClassConfirmed\(false\);\s*onClose\(\);/);
  });

  it('the radar toolbar opens it with the meeting the class has open', () => {
    expect(heat).toMatch(/resetLevel="single_student"\s*resetTarget="class"\s*activeSessionNumber=\{activeSessionNum\}/);
    expect(heat).toContain('await useStore.getState().resetClassActiveSession(reason, reasonNote, options?.sessionNumber ?? 0);');
  });

  it('the per-learner dialogs are untouched: they never pass a class target', () => {
    const cm = readFileSync(resolve(__dirname, '../../presentation/pages/TeacherDashboard/ClassManagement.tsx'), 'utf-8');
    const drawer = readFileSync(resolve(__dirname, '../../presentation/pages/TeacherDashboard/components/StudentLearningConditionsDrawer.tsx'), 'utf-8');
    expect(cm).not.toContain('resetTarget');
    expect(drawer).not.toContain('resetTarget');
  });
});
